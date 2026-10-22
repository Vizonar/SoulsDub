-- Amostras de voz (MP3/WAV).
-- Os arquivos ficam num bucket PRIVADO do Supabase Storage; o painel os toca por links assinados de curta duração.
-- Caminho do objeto: <dubber_id>/<sample_id>.<mp3|wav>

create table public.dubber_voice_samples (
  id               uuid primary key default gen_random_uuid(),
  dubber_id        uuid not null references public.dubbers (id) on delete cascade,
  storage_path     text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|wav)$'),
  file_name        text not null check (char_length(file_name) between 1 and 120),
  mime_type        text not null check (mime_type in ('audio/mpeg', 'audio/wav')),
  size_bytes       integer not null check (size_bytes between 1 and 10485760),
  label            text check (char_length(label) <= 60),
  source           text not null check (source in ('discord', 'panel')),
  uploaded_by      uuid references auth.users (id) on delete set null,
  uploaded_by_name text not null,
  created_at       timestamptz not null default now()
);
create index dubber_voice_samples_dubber_idx on public.dubber_voice_samples (dubber_id, created_at desc);

-- No máximo 5 amostras por dublador (mesmo limite do bot e do painel).
create function public.limit_voice_samples() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.dubber_voice_samples where dubber_id = new.dubber_id) >= 5 then
    raise exception 'Limite de 5 amostras por dublador. Remova uma antes de enviar outra.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger voice_samples_limit before insert on public.dubber_voice_samples
  for each row execute function public.limit_voice_samples();

create trigger voice_samples_audit after insert or delete on public.dubber_voice_samples
  for each row execute function public.log_audit();

alter table public.dubber_voice_samples enable row level security;
revoke all on public.dubber_voice_samples from anon, authenticated;
grant select, delete on public.dubber_voice_samples to authenticated;
grant insert on public.dubber_voice_samples to authenticated;

create policy samples_read   on public.dubber_voice_samples for select to authenticated using (public.is_staff());
create policy samples_insert on public.dubber_voice_samples for insert to authenticated
  with check (public.is_admin() and uploaded_by = (select auth.uid()) and source = 'panel');
create policy samples_delete on public.dubber_voice_samples for delete to authenticated using (public.is_admin());
-- O bot grava com a service role (ignora RLS) e valida tipo/tamanho/conteúdo antes.

-- ---------------------------------------------------------------- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-samples', 'voice-samples', false, 10485760, array['audio/mpeg', 'audio/wav'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['audio/mpeg', 'audio/wav'];

create policy voice_samples_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'voice-samples' and public.is_staff());
create policy voice_samples_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-samples' and public.is_admin());
create policy voice_samples_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'voice-samples' and public.is_admin());
