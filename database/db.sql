-- =============================================================
-- db.sql — схема базы данных OpenAlex для проекта ВКР.
--
-- Создание БД и применение схемы:
--   createdb -U postgres openalex_db
--   psql -U postgres -d openalex_db -f db.sql
-- =============================================================

DROP TABLE IF EXISTS publication_keywords  CASCADE;
DROP TABLE IF EXISTS publication_topics    CASCADE;
DROP TABLE IF EXISTS publication_authors   CASCADE;
DROP TABLE IF EXISTS affiliations          CASCADE;
DROP TABLE IF EXISTS persons               CASCADE;
DROP TABLE IF EXISTS publications          CASCADE;
DROP TABLE IF EXISTS journals              CASCADE;


-- 1. ЖУРНАЛЫ
CREATE TABLE journals (
    journal_id    SERIAL PRIMARY KEY,
    openalex_id   TEXT UNIQUE,
    name          TEXT NOT NULL,
    issn          VARCHAR(20),
    publisher     TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_journals_name ON journals(name);


-- 2. ПУБЛИКАЦИИ
CREATE TABLE publications (
    publication_id    SERIAL PRIMARY KEY,
    openalex_id       TEXT UNIQUE,
    title             TEXT NOT NULL,
    doi               TEXT UNIQUE,
    publication_year  INTEGER,
    publication_type  TEXT,
    cited_by_count    INTEGER DEFAULT 0,
    abstract          TEXT,
    journal_id        INTEGER REFERENCES journals(journal_id) ON DELETE SET NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_publications_year    ON publications(publication_year);
CREATE INDEX idx_publications_journal ON publications(journal_id);
CREATE INDEX idx_publications_title   ON publications(title);


-- 3. ПЕРСОНЫ (авторы)
CREATE TABLE persons (
    person_id     SERIAL PRIMARY KEY,
    openalex_id   TEXT UNIQUE,
    full_name     TEXT NOT NULL,
    orcid         TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_persons_name ON persons(full_name);


-- 4. АФФИЛИАЦИИ
CREATE TABLE affiliations (
    affiliation_id  SERIAL PRIMARY KEY,
    person_id       INTEGER REFERENCES persons(person_id) ON DELETE CASCADE,
    institution_id  TEXT,           -- ID организации в OpenAlex (для geo-обогащения)
    institution     TEXT NOT NULL,  -- Название организации
    country         VARCHAR(100),
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_affiliations_person      ON affiliations(person_id);
CREATE INDEX idx_affiliations_institution ON affiliations(institution);
CREATE INDEX idx_affiliations_country     ON affiliations(country);


-- 5. СВЯЗЬ публикация ↔ автор
CREATE TABLE publication_authors (
    publication_id  INTEGER REFERENCES publications(publication_id) ON DELETE CASCADE,
    person_id       INTEGER REFERENCES persons(person_id)           ON DELETE CASCADE,
    author_position INTEGER,  -- порядок автора в статье (1 = первый)
    PRIMARY KEY (publication_id, person_id)
);

CREATE INDEX idx_publication_authors_publication ON publication_authors(publication_id);
CREATE INDEX idx_publication_authors_person      ON publication_authors(person_id);


-- 6. ТЕМЫ публикаций
CREATE TABLE publication_topics (
    id             SERIAL PRIMARY KEY,
    publication_id INTEGER REFERENCES publications(publication_id) ON DELETE CASCADE,
    topic_name     TEXT NOT NULL,
    score          DOUBLE PRECISION
);

CREATE INDEX idx_publication_topics_publication ON publication_topics(publication_id);
CREATE INDEX idx_publication_topics_name        ON publication_topics(topic_name);


-- 7. КЛЮЧЕВЫЕ СЛОВА публикаций
CREATE TABLE publication_keywords (
    id             SERIAL PRIMARY KEY,
    publication_id INTEGER REFERENCES publications(publication_id) ON DELETE CASCADE,
    keyword_name   TEXT NOT NULL,
    score          DOUBLE PRECISION
);

CREATE INDEX idx_publication_keywords_publication ON publication_keywords(publication_id);
CREATE INDEX idx_publication_keywords_name        ON publication_keywords(keyword_name);
