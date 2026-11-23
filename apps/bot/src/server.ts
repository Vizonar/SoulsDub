import express from 'express';
import cors from 'cors';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import type { Actor, DubberRepository, QueryParams, SampleMime, VoiceSample } from '@soul/shared';

/**
 * API do painel Vox Trupe Studios.
 * Todas as rotas passam pelo banco Postgres (Neon) — o navegador nunca vê credencial.
 */

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Repositório que também guarda os bytes das amostras (Neon) — o painel reproduz o áudio pela API. */
interface SampleBytesRepository extends DubberRepository {
  getSampleBytes?(sampleId: string): Promise<{ meta: VoiceSample; bytes: Uint8Array } | null>;
}

export interface ServerOptions {
  repo: DubberRepository;
  databaseUrl: string;
  port?: number | string;
  /** Origem do site publicado (CORS). */
  origin?: string | string[];
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const statusFor = (e: unknown): number => {
  const name = (e as { name?: string })?.name;
  return name === 'ValidationError' ? 400 : name === 'NotFoundError' ? 404 : 500;
};

const messageFor = (e: unknown): string => (e instanceof Error && e.message) || 'Erro interno';

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const asBool = (v: unknown): boolean | undefined => (v === 'true' ? true : v === 'false' ? false : undefined);

/** Query string do painel → parâmetros de consulta do repositório. */
function queryParams(query: express.Request['query']): QueryParams {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(Math.max(1, Number(query.pageSize) || 20), 100);
  return {
    filters: {
      search: asString(query.search),
      classification: asString(query.classification) as QueryParams['filters']['classification'],
      selfLevel: asString(query.selfLevel) as QueryParams['filters']['selfLevel'],
      voiceTone: asString(query.voiceTone) as QueryParams['filters']['voiceTone'],
      voiceType: asString(query.voiceType) as QueryParams['filters']['voiceType'],
      intensity: asString(query.intensity) as QueryParams['filters']['intensity'],
      speechSpeed: asString(query.speechSpeed) as QueryParams['filters']['speechSpeed'],
      specialty: asString(query.specialty),
      availability: asString(query.availability),
      interest: asString(query.interest),
      status: ['active', 'inactive', 'all'].includes(String(query.status))
        ? (query.status as QueryParams['filters']['status'])
        : undefined,
      needsReview: asBool(query.needsReview),
    },
    sort: { key: (asString(query.sort) as QueryParams['sort']['key']) ?? 'updatedAt', dir: query.dir === 'asc' ? 'asc' : 'desc' },
    page,
    pageSize,
  };
}

/** Detecta o tipo real do áudio pelo cabeçalho, para não confiar no que o cliente declara. */
function sniffMime(bytes: Uint8Array): SampleMime {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  return 'audio/mpeg';
}

export function createServer({ repo, databaseUrl, origin }: ServerOptions) {
  const app = express();
  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 3 });

  const allowed = Array.isArray(origin) ? origin : origin ? [origin] : [];
  app.use(cors({ origin: allowed.length ? allowed : false }));
  // Até 10 MB de áudio em base64, com margem para o envelope JSON.
  app.use(express.json({ limit: '14mb' }));

  // ---------- helpers ----------
  async function actorFrom(req: express.Request): Promise<Actor | null> {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return null;
    const { rows } = await pool.query<{ id: string; display_name: string; role: Actor['role'] }>(
      `SELECT u.id, u.display_name, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token],
    );
    if (!rows[0]) return null;
    return { id: rows[0].id, name: rows[0].display_name, role: rows[0].role };
  }

  type Handler = (req: express.Request, res: express.Response) => Promise<unknown>;

  const wrap = (handler: Handler): Handler => async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      res.status(statusFor(e)).json({ error: messageFor(e) });
    }
  };

  const requireActor = (handler: (actor: Actor, req: express.Request, res: express.Response) => Promise<unknown>): Handler =>
    wrap(async (req, res) => {
      const actor = await actorFrom(req);
      if (!actor) {
        res.status(401).json({ error: 'Sessão inválida. Entre novamente.' });
        return;
      }
      await handler(actor, req, res);
    });

  const param = (req: express.Request, name: string): string => String((req.params as Record<string, string>)[name] ?? '');

  /** Registro de auditoria (usado pelas áreas de amostras, projetos e episódios). */
  const logProject = async (actor: Actor, action: string, entity: string, entityId: string, details?: Record<string, unknown>) => {
    await pool.query(
      `INSERT INTO audit_log (actor_id, actor_name, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor.id, actor.name, action, entity, entityId, details ? JSON.stringify(details) : null],
    );
  };

  // ---------- saúde ----------
  // Liveness probe must not wait for Neon; Render can detect the open HTTP port promptly.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'Vox Trupe Studios', db: 'neon' });
  });

  // Readiness check verifies the database separately from process liveness.
  app.get('/api/ready', wrap(async (_req, res) => {
    const { rows } = await pool.query<{ now: Date }>('SELECT now() AS now');
    res.json({ ok: true, db: 'neon', now: rows[0]?.now });
  }));

  // ---------- auth ----------
  app.post('/api/auth/login', wrap(async (req, res) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
    const username = asString(body.username);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) {
      res.status(400).json({ error: 'Informe usuário e senha.' });
      return;
    }
    const { rows } = await pool.query<{ id: string; username: string; display_name: string; role: Actor['role']; password_hash: string }>(
      `SELECT * FROM users WHERE lower(username) = lower($1)`,
      [username],
    );
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      return;
    }
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    await pool.query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`, [token, user.id, expires]);
    await pool.query(`DELETE FROM sessions WHERE expires_at < now()`);
    res.json({
      token,
      expiresAt: expires.toISOString(),
      user: { id: user.id, username: user.username, name: user.display_name, role: user.role },
    });
  }));

  app.post('/api/auth/logout', wrap(async (req, res) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token) await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
    res.json({ ok: true });
  }));

  app.get('/api/auth/me', requireActor(async (actor, _req, res) => {
    res.json({ user: { id: actor.id, name: actor.name, role: actor.role } });
  }));

  // Usuários são provisionados por npm run user:create; não há cadastro público.

  // ---------- fichas ----------
  app.get('/api/fichas', requireActor(async (actor, req, res) => {
    res.json(await repo.query(actor, queryParams(req.query)));
  }));

  app.get('/api/fichas/:id', requireActor(async (actor, req, res) => {
    res.json(await repo.getDetails(actor, param(req, 'id')));
  }));

  // Amostras com o status de aprovação (usado pela tela da ficha).
  app.get('/api/fichas/:id/amostras', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query(
      `SELECT id, dubber_id, file_name, mime_type, size_bytes, label, source, uploaded_by_name,
              created_at, review_status, review_note, reviewed_by, reviewed_at
         FROM samples WHERE dubber_id = $1 ORDER BY created_at DESC`,
      [param(req, 'id')],
    );
    res.json(rows);
  }));

  // Publicação da ficha (estado atual)
  app.get('/api/fichas/:id/publicacao', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query('SELECT is_public, public_slug FROM dubbers WHERE id = $1', [param(req, 'id')]);
    if (!rows[0]) {
      res.status(404).json({ error: 'Ficha não encontrada.' });
      return;
    }
    res.json(rows[0]);
  }));

  // Tag do Discord do dublador (para contato direto)
  app.get('/api/fichas/:id/discord', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query('SELECT discord_tag FROM dubbers WHERE id = $1', [param(req, 'id')]);
    if (!rows[0]) {
      res.status(404).json({ error: 'Ficha não encontrada.' });
      return;
    }
    res.json({ discordTag: rows[0].discord_tag ?? null });
  }));

  app.patch('/api/fichas/:id/discord', requireActor(async (actor, req, res) => {
    const tag = asString((req.body as { discordTag?: unknown })?.discordTag);
    const { rows } = await pool.query(
      'UPDATE dubbers SET discord_tag = $2 WHERE id = $1 RETURNING discord_tag',
      [param(req, 'id'), tag ?? null],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Ficha não encontrada.' });
      return;
    }
    await logProject(actor, 'dubber.discord_tag', 'dubber', param(req, 'id'), { tag });
    res.json({ discordTag: rows[0].discord_tag ?? null });
  }));

  app.patch('/api/fichas/:id', requireActor(async (actor, req, res) => {
    res.json(await repo.updateDubber(actor, param(req, 'id'), req.body ?? {}));
  }));

  app.post('/api/fichas/:id/classificacao', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { classification?: unknown; reason?: unknown };
    res.json(await repo.changeClassification(actor, param(req, 'id'), String(body.classification ?? '') as never, String(body.reason ?? '')));
  }));

  app.post('/api/fichas/:id/ativo', requireActor(async (actor, req, res) => {
    res.json(await repo.setActive(actor, param(req, 'id'), Boolean((req.body as { active?: unknown })?.active)));
  }));

  app.post('/api/fichas/:id/notas', requireActor(async (actor, req, res) => {
    res.status(201).json(await repo.addNote(actor, param(req, 'id'), String((req.body as { body?: unknown })?.body ?? '')));
  }));

  app.post('/api/fichas/:id/revisoes', requireActor(async (actor, req, res) => {
    res.status(201).json(await repo.addReview(actor, { ...(req.body ?? {}), dubberId: param(req, 'id') }));
  }));

  app.post('/api/fichas/:id/revisado', requireActor(async (actor, req, res) => {
    res.json(await repo.markReviewed(actor, param(req, 'id')));
  }));

  // ---------- amostras ----------
  app.post('/api/fichas/:id/samples', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { fileName?: unknown; base64?: unknown; label?: unknown };
    const fileName = asString(body.fileName);
    const base64 = typeof body.base64 === 'string' ? body.base64 : '';
    if (!fileName || !base64) {
      res.status(400).json({ error: 'fileName e base64 são obrigatórios.' });
      return;
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      res.status(400).json({ error: 'O áudio enviado está corrompido (base64 inválido).' });
      return;
    }
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    if (bytes.length === 0) {
      res.status(400).json({ error: 'O arquivo está vazio.' });
      return;
    }
    if (bytes.length > MAX_AUDIO_BYTES) {
      res.status(413).json({ error: 'O áudio passa do limite de 10 MB.' });
      return;
    }
    const sample = await repo.addSample(
      actor,
      param(req, 'id'),
      { fileName, mimeType: sniffMime(bytes), bytes },
      asString(body.label),
    );
    res.status(201).json(sample);
  }));

  app.delete('/api/samples/:id', requireActor(async (actor, req, res) => {
    await repo.deleteSample(actor, param(req, 'id'));
    res.json({ ok: true });
  }));

  // Aprovação de amostra de voz (pendente / aprovada / recusada)
  app.post('/api/samples/:id/aprovacao', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { status?: unknown; note?: unknown };
    const status = asString(body.status);
    if (!status || !['pendente', 'aprovada', 'recusada'].includes(status)) {
      res.status(400).json({ error: 'Status inválido.' });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE samples SET review_status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now()
       WHERE id = $1 RETURNING dubber_id`,
      [param(req, 'id'), status, asString(body.note) ?? null, actor.name],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Amostra não encontrada.' });
      return;
    }
    await logProject(actor, 'sample.reviewed', 'dubber', rows[0].dubber_id, { status });
    res.json({ ok: true });
  }));

  // Áudio servido pelo próprio backend (bytes no Postgres), sempre autenticado.
  app.get('/api/samples/:id/audio', requireActor(async (_actor, req, res) => {
    const sampleRepo = repo as SampleBytesRepository;
    if (typeof sampleRepo.getSampleBytes !== 'function') {
      res.status(501).json({ error: 'Áudio indisponível.' });
      return;
    }
    const found = await sampleRepo.getSampleBytes(param(req, 'id'));
    if (!found) {
      res.status(404).json({ error: 'Amostra não encontrada.' });
      return;
    }
    const extension = found.meta.mimeType === 'audio/wav' ? 'wav' : 'mp3';
    res.setHeader('Content-Type', found.meta.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="amostra.${extension}"`);
    res.send(Buffer.from(found.bytes));
  }));

  // ---------- projetos ----------
  app.get('/api/projetos', requireActor(async (_actor, _req, res) => {
    const { rows } = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(rows);
  }));

  app.post('/api/projetos', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { title?: unknown; status?: unknown };
    const title = asString(body.title);
    if (!title) {
      res.status(400).json({ error: 'Informe o nome do projeto.' });
      return;
    }
    const { rows } = await pool.query(
      'INSERT INTO projects (title, status) VALUES ($1, $2) RETURNING *',
      [title, asString(body.status) ?? 'nao_iniciado'],
    );
    await logProject(actor, 'project.created', 'project', rows[0].id, { title });
    res.status(201).json(rows[0]);
  }));

  app.get('/api/projetos/:id', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [param(req, 'id')]);
    if (!rows[0]) {
      res.status(404).json({ error: 'Projeto não encontrado.' });
      return;
    }
    res.json(rows[0]);
  }));

  app.get('/api/projetos/:id/episodios', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query('SELECT * FROM episodes WHERE project_id = $1 ORDER BY created_at ASC', [param(req, 'id')]);
    res.json(rows);
  }));

  app.post('/api/projetos/:id/episodios', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { title?: unknown; status?: unknown; script?: unknown };
    const title = asString(body.title);
    if (!title) {
      res.status(400).json({ error: 'Informe o título do episódio.' });
      return;
    }
    const { rows } = await pool.query(
      'INSERT INTO episodes (project_id, title, status, script) VALUES ($1, $2, $3, $4) RETURNING *',
      [param(req, 'id'), title, asString(body.status) ?? 'planejamento', asString(body.script) ?? null],
    );
    await logProject(actor, 'episode.created', 'episode', rows[0].id, { title });
    res.status(201).json(rows[0]);
  }));

  app.patch('/api/episodios/:id', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { title?: unknown; status?: unknown; script?: unknown };
    const { rows } = await pool.query(
      `UPDATE episodes SET
         title = COALESCE($2, title),
         status = COALESCE($3, status),
         script = COALESCE($4, script)
       WHERE id = $1 RETURNING *`,
      [param(req, 'id'), asString(body.title) ?? null, asString(body.status) ?? null, asString(body.script) ?? null],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Episódio não encontrado.' });
      return;
    }
    await logProject(actor, 'episode.updated', 'episode', rows[0].id);
    res.json(rows[0]);
  }));

  // ---------- elenco do projeto ----------
  app.get('/api/projetos/:id/elenco', requireActor(async (_actor, req, res) => {
    const search = asString(req.query.search);
    const { rows } = await pool.query(
      `SELECT m.id, m.project_id, m.dubber_id, m.character_name, m.role_note, m.created_at,
              d.display_name AS dubber_name, d.classification
         FROM project_members m
         JOIN dubbers d ON d.id = m.dubber_id
        WHERE m.project_id = $1
          AND ($2::text IS NULL OR m.character_name ILIKE '%' || $2 || '%' OR d.display_name ILIKE '%' || $2 || '%')
        ORDER BY m.character_name ASC`,
      [param(req, 'id'), search ?? null],
    );
    res.json(rows);
  }));

  /**
   * Personagens que aparecem no roteiro mas ainda não têm dublador escalado.
   * Evita descobrir a falta de elenco só no dia da gravação.
   */
  app.get('/api/projetos/:id/pendencias', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query<{ character_name: string; total: string }>(
      `SELECT l.character_name, count(*)::text AS total
         FROM episode_lines l
         JOIN episodes e ON e.id = l.episode_id
        WHERE e.project_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM project_members m
             WHERE m.project_id = e.project_id AND lower(m.character_name) = lower(l.character_name)
          )
        GROUP BY l.character_name
        ORDER BY count(*) DESC`,
      [param(req, 'id')],
    );
    res.json(rows.map((r) => ({ characterName: r.character_name, lines: Number(r.total) })));
  }));

  app.post('/api/projetos/:id/elenco', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { dubberId?: unknown; characterName?: unknown; roleNote?: unknown };
    const dubberId = asString(body.dubberId);
    const characterName = asString(body.characterName);
    if (!dubberId || !characterName) {
      res.status(400).json({ error: 'Escolha o dublador e o personagem.' });
      return;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO project_members (project_id, dubber_id, character_name, role_note)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [param(req, 'id'), dubberId, characterName, asString(body.roleNote) ?? null],
      );
      await logProject(actor, 'cast.added', 'project', param(req, 'id'), { characterName });
      res.status(201).json({ id: rows[0].id });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'Esse dublador já está escalado para esse personagem.' });
        return;
      }
      throw e;
    }
  }));

  app.delete('/api/elenco/:id', requireActor(async (actor, req, res) => {
    const { rows } = await pool.query('DELETE FROM project_members WHERE id = $1 RETURNING project_id', [param(req, 'id')]);
    if (!rows[0]) {
      res.status(404).json({ error: 'Escalação não encontrada.' });
      return;
    }
    await logProject(actor, 'cast.removed', 'project', rows[0].project_id);
    res.json({ ok: true });
  }));

  // ---------- falas do roteiro (por personagem) ----------
  app.get('/api/episodios/:id/falas', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM episode_lines WHERE episode_id = $1 ORDER BY line_number ASC, created_at ASC`,
      [param(req, 'id')],
    );
    res.json(rows);
  }));

  app.post('/api/episodios/:id/falas', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { characterName?: unknown; text?: unknown; context?: unknown };
    const characterName = asString(body.characterName);
    const text = asString(body.text);
    if (!characterName || !text) {
      res.status(400).json({ error: 'Informe o personagem e a fala.' });
      return;
    }
    const { rows: maxRow } = await pool.query<{ next: number }>(
      `SELECT COALESCE(MAX(line_number), 0) + 1 AS next FROM episode_lines WHERE episode_id = $1`,
      [param(req, 'id')],
    );
    const { rows } = await pool.query(
      `INSERT INTO episode_lines (episode_id, character_name, line_number, text, context)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [param(req, 'id'), characterName, maxRow[0]?.next ?? 1, text, asString(body.context) ?? null],
    );
    await logProject(actor, 'line.created', 'episode', param(req, 'id'), { characterName });
    res.status(201).json(rows[0]);
  }));

  app.patch('/api/falas/:id', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { characterName?: unknown; text?: unknown; context?: unknown };
    const { rows } = await pool.query(
      `UPDATE episode_lines SET
         character_name = COALESCE($2, character_name),
         text = COALESCE($3, text),
         context = COALESCE($4, context)
       WHERE id = $1 RETURNING *`,
      [param(req, 'id'), asString(body.characterName) ?? null, asString(body.text) ?? null, asString(body.context) ?? null],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Fala não encontrada.' });
      return;
    }
    await logProject(actor, 'line.updated', 'episode', rows[0].episode_id);
    res.json(rows[0]);
  }));

  app.delete('/api/falas/:id', requireActor(async (actor, req, res) => {
    const { rows } = await pool.query('DELETE FROM episode_lines WHERE id = $1 RETURNING episode_id', [param(req, 'id')]);
    if (!rows[0]) {
      res.status(404).json({ error: 'Fala não encontrada.' });
      return;
    }
    await logProject(actor, 'line.deleted', 'episode', rows[0].episode_id);
    res.json({ ok: true });
  }));

  // ---------- status de gravação por personagem ----------
  app.get('/api/episodios/:id/gravacao', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query(
      `SELECT r.*, d.display_name AS dubber_name
         FROM recording_status r
         JOIN dubbers d ON d.id = r.dubber_id
        WHERE r.episode_id = $1
        ORDER BY r.character_name ASC`,
      [param(req, 'id')],
    );
    res.json(rows);
  }));

  /**
   * Página de gravação do dublador: junta as falas do personagem dele
   * em todos os episódios do projeto, com o status atual de cada uma.
   */
  app.get('/api/projetos/:id/meu-roteiro/:dubberId', requireActor(async (_actor, req, res) => {
    const projectId = param(req, 'id');
    const dubberId = param(req, 'dubberId');
    const { rows: member } = await pool.query(
      'SELECT character_name FROM project_members WHERE project_id = $1 AND dubber_id = $2',
      [projectId, dubberId],
    );
    if (!member.length) {
      res.status(404).json({ error: 'Este dublador não faz parte do elenco deste projeto.' });
      return;
    }
    const characters = member.map((m) => m.character_name);
    const { rows } = await pool.query(
      `SELECT e.id AS episode_id, e.title AS episode_title, e.status AS episode_status,
              l.character_name, l.line_number, l.text, l.context,
              r.status AS recording_status
         FROM episode_lines l
         JOIN episodes e ON e.id = l.episode_id
         LEFT JOIN recording_status r
           ON r.episode_id = e.id AND r.dubber_id = $2 AND lower(r.character_name) = lower(l.character_name)
        WHERE e.project_id = $1
          AND lower(l.character_name) = ANY($3::text[])
        ORDER BY e.created_at ASC, l.line_number ASC`,
      [projectId, dubberId, characters.map((c) => c.toLowerCase())],
    );
    res.json({
      characters,
      episodes: [...new Set(rows.map((r) => r.episode_id))].map((episodeId) => {
        const first = rows.find((r) => r.episode_id === episodeId);
        return {
          episodeId,
          episodeTitle: first?.episode_title ?? '',
          episodeStatus: first?.episode_status ?? 'planejamento',
          lines: rows
            .filter((r) => r.episode_id === episodeId)
            .map((r) => ({
              characterName: r.character_name,
              lineNumber: r.line_number,
              text: r.text,
              context: r.context,
              recordingStatus: r.recording_status ?? 'pendente',
            })),
        };
      }),
    });
  }));

  app.post('/api/episodios/:id/gravacao', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { dubberId?: unknown; characterName?: unknown; status?: unknown; note?: unknown };
    const dubberId = asString(body.dubberId);
    const characterName = asString(body.characterName);
    if (!dubberId || !characterName) {
      res.status(400).json({ error: 'Informe o dublador e o personagem.' });
      return;
    }
    const status = asString(body.status) ?? 'pendente';
    const { rows } = await pool.query(
      `INSERT INTO recording_status (episode_id, dubber_id, character_name, status, note, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (episode_id, dubber_id, character_name)
       DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING *`,
      [param(req, 'id'), dubberId, characterName, status, asString(body.note) ?? null, actor.name],
    );
    await logProject(actor, 'recording.updated', 'episode', param(req, 'id'), { characterName, status });
    res.status(201).json(rows[0]);
  }));

  // ---------- versões do roteiro ----------
  app.get('/api/episodios/:id/versoes', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query(
      `SELECT id, episode_id, author_name, created_at, length(content) AS chars
         FROM script_versions WHERE episode_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [param(req, 'id')],
    );
    res.json(rows);
  }));

  app.post('/api/episodios/:id/versoes', requireActor(async (actor, req, res) => {
    const { rows: ep } = await pool.query<{ script: string | null }>('SELECT script FROM episodes WHERE id = $1', [param(req, 'id')]);
    if (!ep[0]) {
      res.status(404).json({ error: 'Episódio não encontrado.' });
      return;
    }
    const content = ep[0].script ?? '';
    if (!content.trim()) {
      res.status(400).json({ error: 'Não há roteiro para versionar.' });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO script_versions (episode_id, content, author_id, author_name)
       VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
      [param(req, 'id'), content, actor.id, actor.name],
    );
    await logProject(actor, 'script.versioned', 'episode', param(req, 'id'));
    res.status(201).json({ id: rows[0].id, createdAt: rows[0].created_at });
  }));

  app.get('/api/versoes/:id', requireActor(async (_actor, req, res) => {
    const { rows } = await pool.query('SELECT * FROM script_versions WHERE id = $1', [param(req, 'id')]);
    if (!rows[0]) {
      res.status(404).json({ error: 'Versão não encontrada.' });
      return;
    }
    res.json(rows[0]);
  }));

  // ---------- ficha pública (sem login, com dados mínimos) ----------
  app.get('/api/publico/dubladores', wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT d.public_slug, d.display_name, d.voice_tone, d.voice_types, d.self_level, d.classification,
              (SELECT count(*)::int FROM samples s WHERE s.dubber_id = d.id AND s.review_status = 'aprovada') AS approved_samples
         FROM dubbers d
        WHERE d.is_public = true AND d.public_slug IS NOT NULL AND d.is_active = true
        ORDER BY d.display_name ASC`,
    );
    res.json(rows);
  }));

  app.get('/api/publico/dubladores/:slug', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, public_slug, display_name, voice_tone, voice_types, self_level, classification,
              experience, specialties, interests, wanted_characters
         FROM dubbers
        WHERE public_slug = $1 AND is_public = true AND is_active = true`,
      [param(req, 'slug')],
    );
    const d = rows[0];
    if (!d) {
      res.status(404).json({ error: 'Ficha não encontrada.' });
      return;
    }
    const { rows: samples } = await pool.query(
      `SELECT id, file_name, size_bytes, label, created_at FROM samples
        WHERE dubber_id = $1 AND review_status = 'aprovada' ORDER BY created_at DESC LIMIT 5`,
      [d.id],
    );
    // Nunca expõe discord_id, idade, notas internas ou histórico neste endpoint.
    res.json({
      displayName: d.display_name,
      slug: d.public_slug,
      voiceTone: d.voice_tone,
      voiceTypes: d.voice_types ?? [],
      selfLevel: d.self_level,
      classification: d.classification,
      experience: d.experience,
      specialties: d.specialties ?? [],
      interests: d.interests ?? [],
      wantedCharacters: d.wanted_characters,
      samples: samples.map((s: { id: string; file_name: string; size_bytes: number; label: string | null }) => ({
        id: s.id,
        fileName: s.file_name,
        sizeBytes: s.size_bytes,
        label: s.label,
      })),
    });
  }));

  // Áudio público: só de amostras aprovadas de fichas públicas.
  app.get('/api/publico/audio/:id', wrap(async (req, res) => {
    const sampleRepo = repo as SampleBytesRepository;
    if (typeof sampleRepo.getSampleBytes !== 'function') {
      res.status(501).json({ error: 'Áudio indisponível.' });
      return;
    }
    const { rows: allowed } = await pool.query(
      `SELECT 1 FROM samples s JOIN dubbers d ON d.id = s.dubber_id
        WHERE s.id = $1 AND s.review_status = 'aprovada' AND d.is_public = true AND d.is_active = true`,
      [param(req, 'id')],
    );
    if (!allowed[0]) {
      res.status(404).json({ error: 'Amostra não encontrada.' });
      return;
    }
    const found = await sampleRepo.getSampleBytes(param(req, 'id'));
    if (!found) {
      res.status(404).json({ error: 'Amostra não encontrada.' });
      return;
    }
    res.setHeader('Content-Type', found.meta.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(found.bytes));
  }));

  // ---------- ficha pública: configuração pelo painel ----------
  app.post('/api/fichas/:id/publicar', requireActor(async (actor, req, res) => {
    const body = (req.body ?? {}) as { isPublic?: unknown; slug?: unknown };
    const isPublic = body.isPublic === true;
    const rawSlug = asString(body.slug);
    const slug = rawSlug
      ? rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
      : null;
    if (isPublic && !slug) {
      res.status(400).json({ error: 'Informe um endereço (slug) para a ficha pública.' });
      return;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE dubbers SET is_public = $2, public_slug = $3 WHERE id = $1
         RETURNING is_public, public_slug`,
        [param(req, 'id'), isPublic, slug],
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'Ficha não encontrada.' });
        return;
      }
      await logProject(actor, isPublic ? 'dubber.published' : 'dubber.unpublished', 'dubber', param(req, 'id'), { slug });
      res.json(rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'Esse endereço já está em uso por outra ficha.' });
        return;
      }
      throw e;
    }
  }));

  // ---------- exportar roteiro (.txt) ----------
  app.get('/api/episodios/:id/exportar', requireActor(async (_actor, req, res) => {
    const epId = param(req, 'id');
    const { rows: ep } = await pool.query('SELECT title FROM episodes WHERE id = $1', [epId]);
    if (!ep[0]) {
      res.status(404).json({ error: 'Episódio não encontrado.' });
      return;
    }
    const { rows: lines } = await pool.query(
      'SELECT character_name, text FROM episode_lines WHERE episode_id = $1 ORDER BY line_number ASC',
      [epId],
    );
    const content = lines.map((l) => `${l.character_name.toUpperCase()}: ${l.text}`).join('\n\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ep[0].title.replace(/[^a-z0-9]/gi, '_')}.txt"`);
    res.send(content);
  }));

  // ---------- dashboard e backup ----------
  app.get('/api/dashboard', requireActor(async (actor, _req, res) => {
    const [
      { rows: projs },
      { rows: eps },
      { rows: dubs },
      { rows: samples },
    ] = await Promise.all([
      pool.query('SELECT count(*)::int as c FROM projects'),
      pool.query('SELECT count(*)::int as c FROM episodes'),
      pool.query('SELECT count(*)::int as c FROM dubbers WHERE is_active = true'),
      pool.query('SELECT count(*)::int as c FROM samples WHERE review_status = \'pendente\''),
    ]);
    res.json({
      projects: projs[0].c,
      episodes: eps[0].c,
      activeDubbers: dubs[0].c,
      pendingSamples: samples[0].c,
    });
  }));

  app.get('/api/backup', requireActor(async (actor, _req, res) => {
    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const [dubbers, projects, eps, lines] = await Promise.all([
      pool.query('SELECT * FROM dubbers'),
      pool.query('SELECT * FROM projects'),
      pool.query('SELECT * FROM episodes'),
      pool.query('SELECT * FROM episode_lines'),
    ]);
    res.json({
      exportedAt: new Date(),
      dubbers: dubbers.rows,
      projects: projects.rows,
      episodes: eps.rows,
      lines: lines.rows,
    });
  }));
  app.get('/api/revisoes', requireActor(async (actor, _req, res) => {
    res.json(await repo.listReviews(actor));
  }));

  app.get('/api/auditoria', requireActor(async (actor, _req, res) => {
    res.json(await repo.listAudit(actor));
  }));

  return app;
}

/** Sobe o servidor (chamado pelo processo do bot no Render). */
export function startServer(opts: ServerOptions) {
  const port = opts.port ?? process.env.PORT ?? 3000;
  const app = createServer(opts);
  return new Promise<import('node:http').Server>((resolve) => {
    const srv = app.listen(port, () => {
      console.log(`[api] Vox Trupe Studios em http://localhost:${port}`);
      resolve(srv);
    });
  });
}