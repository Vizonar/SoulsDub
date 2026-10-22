import {
  CLASSIFICATION_KEYS,
  INTENSITY_KEYS,
  SELF_LEVEL_KEYS,
  SPEECH_SPEED_KEYS,
  VOICE_TONE_KEYS,
  type ClassificationKey,
} from './constants.js';
import { MemoryRepository, type MemorySeed } from './repository.js';
import { makeToneWav } from './samples.js';
import type { Actor, AuditLogEntry, ClassificationHistoryEntry, Dubber, InternalNote, Review, VoiceSample } from './types.js';

/** Atores fictícios do modo DEMO. Não existem no Supabase. */
export const DEMO_ADMIN: Actor = { id: 'demo-admin', name: 'Admin Demo', role: 'admin' };
export const DEMO_REVIEWER: Actor = { id: 'demo-reviewer', name: 'Avaliadora Demo', role: 'reviewer' };

const NAMES = [
  'Aurora Eco', 'Dante Bravo', 'Mel Rouca', 'Théo Grave', 'Luma Faísca', 'Rafa Trovão', 'Bia Sussurro', 'Caio Marés',
  'Yumi Aguda', 'Nico Teatro', 'Sol Brasa', 'Zé do Eco', 'Lia Orvalho', 'Otto Rugido', 'Maya Cinzas', 'Gui Cometa',
  'Nara Véu', 'Beto Narrador', 'Íris Prisma', 'Ravi Tempestade', 'Tati Fagulha', 'Duda Lunar', 'Kenzo Noturno', 'Pietra Lâmina',
];
const PRONOUNS = ['ela/dela', 'ele/dele', 'elu/delu', undefined, 'ela/dela', 'ele/dele'];
const TYPES = [['feminina', 'adulta'], ['masculina', 'adulta'], ['neutra'], ['adolescente', 'feminina'], ['infantil'], ['masculina', 'adolescente'], ['feminina'], ['neutra', 'adulta']] as const;
const SPECIALTIES = ['personagens sérios', 'vilões', 'protagonistas', 'comédia', 'narração', 'personagens caricatos', 'criaturas', 'voz de robô', 'mentores'];
const AVAIL = [['noite'], ['manha', 'tarde'], ['fins_de_semana'], ['horarios_flexiveis'], ['tarde', 'noite'], [], ['manha'], ['noite', 'fins_de_semana']];
const INTERESTS = [['fan_dubs', 'animacoes'], ['jogos'], ['audiobooks', 'narracao'], ['parodias', 'videos'], ['animacoes', 'jogos', 'fan_dubs'], ['videos'], ['narracao'], ['jogos', 'parodias']];
const EXPERIENCE = [
  'Dublo por hobby há 1 ano em projetos pequenos da comunidade.',
  'Participei de 3 fan dubs e de um curso online de interpretação.',
  'Narro audiobooks independentes há 4 anos.',
  'Comecei agora e quero aprender com a equipe.',
  'Atuo em teatro amador e já dublei duas paródias.',
  'Trabalhei em projetos de jogos indie como voz de personagens secundários.',
];
const WANTED = ['Protagonistas de aventura.', 'Vilões carismáticos.', 'Personagens cômicos e exagerados.', 'Mentores e personagens serenos.', 'Qualquer papel que me desafie.'];
const DICTION = ['Dicção clara, às vezes acelero nas falas longas.', 'Sotaque carioca leve.', 'Articulação precisa.', 'Estou treinando trava-línguas.'];

const pick = <T,>(list: readonly T[], i: number): T => list[i % list.length] as T;
const daysAgo = (now: Date, d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

/** Gera 24 dubladores fictícios determinísticos, com histórico e avaliações de exemplo. */
export function createDemoSeed(now: Date = new Date()): MemorySeed {
  const dubbers: Dubber[] = NAMES.map((displayName, i) => {
    const classification: ClassificationKey = CLASSIFICATION_KEYS[[0, 0, 1, 2, 0, 1, 3, 0, 1, 2, 0, 4, 1, 0, 2, 3, 1, 0, 2, 4, 1, 0, 3, 2][i] as number] as ClassificationKey;
    const createdAt = daysAgo(now, 2 + i * 2.5);
    return {
      id: `demo-${String(i + 1).padStart(3, '0')}`,
      discordId: `99000000000000${String(i + 1).padStart(4, '0')}`,
      displayName,
      age: i % 5 === 4 ? undefined : 16 + ((i * 7) % 30),
      pronouns: pick(PRONOUNS, i),
      selfLevel: pick(SELF_LEVEL_KEYS, i + Math.floor(i / 4)),
      experience: pick(EXPERIENCE, i),
      voiceTone: pick(VOICE_TONE_KEYS, i * 3 + 1),
      voiceTypes: [...pick(TYPES, i)],
      intensity: pick(INTENSITY_KEYS, i + Math.floor(i / 3)),
      diction: pick(DICTION, i),
      speechSpeed: pick(SPEECH_SPEED_KEYS, i * 2 + Math.floor(i / 5)),
      specialties: [...new Set([pick(SPECIALTIES, i), pick(SPECIALTIES, i * 2 + 3)])],
      availability: [...pick(AVAIL, i)],
      interests: [...pick(INTERESTS, i * 3 + 1)],
      wantedCharacters: pick(WANTED, i),
      classification,
      isActive: i !== 5 && i !== 17,
      needsReview: i % 4 === 0 || i < 3,
      createdAt,
      updatedAt: daysAgo(now, 1 + i * 1.5),
    };
  });

  const reviews: Review[] = [];
  const history: ClassificationHistoryEntry[] = [];
  dubbers.forEach((d, i) => {
    const rank = CLASSIFICATION_KEYS.indexOf(d.classification);
    if (rank === 0) return;
    const previous = CLASSIFICATION_KEYS[rank - 1] as ClassificationKey;
    const reviewId = `demo-review-${i + 1}`;
    const createdAt = daysAgo(now, 1 + i);
    reviews.push({
      id: reviewId, dubberId: d.id, reviewerId: DEMO_ADMIN.id, reviewerName: DEMO_ADMIN.name,
      previousClassification: previous, newClassification: d.classification,
      criteria: [{ label: 'Interpretação', notes: 'Boa variação emocional (exemplo fictício).' }, { label: 'Qualidade de áudio' }],
      comments: 'Avaliação de exemplo do modo DEMO.', reason: 'Evolução observada nos últimos projetos (exemplo fictício).', createdAt,
    });
    history.push({
      id: `demo-history-${i + 1}`, dubberId: d.id, previousClassification: previous, newClassification: d.classification,
      reason: 'Evolução observada nos últimos projetos (exemplo fictício).', changedById: DEMO_ADMIN.id, changedByName: DEMO_ADMIN.name, reviewId, createdAt,
    });
  });

  const notes: InternalNote[] = [
    { id: 'demo-note-1', dubberId: 'demo-002', authorId: DEMO_REVIEWER.id, authorName: DEMO_REVIEWER.name, body: 'Observação interna fictícia: ótimo para vilões; revisar áudio com microfone novo.', createdAt: daysAgo(now, 3) },
  ];
  const audit: AuditLogEntry[] = [
    { id: 'demo-audit-1', actorId: null, actorName: 'Bot do Discord (demo)', action: 'dubber.created', entity: 'dubber', entityId: 'demo-001', createdAt: daysAgo(now, 2) },
  ];
  // Amostras de demonstração: tons sintéticos (não são vozes reais), só para testar o player e o upload.
  const samples = [1, 2, 4, 6, 9, 12, 19].flatMap((idx, n) =>
    [0, ...(n % 3 === 0 ? [1] : [])].map((k) => {
      const d = dubbers[idx] as Dubber;
      const bytes = makeToneWav(220 + idx * 25 + k * 110, 1.2);
      const meta: VoiceSample = {
        id: `demo-sample-${idx}-${k}`, dubberId: d.id, fileName: `sample-demo-${k + 1}.wav`, mimeType: 'audio/wav', sizeBytes: bytes.length,
        label: k === 0 ? 'Leitura neutra (tom sintético de exemplo)' : 'Cena dramática (tom sintético de exemplo)',
        source: k === 0 ? 'discord' : 'panel', uploadedByName: k === 0 ? d.displayName : DEMO_ADMIN.name, createdAt: daysAgo(now, 1 + idx),
      };
      return { meta, bytes };
    }),
  );
  return { dubbers, reviews, history, notes, audit, samples };
}

/** Cria um repositório DEMO novo e isolado (cada chamada tem seus próprios dados). */
export function createDemoRepository(now: Date = new Date()): MemoryRepository {
  return new MemoryRepository(createDemoSeed(now));
}
