package racehandler_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/handlers"
	racehandler "landing-api/internal/http/handlers/race"
	"landing-api/internal/http/models"
	"landing-api/internal/http/routes"
	"landing-api/internal/service/race"
	"landing-api/internal/testsupport"
	"landing-api/internal/utils/secure"
)

func newApp(t *testing.T) *fiber.App {
	t.Helper()
	db := testsupport.Fresh(t)
	board := race.NewBoard(db.Queries, time.Now)
	h := &handlers.Handlers{Race: racehandler.New(board)}
	ts := secure.NewTokenService("race-handler-test-secret-32-bytes!!", 15, 7, 30) //nolint:gosec // fixture value
	app := fiber.New()
	routes.Setup(app, h, "http://localhost:5173", ts, false, "", nil)
	return app
}

func do(t *testing.T, app *fiber.App, method, url, body string) (int, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, "http://example.test"+url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, out
}

const goodRun = `{"track":"coaster","name":"Bat","ship":"vega","lap_ms":[60000,60000,60000]}`

func TestPostThenGetRoundTrip(t *testing.T) {
	t.Parallel()
	app := newApp(t)

	status, body := do(t, app, "POST", "/api/race/times", goodRun)
	if status != 200 {
		t.Fatalf("POST status %d: %s", status, body)
	}
	var posted race.BoardView
	if err := json.Unmarshal(body, &posted); err != nil {
		t.Fatal(err)
	}
	if !posted.NewBest || posted.You == nil || posted.You.Place != 1 {
		t.Fatalf("posted = %+v", posted)
	}

	status, body = do(t, app, "GET", "/api/race/board?track=coaster&name=bat", "")
	if status != 200 {
		t.Fatalf("GET status %d: %s", status, body)
	}
	var got race.BoardView
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Top) != 1 || got.Top[0].Name != "Bat" || got.Top[0].TotalMs != 180000 || got.You == nil {
		t.Fatalf("got = %+v", got)
	}
}

func TestBadBodiesGet400WithAMessage(t *testing.T) {
	t.Parallel()
	app := newApp(t)
	bodies := []string{
		`not json`,
		`{"track":"coaster","name":"Bat","ship":"vega","lap_ms":[1,1,1]}`,
		`{"track":"moon","name":"Bat","ship":"vega","lap_ms":[60000,60000,60000]}`,
	}
	for _, b := range bodies {
		status, out := do(t, app, "POST", "/api/race/times", b)
		var e models.ErrorResponse
		if err := json.Unmarshal(out, &e); err != nil {
			t.Fatal(err)
		}
		if status != 400 || e.Message == "" {
			t.Errorf("body %q: status %d, %+v", b, status, e)
		}
	}
	if status, _ := do(t, app, "GET", "/api/race/board?track=moon", ""); status != 400 {
		t.Errorf("unknown track GET status %d, want 400", status)
	}
}

func TestPostIsRateLimited(t *testing.T) {
	t.Parallel()
	app := newApp(t)
	for i := range 10 {
		if status, body := do(t, app, "POST", "/api/race/times", goodRun); status != 200 {
			t.Fatalf("post %d: status %d: %s", i+1, status, body)
		}
	}
	if status, _ := do(t, app, "POST", "/api/race/times", goodRun); status != 429 {
		t.Fatalf("11th post status %d, want 429", status)
	}
}
