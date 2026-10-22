import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_PRESETS,
  INTENSITY_KEYS,
  INTENSITY_LABELS,
  INTEREST_LABELS,
  INTEREST_PRESETS,
  labelOf,
  SELF_LEVEL_KEYS,
  SELF_LEVEL_LABELS,
  SPEECH_SPEED_KEYS,
  SPEECH_SPEED_LABELS,
  VOICE_TONE_KEYS,
  VOICE_TONE_LABELS,
  VOICE_TYPE_KEYS,
  VOICE_TYPE_LABELS,
  type FormPolicy,
} from '@soul/shared';
import { IDS, type ModalName, type SelectField } from './ids.js';
import { STEP_ORDER, STEP_TITLES, validateStep, type Draft, type WizardSession } from './wizard.js';

const COLOR = 0x5b3fd1;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const list = (v: readonly string[] | undefined) => (v && v.length ? v.map(labelOf).join(', ') : '—');

export type Panel = { content?: string; embeds: EmbedBuilder[]; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] };

interface SelectSpec {
  field: SelectField;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
  min: number;
  max: number;
}

const opts = (keys: readonly string[], labels: Record<string, string>) => keys.map((k) => ({ value: k, label: labels[k] ?? k }));

function selectRow(spec: SelectSpec) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(IDS.select(spec.field))
    .setPlaceholder(clip(spec.placeholder, 150))
    .setMinValues(spec.min)
    .setMaxValues(spec.max)
    .addOptions(spec.options.slice(0, 25).map((o) => ({ label: clip(o.label, 100), value: o.value, default: spec.selected.includes(o.value) })));
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
}

const button = (id: string, label: string, style: ButtonStyle, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

function navRow(s: WizardSession, extra?: { id: string; label: string }) {
  const first = s.step === 'personal';
  const buttons: ButtonBuilder[] = [button(IDS.nav('back'), 'Voltar', ButtonStyle.Secondary, first)];
  if (extra) buttons.push(button(extra.id, extra.label, ButtonStyle.Primary));
  buttons.push(
    s.step === 'review' ? button(IDS.nav('submit'), 'Enviar ficha', ButtonStyle.Success) : button(IDS.nav('next'), 'Avançar', ButtonStyle.Success),
  );
  buttons.push(button(IDS.nav('cancel'), 'Cancelar', ButtonStyle.Danger));
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons);
}

export function summaryFields(d: Draft) {
  return [
    { name: 'Nome / Nick', value: clip(d.displayName || '—', 200) },
    { name: 'Idade · Pronomes', value: `${d.age ?? '—'} · ${d.pronouns || '—'}` },
    { name: 'Nível (autodeclarado)', value: d.selfLevel ? SELF_LEVEL_LABELS[d.selfLevel] : '—' },
    { name: 'Experiência', value: clip(d.experience || '—', 600) },
    { name: 'Tom · Intensidade · Fala', value: `${d.voiceTone ? VOICE_TONE_LABELS[d.voiceTone] : '—'} · ${d.intensity ? INTENSITY_LABELS[d.intensity] : '—'} · ${d.speechSpeed ? SPEECH_SPEED_LABELS[d.speechSpeed] : '—'}` },
    { name: 'Tipo de voz', value: list(d.voiceTypes) },
    { name: 'Dicção', value: clip(d.diction || '—', 300) },
    { name: 'Especialidades', value: clip(list(d.specialties), 500) },
    { name: 'Disponibilidade', value: clip(list(d.availability), 300) },
    { name: 'Projetos de interesse', value: clip(list(d.interests), 300) },
    { name: 'Personagens desejados', value: clip(d.wantedCharacters || '—', 600) },
  ];
}

/** Monta o painel (mensagem efêmera) da etapa atual, refletindo tudo o que já foi respondido. */
export function renderPanel(s: WizardSession, policy: FormPolicy): Panel {
  const i = STEP_ORDER.indexOf(s.step) + 1;
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`🎙️ Ficha do dublador — etapa ${i} de ${STEP_ORDER.length}`)
    .setFooter({ text: s.mode === 'update' ? 'Atualizando a ficha que você já enviou' : 'Suas respostas ficam salvas ao avançar e voltar' });
  const d = s.data;
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const status = (ok: boolean) => (ok ? '✅' : '⬜');
  const check = validateStep(d, s.step, policy);

  if (s.step === 'personal') {
    embed.setDescription(`**${STEP_TITLES.personal}**\nUse “Preencher dados” e escolha seu nível no menu.`).addFields(
      { name: `${status(!!d.displayName)} Nome / Nick`, value: d.displayName || '—', inline: true },
      { name: `${policy.requireAge ? status(d.age !== undefined) : '•'} Idade`, value: String(d.age ?? '—'), inline: true },
      { name: '• Pronomes', value: d.pronouns || '—', inline: true },
      { name: `${status(!!d.selfLevel)} Nível autodeclarado`, value: d.selfLevel ? SELF_LEVEL_LABELS[d.selfLevel] : '—', inline: true },
      { name: '• Experiência', value: clip(d.experience || '—', 500) },
    );
    rows.push(
      selectRow({ field: 'selfLevel', placeholder: 'Nível (como você se vê)', options: opts(SELF_LEVEL_KEYS, SELF_LEVEL_LABELS), selected: d.selfLevel ? [d.selfLevel] : [], min: 1, max: 1 }),
      navRow(s, { id: IDS.open('personal'), label: d.displayName ? 'Editar dados' : 'Preencher dados' }),
    );
  } else if (s.step === 'vocal') {
    embed.setDescription(`**${STEP_TITLES.vocal}**\nTipo de voz aceita mais de uma opção. Eles descrevem a voz para casting — não definem identidade de gênero.`).addFields(
      { name: '• Dicção', value: clip(d.diction || '—', 300) },
      { name: '• Especialidades', value: clip(list(d.specialties), 400) },
    );
    rows.push(
      selectRow({ field: 'voiceTone', placeholder: 'Tom de voz', options: opts(VOICE_TONE_KEYS, VOICE_TONE_LABELS), selected: d.voiceTone ? [d.voiceTone] : [], min: 1, max: 1 }),
      selectRow({ field: 'voiceTypes', placeholder: 'Tipo de voz (uma ou mais)', options: opts(VOICE_TYPE_KEYS, VOICE_TYPE_LABELS), selected: d.voiceTypes ?? [], min: 1, max: VOICE_TYPE_KEYS.length }),
      selectRow({ field: 'intensity', placeholder: 'Intensidade', options: opts(INTENSITY_KEYS, INTENSITY_LABELS), selected: d.intensity ? [d.intensity] : [], min: 1, max: 1 }),
      selectRow({ field: 'speechSpeed', placeholder: 'Velocidade de fala', options: opts(SPEECH_SPEED_KEYS, SPEECH_SPEED_LABELS), selected: d.speechSpeed ? [d.speechSpeed] : [], min: 1, max: 1 }),
      navRow(s, { id: IDS.open('vocal'), label: 'Dicção e especialidades' }),
    );
  } else if (s.step === 'availability') {
    embed.setDescription(`**${STEP_TITLES.availability}**\nTudo aqui é opcional. Use o botão para incluir itens que não estão nos menus.`).addFields(
      { name: '• Disponibilidade', value: clip(list(d.availability), 400) },
      { name: '• Projetos de interesse', value: clip(list(d.interests), 400) },
      { name: '• Personagens que gostaria de interpretar', value: clip(d.wantedCharacters || '—', 500) },
    );
    rows.push(
      selectRow({ field: 'availability', placeholder: 'Disponibilidade (opcional)', options: opts(AVAILABILITY_PRESETS, AVAILABILITY_LABELS), selected: d.availability ?? [], min: 0, max: AVAILABILITY_PRESETS.length }),
      selectRow({ field: 'interests', placeholder: 'Projetos de interesse (opcional)', options: opts(INTEREST_PRESETS, INTEREST_LABELS), selected: d.interests ?? [], min: 0, max: INTEREST_PRESETS.length }),
      navRow(s, { id: IDS.open('availability'), label: 'Personagens e outros' }),
    );
  } else {
    embed.setDescription(`**${STEP_TITLES.review}**\nConfira tudo. Sua classificação oficial é definida pela equipe — não por este formulário.`).addFields(summaryFields(d));
    rows.push(navRow(s));
  }

  const problems = s.errors.length ? s.errors : [];
  if (problems.length) embed.addFields({ name: '⚠️ Corrija antes de continuar', value: clip(problems.map((e) => `• ${e}`).join('\n'), 1000) });
  else if (!check.ok && s.step === 'review') embed.addFields({ name: '⚠️ Ficha incompleta', value: clip(check.errors.map((e) => `• ${e}`).join('\n'), 1000) });
  return { embeds: [embed], components: rows };
}

// ---------------------------------------------------------------- modais (máximo de 5 campos de texto)
function input(id: string, label: string, style: TextInputStyle, opt: { required?: boolean; max: number; value?: string; placeholder?: string }) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(clip(label, 45)).setStyle(style).setRequired(opt.required ?? false).setMaxLength(opt.max);
  if (opt.placeholder) t.setPlaceholder(clip(opt.placeholder, 100));
  if (opt.value) t.setValue(clip(opt.value, opt.max));
  return new ActionRowBuilder<TextInputBuilder>().addComponents(t);
}

export function renderModal(name: ModalName, d: Draft, policy: FormPolicy): ModalBuilder {
  const S = TextInputStyle.Short;
  const P = TextInputStyle.Paragraph;
  const modal = new ModalBuilder().setCustomId(IDS.modal(name));
  if (name === 'personal') {
    return modal.setTitle('Informações pessoais').addComponents(
      input('displayName', 'Nome / Nick', S, { required: true, max: 64, value: d.displayName }),
      input('age', policy.requireAge ? 'Idade' : 'Idade (opcional)', S, { required: policy.requireAge, max: 3, value: d.age?.toString(), placeholder: 'Apenas números' }),
      input('pronouns', 'Pronomes (opcional)', S, { max: 40, value: d.pronouns, placeholder: 'Ex.: ela/dela, ele/dele, elu/delu' }),
      input('experience', 'Experiência (opcional)', P, { max: 2000, value: d.experience, placeholder: 'Projetos anteriores, tempo de experiência, cursos…' }),
    );
  }
  if (name === 'vocal') {
    return modal.setTitle('Dicção e especialidades').addComponents(
      input('diction', 'Dicção (opcional)', S, { max: 500, value: d.diction, placeholder: 'Autodescrição ou observações' }),
      input('specialties', 'Especialidades (opcional)', P, {
        max: 1000, value: d.specialties?.join(', '), placeholder: 'Separe por vírgula: personagens sérios, vilões, comédia… Pode criar novas.',
      }),
    );
  }
  const customs = (cur: string[] | undefined, presets: readonly string[]) => (cur ?? []).filter((t) => !presets.includes(t)).join(', ');
  return modal.setTitle('Personagens e outros').addComponents(
    input('wantedCharacters', 'Personagens que gostaria de interpretar', P, { max: 2000, value: d.wantedCharacters, placeholder: 'Personagens, tipos de papel e estilos desejados' }),
    input('extraAvailability', 'Outras disponibilidades (opcional)', S, { max: 200, value: customs(d.availability, AVAILABILITY_PRESETS), placeholder: 'Separe por vírgula' }),
    input('extraInterests', 'Outros projetos de interesse (opcional)', S, { max: 200, value: customs(d.interests, INTEREST_PRESETS), placeholder: 'Separe por vírgula' }),
  );
}

// ---------------------------------------------------------------- mensagens fixas
export function renderStartMessage(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎙️ Ficha do dublador — Soul Dublers')
    .setDescription(
      'Clique em **Preencher ficha** para se cadastrar. O formulário abre só para você e tem 3 etapas, com revisão antes do envio.\n' +
        'Se já enviou uma ficha, o mesmo botão permite atualizá-la (conforme as regras da comunidade).',
    );
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button(IDS.start, 'Preencher ficha', ButtonStyle.Primary));
  return { embeds: [embed], components: [row] };
}

export const plain = (content: string) => ({ content, embeds: [] as EmbedBuilder[], components: [] as ActionRowBuilder<MessageActionRowComponentBuilder>[] });
