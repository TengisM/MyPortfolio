package tronhandler_test

import (
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v2"

	tronhandler "landing-api/internal/http/handlers/tron"
	"landing-api/internal/service/tron"
)

const origin = "http://localhost:5173"

// serve starts the game socket on a free port and returns its URL.
func serve(t *testing.T) string {
	t.Helper()
	hub := tron.NewHub(tron.Timing{Countdown: 10 * time.Millisecond, RoundPause: time.Second, BaseSpeed: 200})
	h := tronhandler.New(hub, origin, false)
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	app.Get("/api/tron/ws", h.Upgrade, h.Socket())
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = app.Listener(ln) }()
	t.Cleanup(func() {
		hub.Shutdown()
		_ = app.Shutdown()
	})
	return "ws://" + ln.Addr().String() + "/api/tron/ws"
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

func TestAnyLocalhostPortInDevelopment(t *testing.T) {
	t.Parallel()
	hub := tron.NewHub(tron.Default)
	t.Cleanup(hub.Shutdown)
	for _, tc := range []struct {
		dev    bool
		origin string
		want   int
	}{
		{dev: true, origin: "http://localhost:5174", want: fiber.StatusSwitchingProtocols},
		{dev: false, origin: "http://localhost:5174", want: fiber.StatusForbidden},
		{dev: true, origin: "https://evil.example", want: fiber.StatusForbidden},
	} {
		app := fiber.New()
		h := tronhandler.New(hub, origin, tc.dev)
		app.Get("/ws", h.Upgrade, func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusSwitchingProtocols) })
		req, _ := http.NewRequest(http.MethodGet, "http://api.test/ws", nil)
		req.Header.Set("Connection", "Upgrade")
		req.Header.Set("Upgrade", "websocket")
		req.Header.Set("Origin", tc.origin)
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		_ = res.Body.Close()
		if res.StatusCode != tc.want {
			t.Errorf("dev=%v origin %s: status %d, want %d", tc.dev, tc.origin, res.StatusCode, tc.want)
		}
	}
}

func TestTwoPlayersMeetAndRide(t *testing.T) {
	t.Parallel()
	url := serve(t)
	host, _, err := dial(t, url, origin)
	if err != nil {
		t.Fatal(err)
	}
	send(t, host, map[string]string{"t": "create"})
	room := next(t, host, "room")
	code, _ := room["code"].(string)

	guest, _, err := dial(t, url, origin)
	if err != nil {
		t.Fatal(err)
	}
	send(t, guest, map[string]string{"t": "join", "code": code})
	if joined := next(t, guest, "room"); joined["you"] != float64(1) {
		t.Fatalf("guest seat = %v, want 1", joined["you"])
	}

	send(t, host, map[string]string{"t": "start"})
	round := next(t, guest, "round")
	if len(round["r"].([]any)) != 2 {
		t.Fatalf("round riders = %v, want 2", round["r"])
	}
	send(t, guest, map[string]any{"t": "turn", "d": 0})
	tick := next(t, guest, "tick")
	if moves, _ := tick["m"].([]any); len(moves) == 0 {
		t.Fatalf("tick = %v, want moves", tick)
	}
}

func TestJoiningAMissingRoomExplains(t *testing.T) {
	t.Parallel()
	url := serve(t)
	c, _, err := dial(t, url, origin)
	if err != nil {
		t.Fatal(err)
	}
	send(t, c, map[string]string{"t": "join", "code": "QQQQ"})
	msg := next(t, c, "error")
	if msg["msg"] != tron.ErrNoRoom.Error() {
		t.Fatalf("error = %v", msg["msg"])
	}
	// The server closes after explaining.
	_ = c.SetReadDeadline(time.Now().Add(time.Second))
	if _, _, err := c.ReadMessage(); err == nil {
		t.Fatal("connection stayed open after a refused join")
	}
}
