package racehandler_test

import (
	"net"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v2"

	racehandler "landing-api/internal/http/handlers/race"
	"landing-api/internal/service/race"
)

const origin = "http://localhost:5173"

// serve starts the race socket on a free port and returns its URL.
func serve(t *testing.T) string {
	t.Helper()
	hub := race.NewHub(race.Timing{Countdown: 10 * time.Millisecond, Cutoff: time.Minute, MaxRace: time.Minute, Seed: 3})
	h := racehandler.NewSocket(hub, origin, false)
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	app.Get("/api/race/ws", h.Upgrade, h.Socket())
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = app.Listener(ln) }()
	t.Cleanup(func() {
		hub.Shutdown()
		_ = app.Shutdown()
	})
	return "ws://" + ln.Addr().String() + "/api/race/ws"
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

func TestTwoPlayersRace(t *testing.T) {
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

	send(t, host, map[string]string{"t": "start"})
	if msg := next(t, host, "error"); msg["msg"] != race.ErrTooFew.Error() {
		t.Fatalf("start before picking = %v", msg["msg"])
	}
	send(t, host, map[string]string{"t": "pick", "ship": "tractor", "name": "Bat"})
	if msg := next(t, host, "error"); msg["msg"] != race.ErrBadShip.Error() {
		t.Fatalf("bad pick = %v", msg["msg"])
	}
	send(t, host, map[string]string{"t": "pick", "ship": "vega", "name": "Bat"})
	send(t, guest, map[string]string{"t": "pick", "ship": "wisp", "name": "Сараа"})
	lobby := next(t, host, "room")
	for lobby["names"].([]any)[1] != "Сараа" {
		lobby = next(t, host, "room")
	}
	if lobby["ships"].([]any)[1] != "wisp" {
		t.Fatalf("lobby = %v", lobby)
	}

	send(t, guest, map[string]string{"t": "start"})
	if msg := next(t, guest, "error"); msg["msg"] != race.ErrNotHost.Error() {
		t.Fatalf("guest start error = %v", msg["msg"])
	}
	send(t, host, map[string]string{"t": "start"})
	m := next(t, guest, "race")
	if players := m["players"].([]any); players[0] != true || players[1] != true || players[2] != false {
		t.Fatalf("race players = %v", players)
	}
	if !slices.Contains(race.Tracks, m["track"].(string)) {
		t.Fatalf("track = %v", m["track"])
	}

	// The countdown is 10 ms, so a state sent right away may fall inside it and be dropped. Keep
	// sending, under the socket's message limit, until the guest hears one.
	state := map[string]any{"t": "s", "p": 2, "d": 512.3, "x": -2.1, "y": 0, "h": 0.05, "v": 81.2, "b": 1, "l": 1, "c": 3}
	stop, stopped := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(stopped)
		for {
			_ = host.WriteJSON(state)
			select {
			case <-stop:
				return
			case <-time.After(40 * time.Millisecond):
			}
		}
	}()
	got := next(t, guest, "s")
	close(stop)
	<-stopped
	if got["s"] != float64(0) || got["d"] != 512.3 || got["v"] != 81.2 || got["l"] != float64(1) {
		t.Fatalf("relayed state = %v", got)
	}

	send(t, host, map[string]any{"t": "finish", "ms": 204118})
	done := next(t, guest, "done")
	if done["s"] != float64(0) || done["ms"] != float64(204118) || done["place"] != float64(1) {
		t.Fatalf("done = %v", done)
	}
	send(t, guest, map[string]any{"t": "finish", "ms": 209877})
	over := next(t, host, "over")
	if over["win"] != float64(0) || over["wins"].([]any)[0] != float64(1) {
		t.Fatalf("over = %v", over)
	}
}
