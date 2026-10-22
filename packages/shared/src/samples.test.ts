import { describe, expect, it } from 'vitest';
import { createDemoRepository, DEMO_ADMIN, DEMO_REVIEWER } from './demo-data.js';
import { MemoryRepository, parseForm, ValidationError } from './repository.js';
import { PermissionError } from './permissions.js';
import { MAX_SAMPLES_PER_DUBBER, SAMPLE_MAX_BYTES, makeToneWav, safeFileName, sniffAudio, validateAudioFile } from './samples.js';
import { validForm } from './fixtures.test-util.js';

const wav = () => makeToneWav(440, 0.2);
const mp3Id3 = () => new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
const mp3Frame = () => new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0]);
const D1 = '123456789012345678';

describe('validação de áudio (conteúdo, extensão, tipo e tamanho)', () => {
  it('reconhece WAV e MP3 (com ID3 ou quadro MPEG) pelo conteúdo', () => {
    expect(sniffAudio(wav())).toBe('wav');
    expect(sniffAudio(mp3Id3())).toBe('mp3');
    expect(sniffAudio(mp3Frame())).toBe('mp3');
    expect(sniffAudio(new TextEncoder().encode('MZ executable'))).toBeNull();
  });

  it('aceita .wav e .mp3 válidos e normaliza o MIME', () => {
    expect(validateAudioFile({ fileName: 'voz.WAV', mimeType: 'audio/x-wav', bytes: wav() })).toMatchObject({ ok: true, mimeType: 'audio/wav', extension: 'wav' });
    expect(validateAudioFile({ fileName: 'voz.mp3', mimeType: 'audio/mpeg', bytes: mp3Id3() })).toMatchObject({ ok: true, mimeType: 'audio/mpeg' });
    expect(validateAudioFile({ fileName: 'voz.mp3', mimeType: 'application/octet-stream', bytes: mp3Frame() }).ok).toBe(true);
  });

  it('rejeita extensão errada, arquivo renomeado, vazio, grande demais e MIME de outro tipo', () => {
    expect(validateAudioFile({ fileName: 'voz.ogg', mimeType: 'audio/ogg', bytes: wav() }).ok).toBe(false);
    expect(validateAudioFile({ fileName: 'virus.mp3', mimeType: 'audio/mpeg', bytes: new TextEncoder().encode('MZ...') }).errors.join()).toMatch(/não parece ser um áudio/);
    expect(validateAudioFile({ fileName: 'a.mp3', mimeType: 'audio/mpeg', bytes: wav() }).errors.join()).toMatch(/não corresponde/);
    expect(validateAudioFile({ fileName: 'a.wav', mimeType: 'audio/wav', bytes: new Uint8Array() }).errors.join()).toMatch(/vazio/);
    const big = new Uint8Array(SAMPLE_MAX_BYTES + 1); big.set(wav().slice(0, 12));
    expect(validateAudioFile({ fileName: 'a.wav', mimeType: 'audio/wav', bytes: big }).errors.join()).toMatch(/limite/);
    expect(validateAudioFile({ fileName: 'a.wav', mimeType: 'video/mp4', bytes: wav() }).ok).toBe(false);
  });

  it('sanitiza nomes de arquivo (sem caminhos nem caracteres de controle)', () => {
    expect(safeFileName('../../etc/passwd.wav')).toBe('passwd.wav');
    expect(safeFileName('C:\\Users\\x\\voz?.wav')).toBe('voz.wav');
    expect(safeFileName('')).toBe('audio');
  });
});

describe('amostras de voz — repositório', () => {
  const setup = async () => {
    const repo = new MemoryRepository();
    const r = await repo.upsertFromForm(D1, parseForm(validForm()));
    if (r.status !== 'created') throw new Error('x');
    return { repo, id: r.dubber.id };
  };

  it('dublador envia via Discord: exige ficha, valida o arquivo, guarda e marca para revisão', async () => {
    const repo = new MemoryRepository();
    expect((await repo.addSampleFromDiscord(D1, { fileName: 'a.wav', mimeType: 'audio/wav', bytes: wav() })).status).toBe('no_profile');
    const { repo: r2, id } = await setup();
    const bad = await r2.addSampleFromDiscord(D1, { fileName: 'a.wav', mimeType: 'audio/wav', bytes: new Uint8Array([1, 2, 3]) });
    expect(bad.status).toBe('invalid');
    const ok = await r2.addSampleFromDiscord(D1, { fileName: 'minha voz.wav', mimeType: 'audio/wav', bytes: wav() }, '  Leitura  ');
    expect(ok.status).toBe('added');
    const details = await r2.getDetails(DEMO_ADMIN, id);
    expect(details.samples).toHaveLength(1);
    expect(details.samples[0]).toMatchObject({ label: 'Leitura', source: 'discord', mimeType: 'audio/wav', fileName: 'minha voz.wav' });
    expect(details.samples[0]!.url).toBeTruthy();
  });

  it(`respeita o limite de ${MAX_SAMPLES_PER_DUBBER} amostras, no Discord e no painel`, async () => {
    const { repo, id } = await setup();
    const f = { fileName: 'a.wav', mimeType: 'audio/wav', bytes: wav() };
    for (let i = 0; i < MAX_SAMPLES_PER_DUBBER; i++) await repo.addSample(DEMO_ADMIN, id, f);
    expect(await repo.addSampleFromDiscord(D1, f)).toEqual({ status: 'limit_reached', max: MAX_SAMPLES_PER_DUBBER });
    await expect(repo.addSample(DEMO_ADMIN, id, f)).rejects.toBeInstanceOf(ValidationError);
  });

  it('painel: só admin envia/apaga; avaliador ouve; apagar libera vaga e registra auditoria', async () => {
    const { repo, id } = await setup();
    const f = { fileName: 'a.mp3', mimeType: 'audio/mpeg', bytes: mp3Id3() };
    await expect(repo.addSample(DEMO_REVIEWER, id, f)).rejects.toBeInstanceOf(PermissionError);
    const s = await repo.addSample(DEMO_ADMIN, id, f, 'Cena 1');
    expect(s).toMatchObject({ source: 'panel', uploadedByName: DEMO_ADMIN.name, mimeType: 'audio/mpeg' });
    expect((await repo.getDetails(DEMO_REVIEWER, id)).samples).toHaveLength(1);
    await expect(repo.deleteSample(DEMO_REVIEWER, s.id)).rejects.toBeInstanceOf(PermissionError);
    await repo.deleteSample(DEMO_ADMIN, s.id);
    expect((await repo.getDetails(DEMO_ADMIN, id)).samples).toHaveLength(0);
    expect((await repo.listAudit(DEMO_ADMIN)).map((a) => a.action)).toEqual(expect.arrayContaining(['sample.created', 'sample.deleted']));
    await expect(repo.deleteSample(DEMO_ADMIN, s.id)).rejects.toThrow(/não encontrad/);
  });

  it('painel rejeita arquivo que não é áudio mesmo com extensão .mp3', async () => {
    const { repo, id } = await setup();
    await expect(repo.addSample(DEMO_ADMIN, id, { fileName: 'x.mp3', mimeType: 'audio/mpeg', bytes: new TextEncoder().encode('<html>') })).rejects.toBeInstanceOf(ValidationError);
  });

  it('DEMO traz amostras sintéticas e elas não vazam entre sessões', async () => {
    const a = createDemoRepository();
    const b = createDemoRepository();
    const all = await a.listAll(DEMO_ADMIN);
    const withAudio = (await Promise.all(all.map((d) => a.getDetails(DEMO_ADMIN, d.id)))).filter((x) => x.samples.length > 0);
    expect(withAudio.length).toBeGreaterThanOrEqual(5);
    const target = withAudio[0]!;
    await a.deleteSample(DEMO_ADMIN, target.samples[0]!.id);
    expect((await b.getDetails(DEMO_ADMIN, target.dubber.id)).samples.length).toBe(target.samples.length);
  });
});
