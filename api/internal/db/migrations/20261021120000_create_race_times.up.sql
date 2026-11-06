-- Solo race times for the weekly scoreboard. Rows from before the current week are deleted when the
-- next time is posted, so the table stays small and nothing needs a cron job.
CREATE TABLE race_times (
    id         uuid        PRIMARY KEY,
    track      text        NOT NULL CHECK (track IN ('coaster', 'skyway', 'tidal')),
    name       text        NOT NULL,
    -- strings.ToLower(name), set by the API. The board groups by it.
    name_key   text        NOT NULL,
    ship       text        NOT NULL CHECK (ship IN ('vega', 'kestrel', 'lancer', 'wisp', 'torch')),
    lap_ms     integer[]   NOT NULL CHECK (cardinality(lap_ms) = 3),
    total_ms   integer     NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX race_times_board_idx ON race_times (track, created_at, total_ms);
