/** Cliente da API do bot (Vox Trupe Studios). Nenhuma credencial de banco aqui. */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const BASE = API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '');
const TOKEN_KEY = 'vox.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    tokenStore.clear();
    throw new ApiError('Sessão expirada. Entre novamente.', 401);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error ?? `Erro ${res.status}`, res.status);
  return data as T;
}

export interface SessionUser {
  id: string;
  name: string;
  role: 'admin' | 'reviewer';
}

export const api = {
  health: () => request<{ ok: boolean; app: string; db: string; now: string }>('/api/health'),

  login: (username: string, password: string) =>
    request<{ token: string; expiresAt: string; user: SessionUser & { username: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ user: SessionUser }>('/api/auth/me'),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  fichas: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ items: Dubber[]; total: number; page: number; pageSize: number }>(`/api/fichas${qs ? `?${qs}` : ''}`);
  },

  ficha: (id: string) => request<DubberDetails>(`/api/fichas/${id}`),

  atualizarFicha: (id: string, patch: Record<string, unknown>) =>
    request<Dubber>(`/api/fichas/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  classificar: (id: string, classification: string, reason: string) =>
    request<Dubber>(`/api/fichas/${id}/classificacao`, { method: 'POST', body: JSON.stringify({ classification, reason }) }),

  setAtivo: (id: string, active: boolean) =>
    request<Dubber>(`/api/fichas/${id}/ativo`, { method: 'POST', body: JSON.stringify({ active }) }),

  adicionarNota: (id: string, body: string) =>
    request<unknown>(`/api/fichas/${id}/notas`, { method: 'POST', body: JSON.stringify({ body }) }),

  marcarRevisado: (id: string) => request<Dubber>(`/api/fichas/${id}/revisado`, { method: 'POST' }),

  enviarSample: (id: string, fileName: string, mimeType: string, base64: string, label?: string) =>
    request<VoiceSample>(`/api/fichas/${id}/samples`, {
      method: 'POST',
      body: JSON.stringify({ fileName, mimeType, base64, label }),
    }),

  removerSample: (id: string) => request<{ ok: boolean }>(`/api/samples/${id}`, { method: 'DELETE' }),

  audio: async (id: string): Promise<string> => {
    const token = tokenStore.get();
    const res = await fetch(`${BASE}/api/samples/${id}/audio`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError('Não foi possível carregar o áudio.', res.status);
    return URL.createObjectURL(await res.blob());
  },

  revisoes: () => request<unknown[]>('/api/revisoes'),

  auditoria: () => request<unknown[]>('/api/auditoria'),

  // ---- projetos ----
  projetos: () => request<Project[]>('/api/projetos'),

  projeto: (id: string) => request<Project>(`/api/projetos/${id}`),

  criarProjeto: (title: string, status: ProjectStatus) =>
    request<Project>('/api/projetos', { method: 'POST', body: JSON.stringify({ title, status }) }),

  episodios: (projectId: string) => request<Episode[]>(`/api/projetos/${projectId}/episodios`),

  criarEpisodio: (projectId: string, data: { title: string; status: EpisodeStatus; script?: string }) =>
    request<Episode>(`/api/projetos/${projectId}/episodios`, { method: 'POST', body: JSON.stringify(data) }),

  atualizarEpisodio: (episodeId: string, data: Partial<{ title: string; status: EpisodeStatus; script: string }>) =>
    request<Episode>(`/api/episodios/${episodeId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  elenco: (projectId: string) => request<CastMember[]>(`/api/projetos/${projectId}/elenco`),

  escalar: (projectId: string, data: { dubberId: string; characterName: string; roleNote?: string }) =>
    request<{ id: string }>(`/api/projetos/${projectId}/elenco`, { method: 'POST', body: JSON.stringify(data) }),

  removerEscalacao: (castId: string) => request<{ ok: boolean }>(`/api/elenco/${castId}`, { method: 'DELETE' }),
};

// ---- tipos espelhados do pacote compartilhado ----
export interface Dubber {
  id: string;
  discordId: string;
  displayName: string;
  age?: number;
  pronouns?: string;
  selfLevel: string;
  experience?: string;
  voiceTone: string;
  voiceTypes: string[];
  intensity: string;
  diction?: string;
  speechSpeed: string;
  specialties: string[];
  availability: string[];
  interests: string[];
  wantedCharacters?: string;
  classification: string;
  isActive: boolean;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceSample {
  id: string;
  dubberId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  label?: string;
  source: string;
  uploadedByName: string;
  createdAt: string;
  url?: string;
}

export interface Note {
  id: string;
  dubberId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface DubberDetails {
  dubber: Dubber;
  reviews: unknown[];
  history: unknown[];
  notes: Note[];
  audit: unknown[];
  samples: VoiceSample[];
}

// ---- projetos ----
export type ProjectStatus = 'planejamento' | 'nao_iniciado' | 'em_producao' | 'pronto' | 'finalizado';
export type EpisodeStatus = 'planejamento' | 'roteiro_pronto' | 'gravando' | 'mixando' | 'concluido';

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planejamento: 'Em criação',
  nao_iniciado: 'Não iniciado',
  em_producao: 'Em andamento',
  pronto: 'Pronto',
  finalizado: 'Finalizado',
};

export const EPISODE_STATUS_LABEL: Record<EpisodeStatus, string> = {
  planejamento: 'Em criação',
  roteiro_pronto: 'Roteiro pronto',
  gravando: 'Gravando',
  mixando: 'Mixando',
  concluido: 'Concluído',
};

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Episode {
  id: string;
  project_id: string;
  title: string;
  status: EpisodeStatus;
  script?: string | null;
  created_at: string;
}

export interface CastMember {
  id: string;
  project_id: string;
  dubber_id: string;
  character_name: string;
  role_note?: string | null;
  dubber_name: string;
  classification: string;
  created_at: string;
}
