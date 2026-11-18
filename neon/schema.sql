-- =============================================================
-- Vox Trupe Studios — schema completo (Neon / Postgres puro)
-- Execute no SQL Editor do Neon. Sem Supabase, sem RLS, sem anon.
-- =============================================================

-- 1) Usuários do painel (login completo)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,            -- scrypt/sha256 + salt (gerado pelo bot)
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'reviewer' CHECK (role IN ('admin', 'reviewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Fichas dos dubladores (formulários enviados pelo bot)
CREATE TABLE IF NOT EXISTS dubbers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id        TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  age               INTEGER,
  pronouns          TEXT,
  self_level        TEXT NOT NULL DEFAULT 'iniciante',
  experience        TEXT,
  voice_tone        TEXT NOT NULL DEFAULT 'medio',
  voice_types       TEXT[] NOT NULL DEFAULT '{}',
  intensity         TEXT,
  diction           TEXT,
  speech_speed      TEXT,
  specialties       TEXT[] NOT NULL DEFAULT '{}',
  availability      TEXT[] NOT NULL DEFAULT '{}',
  interests         TEXT[] NOT NULL DEFAULT '{}',
  wanted_characters TEXT,
  classification    TEXT NOT NULL DEFAULT 'novato',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  needs_review      BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Migra instalações que já criaram a tabela com age TEXT.
ALTER TABLE dubbers ALTER COLUMN age TYPE INTEGER
  USING CASE WHEN age::text ~ '^[0-9]+$' THEN age::text::INTEGER ELSE NULL END;
UPDATE dubbers SET self_level = 'iniciante' WHERE self_level IS NULL OR self_level = '';
UPDATE dubbers SET voice_tone = 'medio' WHERE voice_tone IS NULL OR voice_tone = '';
ALTER TABLE dubbers ALTER COLUMN self_level SET DEFAULT 'iniciante';
ALTER TABLE dubbers ALTER COLUMN self_level SET NOT NULL;
ALTER TABLE dubbers ALTER COLUMN voice_tone SET DEFAULT 'medio';
ALTER TABLE dubbers ALTER COLUMN voice_tone SET NOT NULL;

-- 3) Samples de áudio (bytes gravados no próprio banco)
CREATE TABLE IF NOT EXISTS samples (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dubber_id         UUID NOT NULL REFERENCES dubbers(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  label             TEXT,
  source            TEXT NOT NULL DEFAULT 'discord' CHECK (source IN ('discord', 'panel')),
  uploaded_by_name  TEXT NOT NULL DEFAULT 'Bot do Discord',
  bytes             BYTEA NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS samples_dubber_idx ON samples(dubber_id);

-- 4) Avaliações
CREATE TABLE IF NOT EXISTS reviews (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dubber_id              UUID NOT NULL REFERENCES dubbers(id) ON DELETE CASCADE,
  reviewer_id            UUID,
  reviewer_name          TEXT NOT NULL,
  previous_classification TEXT,
  new_classification     TEXT NOT NULL,
  criteria               JSONB NOT NULL DEFAULT '{}',
  comments               TEXT,
  reason                 TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Histórico de classificação (append-only)
CREATE TABLE IF NOT EXISTS classification_history (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dubber_id                UUID NOT NULL REFERENCES dubbers(id) ON DELETE CASCADE,
  previous_classification  TEXT,
  new_classification       TEXT NOT NULL,
  reason                   TEXT,
  changed_by_id            UUID,
  changed_by_name          TEXT NOT NULL,
  review_id                UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Notas internas
CREATE TABLE IF NOT EXISTS internal_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dubber_id   UUID NOT NULL REFERENCES dubbers(id) ON DELETE CASCADE,
  author_id   UUID,
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7) Auditoria (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID,
  actor_name TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT 'dubber',
  entity_id  TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8) Sessões de login do painel (token -> usuário)
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
