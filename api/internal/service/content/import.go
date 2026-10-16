package content

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
)

// ErrNotEmpty means import-content found rows already. It never merges into existing content.
var ErrNotEmpty = errors.New("projects or experience already has rows")

// ImportResult counts what Import wrote.
type ImportResult struct {
	Projects   int
	Logos      int
	Experience int
}

// DefaultPublicDir is where a snapshot's logo paths resolve when no --public is given: the
// project's public/ folder, two levels up from src/content/content.json.
func DefaultPublicDir(snapshotPath string) string {
	return filepath.Join(filepath.Dir(snapshotPath), "..", "..", "public")
}

// Import reads a content.json snapshot and inserts it with its ids. Project order is the array
// order. Each logo path is read under publicDir. Everything is checked before the first insert,
// and the inserts share one transaction, so a bad file leaves the database empty.
func Import(ctx context.Context, pool *pgxpool.Pool, snapshotPath, publicDir string) (ImportResult, error) {
	raw, err := os.ReadFile(snapshotPath) //nolint:gosec // the operator names this file on the command line
	if err != nil {
		return ImportResult{}, fmt.Errorf("read snapshot: %w", err)
	}
	var snap models.RsContent
	if err := json.Unmarshal(raw, &snap); err != nil {
		return ImportResult{}, fmt.Errorf("parse snapshot: %w", err)
	}

	projects := make([]sqlc.ImportProjectParams, 0, len(snap.Projects))
	result := ImportResult{}
	for i, p := range snap.Projects {
		in, msg := ParseProject(models.RqProject{
			Title:         p.Title,
			URL:           p.URL,
			DescriptionMn: p.Description.Mn,
			DescriptionEn: p.Description.En,
		})
		if msg != "" {
			return ImportResult{}, fmt.Errorf("project %d (%s): %s", i, p.Title, msg)
		}
		params := sqlc.ImportProjectParams{
			ID:            p.ID,
			Title:         in.Title,
			Url:           in.URL,
			DescriptionMn: in.DescriptionMn,
			DescriptionEn: in.DescriptionEn,
			Published:     true,
			SortOrder:     int32(i),
		}
		if p.Logo != nil {
			data, contentType, err := readLogo(publicDir, *p.Logo)
			if err != nil {
				return ImportResult{}, fmt.Errorf("project %d (%s): %w", i, p.Title, err)
			}
			params.Logo = data
			params.LogoContentType = &contentType
			result.Logos++
		}
		projects = append(projects, params)
	}

	experience := make([]sqlc.CreateExperienceParams, 0, len(snap.Experience))
	for i, e := range snap.Experience {
		in, msg := ParseExperience(models.RqExperience{
			Kind:           e.Kind,
			OrganizationMn: e.Organization.Mn,
			OrganizationEn: e.Organization.En,
			PositionMn:     e.Position.Mn,
			PositionEn:     e.Position.En,
			DescriptionMn:  e.Description.Mn,
			DescriptionEn:  e.Description.En,
			StartDate:      e.StartDate,
			EndDate:        e.EndDate,
		})
		if msg != "" {
			return ImportResult{}, fmt.Errorf("experience %d (%s): %s", i, e.Organization.En, msg)
		}
		experience = append(experience, sqlc.CreateExperienceParams{
			ID:             e.ID,
			Kind:           in.Kind,
			OrganizationMn: in.OrganizationMn,
			OrganizationEn: in.OrganizationEn,
			PositionMn:     in.PositionMn,
			PositionEn:     in.PositionEn,
			DescriptionMn:  in.DescriptionMn,
			DescriptionEn:  in.DescriptionEn,
			StartDate:      in.StartDate,
			EndDate:        in.EndDate,
			Published:      true,
		})
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return ImportResult{}, fmt.Errorf("begin import: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := sqlc.New(tx)

	projectCount, err := q.CountProjects(ctx)
	if err != nil {
		return ImportResult{}, fmt.Errorf("count projects: %w", err)
	}
	experienceCount, err := q.CountExperience(ctx)
	if err != nil {
		return ImportResult{}, fmt.Errorf("count experience: %w", err)
	}
	if projectCount > 0 || experienceCount > 0 {
		return ImportResult{}, fmt.Errorf("%w: %d projects, %d experience", ErrNotEmpty, projectCount, experienceCount)
	}

	for _, p := range projects {
		if err := q.ImportProject(ctx, p); err != nil {
			return ImportResult{}, fmt.Errorf("insert project %s: %w", p.ID, err)
		}
	}
	for _, e := range experience {
		if _, err := q.CreateExperience(ctx, e); err != nil {
			return ImportResult{}, fmt.Errorf("insert experience %s: %w", e.ID, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return ImportResult{}, fmt.Errorf("commit import: %w", err)
	}

	result.Projects = len(projects)
	result.Experience = len(experience)
	return result, nil
}

// readLogo reads a site path like "/content/logos/x.png" from under publicDir and checks it the
// same way the logo endpoint does.
func readLogo(publicDir, sitePath string) ([]byte, string, error) {
	rel := filepath.FromSlash(strings.TrimPrefix(sitePath, "/"))
	full := filepath.Join(publicDir, rel)
	// The snapshot is trusted, but a path that climbs out of public/ is a mistake worth catching.
	if inside, err := filepath.Rel(publicDir, full); err != nil || strings.HasPrefix(inside, "..") {
		return nil, "", fmt.Errorf("logo %q is outside %s", sitePath, publicDir)
	}

	data, err := os.ReadFile(full) //nolint:gosec // checked above to stay under publicDir
	if err != nil {
		return nil, "", fmt.Errorf("read logo: %w", err)
	}
	contentType, err := SniffLogo(data)
	if err != nil {
		return nil, "", fmt.Errorf("logo %s: %w", full, err)
	}
	return data, contentType, nil
}
