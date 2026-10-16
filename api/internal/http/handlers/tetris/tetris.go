// Package tetrishandler connects players to online Tetris rooms over a WebSocket.
//
// The first message opens or joins a room: {"t":"create"} or {"t":"join","code":"ABCD"}. After
// that the host sends {"t":"start"}, and each player in the round sends their board as
// {"t":"board","b":"<200 cells>","l":lines} and {"t":"dead"} when they top out. Everything the
// server says is described in the tetris service package.
package tetrishandler

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/handlers/gamesocket"
	"landing-api/internal/service/tetris"
)

var socket = gamesocket.Config{
	// A board message is about 230 bytes.
	ReadLimit: 512,
	// Up to three boards arrive about 12 times a second each, so this is a couple of seconds of
	// them, not 64 like Tron's ticks.
	SendQueue: 128,
	// The client sends about 12 boards a second. Far past that is a script.
	MaxMessagesPerSecond: 30,
}

type Handler struct {
	hub   *tetris.Hub
	guard *gamesocket.Guard
}

// New takes the CORS allowlist and the development switch; gamesocket.NewGuard says what they
// let in.
func New(hub *tetris.Hub, corsOrigins string, allowLocalhost bool) *Handler {
	return &Handler{hub: hub, guard: gamesocket.NewGuard(corsOrigins, allowLocalhost)}
}

// Upgrade refuses plain HTTP and pages from other sites before the socket opens.
func (h *Handler) Upgrade(c *fiber.Ctx) error { return h.guard.Upgrade(c) }

// Socket serves one player for the life of their connection.
func (h *Handler) Socket() fiber.Handler { return gamesocket.Socket(socket, h.play) }

type incoming struct {
	T    string `json:"t"`
	Code string `json:"code"`
	B    string `json:"b"`
	L    int    `json:"l"`
}

func (h *Handler) play(c *gamesocket.Conn, read gamesocket.Reader) {
	var hello incoming
	if !read.JSON(&hello) {
		return
	}
	var room *tetris.Room
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
		c.Send(tetris.ErrorMessage(err))
		return
	}
	defer room.Leave(seat)

	for {
		var msg incoming
		if !read.JSON(&msg) {
			return
		}
		switch msg.T {
		case "board":
			room.Board(seat, msg.B, msg.L)
		case "dead":
			room.Dead(seat)
		case "start":
			if err := room.Start(seat); err != nil {
				// Not fatal: tell them why and keep the connection.
				c.Send(tetris.ErrorMessage(err))
			}
		}
	}
}
