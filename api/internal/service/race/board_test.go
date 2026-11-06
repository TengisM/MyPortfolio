package race_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"landing-api/internal/service/race"
	"landing-api/internal/testsupport"
)

var wednesday = time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)

func newBoard(t *testing.T, now *time.Time) *race.Board {
	t.Helper()
	db := testsupport.Fresh(t)
	return race.NewBoard(db.Queries, func() time.Time { return *now })
}

// run builds a coaster run whose laps sum to about total.
func run(name string, lapMs int) race.Run {
	return race.Run{Track: "coaster", Name: name, Ship: "vega", LapMs: []int{lapMs, lapMs, lapMs}}
}

func TestEmptyBoardTopIsAnEmptyList(t *testing.T) {
	t.Parallel()
	now := wednesday
	view, err := newBoard(t, &now).Get(context.Background(), "coaster", "")
	if err != nil {
		t.Fatal(err)
	}
	if view.Top == nil || len(view.Top) != 0 {
		t.Fatalf("Top = %#v, want an empty non-nil slice", view.Top)
	}
	if view.You != nil {
		t.Fatalf("You = %+v, want nil", view.You)
	}
	if want := time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC); !view.ResetsAt.Equal(want) {
		t.Fatalf("ResetsAt = %v, want %v", view.ResetsAt, want)
	}
}

func TestPostedRunShowsFirst(t *testing.T) {
	t.Parallel()
	now := wednesday
	b := newBoard(t, &now)
	view, err := b.Post(context.Background(), run("Bat", 60000))
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Top) != 1 || view.Top[0].Place != 1 || view.Top[0].TotalMs != 180000 || view.Top[0].Ship != "vega" {
		t.Fatalf("Top = %+v", view.Top)
	}
	if view.You == nil || view.You.Place != 1 || !view.NewBest {
		t.Fatalf("You = %+v, NewBest = %v", view.You, view.NewBest)
	}
}

func TestOneEntryPerNameKeepsTheBest(t *testing.T) {
	t.Parallel()
	now := wednesday
	b := newBoard(t, &now)
	ctx := context.Background()
	if _, err := b.Post(ctx, run("Bat", 60000)); err != nil {
		t.Fatal(err)
	}
	slower, err := b.Post(ctx, run("bat", 61000))
	if err != nil {
		t.Fatal(err)
	}
	if slower.NewBest || len(slower.Top) != 1 || slower.Top[0].TotalMs != 180000 || slower.Top[0].Name != "Bat" {
		t.Fatalf("slower repost: NewBest = %v, Top = %+v", slower.NewBest, slower.Top)
	}
	faster, err := b.Post(ctx, run("BAT", 59000))
	if err != nil {
		t.Fatal(err)
	}
	if !faster.NewBest || len(faster.Top) != 1 || faster.Top[0].Name != "BAT" || faster.Top[0].TotalMs != 177000 {
		t.Fatalf("faster repost: NewBest = %v, Top = %+v", faster.NewBest, faster.Top)
	}
}

func TestTopTenAndPlaceBeyondIt(t *testing.T) {
	t.Parallel()
	now := wednesday
	b := newBoard(t, &now)
	ctx := context.Background()
	for i := range 11 {
		if _, err := b.Post(ctx, run(fmt.Sprintf("p%d", i), 60000+i*100)); err != nil {
			t.Fatal(err)
		}
	}
	view, err := b.Get(ctx, "coaster", "p10")
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Top) != 10 || view.You == nil || view.You.Place != 11 {
		t.Fatalf("len(Top) = %d, You = %+v, want 10 and place 11", len(view.Top), view.You)
	}
}

func TestLastWeekDoesNotShowAndIsDeleted(t *testing.T) {
	t.Parallel()
	db := testsupport.Fresh(t)
	now := wednesday
	b := race.NewBoard(db.Queries, func() time.Time { return now })
	ctx := context.Background()
	if _, err := b.Post(ctx, run("Old", 60000)); err != nil {
		t.Fatal(err)
	}
	now = wednesday.AddDate(0, 0, 7)
	view, err := b.Get(ctx, "coaster", "Old")
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Top) != 0 || view.You != nil {
		t.Fatalf("last week's run shows: %+v", view)
	}
	if _, err := b.Post(ctx, run("New", 60000)); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.Pool.QueryRow(ctx, "SELECT count(*) FROM race_times").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("%d rows left, want only this week's 1", n)
	}
}

func TestPostRefusesBadRuns(t *testing.T) {
	t.Parallel()
	now := wednesday
	b := newBoard(t, &now)
	cases := map[string]race.Run{
		"unknown track": {Track: "moon", Name: "Bat", Ship: "vega", LapMs: []int{60000, 60000, 60000}},
		"unknown ship":  {Track: "coaster", Name: "Bat", Ship: "ufo", LapMs: []int{60000, 60000, 60000}},
		"two laps":      {Track: "coaster", Name: "Bat", Ship: "vega", LapMs: []int{60000, 60000}},
		"four laps":     {Track: "coaster", Name: "Bat", Ship: "vega", LapMs: []int{60000, 60000, 60000, 60000}},
		"fast lap":      {Track: "coaster", Name: "Bat", Ship: "vega", LapMs: []int{60000, 52999, 60000}},
		"tidal fast":    {Track: "tidal", Name: "Bat", Ship: "vega", LapMs: []int{52999, 60000, 60000}},
		"bad name":      {Track: "coaster", Name: "<b>", Ship: "vega", LapMs: []int{60000, 60000, 60000}},
		"huge lap":      {Track: "coaster", Name: "Bat", Ship: "vega", LapMs: []int{60000, 2000000000, 60000}},
	}
	for name, r := range cases {
		_, err := b.Post(context.Background(), r)
		if !errors.Is(err, race.ErrBadRun) {
			t.Errorf("%s: err = %v, want ErrBadRun", name, err)
		} else if race.Message(err) == "" {
			t.Errorf("%s: empty message", name)
		}
	}
	// The exact minimum is allowed.
	if _, err := b.Post(context.Background(), race.Run{Track: "tidal", Name: "Bat", Ship: "vega", LapMs: []int{53000, 53000, 53000}}); err != nil {
		t.Errorf("minimum lap refused: %v", err)
	}
}
