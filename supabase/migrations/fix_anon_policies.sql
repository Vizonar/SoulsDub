-- Permitir SELECT anônimo nos projetos (para funcionar sem service_role)
DO $$ BEGIN
  CREATE POLICY projects_anon_select ON public.projects FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY episodes_anon_select ON public.episodes FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY castings_anon_select ON public.castings FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
