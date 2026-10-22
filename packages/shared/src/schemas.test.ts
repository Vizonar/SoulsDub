import { describe, expect, it } from 'vitest';
import { buildSchemas, dubberFormSchema, noteSchema, classificationChangeSchema, reviewInputSchema } from './schemas.js';
import { parseListText } from './text.js';
import { validForm } from './fixtures.test-util.js';

describe('ficha do dublador — validação', () => {
  it('aceita uma ficha completa e normaliza as tags livres', () => {
    const r = dubberFormSchema.parse(validForm());
    expect(r.specialties).toEqual(['vilões', 'comédia']);
    expect(r.displayName).toBe('Teste Voz');
  });

  it('exige nome/nick', () => {
    expect(dubberFormSchema.safeParse(validForm({ displayName: '   ' })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ displayName: 'x'.repeat(65) })).success).toBe(false);
  });

  it('idade é opcional por padrão, mas valida valores implausíveis e não inteiros', () => {
    expect(dubberFormSchema.safeParse(validForm({ age: undefined })).success).toBe(true);
    expect(dubberFormSchema.safeParse(validForm({ age: 0 })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ age: 150 })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ age: 20.5 })).success).toBe(false);
    // não há restrição etária inventada: 15 e 70 são válidos
    expect(dubberFormSchema.safeParse(validForm({ age: 15 })).success).toBe(true);
    expect(dubberFormSchema.safeParse(validForm({ age: 70 })).success).toBe(true);
  });

  it('idade obrigatória quando a política exige', () => {
    const { full } = buildSchemas({ requireAge: true });
    expect(full.safeParse(validForm({ age: undefined })).success).toBe(false);
    expect(full.safeParse(validForm({ age: 30 })).success).toBe(true);
  });

  it('valida cada lista fechada', () => {
    expect(dubberFormSchema.safeParse(validForm({ selfLevel: 'elite' as never })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ voiceTone: 'rouco' as never })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ intensity: 'extrema' as never })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ speechSpeed: 'turbo' as never })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ voiceTypes: [] })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ voiceTypes: ['robótica' as never] })).success).toBe(false);
  });

  it('permite múltiplos tipos de voz e remove duplicatas de tags', () => {
    const r = dubberFormSchema.parse(validForm({ voiceTypes: ['neutra', 'adolescente'], interests: ['jogos', 'Jogos', 'jogos '] }));
    expect(r.voiceTypes).toEqual(['neutra', 'adolescente']);
    expect(r.interests).toEqual(['jogos']);
  });

  it('aceita novas categorias de especialidade e limita tamanho', () => {
    expect(dubberFormSchema.parse(validForm({ specialties: ['dublagem de documentário'] })).specialties).toEqual(['dublagem de documentário']);
    expect(dubberFormSchema.safeParse(validForm({ specialties: ['a'.repeat(41)] })).success).toBe(false);
    expect(dubberFormSchema.safeParse(validForm({ specialties: Array.from({ length: 21 }, (_, i) => `esp${i}`) })).success).toBe(false);
  });

  it('textos opcionais vazios viram undefined', () => {
    const r = dubberFormSchema.parse(validForm({ pronouns: '  ', diction: '', wantedCharacters: undefined }));
    expect(r.pronouns).toBeUndefined();
    expect(r.diction).toBeUndefined();
  });

  it('IGNORA tentativas de enviar classificação oficial ou observações pelo formulário', () => {
    const r = dubberFormSchema.parse({ ...validForm(), classification: 'elite', internalNotes: 'x', isActive: false });
    expect(r).not.toHaveProperty('classification');
    expect(r).not.toHaveProperty('internalNotes');
    expect(r).not.toHaveProperty('isActive');
  });

  it('parseListText separa por vírgula, ponto e vírgula e quebra de linha', () => {
    expect(parseListText('Vilões, comédia;\n narração ,, Vilões')).toEqual(['vilões', 'comédia', 'narração']);
    expect(parseListText('')).toEqual([]);
  });

  it('valida notas, mudança de classificação e avaliação', () => {
    expect(noteSchema.safeParse('  ').success).toBe(false);
    expect(classificationChangeSchema.safeParse({ newClassification: 'elite', reason: 'ok' }).success).toBe(false);
    expect(classificationChangeSchema.safeParse({ newClassification: 'mestre', reason: 'motivo válido' }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ dubberId: 'a', criteria: [{ label: '' }] }).success).toBe(false);
  });
});
