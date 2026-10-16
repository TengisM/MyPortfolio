package routes

import (
	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/handlers"
	"landing-api/internal/utils/secure"
)

// noStore marks every admin response uncacheable, since leads hold personal data and the panel must
// never see a stale project list after a save. It runs before AuthMiddleware so a 401 is covered too.
func noStore(c *fiber.Ctx) error {
	c.Set(fiber.HeaderCacheControl, "no-store")
	return c.Next()
}

// setupAdminRoutes mounts every route that requires a valid access token.
func setupAdminRoutes(api fiber.Router, h *handlers.Handlers, tokenService *secure.TokenService) {
	admin := api.Group("/admin", noStore, handlers.AuthMiddleware(tokenService))
	admin.Get("/leads", h.Lead.List)

	admin.Get("/projects", h.Content.ListProjects)
	admin.Post("/projects", h.Content.CreateProject)
	admin.Post("/projects/reorder", h.Content.ReorderProjects)
	admin.Put("/projects/:id", h.Content.UpdateProject)
	admin.Delete("/projects/:id", h.Content.DeleteProject)
	admin.Put("/projects/:id/logo", h.Content.SetProjectLogo)
	admin.Delete("/projects/:id/logo", h.Content.ClearProjectLogo)

	admin.Get("/experience", h.Content.ListExperience)
	admin.Post("/experience", h.Content.CreateExperience)
	admin.Put("/experience/:id", h.Content.UpdateExperience)
	admin.Delete("/experience/:id", h.Content.DeleteExperience)

	admin.Get("/publish", h.Content.PublishStatus)
	admin.Post("/publish", h.Content.PublishNow)
}
