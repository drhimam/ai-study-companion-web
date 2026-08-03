/*
# Extend study_materials type to include flashcard decks and saved chat outputs

1. Purpose
   The study_materials table currently stores quizzes, study notes, and infographics.
   This migration adds two new material types so flashcard decks and saved chat
   responses can live in the same table with the same ownership model:
   - 'flashcard_deck' — a named group of flashcards generated from a chat prompt.
   - 'saved' — a chat response the user explicitly saved from the 3-dot menu.

2. Changes
   - Drop the existing CHECK constraint on study_materials.type.
   - Add a new CHECK constraint allowing: 'quiz', 'note', 'infographic',
     'flashcard_deck', 'saved'.

3. Content shapes (stored in jsonb, documented for reference)
   - flashcard_deck: { cards: [{ front, back, analogy, formula }] }
   - saved: { text: string }

4. Security
   No policy changes — existing owner-scoped CRUD policies on study_materials
   already cover all types. RLS remains enabled and unchanged.
*/

ALTER TABLE study_materials DROP CONSTRAINT IF EXISTS study_materials_type_check;

ALTER TABLE study_materials ADD CONSTRAINT study_materials_type_check
  CHECK (type IN ('quiz', 'note', 'infographic', 'flashcard_deck', 'saved'));
