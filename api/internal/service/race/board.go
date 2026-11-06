// Package race holds the racer's weekly scoreboard.
package race

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"landing-api/internal/db/sqlc"
)

const (
	laps     = 3
	topCount = 10
)

// Ships and Tracks are the ids the client sends. The migration's CHECK constraints list the same.
var (
	Ships  = []string{"vega", "kestrel", "lancer", "wisp", "torch"}
	Tracks = []string{"coaster", "skyway", "tidal"}
)

// MinLapMs is the fastest lap the board accepts per track: 0.8 of the fastest smart autopilot lap,
// rounded down to a second. `npm run race:laps` prints these.
var MinLapMs = map[string]int{
	"coaster": 53000,
	"skyway":  53000,
	"tidal":   53000,
}

// ErrBadRun wraps every validation failure. Its message is fit to show the player.
var ErrBadRun = errors.New("bad run")

func badRun(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrBadRun, fmt.Sprintf(format, args...))
}

// Message returns err's player-readable text without the "bad run: " prefix.
func Message(err error) string {
	return strings.TrimPrefix(err.Error(), ErrBadRun.Error()+": ")
}

// Run is one finished solo race.
type Run struct {
	Track, Name, Ship string
	LapMs             []int
}

type Entry struct {
	Place   int    `json:"place"`
	Name    string `json:"name"`
	Ship    string `json:"ship"`
	TotalMs int    `json:"total_ms"`
	LapMs   []int  `json:"lap_ms"`
}

type Place struct {
	Place   int `json:"place"`
	TotalMs int `json:"total_ms"`
}

type BoardView struct {
	Track    string    `json:"track"`
	ResetsAt time.Time `json:"resets_at"`
	Top      []Entry   `json:"top"`
	You      *Place    `json:"you"`
	NewBest  bool      `json:"new_best"`
}

// Board reads and writes this week's times.
type Board struct {
	q   *sqlc.Queries
	now func() time.Time

	// purged is the week start old runs were last deleted before, so the purge runs once a week
	// and not on every post.
	purgeMu sync.Mutex
	purged  time.Time
}

func NewBoard(q *sqlc.Queries, now func() time.Time) *Board {
	return &Board{q: q, now: now}
}

// Get returns the top 10 for a track this week. A valid name that has a run also gets its place.
func (b *Board) Get(ctx context.Context, track, name string) (BoardView, error) {
	if !slices.Contains(Tracks, track) {
		return BoardView{}, badRun("unknown track")
	}
	view, err := b.view(ctx, track)
	if err != nil {
		return BoardView{}, err
	}
	if clean, ok := CleanName(name); ok {
		if view.You, err = b.place(ctx, track, clean); err != nil {
			return BoardView{}, err
		}
	}
	return view, nil
}

// Post checks and stores a run, then returns the board with the run's place.
func (b *Board) Post(ctx context.Context, run Run) (BoardView, error) {
	name, err := validate(run)
	if err != nil {
		return BoardView{}, err
	}
	now := b.now()
	since := WeekStart(now)
	key := strings.ToLower(name)

	before, err := b.place(ctx, run.Track, name)
	if err != nil {
		return BoardView{}, err
	}

	total := 0
	lapMs := make([]int32, len(run.LapMs))
	for i, ms := range run.LapMs {
		total += ms
		lapMs[i] = int32(ms) //nolint:gosec // validate caps every lap far below int32
	}

	// Old weeks go first, so the table never grows past one week of runs.
	if err := b.purge(ctx, since); err != nil {
		return BoardView{}, err
	}
	if err := b.q.CreateRaceTime(ctx, sqlc.CreateRaceTimeParams{
		ID: uuid.New(), Track: run.Track, Name: name, NameKey: key, Ship: run.Ship,
		LapMs: lapMs, TotalMs: int32(total), CreatedAt: now, //nolint:gosec // see above
	}); err != nil {
		return BoardView{}, fmt.Errorf("create race time: %w", err)
	}

	view, err := b.view(ctx, run.Track)
	if err != nil {
		return BoardView{}, err
	}
	if view.You, err = b.place(ctx, run.Track, name); err != nil {
		return BoardView{}, err
	}
	view.NewBest = before == nil || total < before.TotalMs
	return view, nil
}

// purge deletes runs from before since, once per week start.
func (b *Board) purge(ctx context.Context, since time.Time) error {
	b.purgeMu.Lock()
	defer b.purgeMu.Unlock()
	if b.purged.Equal(since) {
		return nil
	}
	if err := b.q.DeleteRaceTimesBefore(ctx, since); err != nil {
		return fmt.Errorf("delete old race times: %w", err)
	}
	b.purged = since
	return nil
}

// maxLapMs keeps a sum of three laps inside an int32. A lap this slow is no real run.
const maxLapMs = 10 * 60 * 1000

func validate(run Run) (string, error) {
	if !slices.Contains(Tracks, run.Track) {
		return "", badRun("unknown track")
	}
	if !slices.Contains(Ships, run.Ship) {
		return "", badRun("unknown ship")
	}
	name, ok := CleanName(run.Name)
	if !ok {
		return "", badRun("name must be 1 to 16 letters, digits, spaces, _ or -")
	}
	if len(run.LapMs) != laps {
		return "", badRun("a run needs exactly %d laps", laps)
	}
	for _, ms := range run.LapMs {
		if ms < MinLapMs[run.Track] {
			return "", badRun("a lap is faster than this track allows")
		}
		if ms > maxLapMs {
			return "", badRun("a lap is too slow for the board")
		}
	}
	return name, nil
}

func (b *Board) view(ctx context.Context, track string) (BoardView, error) {
	since := WeekStart(b.now())
	rows, err := b.q.RaceBoard(ctx, sqlc.RaceBoardParams{Track: track, CreatedAt: since, Limit: topCount})
	if err != nil {
		return BoardView{}, fmt.Errorf("race board: %w", err)
	}
	// Never nil: a nil slice marshals to null and breaks the client on an empty board.
	top := make([]Entry, 0, len(rows))
	for i, row := range rows {
		laps := make([]int, len(row.LapMs))
		for j, ms := range row.LapMs {
			laps[j] = int(ms)
		}
		top = append(top, Entry{Place: i + 1, Name: row.Name, Ship: row.Ship, TotalMs: int(row.TotalMs), LapMs: laps})
	}
	return BoardView{Track: track, ResetsAt: since.AddDate(0, 0, 7), Top: top}, nil
}

// place returns nil when the name has no run this week.
func (b *Board) place(ctx context.Context, track, name string) (*Place, error) {
	row, err := b.q.RacePlace(ctx, sqlc.RacePlaceParams{
		Track: track, CreatedAt: WeekStart(b.now()), NameKey: strings.ToLower(name),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil //nolint:nilnil // no run is a normal answer, not an error
	}
	if err != nil {
		return nil, fmt.Errorf("race place: %w", err)
	}
	return &Place{Place: int(row.Place), TotalMs: int(row.TotalMs)}, nil
}
