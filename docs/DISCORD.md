# Configurar o bot no Discord

> O bot foi testado com objetos simulados, não com um servidor real (o acesso ainda não existia). Faça o teste de
> ponta a ponta abaixo assim que tiver o servidor.

## 1. Criar a aplicação
1. https://discord.com/developers/applications → **New Application**.
2. **Bot → Reset Token**: copie para `DISCORD_TOKEN` (segredo!). Não precisa de nenhum *Privileged Intent* — o bot usa só
   o intent `Guilds`.
3. **General Information → Application ID** → `DISCORD_CLIENT_ID`.
4. No Discord, ative **Modo desenvolvedor** (Configurações → Avançado) e copie o **ID do servidor** → `DISCORD_GUILD_ID`.
   Opcional: ID do canal da equipe → `DISCORD_RECRUITMENT_CHANNEL_ID`; IDs de cargos de staff (separados por vírgula) →
   `DISCORD_ADMIN_ROLE_IDS`.

## 2. Convidar o bot
**OAuth2 → URL Generator**: escopos `bot` e `applications.commands`; permissões: *View Channels*, *Send Messages*,
*Embed Links*. (Só isso.) Abra a URL e escolha o servidor.

## 3. Registrar os comandos e iniciar
```powershell
npm run bot:register     # /ficha-dublador e /sample-voz (no servidor definido em DISCORD_GUILD_ID: aparece na hora)
npm run dev:bot
```
Sem `DISCORD_GUILD_ID` os comandos ficam globais (podem levar até 1 h).

## 4. Permissões
- `/ficha-dublador`: o Discord só o mostra a quem tem *Gerenciar Servidor* e, além disso, o bot **verifica** a permissão
  *Administrador* ou um cargo de `DISCORD_ADMIN_ROLE_IDS`. Em **Configurações do servidor → Integrações → bot** você pode
  ajustar quem vê o comando.
- `/sample-voz`: qualquer membro; só funciona para quem já tem ficha.

## 5. Teste de ponta a ponta
1. Rode `/ficha-dublador` num canal → deve aparecer a mensagem com “Preencher ficha”.
2. Clique, preencha as 3 etapas, volte e avance (as respostas devem permanecer), revise e envie.
3. Confirme no painel que a ficha apareceu e que a classificação é NOVATO.
4. Clique de novo em “Preencher ficha”: deve vir pré-preenchido (atualização, não duplicata).
5. `/sample-voz` com um .wav/.mp3: deve aparecer na ficha, tocável pelo painel.

## Observações
- O bot só avisa o canal da equipe com uma menção, nunca com dados da ficha.
- Rascunhos ficam na memória do bot por 30 min de inatividade.
- Regras opcionais no `.env`: `FORM_REQUIRE_AGE`, `FORM_ALLOW_UPDATES`, `FORM_UPDATE_COOLDOWN_HOURS`.
- `BOT_STORAGE=memory` roda o bot sem Supabase (só para testes locais; nada é gravado).
