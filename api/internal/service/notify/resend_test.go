package notify_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"landing-api/conf"
	"landing-api/internal/service/notify"
)

// capturedRequest is what the fake Resend server saw.
type capturedRequest struct {
	method, path, auth, contentType string
	body                            map[string]any
}

func fakeResend(t *testing.T, status int, reply string) (*httptest.Server, *capturedRequest) {
	t.Helper()

	got := &capturedRequest{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.method = r.Method
		got.path = r.URL.Path
		got.auth = r.Header.Get("Authorization")
		got.contentType = r.Header.Get("Content-Type")
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &got.body); err != nil {
			t.Errorf("request body is not JSON: %v (%s)", err, raw)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(reply))
	}))
	t.Cleanup(srv.Close)
	return srv, got
}

func resendConfig() conf.NotifyConfig {
	return conf.NotifyConfig{
		Driver:       "resend",
		To:           "owner@example.mn",
		ResendAPIKey: "re_test_key",
		ResendFrom:   "onboarding@resend.dev",
		SiteName:     "Tenggis",
	}
}

func TestResendSendsTheDocumentedRequest(t *testing.T) {
	t.Parallel()

	srv, got := fakeResend(t, http.StatusOK, `{"id":"abc"}`)
	n := notify.NewResendAt(resendConfig(), srv.Client(), srv.URL+"/emails")

	err := n.Lead(context.Background(), notify.LeadMessage{
		Name: "Bat", Email: "bat@example.mn", Message: "Sain baina uu", Locale: "mn", SourcePage: "/",
	})
	if err != nil {
		t.Fatalf("Lead() error = %v, want nil", err)
	}

	if got.method != http.MethodPost || got.path != "/emails" {
		t.Errorf("request = %s %s, want POST /emails", got.method, got.path)
	}
	if got.auth != "Bearer re_test_key" {
		t.Errorf("Authorization = %q, want Bearer re_test_key", got.auth)
	}
	if got.contentType != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got.contentType)
	}
	if got.body["from"] != "onboarding@resend.dev" {
		t.Errorf("from = %v, want onboarding@resend.dev", got.body["from"])
	}
	to, ok := got.body["to"].([]any)
	if !ok || len(to) != 1 || to[0] != "owner@example.mn" {
		t.Errorf("to = %v, want [owner@example.mn]", got.body["to"])
	}
	if got.body["subject"] != "[Tenggis] New lead from Bat" {
		t.Errorf("subject = %v, want [Tenggis] New lead from Bat", got.body["subject"])
	}
	text, _ := got.body["text"].(string)
	if !strings.Contains(text, "Sain baina uu") || !strings.Contains(text, "bat@example.mn") {
		t.Errorf("text = %q, want the message and the visitor's email", text)
	}
	if got.body["reply_to"] != "bat@example.mn" {
		t.Errorf("reply_to = %v, want the visitor", got.body["reply_to"])
	}
}

func TestResendReportsARefusal(t *testing.T) {
	t.Parallel()

	srv, _ := fakeResend(t, http.StatusForbidden, `{"message":"domain not verified"}`)
	n := notify.NewResendAt(resendConfig(), srv.Client(), srv.URL+"/emails")

	err := n.Lead(context.Background(), notify.LeadMessage{Name: "Bat", Email: "bat@example.mn"})
	if err == nil {
		t.Fatal("Lead() error = nil, want the 403")
	}
	if !strings.Contains(err.Error(), "403") || !strings.Contains(err.Error(), "domain not verified") {
		t.Errorf("error = %q, want the status and Resend's reason", err)
	}
}
