import type { DubberFormInput } from './schemas.js';

export const validForm = (over: Partial<DubberFormInput> = {}): DubberFormInput => ({
  displayName: 'Teste Voz',
  age: 25,
  pronouns: 'ela/dela',
  selfLevel: 'intermediario',
  experience: 'Dublo há 2 anos.',
  voiceTone: 'medio',
  voiceTypes: ['feminina', 'adulta'],
  intensity: 'media',
  diction: 'Clara.',
  speechSpeed: 'moderada',
  specialties: ['Vilões', ' comédia '],
  availability: ['noite'],
  interests: ['fan_dubs'],
  wantedCharacters: 'Protagonistas',
  ...over,
});
