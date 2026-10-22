/** Regras das amostras de voz (MP3/WAV). Usadas pelo bot, pelo painel e pelo banco. */
export const SAMPLE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (também é o limite do bucket)
export const MAX_SAMPLES_PER_DUBBER = 5;
export const SAMPLE_BUCKET = 'voice-samples';
export const SAMPLE_MIME_TYPES = ['audio/mpeg', 'audio/wav'] as const;
export type SampleMime = (typeof SAMPLE_MIME_TYPES)[number];

export interface AudioFileInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export type AudioKind = 'mp3' | 'wav';

/** Identifica o formato pelo CONTEÚDO (cabeçalho), não pela extensão informada. */
export function sniffAudio(b: Uint8Array): AudioKind | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (b.length >= 3 && ascii(0, 3) === 'ID3') return 'mp3';
  // quadro MPEG de áudio: 11 bits de sincronização e camada válida
  if (b.length >= 4 && b[0] === 0xff && ((b[1] as number) & 0xe0) === 0xe0 && ((b[1] as number) & 0x06) !== 0) return 'mp3';
  return null;
}

export interface AudioValidation {
  ok: boolean;
  errors: string[];
  kind?: AudioKind;
  mimeType?: SampleMime;
  extension?: 'mp3' | 'wav';
  fileName: string;
}

/** Nome seguro para exibição e armazenamento: sem caminhos, sem caracteres de controle. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'audio';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim().slice(-100);
  return cleaned || 'audio';
}

export function validateAudioFile(file: AudioFileInput): AudioValidation {
  const fileName = safeFileName(file.fileName);
  const errors: string[] = [];
  const ext = /\.(mp3|wav)$/i.exec(fileName)?.[1]?.toLowerCase() as 'mp3' | 'wav' | undefined;
  if (!ext) errors.push('Envie um arquivo .mp3 ou .wav.');
  if (file.bytes.length === 0) errors.push('O arquivo está vazio.');
  if (file.bytes.length > SAMPLE_MAX_BYTES) errors.push(`O arquivo passa do limite de ${SAMPLE_MAX_BYTES / 1024 / 1024} MB.`);
  const kind = file.bytes.length > 0 ? sniffAudio(file.bytes) : null;
  if (file.bytes.length > 0 && !kind) errors.push('O conteúdo não parece ser um áudio MP3 ou WAV válido.');
  if (kind && ext && kind !== ext) errors.push(`A extensão .${ext} não corresponde ao conteúdo do arquivo (${kind.toUpperCase()}).`);
  const declared = file.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const mimeOk = !declared || declared === 'application/octet-stream' || /^audio\/(mpeg|mp3|wav|x-wav|wave|vnd\.wave)$/.test(declared);
  if (!mimeOk) errors.push('Tipo de arquivo não aceito. Use MP3 ou WAV.');
  const final = kind ?? ext;
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    kind: kind ?? undefined,
    extension: final,
    mimeType: final === 'wav' ? 'audio/wav' : final === 'mp3' ? 'audio/mpeg' : undefined,
    fileName,
  };
}

/** WAV mono 16-bit sintético (tom senoidal). Usado só nos dados do modo DEMO. */
export function makeToneWav(freq: number, seconds = 1, sampleRate = 8000): Uint8Array {
  const n = Math.floor(sampleRate * seconds);
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / 400, (n - i) / 400);
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 9000 * fade), true);
  }
  return out;
}

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
