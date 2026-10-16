// Package content stores the portfolio's projects and experience, and serves them to the site's
// build. Every successful write asks the publisher for a rebuild.
package content

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrIDSetMismatch = errors.New("ids must name every project exactly once")
	ErrLogoTooLarge  = errors.New("logo is larger than 1 MB")
	ErrLogoType      = errors.New("logo is not a PNG, JPEG or WebP image")
)

// Scheduler is the part of publish.Publisher this package needs.
type Scheduler interface {
	Schedule()
}

type Service struct {
	pool      *pgxpool.Pool
	q         *sqlc.Queries
	publisher Scheduler
}

func New(pool *pgxpool.Pool, q *sqlc.Queries, publisher Scheduler) *Service {
	return &Service{pool: pool, q: q, publisher: publisher}
}

// ProjectInput is a validated project body. ParseProject builds it.
type ProjectInput struct {
	Title         string
	URL           string
	DescriptionMn string
	DescriptionEn string
	Published     bool
}

// ExperienceInput is a validated experience body. ParseExperience builds it.
type ExperienceInput struct {
	Kind           string
	OrganizationMn string
	OrganizationEn string
	PositionMn     string
	PositionEn     string
	DescriptionMn  string
	DescriptionEn  string
	StartDate      time.Time
	EndDate        *time.Time
	Published      bool
}

// Public returns the published rows in the snapshot shape.
func (s *Service) Public(ctx context.Context) (*models.RsContent, error) {
	projects, err := s.q.ListPublishedProjects(ctx)
	if err != nil {
		return nil, fmt.Errorf("list published projects: %w", err)
	}
	experience, err := s.q.ListPublishedExperience(ctx)
	if err != nil {
		return nil, fmt.Errorf("list published experience: %w", err)
	}

	out := &models.RsContent{
		Projects:   make([]models.RsContentProject, 0, len(projects)),
		Experience: make([]models.RsContentExperience, 0, len(experience)),
	}
	for _, p := range projects {
		out.Projects = append(out.Projects, models.RsContentProject{
			ID:          p.ID,
			Title:       p.Title,
			URL:         p.Url,
			Logo:        logoURL(p),
			Description: models.Localized{Mn: p.DescriptionMn, En: p.DescriptionEn},
		})
	}
	for _, e := range experience {
		out.Experience = append(out.Experience, models.RsContentExperience{
			ID:           e.ID,
			Kind:         e.Kind,
			Organization: models.Localized{Mn: e.OrganizationMn, En: e.OrganizationEn},
			Position:     models.Localized{Mn: e.PositionMn, En: e.PositionEn},
			Description:  models.Localized{Mn: e.DescriptionMn, En: e.DescriptionEn},
			StartDate:    e.StartDate.Format(models.DateLayout),
			EndDate:      formatDate(e.EndDate),
		})
	}
	return out, nil
}

// Logo returns one project's logo and its content type. Unpublished projects are served too, so
// the admin panel can preview them; ids are random, so nobody finds one by guessing.
func (s *Service) Logo(ctx context.Context, id uuid.UUID) ([]byte, string, error) {
	row, err := s.q.GetProjectLogo(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	if err != nil {
		return nil, "", fmt.Errorf("get project logo: %w", err)
	}
	contentType := ""
	if row.LogoContentType != nil {
		contentType = *row.LogoContentType
	}
	return row.Logo, contentType, nil
}

// ListProjects returns every project by sort_order.
func (s *Service) ListProjects(ctx context.Context) ([]models.RsAdminProject, error) {
	rows, err := s.q.ListProjects(ctx)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	out := make([]models.RsAdminProject, 0, len(rows))
	for _, row := range rows {
		out = append(out, toAdminProject(row))
	}
	return out, nil
}

// CreateProject appends a project at the end of the list.
func (s *Service) CreateProject(ctx context.Context, in ProjectInput) (models.RsAdminProject, error) {
	id := uuid.New()
	err := s.q.CreateProject(ctx, sqlc.CreateProjectParams{
		ID:            id,
		Title:         in.Title,
		Url:           in.URL,
		DescriptionMn: in.DescriptionMn,
		DescriptionEn: in.DescriptionEn,
		Published:     in.Published,
	})
	if err != nil {
		return models.RsAdminProject{}, fmt.Errorf("create project: %w", err)
	}
	s.publisher.Schedule()
	return s.getProject(ctx, id)
}

// UpdateProject replaces a project's text fields and published flag.
func (s *Service) UpdateProject(ctx context.Context, id uuid.UUID, in ProjectInput) (models.RsAdminProject, error) {
	n, err := s.q.UpdateProject(ctx, sqlc.UpdateProjectParams{
		ID:            id,
		Title:         in.Title,
		Url:           in.URL,
		DescriptionMn: in.DescriptionMn,
		DescriptionEn: in.DescriptionEn,
		Published:     in.Published,
	})
	if err != nil {
		return models.RsAdminProject{}, fmt.Errorf("update project: %w", err)
	}
	if n == 0 {
		return models.RsAdminProject{}, ErrNotFound
	}
	s.publisher.Schedule()
	return s.getProject(ctx, id)
}

// DeleteProject removes a project and its logo.
func (s *Service) DeleteProject(ctx context.Context, id uuid.UUID) error {
	n, err := s.q.DeleteProject(ctx, id)
	if err != nil {
		return fmt.Errorf("delete project: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	s.publisher.Schedule()
	return nil
}

// SetProjectLogo checks data with SniffLogo and stores it.
func (s *Service) SetProjectLogo(ctx context.Context, id uuid.UUID, data []byte) (models.RsAdminProject, error) {
	contentType, err := SniffLogo(data)
	if err != nil {
		return models.RsAdminProject{}, err
	}
	n, err := s.q.SetProjectLogo(ctx, sqlc.SetProjectLogoParams{
		ID:              id,
		Logo:            data,
		LogoContentType: &contentType,
	})
	if err != nil {
		return models.RsAdminProject{}, fmt.Errorf("set project logo: %w", err)
	}
	if n == 0 {
		return models.RsAdminProject{}, ErrNotFound
	}
	s.publisher.Schedule()
	return s.getProject(ctx, id)
}

// ClearProjectLogo removes a project's logo. Clearing one that has none still succeeds.
func (s *Service) ClearProjectLogo(ctx context.Context, id uuid.UUID) (models.RsAdminProject, error) {
	n, err := s.q.ClearProjectLogo(ctx, id)
	if err != nil {
		return models.RsAdminProject{}, fmt.Errorf("clear project logo: %w", err)
	}
	if n == 0 {
		return models.RsAdminProject{}, ErrNotFound
	}
	s.publisher.Schedule()
	return s.getProject(ctx, id)
}

// ReorderProjects sets sort_order to each id's index. ids must hold every project exactly once, so
// a panel with a stale list cannot drop a project to the end by accident.
func (s *Service) ReorderProjects(ctx context.Context, ids []uuid.UUID) ([]models.RsAdminProject, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin reorder: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.q.WithTx(tx)

	existing, err := q.LockProjectIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("lock projects: %w", err)
	}
	if !sameSet(existing, ids) {
		return nil, ErrIDSetMismatch
	}

	for i, id := range ids {
		if err := q.SetProjectSortOrder(ctx, sqlc.SetProjectSortOrderParams{ID: id, SortOrder: int32(i)}); err != nil {
			return nil, fmt.Errorf("set sort order: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit reorder: %w", err)
	}

	s.publisher.Schedule()
	return s.ListProjects(ctx)
}

// ListExperience returns every row, newest start_date first.
func (s *Service) ListExperience(ctx context.Context) ([]models.RsAdminExperience, error) {
	rows, err := s.q.ListExperience(ctx)
	if err != nil {
		return nil, fmt.Errorf("list experience: %w", err)
	}
	out := make([]models.RsAdminExperience, 0, len(rows))
	for _, row := range rows {
		out = append(out, toAdminExperience(row))
	}
	return out, nil
}

// CreateExperience stores one row.
func (s *Service) CreateExperience(ctx context.Context, in ExperienceInput) (models.RsAdminExperience, error) {
	row, err := s.q.CreateExperience(ctx, sqlc.CreateExperienceParams{
		ID:             uuid.New(),
		Kind:           in.Kind,
		OrganizationMn: in.OrganizationMn,
		OrganizationEn: in.OrganizationEn,
		PositionMn:     in.PositionMn,
		PositionEn:     in.PositionEn,
		DescriptionMn:  in.DescriptionMn,
		DescriptionEn:  in.DescriptionEn,
		StartDate:      in.StartDate,
		EndDate:        in.EndDate,
		Published:      in.Published,
	})
	if err != nil {
		return models.RsAdminExperience{}, fmt.Errorf("create experience: %w", err)
	}
	s.publisher.Schedule()
	return toAdminExperience(row), nil
}

// UpdateExperience replaces one row.
func (s *Service) UpdateExperience(ctx context.Context, id uuid.UUID, in ExperienceInput) (models.RsAdminExperience, error) {
	row, err := s.q.UpdateExperience(ctx, sqlc.UpdateExperienceParams{
		ID:             id,
		Kind:           in.Kind,
		OrganizationMn: in.OrganizationMn,
		OrganizationEn: in.OrganizationEn,
		PositionMn:     in.PositionMn,
		PositionEn:     in.PositionEn,
		DescriptionMn:  in.DescriptionMn,
		DescriptionEn:  in.DescriptionEn,
		StartDate:      in.StartDate,
		EndDate:        in.EndDate,
		Published:      in.Published,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return models.RsAdminExperience{}, ErrNotFound
	}
	if err != nil {
		return models.RsAdminExperience{}, fmt.Errorf("update experience: %w", err)
	}
	s.publisher.Schedule()
	return toAdminExperience(row), nil
}

// DeleteExperience removes one row.
func (s *Service) DeleteExperience(ctx context.Context, id uuid.UUID) error {
	n, err := s.q.DeleteExperience(ctx, id)
	if err != nil {
		return fmt.Errorf("delete experience: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	s.publisher.Schedule()
	return nil
}

// SniffLogo returns data's content type if it is an accepted logo. The type comes from the bytes,
// never from the client, because the logo endpoint serves it back with that type.
func SniffLogo(data []byte) (string, error) {
	if len(data) > models.MaxLogoBytes {
		return "", ErrLogoTooLarge
	}
	if len(data) == 0 {
		return "", ErrLogoType
	}
	contentType := http.DetectContentType(data)
	switch contentType {
	case "image/png", "image/jpeg", "image/webp":
		return contentType, nil
	default:
		return "", ErrLogoType
	}
}

func (s *Service) getProject(ctx context.Context, id uuid.UUID) (models.RsAdminProject, error) {
	row, err := s.q.GetProject(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		// Deleted between the write and this read.
		return models.RsAdminProject{}, ErrNotFound
	}
	if err != nil {
		return models.RsAdminProject{}, fmt.Errorf("get project: %w", err)
	}
	return toAdminProject(row), nil
}

func toAdminProject(row sqlc.ProjectSummary) models.RsAdminProject {
	return models.RsAdminProject{
		ID:            row.ID,
		Title:         row.Title,
		URL:           row.Url,
		DescriptionMn: row.DescriptionMn,
		DescriptionEn: row.DescriptionEn,
		Published:     row.Published,
		SortOrder:     row.SortOrder,
		LogoURL:       logoURL(row),
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

func toAdminExperience(row sqlc.Experience) models.RsAdminExperience {
	return models.RsAdminExperience{
		ID:             row.ID,
		Kind:           row.Kind,
		OrganizationMn: row.OrganizationMn,
		OrganizationEn: row.OrganizationEn,
		PositionMn:     row.PositionMn,
		PositionEn:     row.PositionEn,
		DescriptionMn:  row.DescriptionMn,
		DescriptionEn:  row.DescriptionEn,
		StartDate:      row.StartDate.Format(models.DateLayout),
		EndDate:        formatDate(row.EndDate),
		Published:      row.Published,
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

// logoURL carries updated_at as a version, so a new logo gets a new URL and the long cache on the
// logo endpoint never serves the old one.
func logoURL(row sqlc.ProjectSummary) *string {
	if !row.HasLogo {
		return nil
	}
	u := fmt.Sprintf("/api/content/logos/%s?v=%d", row.ID, row.UpdatedAt.Unix())
	return &u
}

func formatDate(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(models.DateLayout)
	return &s
}

func sameSet(existing, ids []uuid.UUID) bool {
	if len(existing) != len(ids) {
		return false
	}
	want := make(map[uuid.UUID]bool, len(existing))
	for _, id := range existing {
		want[id] = true
	}
	for _, id := range ids {
		if !want[id] {
			// Unknown, or already seen once.
			return false
		}
		delete(want, id)
	}
	return true
}
