-- Vektseddelkontroll — RLS policies for the `vektseddel` table
-- Run in Supabase SQL editor. Safe to re-run (DROP IF EXISTS before CREATE).

-- 1. Enable RLS
ALTER TABLE public.vektseddel ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if present (idempotent re-run)
DROP POLICY IF EXISTS "vektseddel_select_authenticated" ON public.vektseddel;
DROP POLICY IF EXISTS "vektseddel_insert_can_edit"     ON public.vektseddel;
DROP POLICY IF EXISTS "vektseddel_update_can_edit"     ON public.vektseddel;
DROP POLICY IF EXISTS "vektseddel_delete_can_edit"     ON public.vektseddel;

-- 3. SELECT: any authenticated user may read
CREATE POLICY "vektseddel_select_authenticated"
  ON public.vektseddel
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. INSERT / UPDATE / DELETE: only users with can_edit_markers = true
--    The `users` table is keyed by email (matches auth.jwt() ->> 'email').
CREATE POLICY "vektseddel_insert_can_edit"
  ON public.vektseddel
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = (auth.jwt() ->> 'email')
        AND u.can_edit_markers = true
    )
  );

CREATE POLICY "vektseddel_update_can_edit"
  ON public.vektseddel
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = (auth.jwt() ->> 'email')
        AND u.can_edit_markers = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = (auth.jwt() ->> 'email')
        AND u.can_edit_markers = true
    )
  );

CREATE POLICY "vektseddel_delete_can_edit"
  ON public.vektseddel
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = (auth.jwt() ->> 'email')
        AND u.can_edit_markers = true
    )
  );

-- 5. Index to speed up the lp_id foreign key lookups (referenced in optimize_2.md)
CREATE INDEX IF NOT EXISTS idx_vektseddel_lp_id ON public.vektseddel(lp_id);
CREATE INDEX IF NOT EXISTS idx_vektseddel_dato  ON public.vektseddel(dato);

-- 6. Verify
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = 'vektseddel';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'vektseddel';
