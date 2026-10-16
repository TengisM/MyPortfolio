-- Portfolio projects, edited in the admin panel. Logos live in the row: there is no object store
-- on the free hosting, and a handful of small images costs nothing here.
CREATE TABLE projects (
    id                uuid PRIMARY KEY,
    title             text        NOT NULL,
    url               text        NOT NULL,
    description_mn    text        NOT NULL DEFAULT '',
    description_en    text        NOT NULL DEFAULT '',
    sort_order        int         NOT NULL,
    published         boolean     NOT NULL DEFAULT true,
    logo              bytea,
    logo_content_type text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    -- A logo without a type could not be served, and a type without a logo means nothing.
    CONSTRAINT projects_logo_pair CHECK ((logo IS NULL) = (logo_content_type IS NULL))
);

-- Not unique: reorder rewrites every row in one transaction, and a unique index would trip on the
-- intermediate states.
CREATE INDEX projects_sort_order_idx ON projects (sort_order);

-- Every read except the logo endpoint goes through this view, so a list never loads logo bytes.
CREATE VIEW project_summaries AS
SELECT id, title, url, description_mn, description_en, sort_order, published,
       (logo IS NOT NULL)::boolean AS has_logo, created_at, updated_at
FROM projects;
