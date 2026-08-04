/*
# Fix study_materials type CHECK constraint

The original better_auth_neon_schema.sql contained an old CHECK constraint
from the bolt.new era that only allowed: 'flashcard_deck', 'quiz', 'study_guide',
'mindmap', 'assignment'.

The app actually uses: 'flashcard_deck', 'quiz', 'note', 'infographic', 'saved', 'assignment'.

Types 'note', 'infographic', and 'saved' were missing from the constraint, causing
every INSERT for those types to fail with a PostgreSQL check constraint violation.
The worker caught the error and fell back to localStorage silently.

This migration drops the old constraint and replaces it with the correct one.
*/

ALTER TABLE study_materials DROP CONSTRAINT IF EXISTS study_materials_type_check;

ALTER TABLE study_materials ADD CONSTRAINT study_materials_type_check
  CHECK (type IN ('flashcard_deck', 'quiz', 'note', 'infographic', 'saved', 'assignment'));
