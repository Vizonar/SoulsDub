import { SAMPLE_MAX_BYTES, formatBytes, type DubberRepository } from '@soul/shared';

export interface AttachmentLike {
  name: string;
  contentType: string | null;
  size: number;
  url: string;
}

export const SAMPLE_COOLDOWN_MS = 20_000;
const ALLOWED_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net'];

/** Baixa o anexo do CDN do Discord, recusando outros hosts e respeitando o limite de tamanho. */
export async function downloadAttachment(url: string, maxBytes = SAMPLE_MAX_BYTES): Promise<Uint8Array> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) throw new Error('host de anexo não permitido');
  const res = await fetch(u);
  if (!res.ok) throw new Error(`download falhou (${res.status})`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('arquivo grande demais');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('arquivo grande demais');
  return buf;
}

export interface UploadDeps {
  repo: DubberRepository;
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  lastUpload: Map<string, number>;
  now: number;
}

/** Regras do envio de amostra pelo Discord. Devolve sempre uma mensagem pronta para o usuário (privada). */
export async function processSampleUpload(deps: UploadDeps, userId: string, att: AttachmentLike, label?: string): Promise<{ ok: boolean; message: string }> {
  const last = deps.lastUpload.get(userId);
  if (last !== undefined && deps.now - last < SAMPLE_COOLDOWN_MS) {
    return { ok: false, message: 'Aguarde alguns segundos antes de enviar outro áudio.' };
  }
  if (att.size > SAMPLE_MAX_BYTES) {
    return { ok: false, message: `O arquivo (${formatBytes(att.size)}) passa do limite de ${formatBytes(SAMPLE_MAX_BYTES)}.` };
  }
  if (!/\.(mp3|wav)$/i.test(att.name)) return { ok: false, message: 'Envie um arquivo .mp3 ou .wav.' };
  deps.lastUpload.set(userId, deps.now);

  let bytes: Uint8Array;
  try {
    bytes = await (deps.fetchBytes ?? downloadAttachment)(att.url);
  } catch (err) {
    console.warn('[bot] falha ao baixar anexo:', err instanceof Error ? err.message : err);
    return { ok: false, message: 'Não consegui baixar o arquivo. Tente enviar novamente.' };
  }
  const r = await deps.repo.addSampleFromDiscord(userId, { fileName: att.name, mimeType: att.contentType ?? '', bytes }, label);
  switch (r.status) {
    case 'added':
      return { ok: true, message: '✅ Amostra recebida! A equipe poderá ouvi-la no painel.' };
    case 'no_profile':
      return { ok: false, message: 'Preencha antes a sua ficha (botão “Preencher ficha”) para anexar amostras de voz.' };
    case 'limit_reached':
      return { ok: false, message: `Você já tem o máximo de ${r.max} amostras. Peça à equipe para remover alguma antes de enviar outra.` };
    case 'invalid':
      return { ok: false, message: `Não aceitei o arquivo: ${r.errors.join(' ')}` };
  }
}
