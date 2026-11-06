// Package racehandler serves the racer's weekly scoreboard.
package racehandler

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/models"
	"landing-api/internal/service/race"
)

type Handler struct {
	board *race.Board
}

func New(board *race.Board) *Handler {
	return &Handler{board: board}
}

type postRequest struct {
	Track string `json:"track"`
	Name  string `json:"name"`
	Ship  string `json:"ship"`
	LapMs []int  `json:"lap_ms"`
}

// Board returns this week's top 10 for ?track=, plus the place of ?name= when it has a run.
func (h *Handler) Board(c *fiber.Ctx) error {
	view, err := h.board.Get(c.Context(), c.Query("track"), c.Query("name"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(view)
}

// Post stores a solo run and returns the board with its place.
func (h *Handler) Post(c *fiber.Ctx) error {
	var req postRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "validation error", Message: "The request body is not valid JSON.",
		})
	}
	view, err := h.board.Post(c.Context(), race.Run{
		Track: req.Track, Name: req.Name, Ship: req.Ship, LapMs: req.LapMs,
	})
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(view)
}

func fail(c *fiber.Ctx, err error) error {
	if errors.Is(err, race.ErrBadRun) {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "validation error", Message: race.Message(err),
		})
	}
	slog.Error("race board failed", slog.Any("err", err))
	return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
		Error: "internal error", Message: "Something went wrong. Try again later.",
	})
}
