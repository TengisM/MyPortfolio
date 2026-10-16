package publish_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"landing-api/internal/service/publish"
)

// fakeClock records every timer and fires them only when the test says so.
type fakeClock struct {
	mu     sync.Mutex
	now    time.Time
	timers []*fakeTimer
}

type fakeTimer struct {
	delay   time.Duration
	f       func()
	stopped bool
}

func (t *fakeTimer) Stop() bool {
	was := !t.stopped
	t.stopped = true
	return was
}

func (c *fakeClock) Now() time.Time { return c.now }

func (c *fakeClock) AfterFunc(d time.Duration, f func()) publish.Timer {
	c.mu.Lock()
	defer c.mu.Unlock()
	timer := &fakeTimer{delay: d, f: f}
	c.timers = append(c.timers, timer)
	return timer
}

// fireLive runs every timer that was not stopped and returns how many ran.
func (c *fakeClock) fireLive() int {
	c.mu.Lock()
	var live []*fakeTimer
	for _, timer := range c.timers {
		if !timer.stopped {
			timer.stopped = true
			live = append(live, timer)
		}
	}
	c.mu.Unlock()
	for _, timer := range live {
		timer.f()
	}
	return len(live)
}

// fakeHook counts POSTs and answers with status.
type fakeHook struct {
	mu     sync.Mutex
	calls  int
	status int
	err    error
	method string
	url    string
}

func (h *fakeHook) Do(req *http.Request) (*http.Response, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.calls++
	h.method = req.Method
	h.url = req.URL.String()
	if h.err != nil {
		return nil, h.err
	}
	return &http.Response{StatusCode: h.status, Body: io.NopCloser(strings.NewReader("{}"))}, nil
}

const hookURL = "https://api.vercel.com/v1/integrations/deploy/prj_x/secret"

func newPublisher(hook *fakeHook) (*publish.Publisher, *fakeClock) {
	clock := &fakeClock{now: time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)}
	return publish.NewWith(hookURL, 30*time.Second, hook, clock), clock
}

func TestScheduleDebouncesABurstIntoOnePost(t *testing.T) {
	t.Parallel()

	hook := &fakeHook{status: http.StatusCreated}
	p, clock := newPublisher(hook)

	p.Schedule()
	p.Schedule()
	p.Schedule()

	if !p.Status().Pending {
		t.Fatal("Pending = false after Schedule, want true")
	}
	if hook.calls != 0 {
		t.Fatalf("hook called %d times before the timer fired, want 0", hook.calls)
	}
	for _, timer := range clock.timers {
		if timer.delay != 30*time.Second {
			t.Errorf("timer delay = %v, want 30s", timer.delay)
		}
	}

	if ran := clock.fireLive(); ran != 1 {
		t.Fatalf("%d live timers after three Schedule calls, want 1", ran)
	}
	if hook.calls != 1 {
		t.Fatalf("hook called %d times, want 1", hook.calls)
	}
	if hook.method != http.MethodPost || hook.url != hookURL {
		t.Errorf("hook got %s %s, want POST %s", hook.method, hook.url, hookURL)
	}

	status := p.Status()
	if status.Pending {
		t.Error("Pending = true after the hook fired, want false")
	}
	if status.LastTriggeredAt == nil || !status.LastTriggeredAt.Equal(clock.now) {
		t.Errorf("LastTriggeredAt = %v, want %v", status.LastTriggeredAt, clock.now)
	}
	if status.LastError != nil {
		t.Errorf("LastError = %q, want nil", *status.LastError)
	}
}

// A timer callback that lost the race with Stop must not post a second time.
func TestStaleTimerCallbackDoesNothing(t *testing.T) {
	t.Parallel()

	hook := &fakeHook{status: http.StatusCreated}
	p, clock := newPublisher(hook)

	p.Schedule()
	stale := clock.timers[0]
	p.Schedule()

	stale.f()
	if hook.calls != 0 {
		t.Fatalf("stale callback posted %d times, want 0", hook.calls)
	}
	clock.fireLive()
	if hook.calls != 1 {
		t.Fatalf("hook called %d times, want 1", hook.calls)
	}
}

func TestEmptyURLDisablesPublishing(t *testing.T) {
	t.Parallel()

	hook := &fakeHook{status: http.StatusCreated}
	clock := &fakeClock{}
	p := publish.NewWith("", 30*time.Second, hook, clock)

	p.Schedule()
	status := p.PublishNow(context.Background())
	p.Flush(context.Background())

	if len(clock.timers) != 0 {
		t.Errorf("%d timers started, want 0", len(clock.timers))
	}
	if hook.calls != 0 {
		t.Errorf("hook called %d times, want 0", hook.calls)
	}
	if status.Configured || status.Pending || status.LastTriggeredAt != nil {
		t.Errorf("status = %+v, want configured=false and nothing else set", status)
	}
}

func TestPublishNowCancelsThePendingTimer(t *testing.T) {
	t.Parallel()

	hook := &fakeHook{status: http.StatusCreated}
	p, clock := newPublisher(hook)

	p.Schedule()
	status := p.PublishNow(context.Background())

	if hook.calls != 1 {
		t.Fatalf("hook called %d times, want 1", hook.calls)
	}
	if !status.Configured || status.Pending {
		t.Errorf("status = %+v, want configured and not pending", status)
	}
	if ran := clock.fireLive(); ran != 0 {
		t.Errorf("%d timers still live after PublishNow, want 0", ran)
	}
}

func TestFailedHookIsReportedAndRedacted(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		hook *fakeHook
		want string
	}{
		{name: "non-2xx", hook: &fakeHook{status: http.StatusNotFound}, want: "404"},
		{
			name: "transport error",
			// net/http wraps a transport failure in *url.Error, which carries the URL.
			hook: &fakeHook{err: &url.Error{Op: "Post", URL: hookURL, Err: errors.New("dial tcp: refused")}},
			want: "refused",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			p, _ := newPublisher(tt.hook)

			status := p.PublishNow(context.Background())
			if status.LastError == nil {
				t.Fatal("LastError = nil, want the failure")
			}
			if !strings.Contains(*status.LastError, tt.want) {
				t.Errorf("LastError = %q, want it to mention %q", *status.LastError, tt.want)
			}
			if strings.Contains(*status.LastError, "secret") {
				t.Errorf("LastError = %q leaks the hook URL", *status.LastError)
			}
		})
	}
}

func TestFlushSendsOnlyWhenPending(t *testing.T) {
	t.Parallel()

	hook := &fakeHook{status: http.StatusCreated}
	p, _ := newPublisher(hook)

	p.Flush(context.Background())
	if hook.calls != 0 {
		t.Fatalf("Flush with nothing pending posted %d times, want 0", hook.calls)
	}

	p.Schedule()
	p.Flush(context.Background())
	if hook.calls != 1 {
		t.Fatalf("Flush with a pending publish posted %d times, want 1", hook.calls)
	}
}
