package conf_test

import (
	"strings"
	"testing"
	"time"

	"landing-api/conf"
)

// No scratch .env: LoadEnvFile runs once per test binary, so only the first one would count.
//
//nolint:paralleltest // t.Setenv is incompatible with t.Parallel
func TestLoadJWTSecretValidation(t *testing.T) {
	// setProductionPrereqs satisfies every other check, so each subtest depends only on JWT_SECRET.
	setProductionPrereqs := func(t *testing.T) {
		t.Helper()
		t.Setenv("APP_ENV", "production")
		t.Setenv("CORS_ORIGINS", "https://example.mn")
		t.Setenv("NOTIFY_DRIVER", "ses")
		t.Setenv("NOTIFY_TO", "owner@example.mn")
		t.Setenv("SES_FROM", "noreply@example.mn")
	}

	t.Run("production with no JWT_SECRET is refused, naming it", func(t *testing.T) {
		setProductionPrereqs(t)
		t.Setenv("JWT_SECRET", "")

		_, err := conf.Load()
		if err == nil {
			t.Fatal("Load() error = nil, want error for missing JWT_SECRET")
		}
		if !strings.Contains(err.Error(), "JWT_SECRET") {
			t.Errorf("Load() error = %q, want it to name JWT_SECRET", err.Error())
		}
	})

	t.Run("production with a 10-character secret is refused, saying why", func(t *testing.T) {
		setProductionPrereqs(t)
		t.Setenv("JWT_SECRET", "short1234x")

		_, err := conf.Load()
		if err == nil {
			t.Fatal("Load() error = nil, want error for a too-short JWT_SECRET")
		}
		if !strings.Contains(err.Error(), "32") {
			t.Errorf("Load() error = %q, want it to say the length floor", err.Error())
		}
	})

	t.Run("production with a 32-character secret starts", func(t *testing.T) {
		setProductionPrereqs(t)
		secret := strings.Repeat("a", 32)
		t.Setenv("JWT_SECRET", secret)

		cfg, err := conf.Load()
		if err != nil {
			t.Fatalf("Load() error = %v, want nil for a 32-character secret", err)
		}
		if cfg.JWT.Secret != secret {
			t.Errorf("JWT.Secret = %q, want %q", cfg.JWT.Secret, secret)
		}
	})

	t.Run("development with no JWT_SECRET uses the documented default", func(t *testing.T) {
		t.Setenv("APP_ENV", "development")
		t.Setenv("CORS_ORIGINS", "")
		t.Setenv("NOTIFY_DRIVER", "")
		t.Setenv("JWT_SECRET", "")

		cfg, err := conf.Load()
		if err != nil {
			t.Fatalf("Load() error = %v, want nil in development", err)
		}
		if cfg.JWT.Secret == "" {
			t.Error("JWT.Secret is empty, want the development default")
		}
	})
}

//nolint:paralleltest // t.Setenv is incompatible with t.Parallel
func TestLoadResendDriver(t *testing.T) {
	setProduction := func(t *testing.T) {
		t.Helper()
		t.Setenv("APP_ENV", "production")
		t.Setenv("CORS_ORIGINS", "https://example.mn")
		t.Setenv("JWT_SECRET", strings.Repeat("a", 32))
		t.Setenv("NOTIFY_DRIVER", "resend")
		t.Setenv("NOTIFY_TO", "owner@example.mn")
		t.Setenv("RESEND_API_KEY", "re_test_key")
		t.Setenv("RESEND_FROM", "")
	}

	t.Run("production accepts resend and defaults the sender", func(t *testing.T) {
		setProduction(t)

		cfg, err := conf.Load()
		if err != nil {
			t.Fatalf("Load() error = %v, want nil", err)
		}
		if cfg.Notify.ResendFrom != "onboarding@resend.dev" {
			t.Errorf("ResendFrom = %q, want onboarding@resend.dev", cfg.Notify.ResendFrom)
		}
	})

	t.Run("missing RESEND_API_KEY is refused, naming it", func(t *testing.T) {
		setProduction(t)
		t.Setenv("RESEND_API_KEY", "")

		_, err := conf.Load()
		if err == nil || !strings.Contains(err.Error(), "RESEND_API_KEY") {
			t.Fatalf("Load() error = %v, want one naming RESEND_API_KEY", err)
		}
	})

	t.Run("missing NOTIFY_TO is refused, naming it", func(t *testing.T) {
		setProduction(t)
		t.Setenv("NOTIFY_TO", "")

		_, err := conf.Load()
		if err == nil || !strings.Contains(err.Error(), "NOTIFY_TO") {
			t.Fatalf("Load() error = %v, want one naming NOTIFY_TO", err)
		}
	})
}

//nolint:paralleltest // t.Setenv is incompatible with t.Parallel
func TestLoadPublishSettings(t *testing.T) {
	setDev := func(t *testing.T) {
		t.Helper()
		t.Setenv("APP_ENV", "development")
		t.Setenv("CORS_ORIGINS", "")
		t.Setenv("NOTIFY_DRIVER", "")
		t.Setenv("VERCEL_DEPLOY_HOOK_URL", "")
		t.Setenv("PUBLISH_DEBOUNCE_SECONDS", "")
	}

	t.Run("defaults to off with a 30 second debounce", func(t *testing.T) {
		setDev(t)

		cfg, err := conf.Load()
		if err != nil {
			t.Fatalf("Load() error = %v", err)
		}
		if cfg.Publish.DeployHookURL != "" || cfg.Publish.Debounce != 30*time.Second {
			t.Errorf("Publish = %+v, want no hook and 30s", cfg.Publish)
		}
	})

	t.Run("a negative debounce is refused", func(t *testing.T) {
		setDev(t)
		t.Setenv("PUBLISH_DEBOUNCE_SECONDS", "-1")

		if _, err := conf.Load(); err == nil {
			t.Fatal("Load() error = nil, want one for -1")
		}
	})

	t.Run("a hook that is not a URL is refused without echoing it", func(t *testing.T) {
		setDev(t)
		t.Setenv("VERCEL_DEPLOY_HOOK_URL", "prj_secretvalue")

		_, err := conf.Load()
		if err == nil {
			t.Fatal("Load() error = nil, want one for a bad hook URL")
		}
		if strings.Contains(err.Error(), "secretvalue") {
			t.Errorf("error = %q repeats the secret", err)
		}
	})
}
