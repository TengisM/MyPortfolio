package tetrishandler_test

import (
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v2"

	tetrishandler "landing-api/internal/http/handlers/tetris"
	"landing-api/internal/service/tetris"
)

const origin = "http://localhost:5173"

// serve starts the game socket on a free port and returns its URL.
func serve(t *testing.T) string {
	t.Helper()
	hub := tetris.NewHub(tetris.Timing{Countdown: 10 * time.Millisecond, GarbageEvery: time.Minute, GarbageRows: 2})
	h := tetrishandler.New(hub, origin, false)
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	app.Get("/api/tetris/ws", h.Upgrade, h.Socket())
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = app.Listener(ln) }()
	t.Cleanup(func() {
		hub.Shutdown()
		_ = app.Shutdown()
	})
	return "ws://" + ln.Addr().String() + "/api/tetris/ws"
}

// dial connects as a page from origin `from`. It returns the handshake's status code.
func dial(t *testing.T, url, from string) (*websocket.Conn, int, error) {
	t.Helper()
	header := http.Header{}
	header.Set("Origin", from)
	c, res, err := websocket.DefaultDialer.Dial(url, header)
	status := 0
	if res != nil {
		status = res.StatusCode
		_ = res.Body.Close()
	}
	if c != nil {
		t.Cleanup(func() { _ = c.Close() })
	}
	return c, status, err
}

func send(t *testing.T, c *websocket.Conn, msg any) {
	t.Helper()
	if err := c.WriteJSON(msg); err != nil {
		t.Fatal(err)
	}
}

// next reads until a message of kind arrives.
func next(t *testing.T, c *websocket.Conn, kind string) map[string]any {
	t.Helper()
	_ = c.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		var m map[string]any
		if err := c.ReadJSON(&m); err != nil {
			t.Fatalf("waiting for %q: %v", kind, err)
		}
		if m["t"] == kind {
			return m
		}
	}
}

func TestForeignOriginIsRefused(t *testing.T) {
	t.Parallel()
	url := serve(t)
	_, status, err := dial(t, url, "https://evil.example")
	if err == nil {
		t.Fatal("dial from a foreign origin succeeded")
	}
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", status)
	}
}

func TestTwoPlayersPlayARound(t *testing.T) {
	t.Parallel()
	url := serve(t)
	host, _, err := dial(t, url, origin)
	if err != nil {
		t.Fatal(err)
	}
	send(t, host, map[string]string{"t": "create"})
	code, _ := next(t, host, "room")["code"].(string)

	guest, _, err := dial(t, url, origin)
	if err != nil {
		t.Fatal(err)
	}
	send(t, guest, map[string]string{"t": "start"})
	// A start before create or join is not a hello, so the server hangs up.
	_ = guest.SetReadDeadline(time.Now().Add(time.Second))
	if _, _, err := guest.ReadMessage(); err == nil {
		t.Fatal("connection stayed open after a bad hello")
	}
	guest, _, err = dial(t, url, origin)
	if err != nil {
		t.Fatal(err)
	}
	send(t, guest, map[string]string{"t": "join", "code": " " + strings.ToLower(code) + " "})
	if joined := next(t, guest, "room"); joined["you"] != float64(1) {
		t.Fatalf("guest seat = %v, want 1", joined["you"])
	}

	send(t, guest, map[string]string{"t": "start"})
	if msg := next(t, guest, "error"); msg["msg"] != tetris.ErrNotHost.Error() {
		t.Fatalf("guest start error = %v", msg["msg"])
	}
	send(t, host, map[string]string{"t": "start"})
	round := next(t, guest, "round")
	if players := round["players"].([]any); players[0] != true || players[1] != true {
		t.Fatalf("round players = %v", players)
	}

	board := strings.Repeat("0", tetris.BoardCells-1) + "7"
	send(t, host, map[string]any{"t": "board", "b": board, "l": 4})
	got := next(t, guest, "board")
	if got["s"] != float64(0) || got["b"] != board || got["l"] != float64(4) {
		t.Fatalf("relayed board = %v", got)
	}

	send(t, guest, map[string]string{"t": "dead"})
	if out := next(t, host, "out"); out["s"] != float64(1) {
		t.Fatalf("out = %v", out)
	}
	over := next(t, host, "over")
	if over["win"] != float64(0) || over["wins"].([]any)[0] != float64(1) {
		t.Fatalf("over = %v, want the host to win", over)
	}
	if lobby := next(t, guest, "room"); lobby["playing"] != false {
		t.Fatalf("room after the round = %v", lobby)
	}
}
