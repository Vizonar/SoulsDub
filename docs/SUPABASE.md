# Configurar o Supabase

> Este passo a passo **não foi executado contra um projeto real** por falta de credenciais; os testes automáticos validam as
> migrations em Postgres local. Siga na ordem e confira cada etapa.

## 1. Criar o projeto
1. Em https://supabase.com, crie um projeto (guarde a senha do banco).
2. Em **Project Settings → API** anote: **Project URL**, chave **anon/publishable** (vai para o painel) e chave
   **service_role/secret** (vai **somente** para o bot — nunca para o navegador, nunca para o Git).

## 2. Rodar as migrations (não destrutivas)
As migrations só **criam** objetos; não apagam dados. Não rode nada em um banco que já tenha tabelas com esses nomes sem revisar.

**Opção A — SQL Editor (mais simples):** abra `supabase/migrations/20261021000001_init.sql`, cole no **SQL Editor** e execute;
depois faça o mesmo com `20261021000002_voice_samples.sql`.

**Opção B — CLI:**
```powershell
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push        # revise o que será aplicado antes de confirmar
```

## 3. Criar o primeiro administrador
1. **Authentication → Users → Add user**: e-mail e senha (marque “Auto Confirm User”). Desative cadastros públicos em
   **Authentication → Providers → Email → Allow new users to sign up** (só você cria usuários).
2. Copie o **UID** do usuário e rode no SQL Editor:
```sql
insert into public.admin_users (user_id, display_name, role)
values ('<UID>', 'Seu Nome', 'admin');   -- use 'reviewer' para avaliadores
```
Novos admins/avaliadores seguem o mesmo caminho (criar usuário + inserir em `admin_users`).

## 4. Conferir (5 minutos)
- **Storage**: deve existir o bucket `voice-samples`, **privado**.
- **Table Editor**: todas as tabelas com o cadeado de RLS ativo.
- Entre no painel (`VITE_APP_MODE=production`) com o admin: dashboard vazio, sem erros.
- Entre com um usuário que **não** está em `admin_users`: deve ver “Sem acesso”.

## 5. Variáveis
```
# painel (navegador)
VITE_APP_MODE=production
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...     # anon/publishable
# bot (privado)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...  # service_role/secret
```

## Modelo e regras (resumo)
- `dubbers` (ficha), `classifications`, `dubber_classification_history`, `dubber_reviews`, `dubber_internal_notes`,
  `dubber_voice_samples`, `admin_users`, `audit_logs`.
- Admin: tudo. Avaliador: lê fichas e amostras, registra avaliações (sem mudar classificação) e observações.
- Histórico, avaliações e auditoria são imutáveis (triggers).
- Funções `SECURITY DEFINER` têm `search_path` vazio e `EXECUTE` só para `authenticated`.
