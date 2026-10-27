-- Criar tabelas base se não existirem (novo projeto)
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    status TEXT DEFAULT 'planejamento',
    chars INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE public.projects ADD CONSTRAINT IF NOT EXISTS projects_status_check CHECK (status IN ('planejamento', 'não iniciado', 'em produção', 'pronto', 'finalizado'));
EXCEPTION WHEN duplicate_table THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS chars INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'não iniciado',
    created_at TIMESTAMPTZ DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY episodes_select ON public.episodes FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY episodes_insert ON public.episodes FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY projects_anon_select ON public.projects FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.castings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    dubber_id UUID REFERENCES public.dubbers(id) ON DELETE CASCADE,
    character TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY castings_anon_select ON public.castings FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
