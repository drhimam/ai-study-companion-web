/*
  Add 'assignment' as a new study_material type.
  Content shape: { text: string } (markdown assignment document)
*/
ALTER TABLE study_materials DROP CONSTRAINT IF EXISTS study_materials_type_check;

ALTER TABLE study_materials ADD CONSTRAINT study_materials_type_check
  CHECK (type IN ('quiz', 'note', 'infographic', 'flashcard_deck', 'saved', 'assignment'));
