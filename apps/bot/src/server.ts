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

  // ---------- saúde ----------
  app.get('/api/health', wrap(async (_req, res) => {
    const { rows } = await pool.query<{ now: Date }>('SELECT now() AS now');
    res.json({ ok: true, app: 'Vox Trupe Studios', db: 'neon', now: rows[0]?.now });
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

  // ---------- avaliações / auditoria ----------
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