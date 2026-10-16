// Package gamesocket is the WebSocket plumbing the online games share: the Origin check, a
// bounded send queue per player, and a read loop with deadlines and a rate limit. Each game
// decodes its own messages and talks to its own rooms.
package gamesocket

import (
	"encoding/json"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

const (
	// Time to say create or join after connecting.
	helloTimeout = 15 * time.Second
	// A silent connection is dropped after this. Pings every pingEvery keep a quiet player in.
	idleTimeout = 60 * time.Second
	pingEvery   = 20 * time.Second
	writeWait   = 5 * time.Second
)

// Guard decides which pages may open a game socket.
type Guard struct {
	origins        map[string]bool
	allowLocalhost bool
}

// NewGuard takes the CORS allowlist: the same sites that may call the API may open a game socket.
// allowLocalhost is for development. It lets in any port on localhost, where Vite moves to the
// next free port when 5173 is taken, and pages served from a private network address
// (`pnpm dev --host`), so another computer on the same Wi-Fi can join a room.
func NewGuard(corsOrigins string, allowLocalhost bool) *Guard {
	origins := map[string]bool{}
	for _, o := range strings.Split(corsOrigins, ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins[o] = true
		}
	}
	return &Guard{origins: origins, allowLocalhost: allowLocalhost}
}

func (g *Guard) allowed(origin string) bool {
	if origin == "" || g.origins[origin] {
		return true
	}
	if !g.allowLocalhost {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	name := u.Hostname()
	if name == "localhost" || strings.HasSuffix(name, ".local") {
		return true
	}
	ip := net.ParseIP(name)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}

// Upgrade refuses plain HTTP and pages from other sites before the socket opens. Browsers always
// send Origin on a WebSocket, and CORS doesn't cover WebSockets, so this check is the only one.
func (g *Guard) Upgrade(c *fiber.Ctx) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return fiber.ErrUpgradeRequired
	}
	if !g.allowed(c.Get(fiber.HeaderOrigin)) {
		return fiber.ErrForbidden
	}
	return c.Next()
}

// Config sizes one game's connections.
type Config struct {
	// The largest message a client may send, in bytes. Anything bigger ends the connection.
	ReadLimit int64
	// Messages queued for a slow reader before it is dropped.
	SendQueue int
	// A connection that sends more than this in a second is a script and gets dropped. The hello
	// doesn't count.
	MaxMessagesPerSecond int
}

// Reader returns the next text message, or false when the connection ended, sent a binary frame,
// went quiet too long or sent too fast. The first call waits helloTimeout, later ones idleTimeout.
type Reader func() ([]byte, bool)

// JSON reads the next message into v. It returns false when read does, or when the message isn't
// JSON, which also ends the connection: only a broken or hostile client sends that.
func (read Reader) JSON(v any) bool {
	data, ok := read()
	return ok && json.Unmarshal(data, v) == nil
}

// Play serves one player. It runs for the life of the connection, which closes when Play returns.
type Play func(c *Conn, read Reader)

// Socket serves every connection with play.
func Socket(cfg Config, play Play) fiber.Handler {
	return websocket.New(func(ws *websocket.Conn) { serve(ws, cfg, play) },
		websocket.Config{ReadBufferSize: 512, WriteBufferSize: 2048})
}

// Conn is a player's connection as a room sees it. Only its writer goroutine touches the
// socket's write side, which allows one writer at a time.
type Conn struct {
	out  chan []byte
	done chan struct{}
	once sync.Once
}

// Send queues msg. A player whose queue is full has stopped reading, so they are dropped rather
// than allowed to hold up the room.
func (c *Conn) Send(msg []byte) bool {
	select {
	case <-c.done:
		return false
	default:
	}
	select {
	case c.out <- msg:
		return true
	default:
		c.Close()
		return false
	}
}

// Close ends the connection once the queued messages are written.
func (c *Conn) Close() { c.once.Do(func() { close(c.done) }) }

func serve(ws *websocket.Conn, cfg Config, play Play) {
	c := &Conn{out: make(chan []byte, cfg.SendQueue), done: make(chan struct{})}
	writerDone := make(chan struct{})
	go writer(ws, c, writerDone)
	// The library recycles ws once serve returns, so the writer has to be finished by then.
	defer func() {
		c.Close()
		<-writerDone
	}()

	ws.SetReadLimit(cfg.ReadLimit)
	ws.SetPongHandler(func(string) error {
		return ws.SetReadDeadline(time.Now().Add(idleTimeout))
	})

	hello := true
	var windowStart time.Time
	count := 0
	read := func() ([]byte, bool) {
		wait := idleTimeout
		if hello {
			wait = helloTimeout
		}
		_ = ws.SetReadDeadline(time.Now().Add(wait))
		kind, data, err := ws.ReadMessage()
		if err != nil || kind != websocket.TextMessage {
			return nil, false
		}
		if hello {
			hello = false
			windowStart = time.Now()
			return data, true
		}
		if time.Since(windowStart) > time.Second {
			windowStart, count = time.Now(), 0
		}
		if count++; count > cfg.MaxMessagesPerSecond {
			return nil, false
		}
		return data, true
	}
	play(c, read)
}

// writer sends queued messages and pings until the connection is closed, then flushes what is
// left (an error message, usually) and closes the socket, which also ends serve's read.
func writer(ws *websocket.Conn, c *Conn, done chan<- struct{}) {
	defer close(done)
	ping := time.NewTicker(pingEvery)
	defer ping.Stop()
	write := func(msg []byte) bool {
		_ = ws.SetWriteDeadline(time.Now().Add(writeWait))
		return ws.WriteMessage(websocket.TextMessage, msg) == nil
	}
	for {
		select {
		case msg := <-c.out:
			if !write(msg) {
				c.Close()
			}
		case <-ping.C:
			_ = ws.SetWriteDeadline(time.Now().Add(writeWait))
			if ws.WriteMessage(websocket.PingMessage, nil) != nil {
				c.Close()
			}
		case <-c.done:
			for {
				select {
				case msg := <-c.out:
					if !write(msg) {
						_ = ws.Close()
						return
					}
				default:
					_ = ws.WriteControl(websocket.CloseMessage,
						websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
						time.Now().Add(writeWait))
					_ = ws.Close()
					return
				}
			}
		}
	}
}
