/*
# AI Companion Web App - Core Schema

1. Purpose
   A web app version of the AI Web Companion: students sign in, organize their
   AI study chats into notebooks, send messages to multi-provider AI models,
   and build flashcard study decks. Each user only ever sees and edits their
   own data.

2. New Tables
   - `notebooks`
     - id (uuid, pk)
     - user_id (uuid, not null, defaults to auth.uid()) -> auth.users
     - title (text, not null)
     - created_at (timestamptz, default now())
     - updated_at (timestamptz, default now())
     One notebook = one chat thread / folder of study material.
   - `messages`
     - id (uuid, pk)
     - notebook_id (uuid, not null) -> notebooks (cascade)
     - user_id (uuid, not null, defaults to auth.uid()) -> auth.users (cascade)
     - role (text, not null) -- 'user' | 'assistant' | 'system'
     - content (text, not null)
     - attachments (jsonb, nullable) -- array of {type, name, content} cards
     - created_at (timestamptz, default now())
     Chat history scoped per notebook. user_id is denormalized for simpler RLS.
   - `flashcards`
     - id (uuid, pk)
     - notebook_id (uuid, not null) -> notebooks (cascade)
     - user_id (uuid, not null, defaults to auth.uid()) -> auth.users (cascade)
     - front (text, not null) -- concept / question
     - back (text, not null) -- definition
     - analogy (text, nullable)
     - formula (text, nullable)
     - status (text, not null default 'new') -- 'new' | 'hard' | 'got_it'
     - created_at (timestamptz, default now())
     Study deck cards scoped per notebook.

3. Indexes
   - notebooks(user_id)
   - messages(notebook_id, created_at)
   - messages(user_id)
   - flashcards(notebook_id)
   - flashcards(user_id)

4. Security
   - RLS enabled on all three tables.
   - notebooks: owner-scoped CRUD via auth.uid() = user_id.
   - messages: owner-scoped via auth.uid() = user_id (denormalized owner column).
   - flashcards: owner-scoped via auth.uid() = user_id.
   - All policies use DROP IF EXISTS first for idempotency.
   - user_id columns DEFAULT auth.uid() so client inserts that omit user_id succeed.

5. Notes
   - No custom auth tables. Supabase auth.users is the source of truth.
   - Email confirmation stays OFF (default).
   - No destructive operations; schema is additive only.
*/

CREATE TABLE IF NOT EXISTS notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  attachments jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  analogy text,
  formula text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'hard', 'got_it')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON notebooks(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_notebook_id ON messages(notebook_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_notebook_id ON flashcards(notebook_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON flashcards(user_id);

ALTER TABLE notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

-- notebooks policies
DROP POLICY IF EXISTS "select_own_notebooks" ON notebooks;
CREATE POLICY "select_own_notebooks" ON notebooks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notebooks" ON notebooks;
CREATE POLICY "insert_own_notebooks" ON notebooks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notebooks" ON notebooks;
CREATE POLICY "update_own_notebooks" ON notebooks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notebooks" ON notebooks;
CREATE POLICY "delete_own_notebooks" ON notebooks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- messages policies
DROP POLICY IF EXISTS "select_own_messages" ON messages;
CREATE POLICY "select_own_messages" ON messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_messages" ON messages;
CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- flashcards policies
DROP POLICY IF EXISTS "select_own_flashcards" ON flashcards;
CREATE POLICY "select_own_flashcards" ON flashcards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_flashcards" ON flashcards;
CREATE POLICY "insert_own_flashcards" ON flashcards
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_flashcards" ON flashcards;
CREATE POLICY "update_own_flashcards" ON flashcards
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_flashcards" ON flashcards;
CREATE POLICY "delete_own_flashcards" ON flashcards
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at trigger for notebooks
CREATE OR REPLACE FUNCTION touch_notebook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notebooks_updated_at ON notebooks;
CREATE TRIGGER notebooks_updated_at
  BEFORE UPDATE ON notebooks
  FOR EACH ROW
  EXECUTE FUNCTION touch_notebook_updated_at();
