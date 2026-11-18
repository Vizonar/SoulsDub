import { fileURLToPath } from 'node:url';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config as loadDotenv } from 'dotenv';
import { MemoryRepository, PgRepository, type DubberRepository } from '@soul/shared';
import { ConfigError, loadConfig } from './config.js';
import { routeInteraction } from './handlers.js';
import { SessionStore } from './wizard/wizard.js';

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

async function main() {
  let config;
  try {
    config = loadConfig(process.env, { discord: true });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`\n${e.message}\n\nO bot só conecta ao Discord quando você preencher o .env (veja docs/DISCORD.md).`);
      console.error('Para validar o projeto sem o servidor, rode: npm test');
      process.exit(1);
    }
    throw e;
  }

  let repo: DubberRepository;
  if (config.storage === 'memory') {
    console.warn('[bot] BOT_STORAGE=memory: as fichas NÃO serão gravadas no banco (apenas teste).');
    repo = new MemoryRepository();
  } else {
    console.log('[bot] armazenamento: Neon (Postgres)');
    repo = new PgRepository(config.databaseUrl!);
  }

  const store = new SessionStore();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, (c) => console.log(`[bot] conectado como ${c.user.tag}`));
  client.on(Events.InteractionCreate, (i) => void routeInteraction(i, { repo, store, config, client }));
  setInterval(() => store.sweep(Date.now()), 5 * 60 * 1000).unref();

  // Inicia a API antes do login no Discord para que o health check do Render responda
  // mesmo se o gateway do Discord estiver indisponível temporariamente.
  if (config.databaseUrl) {
    const { startServer } = await import('./server.js');
    await startServer({
      repo,
      databaseUrl: config.databaseUrl,
      origin: (process.env.WEB_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    });
  }
  await client.login(config.token);
}

void main();
