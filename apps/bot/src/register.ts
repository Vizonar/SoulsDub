import { fileURLToPath } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config as loadDotenv } from 'dotenv';
import { commandsJson } from './commands.js';
import { ConfigError, loadConfig } from './config.js';

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

try {
  const cfg = loadConfig(process.env, { clientId: true });
  if (!cfg.token) throw new ConfigError(['DISCORD_TOKEN não definido.']);
  const rest = new REST({ version: '10' }).setToken(cfg.token);
  const route = cfg.guildId ? Routes.applicationGuildCommands(cfg.clientId!, cfg.guildId) : Routes.applicationCommands(cfg.clientId!);
  await rest.put(route, { body: commandsJson() });
  console.log(`Comandos registrados ${cfg.guildId ? `no servidor ${cfg.guildId}` : 'globalmente (pode levar até 1 hora para aparecer)'}.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  console.error('Preencha DISCORD_TOKEN, DISCORD_CLIENT_ID e (recomendado) DISCORD_GUILD_ID no .env.');
  process.exit(1);
}
