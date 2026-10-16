-- name: ListProjects :many
-- created_at and id break ties, so two rows with one sort_order keep a stable order.
SELECT * FROM project_summaries
ORDER BY sort_order, created_at, id;

-- name: ListPublishedProjects :many
SELECT * FROM project_summaries
WHERE published
ORDER BY sort_order, created_at, id;

-- name: GetProject :one
SELECT * FROM project_summaries WHERE id = $1;

-- name: CreateProject :exec
-- Appends at the end. Two creates at the same moment can share a sort_order; the tiebreak in the
-- list queries keeps that harmless, and the next reorder fixes it.
INSERT INTO projects (id, title, url, description_mn, description_en, published, sort_order)
VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM projects));

-- name: ImportProject :exec
INSERT INTO projects (id, title, url, description_mn, description_en, published, sort_order, logo,
                      logo_content_type)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: UpdateProject :execrows
UPDATE projects
SET title = $2, url = $3, description_mn = $4, description_en = $5, published = $6,
    updated_at = now()
WHERE id = $1;

-- name: DeleteProject :execrows
DELETE FROM projects WHERE id = $1;

-- name: SetProjectLogo :execrows
-- updated_at moves too: it is the cache-busting version in every logo URL.
UPDATE projects
SET logo = $2, logo_content_type = $3, updated_at = now()
WHERE id = $1;

-- name: ClearProjectLogo :execrows
UPDATE projects
SET logo = NULL, logo_content_type = NULL, updated_at = now()
WHERE id = $1;

-- name: GetProjectLogo :one
SELECT logo, logo_content_type FROM projects
WHERE id = $1 AND logo IS NOT NULL;

-- name: LockProjectIDs :many
-- FOR UPDATE holds off a concurrent edit or delete until the reorder commits.
SELECT id FROM projects FOR UPDATE;

-- name: SetProjectSortOrder :exec
-- updated_at stays: moving a project does not change its logo.
UPDATE projects SET sort_order = $2 WHERE id = $1;

-- name: CountProjects :one
SELECT count(*) FROM projects;
