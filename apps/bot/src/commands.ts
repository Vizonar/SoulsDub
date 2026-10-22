import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const COMMAND_NAME = 'ficha-dublador';

export const fichaCommand = new SlashCommandBuilder()
  .setName(COMMAND_NAME)
  .setDescription('Publica a mensagem com o botão para preencher a ficha de dublador (somente administradores).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(0); // 0 = somente em servidores (GUILD)

export const SAMPLE_COMMAND_NAME = 'sample-voz';

export const sampleCommand = new SlashCommandBuilder()
  .setName(SAMPLE_COMMAND_NAME)
  .setDescription('Envia uma amostra da sua voz (MP3 ou WAV, até 10 MB) para a sua ficha de dublador.')
  .addAttachmentOption((o) => o.setName('arquivo').setDescription('Áudio .mp3 ou .wav').setRequired(true))
  .addStringOption((o) => o.setName('descricao').setDescription('Ex.: leitura neutra, cena dramática').setMaxLength(60))
  .setContexts(0);

export const commandsJson = () => [fichaCommand.toJSON(), sampleCommand.toJSON()];
