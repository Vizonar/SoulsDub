/**
 * Aplica a migration num Postgres real (PGlite, em memória) com stubs mínimos do Supabase (auth.uid, papéis)
 * e verifica RLS, proteção da classificação e imutabilidade do histórico.
 * NÃO substitui um teste no projeto Supabase real — ver docs/SUPABASE.md.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { beforeAll, describe, expect, it } from 'vitest';

const migrations = ['20261021000001_init.sql', '20261021000002_voice_samples.sql'].map((f) => readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));
const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const REVIEWER = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';
let db: PGlite;
let dubberId: string;

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema extensions; create schema auth; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public, extensions to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const m of migrations) await db.exec(m);
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}','a@x'), ('${REVIEWER}','r@x'), ('${STRANGER}','s@x');
    insert into public.admin_users (user_id, display_name, role) values
      ('${ADMIN}','Admin Teste','admin'), ('${REVIEWER}','Avaliadora Teste','reviewer');
    insert into public.dubbers (discord_id, display_name, self_level, voice_tone, voice_types, intensity, speech_speed, availability)
      values ('123456789012345678','Fulano Teste','iniciante','medio','{adulta}','media','moderada','{noite}');
  `);
  dubberId = (await rows(`select id from public.dubbers`))[0]!.id as string;
});

describe('migration + RLS (Postgres real em memória)', () => {
  it('aplica sem erros e cria classificações oficiais', async () => {
    const r = await rows(`select key from public.classifications order by rank`);
    expect(r.map((x) => x.key)).toEqual(['novato', 'aprendiz', 'intermediario', 'avancado', 'elite']);
  });

  it('constraints: ID do Discord duplicado/inválido e valores fora da lista são rejeitados', async () => {
    const ins = (id: string, tone = 'medio') =>
      db.exec(`insert into public.dubbers (discord_id, display_name, self_level, voice_tone, voice_types, intensity, speech_speed)
               values ('${id}','X','iniciante','${tone}','{adulta}','media','lenta')`);
    await expect(ins('123456789012345678')).rejects.toThrow(/unique|duplicate/i);
    await expect(ins('abc')).rejects.toThrow(/check/i);
    await expect(ins('223456789012345678', 'rouco')).rejects.toThrow(/check/i);
  });

  it('acesso anônimo não lê nem escreve nada', async () => {
    await expect(as(null, () => rows(`select * from public.dubbers`))).rejects.toThrow(/permission denied/i);
    await expect(as(null, () => db.exec(`update public.dubbers set display_name='x'`))).rejects.toThrow(/permission denied/i);
  });

  it('usuário autenticado que não é da equipe enxerga zero fichas', async () => {
    expect(await as(STRANGER, () => rows(`select * from public.dubbers`))).toHaveLength(0);
    expect(await as(STRANGER, () => rows(`select * from public.admin_users`))).toHaveLength(0);
  });

  it('equipe lê fichas; avaliador não lê o log de auditoria, admin lê', async () => {
    expect(await as(REVIEWER, () => rows(`select * from public.dubbers`))).toHaveLength(1);
    expect(await as(REVIEWER, () => rows(`select * from public.audit_logs`))).toHaveLength(0);
    expect((await as(ADMIN, () => rows(`select * from public.audit_logs`))).length).toBeGreaterThan(0);
  });

  it('ninguém se promove: sem INSERT/UPDATE em admin_users', async () => {
    await expect(as(STRANGER, () => db.exec(`insert into public.admin_users values ('${STRANGER}','Eu','admin')`))).rejects.toThrow(/permission denied/i);
    await expect(as(REVIEWER, () => db.exec(`update public.admin_users set role='admin' where user_id='${REVIEWER}'`))).rejects.toThrow(/permission denied/i);
  });

  it('classificação oficial não muda por UPDATE direto, nem para admin', async () => {
    await expect(as(ADMIN, () => db.exec(`update public.dubbers set classification='elite' where id='${dubberId}'`))).rejects.toThrow(/set_classification/);
    await expect(db.exec(`update public.dubbers set classification='elite' where id='${dubberId}'`)).rejects.toThrow(/set_classification/); // nem service role
    await expect(db.exec(`update public.dubbers set discord_id='999999999999999999' where id='${dubberId}'`)).rejects.toThrow(/ID do Discord/);
  });

  it('avaliador não altera ficha nem classificação', async () => {
    await as(REVIEWER, () => db.exec(`update public.dubbers set display_name='Hack' where id='${dubberId}'`)); // RLS: 0 linhas
    expect((await rows(`select display_name from public.dubbers`))[0]!.display_name).toBe('Fulano Teste');
    await expect(as(REVIEWER, () => rows(`select public.set_classification('${dubberId}','elite','tentativa',null)`))).rejects.toThrow(/administradores/);
    await expect(as(REVIEWER, () => rows(`select public.add_review('${dubberId}','elite','[]','c','motivo qualquer')`))).rejects.toThrow(/administradores/);
  });

  it('admin altera classificação via função: grava histórico com motivo e quem alterou', async () => {
    await as(ADMIN, () => rows(`select public.set_classification('${dubberId}','aprendiz','Passou na avaliação',null)`));
    const d = (await rows(`select classification from public.dubbers`))[0]!;
    expect(d.classification).toBe('aprendiz');
    const h = await rows(`select * from public.dubber_classification_history where dubber_id='${dubberId}'`);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ previous_classification: 'novato', new_classification: 'aprendiz', reason: 'Passou na avaliação', changed_by_name: 'Admin Teste' });
    await expect(as(ADMIN, () => rows(`select public.set_classification('${dubberId}','aprendiz','repetida',null)`))).rejects.toThrow(/já está/);
  });

  it('avaliação por avaliador (sem mudança) funciona; por admin (com mudança) cria avaliação + histórico', async () => {
    await as(REVIEWER, () => rows(`select public.add_review('${dubberId}', null, '[{"label":"Dicção"}]', 'Boa dicção', null)`));
    const rid = (await as(ADMIN, () => rows(`select public.add_review('${dubberId}','intermediario','[]','Evoluiu','Evolução clara') as id`)))[0]!.id;
    const h = await rows(`select * from public.dubber_classification_history where review_id='${rid}'`);
    expect(h).toHaveLength(1);
    const rv = await as(REVIEWER, () => rows(`select * from public.dubber_reviews where dubber_id='${dubberId}' order by created_at`));
    expect(rv).toHaveLength(2);
    expect(rv[0]).toMatchObject({ previous_classification: 'aprendiz', new_classification: 'aprendiz', reviewer_name: 'Avaliadora Teste' });
    expect((await rows(`select needs_review from public.dubbers`))[0]!.needs_review).toBe(false);
  });

  it('histórico, avaliações e auditoria são imutáveis', async () => {
    await expect(db.exec(`update public.dubber_classification_history set reason='alterado'`)).rejects.toThrow(/imutáveis/);
    await expect(db.exec(`delete from public.dubber_reviews`)).rejects.toThrow(/imutáveis/);
    await expect(db.exec(`delete from public.audit_logs`)).rejects.toThrow(/imutáveis/);
  });

  it('observações internas: equipe lê/insere como si mesma; estranho e anônimo não', async () => {
    await as(REVIEWER, () => db.exec(`insert into public.dubber_internal_notes (dubber_id, author_id, author_name, body) values ('${dubberId}','${REVIEWER}','Avaliadora Teste','nota interna')`));
    await expect(as(REVIEWER, () => db.exec(`insert into public.dubber_internal_notes (dubber_id, author_id, author_name, body) values ('${dubberId}','${ADMIN}','Falso','nota')`))).rejects.toThrow(/row-level security/i);
    await expect(as(STRANGER, () => db.exec(`insert into public.dubber_internal_notes (dubber_id, author_id, author_name, body) values ('${dubberId}','${STRANGER}','x','nota')`))).rejects.toThrow(/row-level security/i);
    expect(await as(STRANGER, () => rows(`select * from public.dubber_internal_notes`))).toHaveLength(0);
    expect(await as(ADMIN, () => rows(`select * from public.dubber_internal_notes`))).toHaveLength(1);
  });

  it('admin edita ficha e updated_at é atualizado automaticamente', async () => {
    const before = (await rows(`select updated_at from public.dubbers`))[0]!.updated_at as Date;
    await new Promise((r) => setTimeout(r, 10));
    await as(ADMIN, () => db.exec(`update public.dubbers set display_name='Fulano Corrigido' where id='${dubberId}'`));
    const after = (await rows(`select display_name, updated_at from public.dubbers`))[0]!;
    expect(after.display_name).toBe('Fulano Corrigido');
    expect((after.updated_at as Date).getTime()).toBeGreaterThan(before.getTime());
  });

  it('auditoria guarda só nomes de colunas alteradas, sem valores pessoais', async () => {
    const a = await rows(`select details from public.audit_logs where action='dubbers.update' and details::text like '%display_name%'`);
    expect(a.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).not.toContain('Fulano Corrigido');
  });

  describe('amostras de voz', () => {
    const uuid = () => crypto.randomUUID();
    const insert = (by: string, source = 'panel', path?: string) =>
      db.query(
        `insert into public.dubber_voice_samples (dubber_id, storage_path, file_name, mime_type, size_bytes, source, uploaded_by, uploaded_by_name)
         values ($1, $2, 'a.wav', 'audio/wav', 1000, $3, $4, 'x')`,
        [dubberId, path ?? `${dubberId}/${uuid()}.wav`, source, by],
      );

    it('bucket é privado, limitado a 10 MB e só aceita MP3/WAV', async () => {
      const b = (await rows(`select * from storage.buckets where id='voice-samples'`))[0]!;
      expect(b).toMatchObject({ public: false, allowed_mime_types: ['audio/mpeg', 'audio/wav'] });
      expect(Number(b.file_size_limit)).toBe(10485760);
    });

    it('constraints: tipo, tamanho e caminho inválidos são rejeitados', async () => {
      const bad = (mime: string, size: number, path: string) =>
        db.query(`insert into public.dubber_voice_samples (dubber_id, storage_path, file_name, mime_type, size_bytes, source, uploaded_by_name) values ($1,$2,'a',$3,$4,'discord','x')`, [dubberId, path, mime, size]);
      await expect(bad('video/mp4', 10, `${dubberId}/${uuid()}.wav`)).rejects.toThrow(/check/i);
      await expect(bad('audio/wav', 10485761, `${dubberId}/${uuid()}.wav`)).rejects.toThrow(/check/i);
      await expect(bad('audio/wav', 10, `../../etc/passwd`)).rejects.toThrow(/check/i);
    });

    it('somente admin envia (RLS) e como si mesmo; avaliador lê mas não envia nem apaga', async () => {
      await expect(as(REVIEWER, () => insert(REVIEWER))).rejects.toThrow(/row-level security/i);
      await expect(as(ADMIN, () => insert(REVIEWER))).rejects.toThrow(/row-level security/i); // não pode forjar autor
      await expect(as(ADMIN, () => insert(ADMIN, 'discord'))).rejects.toThrow(/row-level security/i);
      await as(ADMIN, () => insert(ADMIN));
      expect(await as(REVIEWER, () => rows(`select * from public.dubber_voice_samples`))).toHaveLength(1);
      expect(await as(STRANGER, () => rows(`select * from public.dubber_voice_samples`))).toHaveLength(0);
      await as(REVIEWER, () => db.exec(`delete from public.dubber_voice_samples`)); // RLS: 0 linhas
      expect(await rows(`select * from public.dubber_voice_samples`)).toHaveLength(1);
      await expect(as(null, () => rows(`select * from public.dubber_voice_samples`))).rejects.toThrow(/permission denied/i);
    });

    it('limita a 5 amostras por dublador (service role/bot também)', async () => {
      for (let i = 0; i < 4; i++) await insert(ADMIN, 'discord'.replace('discord', 'panel'));
      await expect(insert(ADMIN)).rejects.toThrow(/Limite de 5/);
    });

    it('admin apaga; objetos do Storage seguem a mesma regra (staff lê, admin grava)', async () => {
      await as(ADMIN, () => db.exec(`delete from public.dubber_voice_samples`));
      expect(await rows(`select * from public.dubber_voice_samples`)).toHaveLength(0);
      await db.exec(`insert into storage.objects (bucket_id, name) values ('voice-samples','x/y.wav')`);
      expect(await as(REVIEWER, () => rows(`select * from storage.objects`))).toHaveLength(1);
      expect(await as(STRANGER, () => rows(`select * from storage.objects`))).toHaveLength(0);
      await expect(as(REVIEWER, () => db.exec(`insert into storage.objects (bucket_id, name) values ('voice-samples','z.wav')`))).rejects.toThrow(/row-level security/i);
      await as(ADMIN, () => db.exec(`insert into storage.objects (bucket_id, name) values ('voice-samples','ok.wav')`));
    });
  });
});
