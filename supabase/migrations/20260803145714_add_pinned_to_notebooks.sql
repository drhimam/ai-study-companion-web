/*
# Add pinned column to notebooks

1. Changes
- Adds `pinned` boolean column to the `notebooks` table, defaulting to false.
- This lets users pin notebooks to keep them at the top of the sidebar list.
2. Security
- No new tables. Existing RLS policies on `notebooks` already cover UPDATE,
  so the new column is automatically protected by the existing owner-scoped
  UPDATE policy (USING + WITH CHECK on auth.uid() = user_id).
3. Notes
- Non-destructive: only adds a column with a safe default.
*/

ALTER TABLE notebooks
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
