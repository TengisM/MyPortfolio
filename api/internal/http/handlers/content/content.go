// Package contenthandler serves the public content feed and the admin endpoints for projects,
// experience and publishing.
package contenthandler

import (
	"encoding/base64"
	"errors"
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"landing-api/internal/http/models"
	"landing-api/internal/service/content"
	"landing-api/internal/service/publish"
)

type Handler struct {
	svc       *content.Service
	publisher *publish.Publisher
}

func New(svc *content.Service, publisher *publish.Publisher) *Handler {
	return &Handler{svc: svc, publisher: publisher}
}

// Cache lifetimes for the public endpoints. The content feed is short, because the build reads it
// right after a save. Logos are long, because their URLs carry a version.
const (
	contentCacheControl = "public, max-age=60"
	logoCacheControl    = "public, max-age=86400"
)

const (
	msgBadBody           = "Хүсэлтийн бүтэц буруу байна"
	msgInternal          = "Дотоод алдаа гарлаа. Дараа дахин оролдоно уу."
	msgProjectNotFound   = "Төсөл олдсонгүй"
	msgExperienceMissing = "Туршлага олдсонгүй"
	msgLogoNotFound      = "Лого олдсонгүй"
	msgLogoBase64        = "Лого base64 хэлбэртэй байх ёстой"
	msgLogoTooLarge      = "Лого 1 МБ-аас ихгүй байх ёстой"
	msgLogoType          = "Лого PNG, JPEG эсвэл WebP зураг байх ёстой"
	msgReorderMismatch   = "Жагсаалтад бүх төсөл яг нэг удаа орсон байх ёстой"
)

// Public returns every published project and experience row in the snapshot shape.
func (h *Handler) Public(c *fiber.Ctx) error {
	out, err := h.svc.Public(c.Context())
	if err != nil {
		return internalError(c, "load public content", err)
	}
	c.Set(fiber.HeaderCacheControl, contentCacheControl)
	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true, Data: out})
}

// Logo serves one project's logo bytes.
func (h *Handler) Logo(c *fiber.Ctx) error {
	id, ok := pathID(c)
	if !ok {
		return notFound(c, msgLogoNotFound)
	}
	data, contentType, err := h.svc.Logo(c.Context(), id)
	if errors.Is(err, content.ErrNotFound) {
		return notFound(c, msgLogoNotFound)
	}
	if err != nil {
		return internalError(c, "load logo", err)
	}
	c.Set(fiber.HeaderContentType, contentType)
	c.Set(fiber.HeaderCacheControl, logoCacheControl)
	return c.Status(fiber.StatusOK).Send(data)
}

// ListProjects returns every project by sort_order.
func (h *Handler) ListProjects(c *fiber.Ctx) error {
	items, err := h.svc.ListProjects(c.Context())
	if err != nil {
		return internalError(c, "list projects", err)
	}
	return ok(c, models.RsList[models.RsAdminProject]{Items: items})
}

// CreateProject appends a project.
func (h *Handler) CreateProject(c *fiber.Ctx) error {
	in, msg := parseProjectBody(c)
	if msg != "" {
		return validationError(c, msg)
	}
	project, err := h.svc.CreateProject(c.Context(), in)
	if err != nil {
		return internalError(c, "create project", err)
	}
	return ok(c, project)
}

// UpdateProject replaces one project's fields.
func (h *Handler) UpdateProject(c *fiber.Ctx) error {
	id, found := pathID(c)
	if !found {
		return notFound(c, msgProjectNotFound)
	}
	in, msg := parseProjectBody(c)
	if msg != "" {
		return validationError(c, msg)
	}
	project, err := h.svc.UpdateProject(c.Context(), id, in)
	return projectResult(c, project, err, "update project")
}

// DeleteProject removes one project.
func (h *Handler) DeleteProject(c *fiber.Ctx) error {
	id, found := pathID(c)
	if !found {
		return notFound(c, msgProjectNotFound)
	}
	err := h.svc.DeleteProject(c.Context(), id)
	if errors.Is(err, content.ErrNotFound) {
		return notFound(c, msgProjectNotFound)
	}
	if err != nil {
		return internalError(c, "delete project", err)
	}
	return ok(c, nil)
}

// SetProjectLogo stores a base64 logo. A "data:image/...;base64," prefix is accepted too, because
// that is what FileReader.readAsDataURL produces.
func (h *Handler) SetProjectLogo(c *fiber.Ctx) error {
	id, found := pathID(c)
	if !found {
		return notFound(c, msgProjectNotFound)
	}

	var req models.RqProjectLogo
	if err := c.BodyParser(&req); err != nil {
		return validationError(c, msgBadBody)
	}
	encoded := strings.TrimSpace(req.DataBase64)
	if strings.HasPrefix(encoded, "data:") {
		if _, after, found := strings.Cut(encoded, ";base64,"); found {
			encoded = after
		}
	}
	if encoded == "" {
		return validationError(c, "Лого заавал оруулна уу")
	}
	// Refuse by length first, so an oversized upload is never decoded into memory.
	if len(encoded) > base64.StdEncoding.EncodedLen(models.MaxLogoBytes) {
		return validationError(c, msgLogoTooLarge)
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return validationError(c, msgLogoBase64)
	}

	project, err := h.svc.SetProjectLogo(c.Context(), id, data)
	switch {
	case errors.Is(err, content.ErrLogoTooLarge):
		return validationError(c, msgLogoTooLarge)
	case errors.Is(err, content.ErrLogoType):
		return validationError(c, msgLogoType)
	}
	return projectResult(c, project, err, "set project logo")
}

// ClearProjectLogo removes one project's logo.
func (h *Handler) ClearProjectLogo(c *fiber.Ctx) error {
	id, found := pathID(c)
	if !found {
		return notFound(c, msgProjectNotFound)
	}
	project, err := h.svc.ClearProjectLogo(c.Context(), id)
	return projectResult(c, project, err, "clear project logo")
}

// ReorderProjects sets the project order to the order of ids.
func (h *Handler) ReorderProjects(c *fiber.Ctx) error {
	var req models.RqReorder
	if err := c.BodyParser(&req); err != nil {
		return validationError(c, msgBadBody)
	}
	items, err := h.svc.ReorderProjects(c.Context(), req.IDs)
	if errors.Is(err, content.ErrIDSetMismatch) {
		return validationError(c, msgReorderMismatch)
	}
	if err != nil {
		return internalError(c, "reorder projects", err)
	}
	return ok(c, models.RsList[models.RsAdminProject]{Items: items})
}

// ListExperience returns every experience row, newest first.
func (h *Handler) ListExperience(c *fiber.Ctx) error {
	items, err := h.svc.ListExperience(c.Context())
	if err != nil {
		return internalError(c, "list experience", err)
	}
	return ok(c, models.RsList[models.RsAdminExperience]{Items: items})
}

// CreateExperience stores one experience row.
func (h *Handler) CreateExperience(c *fiber.Ctx) error {
	in, msg := parseExperienceBody(c)
	if msg != "" {
		return validationError(c, msg)
	}
	row, err := h.svc.CreateExperience(c.Context(), in)
	if err != nil {
		return internalError(c, "create experience", err)
	}
	return ok(c, row)
}

// UpdateExperience replaces one experience row.
func (h *Handler) UpdateExperience(c *fiber.Ctx) error {
	id, found := pathID(c)
	if !found {
		return notFound(c, msgExperienceMissing)
	}
	in, msg := parseExperienceBody(c)
	if msg != "" {
		return validationError(c, msg)
	}
	row, err := h.svc.UpdateExperience(c.Context(), id, in)
	if errors.Is(err, content.ErrNotFound) {
		return notFound(c, msgExperienceMissing)
	}
	if err != nil {
		return internalError(c, "update experience", err)
	}
	return ok(c, row)
}

// DeleteExperience removes one experience row.
func (h *Handler) DeleteExperience(c *fiber.Ctx) error {
	id, found := pathID(c)
	if !found {
		return notFound(c, msgExperienceMissing)
	}
	err := h.svc.DeleteExperience(c.Context(), id)
	if errors.Is(err, content.ErrNotFound) {
		return notFound(c, msgExperienceMissing)
	}
	if err != nil {
		return internalError(c, "delete experience", err)
	}
	return ok(c, nil)
}

// PublishStatus reports the deploy hook's state.
func (h *Handler) PublishStatus(c *fiber.Ctx) error {
	return ok(c, h.publisher.Status())
}

// PublishNow calls the deploy hook before answering. A hook failure is still a 200: it is reported
// in last_error, the same place a failed debounced publish shows up.
func (h *Handler) PublishNow(c *fiber.Ctx) error {
	return ok(c, h.publisher.PublishNow(c.Context()))
}

// parseProjectBody returns the input, or a validation message when the body is bad.
func parseProjectBody(c *fiber.Ctx) (content.ProjectInput, string) {
	var req models.RqProject
	if err := c.BodyParser(&req); err != nil {
		return content.ProjectInput{}, msgBadBody
	}
	return content.ParseProject(req)
}

// parseExperienceBody returns the input, or a validation message when the body is bad.
func parseExperienceBody(c *fiber.Ctx) (content.ExperienceInput, string) {
	var req models.RqExperience
	if err := c.BodyParser(&req); err != nil {
		return content.ExperienceInput{}, msgBadBody
	}
	return content.ParseExperience(req)
}

func projectResult(c *fiber.Ctx, project models.RsAdminProject, err error, action string) error {
	if errors.Is(err, content.ErrNotFound) {
		return notFound(c, msgProjectNotFound)
	}
	if err != nil {
		return internalError(c, action, err)
	}
	return ok(c, project)
}

// pathID reads :id. A malformed id cannot name a row, so callers answer 404.
func pathID(c *fiber.Ctx) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Params("id"))
	return id, err == nil
}

func ok(c *fiber.Ctx, data any) error {
	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true, Data: data})
}

func validationError(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{Error: "validation error", Message: msg})
}

func notFound(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusNotFound).JSON(models.ErrorResponse{Error: "not found", Message: msg})
}

func internalError(c *fiber.Ctx, action string, err error) error {
	slog.Error(action+" failed", slog.Any("err", err))
	return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
		Error: "internal error", Message: msgInternal,
	})
}
