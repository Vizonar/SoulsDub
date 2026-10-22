-- Dados de referência (idempotente). NÃO cria dubladores: os dados fictícios ficam apenas no modo DEMO do painel.
insert into public.classifications (key, label, rank) values
  ('novato', 'NOVATO', 1), ('aprendiz', 'APRENDIZ', 2), ('intermediario', 'INTERMEDIÁRIO', 3),
  ('avancado', 'AVANÇADO', 4), ('elite', 'ELITE', 5)
on conflict (key) do nothing;

-- Primeiro administrador (rode manualmente no SQL Editor depois de criar o usuário em Authentication > Users):
-- insert into public.admin_users (user_id, display_name, role)
-- values ('<UUID-DO-USUARIO-EM-auth.users>', 'Seu Nome', 'admin');
