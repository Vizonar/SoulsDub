import { describe, expect, it } from 'vitest';
import { csvCell, dubbersToCsv } from './csv.js';
import { createDemoSeed } from './demo-data.js';
import { can } from './permissions.js';

describe('exportação CSV', () => {
  it('escapa aspas/delimitadores e neutraliza fórmulas', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1+1')).toBe("'-1+1");
    expect(csvCell(undefined)).toBe('');
  });

  it('gera BOM, cabeçalho e uma linha por dublador, sem observações internas', () => {
    const seed = createDemoSeed(new Date('2026-10-21T12:00:00Z'));
    const csv = dubbersToCsv(seed.dubbers);
    expect(csv.startsWith('\uFEFFNome / Nick;ID do Discord')).toBe(true);
    expect(csv.trim().split('\r\n')).toHaveLength(seed.dubbers.length + 1);
    expect(csv).not.toContain('Observação interna');
  });

  it('só administradores exportam', () => {
    expect(can('admin', 'export.csv')).toBe(true);
    expect(can('reviewer', 'export.csv')).toBe(false);
    expect(can(null, 'dubber.read')).toBe(false);
  });
});
