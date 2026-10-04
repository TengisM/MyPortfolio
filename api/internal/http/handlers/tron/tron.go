// Package tronhandler connects players to online Tron rooms over a WebSocket.
//
// The first message opens or joins a room: {"t":"create"} or {"t":"join","code":"ABCD"}. After
// that the host sends {"t":"start"} and everyone steers with {"t":"turn","d":0..3}. Everything
// the server says is described in the tron service package.
package tronhandler

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"

	"landing-api/internal/service/tron"
)

const (
	// The largest valid message is a join with its code, about 30 bytes.
	readLimit = 256
	// Time to say create or join after connecting.
	helloTimeout = 15 * time.Second
	// A silent connection is dropped after this. Pings every pingEvery keep a quiet player in.
	idleTimeout = 60 * time.Second
	pingEvery   = 20 * time.Second
	writeWait   = 5 * time.Second
	// Messages queued for a slow reader before it is dropped. A tick is about 100 bytes.
	sendQueue = 64
	// A person turns a few times a second at most. Far past that is a script.
	maxMessagesPerSecond = 30
)

type Handler struct {
	hub     *tron.Hub
	origins map[string]bool
}

// New takes the CORS allowlist: the same sites that may call the API may open a game socket.
func New(hub *tron.Hub, corsOrigins string) *Handler {
	origins := map[string]bool{}
	for _, o := range strings.Split(corsOrigins, ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins[o] = true
		}
	}
	return &Handler{hub: hub, origins: origins}
}

// Upgrade refuses plain HTTP and pages from other sites before the socket opens. Browsers always
// send Origin on a WebSocket, and CORS doesn't cover WebSockets, so this check is the only one.
func (h *Handler) Upgrade(c *fiber.Ctx) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return fiber.ErrUpgradeRequired
	}
	if o := c.Get(fiber.HeaderOrigin); o != "" && !h.origins[o] {
		return fiber.ErrForbidden
	}
	return c.Next()
}

// Socket serves one player for the life of their connection.
func (h *Handler) Socket() fiber.Handler {
	return websocket.New(h.serve, websocket.Config{ReadBufferSize: 512, WriteBufferSize: 2048})
}

type incoming struct {
	T    string `json:"t"`
	Code string `json:"code"`
	D    int    `json:"d"`
}

// conn is a player's connection as the room sees it. Only its writer goroutine touches the
// socket's write side, which allows one writer at a time.
type conn struct {
	out  chan []byte
	done chan struct{}
	once sync.Once
}

// Send queues msg. A player whose queue is full has stopped reading, so they are dropped rather
// than allowed to hold up the room.
func (c *conn) Send(msg []byte) bool {
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

func (c *conn) Close() { c.once.Do(func() { close(c.done) }) }

func (h *Handler) serve(ws *websocket.Conn) {
	c := &conn{out: make(chan []byte, sendQueue), done: make(chan struct{})}
	writerDone := make(chan struct{})
	go writer(ws, c, writerDone)
	// The library recycles ws once serve returns, so the writer has to be finished by then.
	defer func() {
		c.Close()
		<-writerDone
	}()

	ws.SetReadLimit(readLimit)
	ws.SetPongHandler(func(string) error {
		return ws.SetReadDeadline(time.Now().Add(idleTimeout))
	})

	_ = ws.SetReadDeadline(time.Now().Add(helloTimeout))
	hello, ok := read(ws)
	if !ok {
		return
	}
	var room *tron.Room
	var seat int
	var err error
	switch hello.T {
	case "create":
		room, seat, err = h.hub.Create(c)
	case "join":
		room, seat, err = h.hub.Join(strings.ToUpper(strings.TrimSpace(hello.Code)), c)
	default:
		return
	}
	if err != nil {
		c.Send(tron.ErrorMessage(err))
		return
	}
	defer room.Leave(seat)

	windowStart := time.Now()
	count := 0
	for {
		_ = ws.SetReadDeadline(time.Now().Add(idleTimeout))
		msg, ok := read(ws)
		if !ok {
			return
		}
		if time.Since(windowStart) > time.Second {
			windowStart, count = time.Now(), 0
		}
		if count++; count > maxMessagesPerSecond {
			return
		}
		switch msg.T {
		case "turn":
			if msg.D >= 0 && msg.D <= 3 {
				room.Turn(seat, tron.Dir(msg.D))
			}
		case "start":
			if err := room.Start(seat); err != nil {
				// Not fatal: tell them why and keep the connection.
				c.Send(tron.ErrorMessage(err))
			}
		}
	}
}

// read returns the next message, or false when the connection ended or sent something invalid.
func read(ws *websocket.Conn) (incoming, bool) {
	var msg incoming
	kind, data, err := ws.ReadMessage()
	if err != nil || kind != websocket.TextMessage {
		return msg, false
	}
	if json.Unmarshal(data, &msg) != nil {
		return msg, false
	}
	return msg, true
}

// writer sends queued messages and pings until the connection is closed, then flushes what is
// left (an error message, usually) and closes the socket, which also ends serve's read.
func writer(ws *websocket.Conn, c *conn, done chan<- struct{}) {
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
