// Package publish triggers a site rebuild after content changes. Each change resets one debounce
// timer, so a burst of edits costs one deploy, not one per save.
package publish

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"
)

// hookTimeout bounds one deploy hook call. Vercel answers in well under a second.
const hookTimeout = 10 * time.Second

// Status is what GET and POST /api/admin/publish return.
type Status struct {
	Configured      bool       `json:"configured"`
	Pending         bool       `json:"pending"`
	LastTriggeredAt *time.Time `json:"last_triggered_at"`
	LastError       *string    `json:"last_error"`
}

// Doer sends the deploy hook request. *http.Client satisfies it.
type Doer interface {
	Do(req *http.Request) (*http.Response, error)
}

// Timer is the part of *time.Timer the publisher uses.
type Timer interface {
	Stop() bool
}

// Clock lets tests fire the debounce timer by hand instead of sleeping.
type Clock interface {
	Now() time.Time
	AfterFunc(d time.Duration, f func()) Timer
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

func (realClock) AfterFunc(d time.Duration, f func()) Timer { return time.AfterFunc(d, f) }

// Publisher holds the debounce timer and the last outcome. State is in memory only, so a restart
// forgets a pending publish; Flush covers a graceful stop.
type Publisher struct {
	hookURL string
	delay   time.Duration
	client  Doer
	clock   Clock

	mu    sync.Mutex
	timer Timer
	// generation goes up on every Schedule and PublishNow. A timer callback that lost a race with
	// Stop sees a newer generation and does nothing.
	generation      uint64
	pending         bool
	lastTriggeredAt *time.Time
	lastError       *string
}

// New builds a Publisher. An empty hookURL disables it: changes are logged and nothing is sent.
func New(hookURL string, delay time.Duration) *Publisher {
	return NewWith(hookURL, delay, &http.Client{Timeout: hookTimeout}, realClock{})
}

// NewWith is New with the HTTP client and clock supplied, for tests.
func NewWith(hookURL string, delay time.Duration, client Doer, clock Clock) *Publisher {
	return &Publisher{hookURL: hookURL, delay: delay, client: client, clock: clock}
}

// Schedule (re)starts the debounce timer. Call it after every successful content write.
func (p *Publisher) Schedule() {
	if p.hookURL == "" {
		slog.Info("content changed, VERCEL_DEPLOY_HOOK_URL not set, so no rebuild is triggered")
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.timer != nil {
		p.timer.Stop()
	}
	p.generation++
	gen := p.generation
	p.pending = true
	p.timer = p.clock.AfterFunc(p.delay, func() { p.fire(gen) })
}

// PublishNow cancels any pending timer and calls the hook before returning.
func (p *Publisher) PublishNow(ctx context.Context) Status {
	if p.hookURL == "" {
		slog.Info("publish requested, VERCEL_DEPLOY_HOOK_URL not set, so no rebuild is triggered")
		return p.Status()
	}

	p.mu.Lock()
	p.cancelLocked()
	p.mu.Unlock()

	p.trigger(ctx)
	return p.Status()
}

// Flush sends a pending publish now. main calls it on shutdown, so an edit made just before a
// redeploy still reaches the site.
func (p *Publisher) Flush(ctx context.Context) {
	p.mu.Lock()
	pending := p.pending
	p.cancelLocked()
	p.mu.Unlock()

	if pending {
		p.trigger(ctx)
	}
}

// Status reports the current state.
func (p *Publisher) Status() Status {
	p.mu.Lock()
	defer p.mu.Unlock()

	return Status{
		Configured:      p.hookURL != "",
		Pending:         p.pending,
		LastTriggeredAt: p.lastTriggeredAt,
		LastError:       p.lastError,
	}
}

func (p *Publisher) cancelLocked() {
	if p.timer != nil {
		p.timer.Stop()
		p.timer = nil
	}
	p.generation++
	p.pending = false
}

func (p *Publisher) fire(gen uint64) {
	p.mu.Lock()
	if gen != p.generation {
		p.mu.Unlock()
		return
	}
	p.pending = false
	p.timer = nil
	p.mu.Unlock()

	p.trigger(context.Background())
}

// trigger calls the hook and records the outcome. The hook URL is a secret, so it is never logged.
func (p *Publisher) trigger(ctx context.Context) {
	err := p.post(ctx)

	now := p.clock.Now()
	p.mu.Lock()
	p.lastTriggeredAt = &now
	if err != nil {
		msg := err.Error()
		p.lastError = &msg
	} else {
		p.lastError = nil
	}
	p.mu.Unlock()

	if err != nil {
		slog.Error("deploy hook failed", slog.Any("err", err))
		return
	}
	slog.Info("deploy hook triggered")
}

func (p *Publisher) post(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, hookTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.hookURL, http.NoBody)
	if err != nil {
		return fmt.Errorf("build deploy hook request: %w", err)
	}

	res, err := p.client.Do(req)
	if err != nil {
		// The error text from net/http includes the URL, which holds the hook's secret.
		return fmt.Errorf("call deploy hook: %w", redact(err))
	}
	defer func() { _ = res.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64*1024))

	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("deploy hook answered %d", res.StatusCode)
	}
	return nil
}

// redact drops the URL from a *url.Error and keeps the cause, such as a timeout.
func redact(err error) error {
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		return fmt.Errorf("%s: %w", urlErr.Op, urlErr.Err)
	}
	return err
}
