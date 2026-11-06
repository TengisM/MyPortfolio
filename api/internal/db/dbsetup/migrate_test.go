package dbsetup_test

import (
	"context"
	"testing"

	"landing-api/internal/db/dbsetup"
	"landing-api/internal/testsupport"
)

// A database migrated by a newer build, as after a rollback or a local run against production.
const newerVersion = 99990101000000

func setVersion(t *testing.T, db *testsupport.DB, dirty bool) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		"UPDATE schema_migrations SET version = $1, dirty = $2", newerVersion, dirty)
	if err != nil {
		t.Fatalf("set version: %v", err)
	}
}

func TestRunMigrationsStartsOnNewerDatabase(t *testing.T) {
	t.Parallel()
	db := testsupport.Fresh(t)
	setVersion(t, db, false)

	if err := dbsetup.RunMigrations(db.DSN); err != nil {
		t.Fatalf("an older build must start on a newer schema, got %v", err)
	}
}

func TestRunMigrationsRefusesDirtyNewerDatabase(t *testing.T) {
	t.Parallel()
	db := testsupport.Fresh(t)
	setVersion(t, db, true)

	if err := dbsetup.RunMigrations(db.DSN); err == nil {
		t.Fatal("a half-applied migration must stop startup")
	}
}
