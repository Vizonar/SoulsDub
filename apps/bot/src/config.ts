import { z } from 'zod';
import type { FormPolicy, SubmitRules } from '@soul/shared';

const bool = (def: boolean) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : String(v).toLowerCase() === 'true'), z.boolean());

const schema = z.object({
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_RECRUITMENT_CHANNEL_ID: z.string().optional(),
  DISCORD_ADMIN_ROLE_IDS: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  BOT_STORAGE: z.enum(['supabase', 'memory']).default('supabase'),
  FORM_REQUIRE_AGE: bool(false),
  FORM_ALLOW_UPDATES: bool(true),
  FORM_UPDATE_COOLDOWN_HOURS: z.coerce.number().min(0).max(24 * 365).default(0),
});

export interface BotConfig {
  token?: string;
  clientId?: string;
  guildId?: string;
  recruitmentChannelId?: string;
  adminRoleIds: string[];
  storage: 'supabase' | 'memory';
  supabaseUrl?: string;
  serviceRoleKey?: string;
  policy: FormPolicy;
  rules: SubmitRules;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuração inválida:\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
  }
}

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** Lê o ambiente. `need` lista o que a operação exige (o modo de desenvolvimento não exige credenciais). */
export function loadConfig(env: Record<string, string | undefined>, need: { discord?: boolean; clientId?: boolean } = {}): BotConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const e = parsed.data;
  const cfg: BotConfig = {
    token: clean(e.DISCORD_TOKEN),
    clientId: clean(e.DISCORD_CLIENT_ID),
    guildId: clean(e.DISCORD_GUILD_ID),
    recruitmentChannelId: clean(e.DISCORD_RECRUITMENT_CHANNEL_ID),
    adminRoleIds: (e.DISCORD_ADMIN_ROLE_IDS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
    storage: e.BOT_STORAGE,
    supabaseUrl: clean(e.SUPABASE_URL),
    serviceRoleKey: clean(e.SUPABASE_SERVICE_ROLE_KEY),
    policy: { requireAge: e.FORM_REQUIRE_AGE },
    rules: { allowUpdates: e.FORM_ALLOW_UPDATES, updateCooldownHours: e.FORM_UPDATE_COOLDOWN_HOURS },
  };
  const problems: string[] = [];
  if (need.discord && !cfg.token) problems.push('DISCORD_TOKEN não definido.');
  if ((need.discord || need.clientId) && !cfg.clientId) problems.push('DISCORD_CLIENT_ID não definido.');
  if (need.discord && cfg.storage === 'supabase' && (!cfg.supabaseUrl || !cfg.serviceRoleKey)) {
    problems.push('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios com BOT_STORAGE=supabase (ou use BOT_STORAGE=memory só para testes).');
  }
  if (problems.length) throw new ConfigError(problems);
  return cfg;
}

/** Quem pode publicar o painel /ficha-dublador: permissão Administrador ou um dos cargos configurados. */
export function isAuthorizedAdmin(member: { isAdministrator: boolean; roleIds: readonly string[] }, adminRoleIds: readonly string[]): boolean {
  return member.isAdministrator || member.roleIds.some((r) => adminRoleIds.includes(r));
}
