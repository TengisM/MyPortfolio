package content_test

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
	"landing-api/internal/service/content"
	"landing-api/internal/testsupport"
)

// pngBytes starts with the PNG signature, which is all http.DetectContentType reads.
var pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 64)...) //nolint:gochecknoglobals // fixture

const (
	firstProjectID  = "15ff3610-9e98-4717-83e5-6e2d682a9f21"
	secondProjectID = "1f6f49a9-e27c-468d-9694-5d21e139747c"
	experienceID    = "2518896f-973b-495b-be2e-f871c03b92f6"
)

const snapshotJSON = `{
  "projects": [
    {
      "id": "` + firstProjectID + `",
      "title": "Tetgeleg",
      "url": "https://tetgeleg.mn/",
      "logo": "/content/logos/` + firstProjectID + `.png",
      "description": { "mn": "Тэтгэлэг", "en": "Scholarships" }
    },
    {
      "id": "` + secondProjectID + `",
      "title": "Landing Kit",
      "url": "https://www.npmjs.com/package/@tanasoftllc/landing-kit",
      "logo": null,
      "description": { "mn": "", "en": "" }
    }
  ],
  "experience": [
    {
      "id": "` + experienceID + `",
      "kind": "work",
      "organization": { "mn": "Танасофт ХХК", "en": "Tanasoft LLC" },
      "position": { "mn": "Fullstack инженер", "en": "Fullstack Engineer" },
      "description": { "mn": "", "en": "" },
      "start_date": "2026-04-01",
      "end_date": null
    }
  ]
}`

// writeSnapshot lays out <root>/src/content/content.json and <root>/public/content/logos/, as in
// the real project, and returns the snapshot's path.
func writeSnapshot(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	snapshot := filepath.Join(root, "src", "content", "content.json")
	logos := filepath.Join(root, "public", "content", "logos")
	for _, dir := range []string{filepath.Dir(snapshot), logos} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
	}
	if err := os.WriteFile(snapshot, []byte(snapshotJSON), 0o600); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
	if err := os.WriteFile(filepath.Join(logos, firstProjectID+".png"), pngBytes, 0o600); err != nil {
		t.Fatalf("write logo: %v", err)
	}
	return snapshot
}

func TestImportKeepsIDsOrderAndLogos(t *testing.T) {
	t.Parallel()

	db := testsupport.Fresh(t)
	snapshot := writeSnapshot(t)

	result, err := content.Import(context.Background(), db.Pool, snapshot, content.DefaultPublicDir(snapshot))
	if err != nil {
		t.Fatalf("Import() error = %v", err)
	}
	if result != (content.ImportResult{Projects: 2, Logos: 1, Experience: 1}) {
		t.Errorf("result = %+v, want 2 projects, 1 logo, 1 experience", result)
	}

	projects, err := db.Queries.ListProjects(context.Background())
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 2 {
		t.Fatalf("got %d projects, want 2", len(projects))
	}
	if projects[0].ID.String() != firstProjectID || projects[0].SortOrder != 0 || !projects[0].HasLogo {
		t.Errorf("first project = %+v, want %s at 0 with a logo", projects[0], firstProjectID)
	}
	if projects[1].ID.String() != secondProjectID || projects[1].SortOrder != 1 || projects[1].HasLogo {
		t.Errorf("second project = %+v, want %s at 1 without a logo", projects[1], secondProjectID)
	}

	logo, err := db.Queries.GetProjectLogo(context.Background(), uuid.MustParse(firstProjectID))
	if err != nil {
		t.Fatalf("GetProjectLogo: %v", err)
	}
	if logo.LogoContentType == nil || *logo.LogoContentType != "image/png" || !bytes.Equal(logo.Logo, pngBytes) {
		t.Errorf("stored logo = %v bytes as %v, want the PNG", len(logo.Logo), logo.LogoContentType)
	}

	experience, err := db.Queries.ListExperience(context.Background())
	if err != nil {
		t.Fatalf("ListExperience: %v", err)
	}
	if len(experience) != 1 || experience[0].ID.String() != experienceID || experience[0].EndDate != nil {
		t.Errorf("experience = %+v, want %s with no end date", experience, experienceID)
	}
}

func TestImportRefusesANonEmptyDatabase(t *testing.T) {
	t.Parallel()

	db := testsupport.Fresh(t)
	if _, err := db.Queries.CreateExperience(context.Background(), sqlc.CreateExperienceParams{
		ID: uuid.New(), Kind: "work", OrganizationMn: "A", OrganizationEn: "A", PositionMn: "B", PositionEn: "B",
		StartDate: mustDate(t, "2020-01-01"), Published: true,
	}); err != nil {
		t.Fatalf("seed experience: %v", err)
	}
	snapshot := writeSnapshot(t)

	_, err := content.Import(context.Background(), db.Pool, snapshot, content.DefaultPublicDir(snapshot))
	if !errors.Is(err, content.ErrNotEmpty) {
		t.Fatalf("Import() error = %v, want ErrNotEmpty", err)
	}

	count, err := db.Queries.CountProjects(context.Background())
	if err != nil {
		t.Fatalf("CountProjects: %v", err)
	}
	if count != 0 {
		t.Errorf("projects = %d after a refused import, want 0", count)
	}
}

func TestImportFailsOnAMissingLogo(t *testing.T) {
	t.Parallel()

	db := testsupport.Fresh(t)
	snapshot := writeSnapshot(t)

	_, err := content.Import(context.Background(), db.Pool, snapshot, t.TempDir())
	if err == nil {
		t.Fatal("Import() error = nil, want a read error for the logo")
	}
	count, countErr := db.Queries.CountProjects(context.Background())
	if countErr != nil {
		t.Fatalf("CountProjects: %v", countErr)
	}
	if count != 0 {
		t.Errorf("projects = %d after a failed import, want 0", count)
	}
}

func TestSniffLogo(t *testing.T) {
	t.Parallel()

	jpeg := append([]byte{0xFF, 0xD8, 0xFF}, bytes.Repeat([]byte{0}, 16)...)
	webp := append([]byte("RIFF\x00\x00\x00\x00WEBPVP8 "), bytes.Repeat([]byte{0}, 16)...)
	tooBig := append(append([]byte{}, pngBytes...), make([]byte, models.MaxLogoBytes)...)

	tests := []struct {
		name     string
		data     []byte
		wantType string
		wantErr  error
	}{
		{name: "png", data: pngBytes, wantType: "image/png"},
		{name: "jpeg", data: jpeg, wantType: "image/jpeg"},
		{name: "webp", data: webp, wantType: "image/webp"},
		{name: "gif is refused", data: []byte("GIF89a......"), wantErr: content.ErrLogoType},
		{name: "svg is refused", data: []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), wantErr: content.ErrLogoType},
		{name: "empty is refused", data: nil, wantErr: content.ErrLogoType},
		{name: "over 1 MB is refused", data: tooBig, wantErr: content.ErrLogoTooLarge},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := content.SniffLogo(tt.data)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("SniffLogo() error = %v, want %v", err, tt.wantErr)
			}
			if got != tt.wantType {
				t.Errorf("SniffLogo() = %q, want %q", got, tt.wantType)
			}
		})
	}
}

func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse(models.DateLayout, s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return d
}

func TestParseProject(t *testing.T) {
	t.Parallel()

	valid := func() models.RqProject {
		return models.RqProject{Title: "Tetgeleg", URL: "https://tetgeleg.mn/"}
	}
	long := strings.Repeat("ө", 201)

	tests := []struct {
		name   string
		mutate func(*models.RqProject)
		ok     bool
	}{
		{name: "valid, published by default", mutate: func(*models.RqProject) {}, ok: true},
		{name: "200 Cyrillic characters fit", mutate: func(r *models.RqProject) { r.Title = long[:len(long)-len("ө")] }, ok: true},
		{name: "blank title", mutate: func(r *models.RqProject) { r.Title = "   " }},
		{name: "201-character title", mutate: func(r *models.RqProject) { r.Title = long }},
		{name: "ftp url", mutate: func(r *models.RqProject) { r.URL = "ftp://example.mn" }},
		{name: "javascript url", mutate: func(r *models.RqProject) { r.URL = "javascript:alert(1)" }},
		{name: "2001-character description", mutate: func(r *models.RqProject) { r.DescriptionEn = strings.Repeat("a", 2001) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			req := valid()
			tt.mutate(&req)
			in, msg := content.ParseProject(req)
			if tt.ok && msg != "" {
				t.Fatalf("ParseProject() message = %q, want none", msg)
			}
			if !tt.ok && msg == "" {
				t.Fatal("ParseProject() message is empty, want a validation error")
			}
			if tt.ok && !in.Published {
				t.Error("Published = false, want true when omitted")
			}
		})
	}
}

func TestParseExperience(t *testing.T) {
	t.Parallel()

	valid := func() models.RqExperience {
		end := "2025-10-01"
		return models.RqExperience{
			Kind: "work", OrganizationMn: "StableLab", OrganizationEn: "StableLab",
			PositionMn: "Инженер", PositionEn: "Engineer", StartDate: "2025-05-01", EndDate: &end,
		}
	}
	str := func(s string) *string { return &s }

	tests := []struct {
		name   string
		mutate func(*models.RqExperience)
		ok     bool
	}{
		{name: "valid", mutate: func(*models.RqExperience) {}, ok: true},
		{name: "current role", mutate: func(r *models.RqExperience) { r.EndDate = nil }, ok: true},
		{name: "blank end date means current", mutate: func(r *models.RqExperience) { r.EndDate = str("") }, ok: true},
		{name: "same start and end", mutate: func(r *models.RqExperience) { r.EndDate = str("2025-05-01") }, ok: true},
		{name: "end before start", mutate: func(r *models.RqExperience) { r.EndDate = str("2025-04-30") }},
		{name: "unknown kind", mutate: func(r *models.RqExperience) { r.Kind = "hobby" }},
		{name: "bad start date", mutate: func(r *models.RqExperience) { r.StartDate = "2025-13-01" }},
		{name: "missing position", mutate: func(r *models.RqExperience) { r.PositionEn = "" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			req := valid()
			tt.mutate(&req)
			_, msg := content.ParseExperience(req)
			if tt.ok && msg != "" {
				t.Fatalf("ParseExperience() message = %q, want none", msg)
			}
			if !tt.ok && msg == "" {
				t.Fatal("ParseExperience() message is empty, want a validation error")
			}
		})
	}
}
