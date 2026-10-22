import {
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import {
  AVAILABILITY_PRESETS,
  INTENSITY_KEYS,
  INTEREST_PRESETS,
  SELF_LEVEL_KEYS,
  SPEECH_SPEED_KEYS,
  VOICE_TONE_KEYS,
  VOICE_TYPE_KEYS,
  type DubberRepository,
} from '@soul/shared';
import { COMMAND_NAME, SAMPLE_COMMAND_NAME } from './commands.js';
import { processSampleUpload } from './sample-upload.js';
import { isAuthorizedAdmin, type BotConfig } from './config.js';
import { parseCustomId, type SelectField } from './wizard/ids.js';
import { plain, renderModal, renderPanel, renderStartMessage } from './wizard/render.js';
import {
  advance,
  applySelect,
  createSession,
  goBack,
  applyPatch,
  parseAvailabilityModal,
  parsePersonalModal,
  parseVocalModal,
  submitSession,
  type SessionStore,
  type WizardSession,
} from './wizard/wizard.js';

export interface Ctx {
  repo: DubberRepository;
  store: SessionStore;
  config: BotConfig;
  client?: Client;
  now?: () => number;
  /** Último envio de áudio por usuário (limite de frequência). */
  lastUpload?: Map<string, number>;
}

const EPHEMERAL = MessageFlags.Ephemeral;
const ALLOWED: Record<SelectField, readonly string[]> = {
  selfLevel: SELF_LEVEL_KEYS,
  voiceTone: VOICE_TONE_KEYS,
  voiceTypes: VOICE_TYPE_KEYS,
  intensity: INTENSITY_KEYS,
  speechSpeed: SPEECH_SPEED_KEYS,
  availability: AVAILABILITY_PRESETS,
  interests: INTEREST_PRESETS,
};
const EXPIRED = 'Sua sessão de preenchimento expirou (30 min sem atividade). Clique em **Preencher ficha** novamente.';

const t = (ctx: Ctx) => (ctx.now ?? Date.now)();

/** Roteia qualquer interação. Erros inesperados viram mensagem privada, nunca derrubam o bot. */
export async function routeInteraction(i: Interaction, ctx: Ctx): Promise<void> {
  try {
    if (i.isChatInputCommand() && i.commandName === COMMAND_NAME) return await onCommand(i, ctx);
    if (i.isChatInputCommand() && i.commandName === SAMPLE_COMMAND_NAME) return await onSample(i, ctx);
    if (i.isButton()) return await onButton(i, ctx);
    if (i.isStringSelectMenu()) return await onSelect(i, ctx);
    if (i.isModalSubmit()) return await onModal(i, ctx);
  } catch (err) {
    console.error('[bot] erro ao tratar interação:', err);
    const msg = plain('Algo deu errado ao processar sua ação. Tente novamente em instantes.');
    try {
      if (i.isRepliable()) {
        if (i.replied || i.deferred) await i.followUp({ ...msg, flags: EPHEMERAL });
        else await i.reply({ ...msg, flags: EPHEMERAL });
      }
    } catch {
      /* sem o que fazer */
    }
  }
}

const uploads = new Map<string, number>();

async function onSample(i: ChatInputCommandInteraction, ctx: Ctx) {
  await i.deferReply({ flags: EPHEMERAL });
  const att = i.options.getAttachment('arquivo', true);
  const label = i.options.getString('descricao') ?? undefined;
  const r = await processSampleUpload(
    { repo: ctx.repo, lastUpload: ctx.lastUpload ?? uploads, now: t(ctx) },
    i.user.id,
    { name: att.name, contentType: att.contentType, size: att.size, url: att.url },
    label,
  );
  await i.editReply(r.message);
}

async function onCommand(i: ChatInputCommandInteraction, ctx: Ctx) {
  const m = i.member;
  const roleIds = m && 'cache' in m.roles ? [...m.roles.cache.keys()] : Array.isArray(m?.roles) ? m.roles : [];
  const isAdministrator = i.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (!isAuthorizedAdmin({ isAdministrator, roleIds }, ctx.config.adminRoleIds)) {
    return void (await i.reply({ ...plain('Apenas administradores autorizados podem publicar a ficha.'), flags: EPHEMERAL }));
  }
  if (!i.channel || !('send' in i.channel)) {
    return void (await i.reply({ ...plain('Não consigo publicar neste canal.'), flags: EPHEMERAL }));
  }
  try {
    await i.channel.send(renderStartMessage());
  } catch {
    return void (await i.reply({ ...plain('Não tenho permissão para enviar mensagens neste canal. Verifique as permissões do bot.'), flags: EPHEMERAL }));
  }
  await i.reply({ ...plain('Mensagem publicada. Os candidatos já podem preencher a ficha.'), flags: EPHEMERAL });
}

async function onButton(i: ButtonInteraction, ctx: Ctx) {
  const id = parseCustomId(i.customId);
  const now = t(ctx);
  if (id.kind === 'start') {
    const existing = await ctx.repo.findByDiscordId(i.user.id);
    if (existing && !ctx.config.rules.allowUpdates) {
      return void (await i.reply({ ...plain('Você já enviou sua ficha e, no momento, atualizações estão desativadas. Fale com a equipe.'), flags: EPHEMERAL }));
    }
    const session = createSession(i.user.id, now, existing);
    ctx.store.set(session);
    return void (await i.reply({ ...renderPanel(session, ctx.config.policy), flags: EPHEMERAL }));
  }

  const session = ctx.store.get(i.user.id, now);
  if (id.kind === 'unknown') return;
  if (!session) return void (await i.update(plain(EXPIRED)));

  if (id.kind === 'open') {
    return void (await i.showModal(renderModal(id.modal, session.data, ctx.config.policy)));
  }
  if (id.kind !== 'nav') return;

  switch (id.action) {
    case 'cancel':
      ctx.store.delete(i.user.id);
      return void (await i.update(plain('Cadastro cancelado. Nada foi salvo. Você pode recomeçar quando quiser.')));
    case 'back':
      return void (await update(i, ctx, goBack(session, now)));
    case 'next':
      return void (await update(i, ctx, advance(session, ctx.config.policy, now)));
    case 'submit': {
      const outcome = await submitSession(ctx.repo, session, ctx.config.rules, ctx.config.policy);
      if (outcome.status === 'invalid') return void (await update(i, ctx, { ...session, errors: outcome.errors }));
      if (outcome.status === 'blocked') {
        const when = outcome.retryAt ? ` Tente novamente após ${new Date(outcome.retryAt).toLocaleString('pt-BR')}.` : '';
        const why = outcome.reason === 'cooldown' ? 'Você atualizou sua ficha há pouco tempo.' : 'Atualizações estão desativadas.';
        return void (await i.update(plain(`${why}${when} Seu rascunho foi mantido por 30 minutos.`)));
      }
      ctx.store.delete(i.user.id);
      await i.update(plain(outcome.status === 'created' ? '✅ Ficha enviada! A equipe vai analisá-la e definir sua classificação oficial.\n🎧 Quer anexar uma amostra da sua voz? Use `/sample-voz` com um arquivo MP3 ou WAV.' : '✅ Ficha atualizada! A equipe será avisada para revisá-la.'));
      await notifyStaff(i, ctx, outcome.status);
    }
  }
}

async function update(i: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, ctx: Ctx, s: WizardSession) {
  ctx.store.set(s);
  const panel = renderPanel(s, ctx.config.policy);
  if (i.isModalSubmit() && !i.isFromMessage()) return i.reply({ ...panel, flags: EPHEMERAL });
  return i.update(panel);
}

async function onSelect(i: StringSelectMenuInteraction, ctx: Ctx) {
  const id = parseCustomId(i.customId);
  if (id.kind !== 'select') return;
  const now = t(ctx);
  const session = ctx.store.get(i.user.id, now);
  if (!session) return void (await i.update(plain(EXPIRED)));
  await update(i, ctx, applySelect(session, id.field, i.values, ALLOWED[id.field], now));
}

async function onModal(i: ModalSubmitInteraction, ctx: Ctx) {
  const id = parseCustomId(i.customId);
  if (id.kind !== 'modal') return;
  const now = t(ctx);
  const session = ctx.store.get(i.user.id, now);
  if (!session) return void (await i.reply({ ...plain(EXPIRED), flags: EPHEMERAL }));
  const get = (k: string) => {
    try {
      return i.fields.getTextInputValue(k);
    } catch {
      return '';
    }
  };
  const parsed =
    id.modal === 'personal'
      ? parsePersonalModal({ displayName: get('displayName'), age: get('age'), pronouns: get('pronouns'), experience: get('experience') })
      : id.modal === 'vocal'
        ? parseVocalModal({ diction: get('diction'), specialties: get('specialties') })
        : parseAvailabilityModal({ wantedCharacters: get('wantedCharacters'), extraAvailability: get('extraAvailability'), extraInterests: get('extraInterests') }, session.data);
  const next = applyPatch(session, parsed.patch, now);
  await update(i, ctx, parsed.errors.length ? { ...next, errors: parsed.errors } : next);
}

/** Aviso mínimo à equipe: sem dados pessoais da ficha, apenas a menção ao usuário. */
async function notifyStaff(i: ButtonInteraction, ctx: Ctx, status: 'created' | 'updated') {
  const id = ctx.config.recruitmentChannelId;
  if (!id || !ctx.client) return;
  try {
    const ch = await ctx.client.channels.fetch(id);
    if (ch && 'send' in ch) await ch.send({ content: `📥 Ficha ${status === 'created' ? 'nova' : 'atualizada'} de <@${i.user.id}>. Abra o painel para revisar.`, allowedMentions: { parse: [] } });
  } catch (err) {
    console.warn('[bot] não foi possível avisar o canal de recrutamento:', err);
  }
}
