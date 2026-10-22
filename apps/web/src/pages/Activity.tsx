import { can } from '@soul/shared';
import { Empty, ErrorBox, Loading, Panel } from '../components/ui.js';
import { useApp } from '../lib/app-context.js';
import { actionLabel, fmtDateTime } from '../lib/format.js';
import { useAsync } from '../lib/useAsync.js';

export function Activity() {
  const { repo, actor, version } = useApp();
  const allowed = can(actor.role, 'audit.read');
  const logs = useAsync(() => (allowed ? repo.listAudit(actor) : Promise.resolve([])), [repo, actor, version, allowed]);
  if (!allowed) return <ErrorBox message="Somente administradores acessam o histórico de atividade." />;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Atividade administrativa</h1>
        <p className="text-sm text-ink-soft">Registro das ações relevantes. Guarda quais campos mudaram, nunca os valores pessoais.</p>
      </div>
      <Panel>
        {logs.loading && !logs.data ? <Loading /> : logs.error ? <ErrorBox message={logs.error} /> : logs.data?.length === 0 ? <Empty>Nenhuma atividade registrada.</Empty> : (
          <ul className="divide-y divide-line">
            {logs.data?.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span><span className="font-medium">{actionLabel(l.action)}</span> <span className="text-ink-soft">por {l.actorName}</span>
                  {Array.isArray(l.details?.changed) && <span className="text-ink-soft"> · campos: {(l.details.changed as string[]).join(', ')}</span>}</span>
                <span className="tabular text-xs text-ink-soft">{fmtDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
