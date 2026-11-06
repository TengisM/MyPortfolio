package race_test

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"landing-api/internal/service/race"
)

// The same file drives race-rules.test.ts, so the two name rules cannot drift apart.
func TestCleanNameSharedCases(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("../../../../src/components/games/race-names.cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		In  string  `json:"in"`
		Out *string `json:"out"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range cases {
		got, ok := race.CleanName(c.In)
		switch {
		case c.Out == nil && ok:
			t.Errorf("CleanName(%q) = %q, want a refusal", c.In, got)
		case c.Out != nil && (!ok || got != *c.Out):
			t.Errorf("CleanName(%q) = %q, %v, want %q", c.In, got, ok, *c.Out)
		}
	}
}

func TestWeekStart(t *testing.T) {
	t.Parallel()
	monday := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	cases := map[string]struct{ in, want time.Time }{
		"sunday 23:59":   {time.Date(2026, 10, 25, 23, 59, 0, 0, time.UTC), monday},
		"monday 00:00":   {monday.AddDate(0, 0, 7), monday.AddDate(0, 0, 7)},
		"wednesday noon": {time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC), monday},
		"month rollover": {time.Date(2026, 11, 1, 5, 0, 0, 0, time.UTC), time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC)},
	}
	for name, c := range cases {
		if got := race.WeekStart(c.in); !got.Equal(c.want) {
			t.Errorf("%s: WeekStart(%v) = %v, want %v", name, c.in, got, c.want)
		}
	}
}
