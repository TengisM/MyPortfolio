package racehandler

import (
	"math"
	"strings"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/handlers/gamesocket"
	"landing-api/internal/service/race"
)

var socket = gamesocket.Config{
	// A state message is about 90 bytes.
	ReadLimit: 512,
	// Up to three ships send about 20 states a second each, so this is a few seconds of them.
	SendQueue: 256,
	// The client sends about 20 states a second. Far past that is a script.
	MaxMessagesPerSecond: 40,
}

// Socket connects players to online race rooms over a WebSocket.
//
// The first message opens or joins a room: {"t":"create"} or {"t":"join","code":"ABCD"}. After
// that a player sends {"t":"pick","ship":"vega","name":"Bat"} in the lobby, the host sends
// {"t":"start"}, and each racer sends {"t":"s",...} ship states and {"t":"finish","ms":N}.
// Everything the server says is described in the race service package.
type Socket struct {
	hub   *race.Hub
	guard *gamesocket.Guard
}

// NewSocket takes the CORS allowlist and the development switch; gamesocket.NewGuard says what
// they let in.
func NewSocket(hub *race.Hub, corsOrigins string, allowLocalhost bool) *Socket {
	return &Socket{hub: hub, guard: gamesocket.NewGuard(corsOrigins, allowLocalhost)}
}

// Upgrade refuses plain HTTP and pages from other sites before the socket opens.
func (h *Socket) Upgrade(c *fiber.Ctx) error { return h.guard.Upgrade(c) }

// Socket serves one player for the life of their connection.
func (h *Socket) Socket() fiber.Handler { return gamesocket.Socket(socket, h.play) }

type incoming struct {
	race.State

	T    string  `json:"t"`
	Code string  `json:"code"`
	Ship string  `json:"ship"`
	Name string  `json:"name"`
	Ms   float64 `json:"ms"`
}

func (h *Socket) play(c *gamesocket.Conn, read gamesocket.Reader) {
	var hello incoming
	if !read.JSON(&hello) {
		return
	}
	var room *race.Room
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
		c.Send(race.ErrorMessage(err))
		return
	}
	defer room.Leave(seat)

	for {
		var msg incoming
		if !read.JSON(&msg) {
			return
		}
		switch msg.T {
		case "pick":
			if err := room.Pick(seat, msg.Ship, msg.Name); err != nil {
				c.Send(race.ErrorMessage(err))
			}
		case "start":
			if err := room.Start(seat); err != nil {
				// Not fatal: tell them why and keep the connection.
				c.Send(race.ErrorMessage(err))
			}
		case "s":
			room.State(seat, msg.State)
		case "finish":
			// Rounded so 204118.0 is fine. Anything absurd becomes 0, which Finish drops.
			ms := 0
			if msg.Ms > 0 && msg.Ms < 1e9 {
				ms = int(math.Round(msg.Ms))
			}
			room.Finish(seat, ms)
		}
	}
}
