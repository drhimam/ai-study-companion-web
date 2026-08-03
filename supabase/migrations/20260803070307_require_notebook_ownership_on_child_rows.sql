/*
  # Require notebook ownership on child rows

  1. Problem
     The INSERT and UPDATE policies on `messages`, `flashcards` and
     `study_materials` only checked `auth.uid() = user_id`. Because
     `notebook_id` has no default and no ownership predicate, a signed-in user
     calling the data API directly could attach their own row to a notebook
     belonging to another account.

  2. Change
     Every INSERT WITH CHECK and UPDATE WITH CHECK now additionally requires
     that the referenced notebook belongs to the calling user. SELECT and
     DELETE are unchanged: they already filter on `user_id`.

  3. Notes
     No data is dropped or altered. Existing rows created through the app
     always reference the caller's own notebook, so legitimate use is
     unaffected.
*/

-- messages -----------------------------------------------------------------
DROP POLICY IF EXISTS insert_own_messages ON messages;
CREATE POLICY insert_own_messages ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND notebook_id IN (SELECT id FROM notebooks WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS update_own_messages ON messages;
CREATE POLICY update_own_messages ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND notebook_id IN (SELECT id FROM notebooks WHERE user_id = auth.uid())
  );

-- flashcards ---------------------------------------------------------------
DROP POLICY IF EXISTS insert_own_flashcards ON flashcards;
CREATE POLICY insert_own_flashcards ON flashcards FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND notebook_id IN (SELECT id FROM notebooks WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS update_own_flashcards ON flashcards;
CREATE POLICY update_own_flashcards ON flashcards FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND notebook_id IN (SELECT id FROM notebooks WHERE user_id = auth.uid())
  );

-- study_materials ----------------------------------------------------------
DROP POLICY IF EXISTS insert_own_study_materials ON study_materials;
CREATE POLICY insert_own_study_materials ON study_materials FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND notebook_id IN (SELECT id FROM notebooks WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS update_own_study_materials ON study_materials;
CREATE POLICY update_own_study_materials ON study_materials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND notebook_id IN (SELECT id FROM notebooks WHERE user_id = auth.uid())
  );
