-- Soul Dublers — esquema inicial.
-- Decisões de modelagem (ver docs/DECISOES.md):
--  * Listas curtas (tipos de voz, especialidades, disponibilidade, interesses) usam text[] com índices GIN:
--    mais simples que tabelas de junção e suficientes para filtros "contém".
--  * Classificação oficial: tabela `classifications` + FK. Só muda via função public.set_classification().
--  * Observações internas ficam em tabela própria (nunca na linha da ficha lida pelo bot).
--  * Histórico, avaliações e auditoria são append-only (triggers bloqueiam UPDATE/DELETE).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- referência
create table public.classifications (
  key   text primary key,
  label text not null,
  rank  smallint not null unique
);
insert into public.classifications (key, label, rank) values
  ('novato', 'NOVATO', 1), ('aprendiz', 'APRENDIZ', 2), ('intermediario', 'INTERMEDIÁRIO', 3),
  ('avancado', 'AVANÇADO', 4), ('elite', 'ELITE', 5);

-- ---------------------------------------------------------------- administradores
create table public.admin_users (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role         text not null check (role in ('admin', 'reviewer')),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- fichas
create table public.dubbers (
  id                uuid primary key default gen_random_uuid(),
  discord_id        text not null unique check (discord_id ~ '^[0-9]{15,25}$'),
  display_name      text not null check (char_length(btrim(display_name)) between 1 and 64),
  age               smallint check (age between 1 and 120),
  pronouns          text check (char_length(pronouns) <= 40),
  self_level        text not null check (self_level in ('iniciante','intermediario','avancado','profissional')),
  experience        text check (char_length(experience) <= 4000),
  voice_tone        text not null check (voice_tone in ('grave','medio','agudo','variavel')),
  voice_types       text[] not null
                    check (cardinality(voice_types) between 1 and 6
                           and voice_types <@ array['masculina','feminina','neutra','infantil','adolescente','adulta']),
  intensity         text not null check (intensity in ('baixa','media','alta')),
  diction           text check (char_length(diction) <= 500),
  speech_speed      text not null check (speech_speed in ('lenta','moderada','rapida')),
  specialties       text[] not null default '{}' check (cardinality(specialties) <= 30),
  availability      text[] not null default '{}' check (cardinality(availability) <= 20),
  interests         text[] not null default '{}' check (cardinality(interests) <= 20),
  wanted_characters text check (char_length(wanted_characters) <= 4000),
  classification    text not null default 'novato' references public.classifications (key),
  is_active         boolean not null default true,
  needs_review      boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- colunas geradas só para ordenar por hierarquia (e não por ordem alfabética)
  classification_rank smallint generated always as (
    case classification when 'novato' then 1 when 'aprendiz' then 2 when 'intermediario' then 3
                        when 'avancado' then 4 when 'elite' then 5 end) stored,
  self_level_rank smallint generated always as (
    case self_level when 'iniciante' then 1 when 'intermediario' then 2
                    when 'avancado' then 3 when 'profissional' then 4 end) stored
);

create index dubbers_classification_idx on public.dubbers (classification);
create index dubbers_self_level_idx     on public.dubbers (self_level);
create index dubbers_voice_tone_idx     on public.dubbers (voice_tone);
create index dubbers_intensity_idx      on public.dubbers (intensity);
create index dubbers_speech_speed_idx   on public.dubbers (speech_speed);
create index dubbers_updated_at_idx     on public.dubbers (updated_at desc);
create index dubbers_needs_review_idx   on public.dubbers (needs_review) where needs_review;
create index dubbers_voice_types_gin    on public.dubbers using gin (voice_types);
create index dubbers_specialties_gin    on public.dubbers using gin (specialties);
create index dubbers_availability_gin   on public.dubbers using gin (availability);
create index dubbers_interests_gin      on public.dubbers using gin (interests);
create index dubbers_name_trgm          on public.dubbers using gin (display_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------- histórico / avaliações / notas / auditoria
create table public.dubber_reviews (
  id                      uuid primary key default gen_random_uuid(),
  dubber_id               uuid not null references public.dubbers (id) on delete cascade,
  reviewer_id             uuid references auth.users (id) on delete set null,
  reviewer_name           text not null,
  previous_classification text not null references public.classifications (key),
  new_classification      text not null references public.classifications (key),
  criteria                jsonb not null default '[]' check (jsonb_typeof(criteria) = 'array'),
  comments                text check (char_length(comments) <= 2000),
  reason                  text check (char_length(reason) <= 1000),
  created_at              timestamptz not null default now(),
  check (previous_classification = new_classification or char_length(btrim(coalesce(reason, ''))) >= 3)
);
create index dubber_reviews_dubber_idx on public.dubber_reviews (dubber_id, created_at desc);

create table public.dubber_classification_history (
  id                      uuid primary key default gen_random_uuid(),
  dubber_id               uuid not null references public.dubbers (id) on delete cascade,
  previous_classification text references public.classifications (key),
  new_classification      text not null references public.classifications (key),
  reason                  text not null check (char_length(btrim(reason)) between 3 and 1000),
  changed_by              uuid references auth.users (id) on delete set null,
  changed_by_name         text not null,
  review_id               uuid references public.dubber_reviews (id) on delete set null,
  created_at              timestamptz not null default now()
);
create index dubber_history_dubber_idx on public.dubber_classification_history (dubber_id, created_at desc);

create table public.dubber_internal_notes (
  id          uuid primary key default gen_random_uuid(),
  dubber_id   uuid not null references public.dubbers (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  author_name text not null,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index dubber_notes_dubber_idx on public.dubber_internal_notes (dubber_id, created_at desc);

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  actor_name text,
  action     text not null,
  entity     text not null,
  entity_id  text not null,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx  on public.audit_logs (entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------- funções auxiliares
-- SECURITY DEFINER com search_path vazio: só leem admin_users e devolvem booleano/texto.
create function public.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admin_users where user_id = (select auth.uid())) $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admin_users where user_id = (select auth.uid()) and role = 'admin') $$;

create function public.staff_name() returns text
language sql stable security definer set search_path = ''
as $$ select coalesce((select display_name from public.admin_users where user_id = (select auth.uid())), 'Sistema') $$;

-- ---------------------------------------------------------------- triggers
create function public.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

create trigger dubbers_set_updated_at before update on public.dubbers
  for each row execute function public.set_updated_at();

-- Protege a classificação oficial e a identidade (discord_id) contra qualquer escrita direta.
create function public.guard_dubber() returns trigger
language plpgsql set search_path = ''
as $$
declare allowed boolean := coalesce(current_setting('soul.allow_classification_change', true), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.classification <> 'novato' and not allowed then
      raise exception 'Novas fichas começam como NOVATO.' using errcode = '42501';
    end if;
  else
    if new.discord_id is distinct from old.discord_id then
      raise exception 'O ID do Discord não pode ser alterado.' using errcode = '42501';
    end if;
    if new.classification is distinct from old.classification and not allowed then
      raise exception 'A classificação oficial só pode ser alterada por public.set_classification().' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger dubbers_guard before insert or update on public.dubbers
  for each row execute function public.guard_dubber();

create function public.block_mutation() returns trigger
language plpgsql set search_path = ''
as $$ begin raise exception 'Registros de % são imutáveis.', tg_table_name using errcode = '42501'; end $$;

create trigger reviews_immutable before update or delete on public.dubber_reviews
  for each row execute function public.block_mutation();
create trigger history_immutable before update on public.dubber_classification_history
  for each row execute function public.block_mutation();
create trigger audit_immutable before update or delete on public.audit_logs
  for each row execute function public.block_mutation();
-- (DELETE do histórico só ocorre em cascata, quando a ficha é apagada por um superusuário.)

-- Auditoria automática. Guarda apenas NOMES das colunas alteradas, nunca os valores (evita copiar dados pessoais).
create function public.log_audit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  who text := case when (select auth.uid()) is null then 'Bot / sistema' else public.staff_name() end;
  rec jsonb := to_jsonb(coalesce(new, old));
  changed jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(n.key), '[]'::jsonb) into changed
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at', 'needs_review');
    if jsonb_array_length(changed) = 0 then return new; end if;
  end if;
  insert into public.audit_logs (actor_id, actor_name, action, entity, entity_id, details)
  values (uid, who, tg_table_name || '.' || lower(tg_op), tg_table_name,
          coalesce(rec ->> 'id', rec ->> 'user_id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('changed', changed) else null end);
  return coalesce(new, old);
end $$;

create trigger dubbers_audit after insert or update on public.dubbers
  for each row execute function public.log_audit();
create trigger admin_users_audit after insert or update or delete on public.admin_users
  for each row execute function public.log_audit();
create trigger notes_audit after insert on public.dubber_internal_notes
  for each row execute function public.log_audit();
create trigger reviews_audit after insert on public.dubber_reviews
  for each row execute function public.log_audit();
create trigger history_audit after insert on public.dubber_classification_history
  for each row execute function public.log_audit();

-- ---------------------------------------------------------------- operações de negócio (RPC)
create function public.set_classification(p_dubber_id uuid, p_new text, p_reason text, p_review_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare cur text;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar a classificação oficial.' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Informe o motivo da mudança.' using errcode = 'P0001';
  end if;
  select classification into cur from public.dubbers where id = p_dubber_id for update;
  if not found then raise exception 'Dublador não encontrado.' using errcode = 'P0001'; end if;
  if cur = p_new then raise exception 'A ficha já está nessa classificação.' using errcode = 'P0001'; end if;
  perform set_config('soul.allow_classification_change', 'on', true);  -- vale só nesta transação
  update public.dubbers set classification = p_new where id = p_dubber_id;
  perform set_config('soul.allow_classification_change', 'off', true);
  insert into public.dubber_classification_history
    (dubber_id, previous_classification, new_classification, reason, changed_by, changed_by_name, review_id)
  values (p_dubber_id, cur, p_new, btrim(p_reason), (select auth.uid()), public.staff_name(), p_review_id);
end $$;

create function public.add_review(p_dubber_id uuid, p_new text, p_criteria jsonb, p_comments text, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare cur text; target text; rid uuid;
begin
  if not public.is_staff() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select classification into cur from public.dubbers where id = p_dubber_id for update;
  if not found then raise exception 'Dublador não encontrado.' using errcode = 'P0001'; end if;
  target := coalesce(p_new, cur);
  if target <> cur and not public.is_admin() then
    raise exception 'Apenas administradores podem alterar a classificação oficial.' using errcode = '42501';
  end if;
  insert into public.dubber_reviews
    (dubber_id, reviewer_id, reviewer_name, previous_classification, new_classification, criteria, comments, reason)
  values (p_dubber_id, (select auth.uid()), public.staff_name(), cur, target,
          coalesce(p_criteria, '[]'::jsonb), nullif(btrim(p_comments), ''), nullif(btrim(p_reason), ''))
  returning id into rid;
  if target <> cur then
    perform public.set_classification(p_dubber_id, target, p_reason, rid);
  end if;
  update public.dubbers set needs_review = false where id = p_dubber_id;
  return rid;
end $$;

create function public.mark_reviewed(p_dubber_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  update public.dubbers set needs_review = false where id = p_dubber_id;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.classifications                 enable row level security;
alter table public.admin_users                     enable row level security;
alter table public.dubbers                         enable row level security;
alter table public.dubber_reviews                  enable row level security;
alter table public.dubber_classification_history   enable row level security;
alter table public.dubber_internal_notes           enable row level security;
alter table public.audit_logs                      enable row level security;

-- Nenhum acesso anônimo a nada. Privilégios mínimos para usuários autenticados (a RLS decide o resto).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant select on public.classifications, public.admin_users, public.dubbers, public.dubber_reviews,
                public.dubber_classification_history, public.dubber_internal_notes, public.audit_logs to authenticated;
grant update on public.dubbers to authenticated;
grant insert on public.dubber_internal_notes to authenticated;
grant execute on function public.is_staff(), public.is_admin(), public.staff_name(),
                          public.set_classification(uuid, text, text, uuid),
                          public.add_review(uuid, text, jsonb, text, text),
                          public.mark_reviewed(uuid) to authenticated;
-- Ao autenticado só interessa chamar as RPCs acima; as funções de trigger não precisam de EXECUTE.

create policy classifications_read on public.classifications for select to authenticated using (public.is_staff());

-- Cada usuário lê só a própria linha (para saber seu papel); admins leem todas. Sem INSERT/UPDATE/DELETE para
-- usuários: ninguém se promove. O primeiro admin é criado no SQL Editor (docs/SUPABASE.md).
create policy admin_users_read on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy dubbers_read   on public.dubbers for select to authenticated using (public.is_staff());
create policy dubbers_update on public.dubbers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- INSERT/DELETE: somente service role (bot). Fichas são desativadas, nunca apagadas pelo painel.

create policy reviews_read on public.dubber_reviews for select to authenticated using (public.is_staff());
create policy history_read on public.dubber_classification_history for select to authenticated using (public.is_staff());

create policy notes_read   on public.dubber_internal_notes for select to authenticated using (public.is_staff());
create policy notes_insert on public.dubber_internal_notes for insert to authenticated
  with check (public.is_staff() and author_id = (select auth.uid()));

create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin());
