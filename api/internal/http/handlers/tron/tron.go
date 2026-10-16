// Package tronhandler connects players to online Tron rooms over a WebSocket.
//
// The first message opens or joins a room: {"t":"create"} or {"t":"join","code":"ABCD"}. After
// that the host sends {"t":"addbot"}, {"t":"dropbot"} and {"t":"start"}, and everyone steers
// with {"t":"turn","d":0..3}. Everything the server says is described in the tron service package.
package tronhandler

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/handlers/gamesocket"
	"landing-api/internal/service/tron"
)

var socket = gamesocket.Config{
	// The largest valid message is a join with its code, about 30 bytes.
	ReadLimit: 256,
	// A tick is about 100 bytes.
	SendQueue: 64,
	// A person turns a few times a second at most. Far past that is a script.
	MaxMessagesPerSecond: 30,
}

type Handler struct {
	hub   *tron.Hub
	guard *gamesocket.Guard
}

// New takes the CORS allowlist and the development switch; gamesocket.NewGuard says what they
// let in.
func New(hub *tron.Hub, corsOrigins string, allowLocalhost bool) *Handler {
	return &Handler{hub: hub, guard: gamesocket.NewGuard(corsOrigins, allowLocalhost)}
}

// Upgrade refuses plain HTTP and pages from other sites before the socket opens.
func (h *Handler) Upgrade(c *fiber.Ctx) error { return h.guard.Upgrade(c) }

// Socket serves one player for the life of their connection.
func (h *Handler) Socket() fiber.Handler { return gamesocket.Socket(socket, h.play) }

type incoming struct {
	T    string `json:"t"`
	Code string `json:"code"`
	D    int    `json:"d"`
}

func (h *Handler) play(c *gamesocket.Conn, read gamesocket.Reader) {
	var hello incoming
	if !read.JSON(&hello) {
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

	for {
		var msg incoming
		if !read.JSON(&msg) {
			return
		}
		switch msg.T {
		case "turn":
			if msg.D >= 0 && msg.D <= 3 {
				room.Turn(seat, tron.Dir(msg.D))
			}
		case "start", "addbot", "dropbot":
			var err error
			switch msg.T {
			case "start":
				err = room.Start(seat)
			case "addbot":
				err = room.AddBot(seat)
			default:
				err = room.RemoveBot(seat)
			}
			if err != nil {
				// Not fatal: tell them why and keep the connection.
				c.Send(tron.ErrorMessage(err))
			}
		}
	}
}
