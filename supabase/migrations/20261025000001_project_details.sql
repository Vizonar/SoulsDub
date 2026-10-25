-- Ajustar status para incluir novos valores
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK (status IN ('planejamento', 'em_andamento', 'finalizado', 'não iniciado', 'em produção', 'pronto'));

-- Adicionar coluna chars na projects (opcional, para exibir contagem de papéis)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS chars INTEGER DEFAULT 0;

-- Tabela de episódios (se ainda não existir, adicionar)
CREATE TABLE IF NOT EXISTS public.episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'não iniciado' CHECK (status IN ('não iniciado', 'em produção', 'pronto')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para episodes (se necessário)
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY episodes_select ON public.episodes FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY episodes_insert ON public.episodes FOR INSERT TO authenticated WITH CHECK (public.is_staff());

-- Atualizar RLS de castings para permitir select/insert/update (já existe, mas garantir)
CREATE POLICY IF NOT EXISTS castings_select ON public.castings FOR SELECT TO authenticated USING (public.is_staff());
