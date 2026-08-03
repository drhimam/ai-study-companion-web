/*
  # Secure flashcard deck editing

  1. Problem
     The study_materials UPDATE policy allows a signed-in user to change
     ANY column on their own rows, including `type`, `user_id`,
     `notebook_id`, and `created_at`. The client edit flow also sends
     raw user-typed JSON straight to the database with no validation of
     structure, field lengths, or total size — a vector for injecting
     arbitrarily large or malformed data.

  2. Change
     a) Revoke table-wide UPDATE from authenticated; grant UPDATE only on
        `title` and `content` (the two columns the UI legitimately changes).
     b) Create a SECURITY DEFINER function `update_flashcard_deck` that
        validates the content JSON structure, enforces per-card and total
        size limits, checks ownership, and performs the UPDATE. This is
        the only path for editing flashcard deck content.

  3. Notes
     No data is dropped or altered. The restricted column set matches the
     two fields the UI already writes.
*/

-- a) Column-level privileges: only title and content are user-editable -----
REVOKE UPDATE ON study_materials FROM authenticated;
GRANT UPDATE (title, content) ON study_materials TO authenticated;

-- b) SECURITY DEFINER function for validated flashcard deck updates -------

CREATE OR REPLACE FUNCTION update_flashcard_deck(
  p_material_id uuid,
  p_title text,
  p_content jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_cards jsonb;
  v_card jsonb;
  v_card_count int;
  v_total_size int;
BEGIN
  -- 1. Ownership: derive the actor from the session, not a parameter.
  SELECT user_id INTO v_owner FROM study_materials WHERE id = p_material_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 2. Lock edits to flashcard decks only.
  IF (SELECT type FROM study_materials WHERE id = p_material_id) <> 'flashcard_deck' THEN
    RAISE EXCEPTION 'Only flashcard decks are editable';
  END IF;

  -- 3. Title validation.
  IF p_title IS NULL OR length(p_title) < 1 OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'Invalid title';
  END IF;

  -- 4. Content must be a JSON object with a "cards" array.
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

  -- 5. Card count limits.
  IF v_card_count < 1 OR v_card_count > 200 THEN
    RAISE EXCEPTION 'Card count must be between 1 and 200';
  END IF;

  -- 6. Total payload size limit (256 KB).
  v_total_size := octet_length(p_content::text);
  IF v_total_size > 262144 THEN
    RAISE EXCEPTION 'Content too large';
  END IF;

  -- 7. Validate each card's structure and field lengths.
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

    IF v_card ? 'analogy' AND v_card ->> 'analogy' IS NOT NULL AND length(v_card ->> 'analogy') > 2000 THEN
      RAISE EXCEPTION 'Analogy text too long';
    END IF;

    IF v_card ? 'formula' AND v_card ->> 'formula' IS NOT NULL AND length(v_card ->> 'formula') > 1000 THEN
      RAISE EXCEPTION 'Formula text too long';
    END IF;
  END LOOP;

  -- 8. Perform the update.
  UPDATE study_materials
  SET title = p_title, content = p_content, updated_at = now()
  WHERE id = p_material_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_flashcard_deck FROM anon;
GRANT EXECUTE ON FUNCTION update_flashcard_deck TO authenticated;
