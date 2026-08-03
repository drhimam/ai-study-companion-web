-- ============================================================================
-- Neon PostgreSQL Schema for AI Study Companion with Better Auth
-- ============================================================================

-- Ensure pgcrypto extension is active for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean reset of existing legacy tables if converting from Supabase schema
DROP TABLE IF EXISTS study_materials CASCADE;
DROP TABLE IF EXISTS flashcards CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS notebooks CASCADE;
DROP TABLE IF EXISTS verification CASCADE;
DROP TABLE IF EXISTS account CASCADE;
DROP TABLE IF EXISTS session CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;

-- 1. Better Auth Tables
CREATE TABLE "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "session" (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE "account" (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "verification" (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Application Tables
CREATE TABLE notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  attachments jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  analogy text,
  formula text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'hard', 'got_it')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE study_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('flashcard_deck', 'quiz', 'study_guide', 'mindmap', 'assignment')),
  title text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX idx_notebooks_user_id ON notebooks(user_id);
CREATE INDEX idx_messages_notebook_id ON messages(notebook_id, created_at);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_flashcards_notebook_id ON flashcards(notebook_id);
CREATE INDEX idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX idx_study_materials_notebook_id ON study_materials(notebook_id);
CREATE INDEX idx_study_materials_user_id ON study_materials(user_id);
CREATE INDEX idx_session_token ON session(token);
CREATE INDEX idx_session_user_id ON session(user_id);

-- 4. Triggers for updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notebooks_updated_at ON notebooks;
CREATE TRIGGER notebooks_updated_at
  BEFORE UPDATE ON notebooks
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS study_materials_updated_at ON study_materials;
CREATE TRIGGER study_materials_updated_at
  BEFORE UPDATE ON study_materials
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();

-- 5. RPC Function: update_flashcard_deck
CREATE OR REPLACE FUNCTION update_flashcard_deck(
  p_material_id uuid,
  p_user_id text,
  p_title text,
  p_content jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner text;
  v_cards jsonb;
  v_card jsonb;
  v_card_count int;
  v_total_size int;
BEGIN
  SELECT user_id INTO v_owner FROM study_materials WHERE id = p_material_id;
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF (SELECT type FROM study_materials WHERE id = p_material_id) <> 'flashcard_deck' THEN
    RAISE EXCEPTION 'Only flashcard decks are editable';
  END IF;

  IF p_title IS NULL OR length(p_title) < 1 OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'Invalid title';
  END IF;

  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN
    RAISE EXCEPTION 'Invalid content';
  END IF;

  IF NOT p_content ? 'cards' THEN
    RAISE EXCEPTION 'Missing cards array';
  END IF;

  IF jsonb_typeof(p_content -> 'cards') <> 'array' THEN
    RAISE EXCEPTION 'Cards must be an array';
  END IF;

  v_cards := p_content -> 'cards';
  v_card_count := jsonb_array_length(v_cards);

  IF v_card_count < 1 OR v_card_count > 200 THEN
    RAISE EXCEPTION 'Card count must be between 1 and 200';
  END IF;

  v_total_size := octet_length(p_content::text);
  IF v_total_size > 262144 THEN
    RAISE EXCEPTION 'Content too large';
  END IF;

  FOR v_card IN SELECT * FROM jsonb_array_elements(v_cards)
  LOOP
    IF jsonb_typeof(v_card) <> 'object' THEN
      RAISE EXCEPTION 'Each card must be an object';
    END IF;

    IF NOT (v_card ? 'front' AND v_card ? 'back') THEN
      RAISE EXCEPTION 'Each card needs front and back';
    END IF;

    IF jsonb_typeof(v_card -> 'front') <> 'string' OR jsonb_typeof(v_card -> 'back') <> 'string' THEN
      RAISE EXCEPTION 'Front and back must be text';
    END IF;

    IF length(v_card ->> 'front') < 1 OR length(v_card ->> 'front') > 2000 THEN
      RAISE EXCEPTION 'Front text out of range';
    END IF;

    IF length(v_card ->> 'back') < 1 OR length(v_card ->> 'back') > 2000 THEN
      RAISE EXCEPTION 'Back text out of range';
    END IF;
  END LOOP;

  UPDATE study_materials
  SET title = p_title, content = p_content, updated_at = now()
  WHERE id = p_material_id AND user_id = p_user_id;
END;
$$;
