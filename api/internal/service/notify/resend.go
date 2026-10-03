package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"landing-api/conf"
)

// resendEndpoint is Resend's send-email API.
const resendEndpoint = "https://api.resend.com/emails"

// resendTimeout bounds one send. The lead is already saved, so a slow mail API must not hold the
// form's request open for long.
const resendTimeout = 10 * time.Second

// resendNotifier sends through Resend's HTTP API. Its free plan covers one owner's inbox.
type resendNotifier struct {
	client   *http.Client
	endpoint string
	apiKey   string
	from     string
	to       string
	siteName string
}

// NewResend builds a Notifier backed by Resend. conf.Load has already checked RESEND_API_KEY and
// NOTIFY_TO.
func NewResend(cfg conf.NotifyConfig) Notifier {
	return newResend(cfg, &http.Client{Timeout: resendTimeout}, resendEndpoint)
}

func newResend(cfg conf.NotifyConfig, client *http.Client, endpoint string) Notifier {
	return &resendNotifier{
		client:   client,
		endpoint: endpoint,
		apiKey:   cfg.ResendAPIKey,
		from:     cfg.ResendFrom,
		to:       cfg.To,
		siteName: cfg.SiteName,
	}
}

// resendEmail is the request body. Field names are Resend's.
type resendEmail struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text"`
	ReplyTo string   `json:"reply_to,omitempty"`
}

// Lead sends a plain-text email. Reply-To is the visitor, as in the ses driver. From stays
// RESEND_FROM, since the visitor's address would fail SPF/DKIM.
func (r *resendNotifier) Lead(ctx context.Context, l LeadMessage) error {
	body, err := json.Marshal(resendEmail{
		From:    r.from,
		To:      []string{r.to},
		Subject: buildSubject(r.siteName, l.Name),
		Text: fmt.Sprintf(
			"Name: %s\nEmail: %s\nLocale: %s\nSource page: %s\n\nMessage:\n%s\n",
			l.Name, l.Email, l.Locale, l.SourcePage, l.Message,
		),
		ReplyTo: l.Email,
	})
	if err != nil {
		return fmt.Errorf("encode resend request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("send lead notification: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode < 200 || res.StatusCode > 299 {
		// Resend explains a refusal in the body, such as an unverified sender. Keep a little of it.
		detail, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("send lead notification: resend answered %d: %s", res.StatusCode, detail)
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64*1024))
	return nil
}
