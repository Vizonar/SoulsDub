import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository, SAMPLE_MAX_BYTES, makeToneWav, parseForm, type Dubber } from '@soul/shared';
import { commandsJson } from './commands.js';
import { downloadAttachment, processSampleUpload, SAMPLE_COOLDOWN_MS } from './sample-upload.js';

const U = '123456789012345678';
const form = parseForm({
  displayName: 'Nick', selfLevel: 'iniciante', voiceTone: 'grave', voiceTypes: ['masculina'], intensity: 'alta', speechSpeed: 'rapida',
});
const att = (over = {}) => ({ name: 'voz.wav', contentType: 'audio/wav', size: 16000, url: 'https://cdn.discordapp.com/attachments/1/2/voz.wav', ...over });
const wav = makeToneWav(300, 0.2);

async function setup(withProfile = true) {
  const repo = new MemoryRepository();
  if (withProfile) await repo.upsertFromForm(U, form);
  const fetchBytes = vi.fn(async () => wav);
  return { repo, fetchBytes, last: new Map<string, number>() };
}

describe('/sample-voz', () => {
  it('registra o comando com opção de anexo obrigatória, sem ID de usuário editável', () => {
    const cmd = commandsJson().find((c) => c.name === 'sample-voz')!;
    expect(cmd.options?.find((o) => o.name === 'arquivo')).toMatchObject({ type: 11, required: true });
    expect(commandsJson().map((c) => c.name)).toEqual(['ficha-dublador', 'sample-voz']);
  });

  it('salva a amostra na ficha do próprio autor (ID vem do Discord, não do usuário)', async () => {
    const { repo, fetchBytes, last } = await setup();
    const r = await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 0 }, U, att(), 'Leitura');
    expect(r.ok).toBe(true);
    const d = (await repo.findByDiscordId(U)) as Dubber;
    const det = await repo.getDetails({ id: 'a', name: 'A', role: 'admin' }, d.id);
    expect(det.samples).toHaveLength(1);
    expect(det.samples[0]).toMatchObject({ label: 'Leitura', source: 'discord' });
  });

  it('exige ficha prévia e não baixa nada sem necessidade', async () => {
    const { repo, fetchBytes, last } = await setup(false);
    const r = await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 0 }, U, att());
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('ficha') });
  });

  it('recusa extensão errada e tamanho excessivo antes de baixar', async () => {
    const { repo, fetchBytes, last } = await setup();
    expect((await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 0 }, U, att({ name: 'x.ogg' }))).ok).toBe(false);
    expect((await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 0 }, U, att({ size: SAMPLE_MAX_BYTES + 1 }))).message).toMatch(/limite/);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('recusa conteúdo que não é áudio mesmo com nome .wav', async () => {
    const { repo, last } = await setup();
    const fetchBytes = async () => new TextEncoder().encode('<?php evil ?>');
    const r = await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 0 }, U, att());
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Não aceitei/);
  });

  it('limita a frequência de envios por usuário', async () => {
    const { repo, fetchBytes, last } = await setup();
    expect((await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 1000 }, U, att())).ok).toBe(true);
    expect((await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 1000 + 5000 }, U, att())).message).toMatch(/Aguarde/);
    expect((await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 1000 + SAMPLE_COOLDOWN_MS + 1 }, U, att())).ok).toBe(true);
  });

  it('falha de download vira mensagem amigável', async () => {
    const { repo, last } = await setup();
    const fetchBytes = async () => { throw new Error('boom'); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await processSampleUpload({ repo, fetchBytes, lastUpload: last, now: 0 }, U, att())).message).toMatch(/Não consegui baixar/);
  });

  it('só baixa de hosts do CDN do Discord (anti-SSRF)', async () => {
    await expect(downloadAttachment('https://evil.example.com/a.wav')).rejects.toThrow(/host/);
    await expect(downloadAttachment('http://cdn.discordapp.com/a.wav')).rejects.toThrow(/host/);
    await expect(downloadAttachment('https://cdn.discordapp.com.evil.io/a.wav')).rejects.toThrow(/host/);
  });
});
