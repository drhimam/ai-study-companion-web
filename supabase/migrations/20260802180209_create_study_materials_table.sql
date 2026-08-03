/*
# Study Materials Table for AI Companion

1. Purpose
   Stores AI-generated study materials (quizzes, study notes, infographics)
   per notebook, categorized by type. Flashcards already have their own table
   and are not duplicated here. Each material is owned by the user who created it.

2. New Table
   - `study_materials`
     - id (uuid, pk)
     - notebook_id (uuid, not null) -> notebooks (cascade)
     - user_id (uuid, not null, defaults to auth.uid()) -> auth.users (cascade)
     - type (text, not null) -- 'quiz' | 'note' | 'infographic'
     - title (text, not null)
     - content (jsonb, not null) -- structured payload (quiz questions, note HTML, infographic HTML)
     - created_at (timestamptz, default now())
     - updated_at (timestamptz, default now())

3. Indexes
   - study_materials(notebook_id)
   - study_materials(user_id)
   - study_materials(type)

4. Security
   - RLS enabled, owner-scoped CRUD via auth.uid() = user_id.
   - user_id defaults to auth.uid() so client inserts omitting it succeed.
   - DROP IF EXISTS first for idempotency.

5. Notes
   - Flashcards remain in the existing `flashcards` table.
   - Quiz content stored as structured JSON: array of question objects.
   - Note/infographic content stored as { html: string }.
*/

CREATE TABLE IF NOT EXISTS study_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('quiz', 'note', 'infographic')),
  title text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_materials_notebook_id ON study_materials(notebook_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_user_id ON study_materials(user_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_type ON study_materials(type);

ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_study_materials" ON study_materials;
CREATE POLICY "select_own_study_materials" ON study_materials FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_study_materials" ON study_materials;
CREATE POLICY "insert_own_study_materials" ON study_materials FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_study_materials" ON study_materials;
CREATE POLICY "update_own_study_materials" ON study_materials FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_study_materials" ON study_materials;
CREATE POLICY "delete_own_study_materials" ON study_materials FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION touch_study_material_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS study_materials_updated_at ON study_materials;
CREATE TRIGGER study_materials_updated_at
  BEFORE UPDATE ON study_materials
  FOR EACH ROW
  EXECUTE FUNCTION touch_study_material_updated_at();
