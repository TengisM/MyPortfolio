CREATE TABLE experience (
    id              uuid PRIMARY KEY,
    kind            text        NOT NULL CHECK (kind IN ('work', 'education')),
    organization_mn text        NOT NULL,
    organization_en text        NOT NULL,
    position_mn     text        NOT NULL,
    position_en     text        NOT NULL,
    description_mn  text        NOT NULL DEFAULT '',
    description_en  text        NOT NULL DEFAULT '',
    start_date      date        NOT NULL,
    -- NULL means the role is current.
    end_date        date,
    published       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT experience_dates_ordered CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Both the admin list and the public content read newest first.
CREATE INDEX experience_start_date_idx ON experience (start_date DESC);
