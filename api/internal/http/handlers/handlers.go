// Package handlers holds one HTTP handler per domain.
package handlers

import (
	"landing-api/conf"
	authhandler "landing-api/internal/http/handlers/auth"
	contenthandler "landing-api/internal/http/handlers/content"
	leadhandler "landing-api/internal/http/handlers/lead"
	tronhandler "landing-api/internal/http/handlers/tron"
	"landing-api/internal/service"
)

// Handlers is every domain's HTTP handler.
type Handlers struct {
	Lead    *leadhandler.Handler
	Auth    *authhandler.Handler
	Content *contenthandler.Handler
	Tron    *tronhandler.Handler
}

// New builds every handler. cfg decides whether the refresh cookie is Secure.
func New(services *service.Services, cfg *conf.Config) *Handlers {
	return &Handlers{
		Lead:    leadhandler.New(services.Lead),
		Auth:    authhandler.New(services.Auth, !cfg.IsDevelopment()),
		Content: contenthandler.New(services.Content, services.Publisher),
		Tron:    tronhandler.New(services.Tron, cfg.Server.CORSOrigins, cfg.IsDevelopment()),
	}
}
