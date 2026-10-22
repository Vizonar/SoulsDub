# Decisões técnicas

| Tema | Decisão | Motivo |
|---|---|---|
| Estrutura | Monorepo npm workspaces (`apps/*`, `packages/*`) | Regras (schemas, filtros, permissões) escritas uma vez e usadas por bot, painel e testes. |
| Backend do painel | Sem servidor próprio: painel → Supabase direto, protegido por RLS e funções SQL | Menos peças gratuitas para manter; a segurança fica no banco. |
| Repositório | Interface `DubberRepository` com 2 implementações (`MemoryRepository`, `SupabaseRepository`) | Modo DEMO e testes usam a mesma lógica de produção; demo isolado por construção (nunca cria cliente Supabase). |
| Listas curtas | `text[]` + índices GIN (tipos de voz, especialidades, disponibilidade, interesses) | Mais simples que tabelas de junção; cobre filtros “contém”. Especialidades/categorias novas são texto livre normalizado (minúsculas). |
| Classificação | Tabela `classifications` + FK; muda só por `set_classification()`; trigger barra UPDATE direto | “Somente administradores alteram” garantido no banco, não só na tela. |
| Nível autodeclarado × oficial | Colunas separadas; formulário não tem campo de classificação (testado) | Requisito de independência. |
| Avaliação | Critérios em texto livre, sem pontuação automática; classificação sempre manual | Pedido explícito: não inventar critérios. |
| Avaliador × admin | Avaliador: lê, avalia (sem mudar classificação), anota. Admin: tudo | Separação de permissões. |
| Observações internas | Tabela própria | O bot (service role) nunca precisa lê-las; reduz risco de vazamento. |
| Histórico/auditoria | Append-only por trigger; auditoria guarda só nomes de colunas alteradas | Rastreabilidade sem copiar dados pessoais. |
| Idade | Opcional (`FORM_REQUIRE_AGE`), 1–120, sem restrição etária | Política da comunidade decide. |
| Pronomes | Texto livre | Permite qualquer preferência. |
| Tipo de voz | Descritor de casting, multi-seleção, documentado como não inferindo gênero | Requisito. |
| “Disponível para projetos” | Ativo + ao menos uma disponibilidade informada | Definição simples e transparente. |
| Formulário Discord | Painel efêmero por etapa: selects para opções, modais (≤5 campos) para textos | Limites da API; respostas persistem em rascunho por usuário (30 min). |
| Amostras de voz | Bucket privado + tabela de metadados; validação por conteúdo; 10 MB; 5 por dublador; links assinados de 1 h | Segurança (arquivo falso/renomeado), custo (armazenamento gratuito pequeno) e privacidade (voz é dado pessoal). |
| Envio de áudio no Discord | Comando `/sample-voz` com opção de anexo (não modal) | Modais não aceitam arquivos de forma confiável; anexo de slash command é nativo. Só baixa do CDN do Discord (anti-SSRF) e com limite de frequência. |
| Bundle do painel | Um chunk (~630 kB, ~180 kB gzip) | Suficiente para uso interno; pode-se dividir com import dinâmico depois. |
