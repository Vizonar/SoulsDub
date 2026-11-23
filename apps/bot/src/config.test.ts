import { describe, expect, it } from 'vitest';
import { ConfigError, isAuthorizedAdmin, loadConfig } from './config.js';

describe('configuração', () => {
  it('funciona sem nenhuma credencial (desenvolvimento) e usa padrões seguros', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({ storage: 'neon', policy: { requireAge: false }, rules: { allowUpdates: true, updateCooldownHours: 0 }, adminRoleIds: [] });
  });
  it('exige credenciais só quando o bot vai conectar', () => {
    expect(() => loadConfig({}, { discord: true })).toThrow(ConfigError);
    expect(() => loadConfig({ DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c' }, { discord: true })).toThrow(/DATABASE_URL/);
    expect(loadConfig({ DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c', BOT_STORAGE: 'memory' }, { discord: true }).token).toBe('t');
    expect(loadConfig({ DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c', DATABASE_URL: 'postgres://db' }, { discord: true }).storage).toBe('neon');
  });
  it('normaliza WEB_ORIGIN sem esquema e aceita múltiplas origens', () => {
    const c = loadConfig({ WEB_ORIGIN: 'https://voxtrupe-jgrm-green.vercel.app, https://preview.voxtrupe.app/' });
    expect(c.webOrigins).toEqual(['https://voxtrupe-jgrm-green.vercel.app', 'https://preview.voxtrupe.app']);
  });
  it('interpreta regras do formulário e cargos de administrador', () => {
    const c = loadConfig({ FORM_REQUIRE_AGE: 'true', FORM_ALLOW_UPDATES: 'false', FORM_UPDATE_COOLDOWN_HOURS: '12', DISCORD_ADMIN_ROLE_IDS: ' 1, 2 ,' });
    expect(c.policy.requireAge).toBe(true);
    expect(c.rules).toEqual({ allowUpdates: false, updateCooldownHours: 12 });
    expect(c.adminRoleIds).toEqual(['1', '2']);
    expect(() => loadConfig({ BOT_STORAGE: 'outro' })).toThrow(ConfigError);
  });
  it('autoriza Administrador ou cargo configurado; nega o resto', () => {
    expect(isAuthorizedAdmin({ isAdministrator: true, roleIds: [] }, [])).toBe(true);
    expect(isAuthorizedAdmin({ isAdministrator: false, roleIds: ['9', '2'] }, ['2'])).toBe(true);
    expect(isAuthorizedAdmin({ isAdministrator: false, roleIds: ['9'] }, ['2'])).toBe(false);
    expect(isAuthorizedAdmin({ isAdministrator: false, roleIds: ['2'] }, [])).toBe(false);
  });
});
