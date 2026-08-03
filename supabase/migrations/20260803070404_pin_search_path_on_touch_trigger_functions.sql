/*
  # Pin the search path on the updated_at trigger functions

  1. Problem
     `public.touch_notebook_updated_at` and
     `public.touch_study_material_updated_at` ran with a role-mutable
     `search_path`, which the database linter reports as
     `function_search_path_mutable`. A role able to create objects in a schema
     earlier on the resolution path could shadow what these functions call.

  2. Change
     Both functions are pinned to `search_path = public, pg_temp`.

  3. Notes
     Behaviour is unchanged; only name resolution is fixed.
*/

ALTER FUNCTION public.touch_notebook_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_study_material_updated_at() SET search_path = public, pg_temp;
