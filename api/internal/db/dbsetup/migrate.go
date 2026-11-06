package dbsetup

import (
	"errors"
	"fmt"
	"io/fs"
	"log/slog"

	"landing-api/internal/db/migrations"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

func RunMigrations(dsn string) error {
	sourceDriver, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("failed to create migration source: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", sourceDriver, dsn)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}
	// Close the connection golang-migrate opened. pgtestdb cannot clone a template database
	// while any connection to it is open.
	defer func() {
		if srcErr, dbErr := m.Close(); srcErr != nil || dbErr != nil {
			slog.Warn("failed to close migrate instance",
				slog.Any("source_err", srcErr), slog.Any("db_err", dbErr))
		}
	}()

	// A newer build already migrated this database: a deploy was rolled back, or unreleased code
	// ran locally against production. golang-migrate refuses a version it has no file for, which
	// crash-looped the whole API on 2026-11-05. Migrations here are forward-only and additive, so
	// this build still runs on the newer schema. A dirty version still stops startup below.
	if version, dirty, err := m.Version(); err == nil && !dirty {
		last, err := lastVersion(sourceDriver)
		if err != nil {
			return fmt.Errorf("failed to read migration files: %w", err)
		}
		if version > last {
			slog.Warn("database is ahead of this build, skipping migrations",
				slog.Uint64("database", uint64(version)), slog.Uint64("build", uint64(last)))
			return nil
		}
	}

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}

// lastVersion is the newest migration this build carries.
func lastVersion(src source.Driver) (uint, error) {
	v, err := src.First()
	if err != nil {
		return 0, err
	}
	for {
		next, err := src.Next(v)
		if errors.Is(err, fs.ErrNotExist) {
			return v, nil
		}
		if err != nil {
			return 0, err
		}
		v = next
	}
}
