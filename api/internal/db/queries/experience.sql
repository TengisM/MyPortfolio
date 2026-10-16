-- name: ListExperience :many
SELECT * FROM experience
ORDER BY start_date DESC, created_at, id;

-- name: ListPublishedExperience :many
SELECT * FROM experience
WHERE published
ORDER BY start_date DESC, created_at, id;

-- name: CreateExperience :one
INSERT INTO experience (id, kind, organization_mn, organization_en, position_mn, position_en,
                        description_mn, description_en, start_date, end_date, published)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: UpdateExperience :one
UPDATE experience
SET kind = $2, organization_mn = $3, organization_en = $4, position_mn = $5, position_en = $6,
    description_mn = $7, description_en = $8, start_date = $9, end_date = $10, published = $11,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteExperience :execrows
DELETE FROM experience WHERE id = $1;

-- name: CountExperience :one
SELECT count(*) FROM experience;
