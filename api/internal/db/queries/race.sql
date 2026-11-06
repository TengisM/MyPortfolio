-- name: CreateRaceTime :exec
INSERT INTO race_times (id, track, name, name_key, ship, lap_ms, total_ms, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: RaceBoard :many
-- Each name_key's best run on the track since a time, with the name as typed on that run.
SELECT name, ship, lap_ms, total_ms FROM (
    SELECT DISTINCT ON (name_key) name, ship, lap_ms, total_ms, created_at
    FROM race_times
    WHERE track = $1 AND created_at >= $2
    ORDER BY name_key, total_ms, created_at
) best
ORDER BY total_ms, created_at
LIMIT $3;

-- name: RacePlace :one
-- A name_key's place among the best runs since a time, and its best total. No row means no run.
SELECT place::int AS place, total_ms FROM (
    SELECT name_key, total_ms,
           row_number() OVER (ORDER BY total_ms, created_at) AS place
    FROM (
        SELECT DISTINCT ON (name_key) name_key, total_ms, created_at
        FROM race_times
        WHERE track = $1 AND created_at >= $2
        ORDER BY name_key, total_ms, created_at
    ) best
) ranked
WHERE name_key = $3;

-- name: DeleteRaceTimesBefore :exec
DELETE FROM race_times WHERE created_at < $1;
