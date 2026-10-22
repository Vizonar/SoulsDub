import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('segredos nunca chegam ao navegador', () => {
const files = walk(fileURLToPath(new URL('.', import.meta.url)))
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'));

  it('o código do painel não referencia variáveis privadas', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/SERVICE_ROLE|DISCORD_TOKEN|process\.env/);
    }
  });

  it('o painel só lê variáveis VITE_ (únicas expostas pelo Vite)', () => {
    const src = readFileSync(new URL('./lib/env.ts', import.meta.url), 'utf8');
    const names = [...src.matchAll(/raw\.([A-Z_]+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toMatch(/^VITE_/);
  });
});
