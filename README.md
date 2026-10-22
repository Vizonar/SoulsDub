# Soul Dublers — Cadastro e Classificação de Dubladores

Sistema para a comunidade **Soul Dublers** (Discord): ficha do dublador preenchida no próprio Discord, painel
administrativo web, avaliação com histórico, **amostras de voz em MP3/WAV** e banco de dados no Supabase.

> **Estado atual:** funciona por completo em **modo DEMO** (24 dubladores fictícios, sem nenhuma credencial).
> O bot e a integração com Supabase estão implementados e testados, mas **ainda não foram executados contra um servidor
> Discord nem um projeto Supabase reais** — isso depende das suas credenciais (veja [docs/DISCORD.md](docs/DISCORD.md) e
> [docs/SUPABASE.md](docs/SUPABASE.md)).

```
apps/web/            Painel (React + TypeScript + Vite + Tailwind)
apps/bot/            Bot (Node + TypeScript + discord.js)
packages/shared/     Regras compartilhadas: schemas Zod, filtros, permissões, repositórios, dados DEMO
supabase/migrations/ Tabelas, RLS, funções e Storage
supabase/seed.sql    Dados de referência + exemplo de criação do 1º administrador
docs/                Decisões técnicas, Supabase e Discord passo a passo
```

## 1. Pré-requisitos
- Windows 10/11 (também roda em macOS/Linux).
- [Node.js](https://nodejs.org) **20 ou superior** (LTS) — inclui o npm.
- Para produção: conta no [Supabase](https://supabase.com) e uma aplicação no [Discord Developer Portal](https://discord.com/developers/applications).

## 2. Instalação
No PowerShell, dentro da pasta do projeto:
```powershell
.\scripts\setup.ps1     # confere o Node, cria o .env e roda npm install
# ou manualmente:
copy .env.example .env
npm install
```
Se o PowerShell bloquear scripts: `Set-ExecutionPolicy -Scope Process Bypass` e rode de novo.

## 3. Painel em modo DEMO (sem credenciais)
```powershell
npm run dev
```
Abre em http://localhost:5173 com `VITE_APP_MODE=demo`. Você pode:
- ver o dashboard, buscar, combinar filtros, ordenar e paginar;
- abrir a ficha completa, editar, **alterar classificação**, registrar avaliações e observações, ver o histórico;
- **ouvir e enviar amostras de voz** (os demos trazem tons sintéticos; envie um .mp3/.wav seu para testar);
- alternar entre **Administrador** e **Avaliador** (menu “Testar como”) para ver as permissões.

O modo DEMO é sinalizado por uma faixa fixa no topo, vive só em memória e **volta ao início ao recarregar**. Nunca acessa
Supabase nem Discord (há testes automáticos para isso).

## 4–6. Supabase, migrations e primeiro administrador
Passo a passo completo em **[docs/SUPABASE.md](docs/SUPABASE.md)** (criar projeto, `supabase db push` ou colar o SQL,
criar o usuário, inserir o primeiro administrador, preencher o `.env`). Resumo do `.env` para produção:
```
VITE_APP_MODE=production
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon/publishable>   # a única chave que vai ao navegador
```
Se faltar algo, o painel **não** volta para o demo em silêncio: mostra o que está faltando. Ele também recusa uma chave
privilegiada (service role / `sb_secret_`) colocada por engano em `VITE_SUPABASE_ANON_KEY`.

## 7–10. Bot do Discord
Passo a passo em **[docs/DISCORD.md](docs/DISCORD.md)**: criar a aplicação, convidar o bot, permissões, registrar os comandos e
rodar. Resumo:
```powershell
npm run bot:register    # registra /ficha-dublador e /sample-voz
npm run dev:bot         # desenvolvimento
npm run build; node apps/bot/dist/index.js   # produção
```
Sem token, `npm run dev:bot` apenas explica o que falta e encerra — tudo o mais continua funcionando.

**Como o candidato usa:**
1. Um administrador roda `/ficha-dublador` num canal; o bot publica uma mensagem com o botão **Preencher ficha**.
2. O candidato clica e preenche em 3 etapas (mensagem privada, só ele vê): modais para textos, menus para opções, botões
   Voltar/Avançar/Cancelar, **revisão antes do envio**. As respostas não se perdem ao navegar.
3. A ficha é salva no Supabase ligada ao ID do Discord (**uma ficha por pessoa**; reenviar atualiza a mesma ficha).
4. Para a amostra de voz: `/sample-voz arquivo:<mp3 ou wav> descricao:<opcional>`.
5. A **classificação oficial** nunca aparece no formulário: só administradores alteram, no painel.

## Amostras de voz (MP3/WAV)
- Até **10 MB** por arquivo e **5 por dublador** (limite validado no bot, no painel e no banco).
- O formato é conferido pelo **conteúdo** do arquivo (cabeçalho), não só pela extensão: um `.mp3` falso é recusado.
- Ficam num **bucket privado** do Supabase Storage. O painel toca por links assinados que expiram em 1 hora.
- Enviam: o próprio dublador (`/sample-voz`) e administradores (painel). Ouvem: administradores e avaliadores. Só
  administradores removem. Cada envio/remoção entra no log de atividade.
- ⚠️ WAV é grande: um WAV de 10 MB ocupa muito do armazenamento gratuito. Incentive MP3 (veja “Limites”).

## 11. Testes e verificação
```powershell
npm run check      # tipos + lint + testes + build (tudo)
npm test           # só os testes
```
Cobre: validação dos campos, navegação e persistência entre etapas, limites reais da API do Discord (≤5 campos por modal,
≤25 opções por menu, ≤5 linhas), duplicidade, atualização, filtros combinados, paginação, classificação e histórico,
permissões, isolamento do DEMO, áudio (conteúdo/tamanho/limites), CSV e interface do painel.
Os testes de banco aplicam as migrations num **Postgres real em memória (PGlite)** e verificam RLS, constraints, triggers
e políticas do Storage — mas com stubs do Supabase; **repita a verificação no seu projeto real** (docs/SUPABASE.md).

## 12–13. Deploy gratuito e limites
Confira sempre as páginas oficiais; planos gratuitos mudam. Valores abaixo conferidos em outubro/2026 em fontes
secundárias (algumas divergem entre si):

| Peça | Opção | Observações |
|---|---|---|
| Painel (estático) | Cloudflare Pages, Netlify, Vercel ou GitHub Pages | `npm run build -w apps/web` gera `apps/web/dist`. Defina `VITE_*` no painel do host. |
| Banco/Auth/Storage | Supabase Free | ~500 MB de banco, ~1 GB de arquivos (algumas fontes citam 500 MB), ~5 GB de tráfego/mês, 50 mil usuários ativos, 2 projetos. **O projeto pausa após 7 dias sem atividade** e precisa ser reativado manualmente. Sem backups diários. |
| Bot (24h) | PC/servidor próprio, VPS barata ou camada gratuita de nuvem com VM | O bot mantém conexão permanente: hospedagens “serverless” gratuitas não servem. Verifique a oferta atual antes de depender dela. |

Consequências práticas: (1) para uso real e contínuo, considere o plano pago do Supabase (a pausa derruba o painel e o
bot); (2) arquivos de áudio consomem o armazenamento rápido — com 100 dubladores × 5 WAVs de 10 MB passaria de 1 GB.

## Segurança em resumo
- Chave `service_role` e token do Discord só existem no `.env` do **bot** (ambiente privado). O painel só lê `VITE_*`
  (teste automático garante que o código do painel não referencia segredos).
- RLS em todas as tabelas; anônimos não leem nada; só admins/avaliadores cadastrados em `admin_users` acessam.
- Ninguém se promove: não há política de escrita em `admin_users`. O 1º admin é criado manualmente no SQL Editor.
- Classificação oficial só muda pela função `set_classification()` (admin), com histórico imutável. Há trigger que barra
  alteração direta, até para a service role.
- Observações internas ficam em tabela separada, nunca lidas pelo bot e nunca postadas em canais do Discord.
- O bot só avisa o canal de recrutamento com uma menção ao usuário, sem dados da ficha.
- CSV exportado neutraliza fórmulas (anti “CSV injection”) e nunca inclui observações internas.

## Limitações conhecidas (honestidade)
- Bot e Supabase **não foram testados contra serviços reais** por falta de credenciais; a lógica foi testada com
  repositórios em memória, objetos simulados do discord.js e Postgres local.
- Rascunhos do formulário ficam em memória do bot: se ele reiniciar durante o preenchimento, o candidato recomeça.
- O filtro de busca por nome no Supabase não ignora acentos (no demo ignora).
- Cada link de áudio expira em 1 h; recarregue a ficha para gerar outro.
- Não há ordenação/filtro por “tem amostra de voz” (a informação aparece na ficha).

Decisões técnicas: [docs/DECISOES.md](docs/DECISOES.md).
