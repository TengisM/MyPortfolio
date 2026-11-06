// Package handlers holds one HTTP handler per domain.
package handlers

import (
	"landing-api/conf"
	authhandler "landing-api/internal/http/handlers/auth"
	contenthandler "landing-api/internal/http/handlers/content"
	leadhandler "landing-api/internal/http/handlers/lead"
	racehandler "landing-api/internal/http/handlers/race"
	tetrishandler "landing-api/internal/http/handlers/tetris"
	tronhandler "landing-api/internal/http/handlers/tron"
	"landing-api/internal/service"
)

// Handlers is every domain's HTTP handler.
type Handlers struct {
	Lead    *leadhandler.Handler
	Auth    *authhandler.Handler
	Content *contenthandler.Handler
	Tron    *tronhandler.Handler
	Tetris  *tetrishandler.Handler
	Race    *racehandler.Handler
	// RaceSocket is the online race rooms, beside the scoreboard.
	RaceSocket *racehandler.Socket
}

// New builds every handler. cfg decides whether the refresh cookie is Secure.
func New(services *service.Services, cfg *conf.Config) *Handlers {
	return &Handlers{
		Lead:       leadhandler.New(services.Lead),
		Auth:       authhandler.New(services.Auth, !cfg.IsDevelopment()),
		Content:    contenthandler.New(services.Content, services.Publisher),
		Tron:       tronhandler.New(services.Tron, cfg.Server.CORSOrigins, cfg.IsDevelopment()),
		Tetris:     tetrishandler.New(services.Tetris, cfg.Server.CORSOrigins, cfg.IsDevelopment()),
		Race:       racehandler.New(services.Race),
		RaceSocket: racehandler.NewSocket(services.RaceRooms, cfg.Server.CORSOrigins, cfg.IsDevelopment()),
	}
}
