-- 1. Tabela de Projetos
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text default 'em_andamento' check (status in ('planejamento', 'em_andamento', 'finalizado')),
  created_at timestamptz default now()
);

-- 2. Tabela de Escalação (vincular dublador + projeto + personagem)
create table public.castings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  dubber_id uuid not null references public.dubbers(id) on delete cascade,
  character_name text not null,
  role_notes text,
  created_at timestamptz default now()
);

-- RLS
alter table public.projects enable row level security;
alter table public.castings enable row level security;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.castings to authenticated;

create policy projects_all on public.projects for all to authenticated using (public.is_staff());
create policy castings_all on public.castings for all to authenticated using (public.is_staff());
