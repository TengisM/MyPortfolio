package contenthandler_test

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/tanasoft1/testkit"
	"github.com/tanasoft1/testkit/fiberkit"

	"landing-api/internal/http/handlers"
	contenthandler "landing-api/internal/http/handlers/content"
	"landing-api/internal/http/models"
	"landing-api/internal/http/routes"
	"landing-api/internal/service/content"
	"landing-api/internal/service/publish"
	"landing-api/internal/testsupport"
	"landing-api/internal/utils/secure"
)

const testJWTSecret = "content-handler-test-secret-32-b!" //nolint:gosec // fixture value for tests, not a real secret

// pngBytes starts with the PNG signature, which is all http.DetectContentType reads.
var pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{1}, 64)...) //nolint:gochecknoglobals // fixture

// countingScheduler stands in for the publisher, so a test can see which writes asked for a rebuild.
type countingScheduler struct{ calls atomic.Int32 }

func (s *countingScheduler) Schedule() { s.calls.Add(1) }

type testApp struct {
	app       *fiber.App
	client    *testkit.Client
	anon      *testkit.Client
	scheduler *countingScheduler
	token     string
}

// newApp builds the real middleware chain against a fresh database. The publisher has no hook URL,
// so the publish endpoints report configured:false.
func newApp(t *testing.T) *testApp {
	t.Helper()

	db := testsupport.Fresh(t)
	tokenService := secure.NewTokenService(testJWTSecret, 15, 7, 30)
	scheduler := &countingScheduler{}
	h := &handlers.Handlers{
		Content: contenthandler.New(content.New(db.Pool, db.Queries, scheduler), publish.New("", 30*time.Second)),
	}

	app := fiber.New()
	routes.Setup(app, h, "http://localhost:5173", tokenService, false, "", nil)

	token, err := tokenService.GenerateAccessToken(uuid.New(), "admin@example.mn")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}
	anon := testkit.NewClient(t, fiberkit.Doer(app))
	return &testApp{
		app:       app,
		client:    anon.With("Authorization", "Bearer "+token),
		anon:      anon,
		scheduler: scheduler,
		token:     token,
	}
}

// clientFor returns an authorized client bound to t, for parallel subtests.
func (a *testApp) clientFor(t *testing.T) *testkit.Client {
	t.Helper()
	return testkit.NewClient(t, fiberkit.Doer(a.app)).With("Authorization", "Bearer "+a.token)
}

// del sends an authorized DELETE. testkit.Client has no Delete.
func (a *testApp) del(t *testing.T, path string) int {
	t.Helper()

	req := httptest.NewRequest(http.MethodDelete, path, http.NoBody)
	req.Header.Set("Authorization", "Bearer "+a.token)
	res, err := a.app.Test(req, -1)
	if err != nil {
		t.Fatalf("DELETE %s: %v", path, err)
	}
	defer func() { _ = res.Body.Close() }()
	_, _ = io.Copy(io.Discard, res.Body)
	return res.StatusCode
}

// envelope is models.SuccessResponse with Data typed.
type envelope[T any] struct {
	Success bool `json:"success"`
	Data    T    `json:"data"`
}

func decode[T any](res *testkit.Response) T {
	var body envelope[T]
	res.Decode(&body)
	return body.Data
}

func validProject(title string) map[string]any {
	return map[string]any{
		"title":          title,
		"url":            "https://example.mn/",
		"description_mn": "Тайлбар",
		"description_en": "Description",
		"published":      true,
	}
}

func validExperience(start string) map[string]any {
	return map[string]any{
		"kind":            "work",
		"organization_mn": "Танасофт ХХК",
		"organization_en": "Tanasoft LLC",
		"position_mn":     "Инженер",
		"position_en":     "Engineer",
		"description_mn":  "",
		"description_en":  "",
		"start_date":      start,
		"end_date":        nil,
		"published":       true,
	}
}

func (a *testApp) createProject(t *testing.T, title string) models.RsAdminProject {
	t.Helper()
	res := a.client.PostJSON("/api/admin/projects", validProject(title)).Status(http.StatusOK)
	return decode[models.RsAdminProject](res)
}

func TestAdminContentRequiresAuthorization(t *testing.T) {
	t.Parallel()

	a := newApp(t)
	for _, path := range []string{"/api/admin/projects", "/api/admin/experience", "/api/admin/publish"} {
		res := a.anon.Get(path).Status(http.StatusUnauthorized)
		if got := res.Header.Get(fiber.HeaderCacheControl); got != "no-store" {
			t.Errorf("%s Cache-Control = %q, want no-store", path, got)
		}
	}
}

func TestProjectCRUD(t *testing.T) {
	t.Parallel()

	a := newApp(t)

	first := a.createProject(t, "Tetgeleg")
	if first.Title != "Tetgeleg" || first.SortOrder != 0 || !first.Published || first.LogoURL != nil {
		t.Fatalf("created = %+v, want Tetgeleg at 0, published, no logo", first)
	}
	second := a.createProject(t, "Lann")
	if second.SortOrder != 1 {
		t.Errorf("second sort_order = %d, want 1 (appended)", second.SortOrder)
	}

	update := validProject("Tetgeleg.mn")
	update["published"] = false
	updated := decode[models.RsAdminProject](
		a.client.PutJSON("/api/admin/projects/"+first.ID.String(), update).Status(http.StatusOK))
	if updated.Title != "Tetgeleg.mn" || updated.Published || updated.SortOrder != 0 {
		t.Errorf("updated = %+v, want the new title, unpublished, still at 0", updated)
	}

	list := decode[models.RsList[models.RsAdminProject]](a.client.Get("/api/admin/projects").Status(http.StatusOK))
	if len(list.Items) != 2 || list.Items[0].ID != first.ID || list.Items[1].ID != second.ID {
		t.Fatalf("list = %+v, want first then second", list.Items)
	}

	if code := a.del(t, "/api/admin/projects/"+second.ID.String()); code != http.StatusOK {
		t.Fatalf("DELETE status = %d, want 200", code)
	}
	if code := a.del(t, "/api/admin/projects/"+second.ID.String()); code != http.StatusNotFound {
		t.Errorf("second DELETE status = %d, want 404", code)
	}
	a.client.PutJSON("/api/admin/projects/"+uuid.NewString(), validProject("X")).Status(http.StatusNotFound)
	a.client.PutJSON("/api/admin/projects/not-a-uuid", validProject("X")).Status(http.StatusNotFound)

	// Two creates, one update, one delete. The failed calls must not schedule a rebuild.
	if got := a.scheduler.calls.Load(); got != 4 {
		t.Errorf("Schedule called %d times, want 4", got)
	}
}

func TestProjectValidationErrors(t *testing.T) {
	t.Parallel()

	a := newApp(t)

	tests := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{name: "missing title", mutate: func(b map[string]any) { delete(b, "title") }},
		{name: "201-character title", mutate: func(b map[string]any) { b["title"] = strings.Repeat("a", 201) }},
		{name: "url without scheme", mutate: func(b map[string]any) { b["url"] = "tetgeleg.mn" }},
		{name: "ftp url", mutate: func(b map[string]any) { b["url"] = "ftp://tetgeleg.mn" }},
		{name: "2001-character description", mutate: func(b map[string]any) { b["description_mn"] = strings.Repeat("ө", 2001) }},
		{name: "title of the wrong type", mutate: func(b map[string]any) { b["title"] = 7 }},
	}
	// Cleanup runs after the parallel subtests finish.
	t.Cleanup(func() {
		list := decode[models.RsList[models.RsAdminProject]](a.clientFor(t).Get("/api/admin/projects").Status(http.StatusOK))
		if len(list.Items) != 0 {
			t.Errorf("%d projects stored after only bad requests, want 0", len(list.Items))
		}
		if list.Items == nil {
			t.Error("items is null, want []")
		}
	})

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			body := validProject("Tetgeleg")
			tt.mutate(body)
			var got models.ErrorResponse
			a.clientFor(t).PostJSON("/api/admin/projects", body).Status(http.StatusBadRequest).Decode(&got)
			if got.Error != "validation error" || got.Message == "" {
				t.Errorf("error = %+v, want validation error with a message", got)
			}
		})
	}
}

func TestReorderRequiresEveryIDExactlyOnce(t *testing.T) {
	t.Parallel()

	a := newApp(t)
	p1 := a.createProject(t, "One")
	p2 := a.createProject(t, "Two")
	p3 := a.createProject(t, "Three")
	before := a.scheduler.calls.Load()

	bad := map[string][]uuid.UUID{
		"missing one": {p1.ID, p2.ID},
		"duplicate":   {p1.ID, p2.ID, p2.ID},
		"unknown id":  {p1.ID, p2.ID, uuid.New()},
		"extra id":    {p1.ID, p2.ID, p3.ID, uuid.New()},
	}
	for name, ids := range bad {
		var got models.ErrorResponse
		a.client.PostJSON("/api/admin/projects/reorder", map[string]any{"ids": ids}).
			Status(http.StatusBadRequest).Decode(&got)
		if got.Error != "validation error" {
			t.Errorf("%s: error = %q, want validation error", name, got.Error)
		}
	}
	a.client.PostJSON("/api/admin/projects/reorder", map[string]any{"ids": []string{"nope"}}).
		Status(http.StatusBadRequest)

	reordered := decode[models.RsList[models.RsAdminProject]](
		a.client.PostJSON("/api/admin/projects/reorder", map[string]any{"ids": []uuid.UUID{p3.ID, p1.ID, p2.ID}}).
			Status(http.StatusOK))
	want := []uuid.UUID{p3.ID, p1.ID, p2.ID}
	for i, item := range reordered.Items {
		if item.ID != want[i] || item.SortOrder != int32(i) {
			t.Errorf("item %d = %s at %d, want %s at %d", i, item.ID, item.SortOrder, want[i], i)
		}
	}
	if got := a.scheduler.calls.Load() - before; got != 1 {
		t.Errorf("reorders scheduled %d rebuilds, want 1 (only the good one)", got)
	}
}

func TestLogoUploadServeAndClear(t *testing.T) {
	t.Parallel()

	a := newApp(t)
	project := a.createProject(t, "Tetgeleg")
	logoPath := "/api/admin/projects/" + project.ID.String() + "/logo"

	// The data URL prefix from FileReader.readAsDataURL is accepted. The client's type is ignored.
	withLogo := decode[models.RsAdminProject](a.client.PutJSON(logoPath, map[string]any{
		"content_type": "image/gif",
		"data_base64":  "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes),
	}).Status(http.StatusOK))
	if withLogo.LogoURL == nil || !strings.HasPrefix(*withLogo.LogoURL, "/api/content/logos/"+project.ID.String()+"?v=") {
		t.Fatalf("logo_url = %v, want /api/content/logos/<id>?v=...", withLogo.LogoURL)
	}

	res := a.anon.Get(*withLogo.LogoURL).Status(http.StatusOK)
	if got := res.Header.Get(fiber.HeaderContentType); got != "image/png" {
		t.Errorf("Content-Type = %q, want image/png (sniffed)", got)
	}
	if got := res.Header.Get(fiber.HeaderCacheControl); got != "public, max-age=86400" {
		t.Errorf("Cache-Control = %q, want public, max-age=86400", got)
	}
	if !bytes.Equal(res.Body, pngBytes) {
		t.Errorf("served %d bytes, want the uploaded %d", len(res.Body), len(pngBytes))
	}

	if code := a.del(t, logoPath); code != http.StatusOK {
		t.Fatalf("DELETE logo status = %d, want 200", code)
	}
	list := decode[models.RsList[models.RsAdminProject]](a.client.Get("/api/admin/projects").Status(http.StatusOK))
	if list.Items[0].LogoURL != nil {
		t.Errorf("logo_url = %v after DELETE, want null", *list.Items[0].LogoURL)
	}
	a.anon.Get("/api/content/logos/" + project.ID.String()).Status(http.StatusNotFound)
	a.anon.Get("/api/content/logos/not-a-uuid").Status(http.StatusNotFound)
}

func TestLogoRejections(t *testing.T) {
	t.Parallel()

	a := newApp(t)
	project := a.createProject(t, "Tetgeleg")
	logoPath := "/api/admin/projects/" + project.ID.String() + "/logo"
	tooBig := append(append([]byte{}, pngBytes...), make([]byte, models.MaxLogoBytes)...)

	tests := []struct {
		name string
		data string
		want string
	}{
		{name: "svg", data: base64.StdEncoding.EncodeToString([]byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`)), want: "PNG"},
		{name: "gif", data: base64.StdEncoding.EncodeToString([]byte("GIF89a......")), want: "PNG"},
		{name: "over 1 MB", data: base64.StdEncoding.EncodeToString(tooBig), want: "1 МБ"},
		{name: "not base64", data: "!!!not base64!!!", want: "base64"},
		{name: "empty", data: "", want: "Лого"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var got models.ErrorResponse
			a.clientFor(t).PutJSON(logoPath, map[string]any{"data_base64": tt.data}).
				Status(http.StatusBadRequest).Decode(&got)
			if got.Error != "validation error" || !strings.Contains(got.Message, tt.want) {
				t.Errorf("error = %+v, want validation error mentioning %q", got, tt.want)
			}
		})
	}

	a.client.PutJSON("/api/admin/projects/"+uuid.NewString()+"/logo", map[string]any{
		"data_base64": base64.StdEncoding.EncodeToString(pngBytes),
	}).Status(http.StatusNotFound)

	// No rejected upload may leave a logo behind.
	t.Cleanup(func() {
		testkit.NewClient(t, fiberkit.Doer(a.app)).Get("/api/content/logos/" + project.ID.String()).Status(http.StatusNotFound)
	})
}

func TestExperienceCRUD(t *testing.T) {
	t.Parallel()

	a := newApp(t)

	older := decode[models.RsAdminExperience](
		a.client.PostJSON("/api/admin/experience", validExperience("2020-06-01")).Status(http.StatusOK))
	newer := decode[models.RsAdminExperience](
		a.client.PostJSON("/api/admin/experience", validExperience("2026-04-01")).Status(http.StatusOK))
	if newer.StartDate != "2026-04-01" || newer.EndDate != nil || newer.Kind != "work" {
		t.Errorf("created = %+v, want start 2026-04-01, no end, work", newer)
	}

	list := decode[models.RsList[models.RsAdminExperience]](a.client.Get("/api/admin/experience").Status(http.StatusOK))
	if len(list.Items) != 2 || list.Items[0].ID != newer.ID || list.Items[1].ID != older.ID {
		t.Fatalf("list = %+v, want newest start_date first", list.Items)
	}

	update := validExperience("2020-06-01")
	update["kind"] = "education"
	update["end_date"] = "2021-08-01"
	updated := decode[models.RsAdminExperience](
		a.client.PutJSON("/api/admin/experience/"+older.ID.String(), update).Status(http.StatusOK))
	if updated.Kind != "education" || updated.EndDate == nil || *updated.EndDate != "2021-08-01" {
		t.Errorf("updated = %+v, want education ending 2021-08-01", updated)
	}

	backwards := validExperience("2020-06-01")
	backwards["end_date"] = "2019-01-01"
	var got models.ErrorResponse
	a.client.PutJSON("/api/admin/experience/"+older.ID.String(), backwards).Status(http.StatusBadRequest).Decode(&got)
	if got.Error != "validation error" {
		t.Errorf("end before start: error = %q, want validation error", got.Error)
	}
	badKind := validExperience("2020-06-01")
	badKind["kind"] = "hobby"
	a.client.PostJSON("/api/admin/experience", badKind).Status(http.StatusBadRequest)
	badDate := validExperience("01/06/2020")
	a.client.PostJSON("/api/admin/experience", badDate).Status(http.StatusBadRequest)

	if code := a.del(t, "/api/admin/experience/"+older.ID.String()); code != http.StatusOK {
		t.Fatalf("DELETE status = %d, want 200", code)
	}
	if code := a.del(t, "/api/admin/experience/"+older.ID.String()); code != http.StatusNotFound {
		t.Errorf("second DELETE status = %d, want 404", code)
	}
	a.client.PutJSON("/api/admin/experience/"+uuid.NewString(), validExperience("2020-06-01")).
		Status(http.StatusNotFound)

	// Two creates, one update, one delete.
	if got := a.scheduler.calls.Load(); got != 4 {
		t.Errorf("Schedule called %d times, want 4", got)
	}
}

func TestPublicContentReturnsOnlyPublishedRows(t *testing.T) {
	t.Parallel()

	a := newApp(t)
	shown := a.createProject(t, "Shown")
	hidden := validProject("Hidden")
	hidden["published"] = false
	a.client.PostJSON("/api/admin/projects", hidden).Status(http.StatusOK)

	a.client.PostJSON("/api/admin/experience", validExperience("2020-06-01")).Status(http.StatusOK)
	current := decode[models.RsAdminExperience](
		a.client.PostJSON("/api/admin/experience", validExperience("2026-04-01")).Status(http.StatusOK))
	hiddenExp := validExperience("2023-01-01")
	hiddenExp["published"] = false
	a.client.PostJSON("/api/admin/experience", hiddenExp).Status(http.StatusOK)

	res := a.anon.Get("/api/content").Status(http.StatusOK)
	if got := res.Header.Get(fiber.HeaderCacheControl); got != "public, max-age=60" {
		t.Errorf("Cache-Control = %q, want public, max-age=60", got)
	}
	body := decode[models.RsContent](res)

	if len(body.Projects) != 1 || body.Projects[0].ID != shown.ID {
		t.Fatalf("projects = %+v, want only Shown", body.Projects)
	}
	p := body.Projects[0]
	if p.Logo != nil || p.Description.Mn != "Тайлбар" || p.Description.En != "Description" {
		t.Errorf("project = %+v, want no logo and both descriptions", p)
	}
	if len(body.Experience) != 2 || body.Experience[0].ID != current.ID {
		t.Fatalf("experience = %+v, want 2 published rows, newest first", body.Experience)
	}
	e := body.Experience[0]
	if e.Organization.En != "Tanasoft LLC" || e.Position.Mn != "Инженер" || e.StartDate != "2026-04-01" || e.EndDate != nil {
		t.Errorf("experience row = %+v, want the snapshot shape", e)
	}
}

func TestPublishEndpointsReportUnconfigured(t *testing.T) {
	t.Parallel()

	a := newApp(t)
	for _, res := range []*testkit.Response{
		a.client.Get("/api/admin/publish").Status(http.StatusOK),
		a.client.PostJSON("/api/admin/publish", nil).Status(http.StatusOK),
	} {
		status := decode[publish.Status](res)
		if status.Configured || status.Pending || status.LastTriggeredAt != nil || status.LastError != nil {
			t.Errorf("status = %+v, want everything false or null", status)
		}
	}
}
