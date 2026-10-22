import { Link } from 'react-router-dom';
import { CLASSIFICATION_LABELS, computeStats } from '@soul/shared';
import { ClassBadge, Empty, ErrorBox, Loading, Panel } from '../components/ui.js';
import { useApp } from '../lib/app-context.js';
import { fmtDateTime } from '../lib/format.js';
import { useAsync } from '../lib/useAsync.js';

export function Reviews() {
  const { repo, actor, version } = useApp();
  const reviews = useAsync(() => repo.listReviews(actor), [repo, actor, version]);
  const all = useAsync(() => repo.listAll(actor), [repo, actor, version]);
  const pending = computeStats(all.data ?? []).needsReview;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avaliações</h1>
        <p className="text-sm text-ink-soft">A classificação é sempre decidida manualmente pela equipe. Não há pontuação automática. Para registrar uma avaliação, abra a ficha do dublador.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Panel title="Avaliações registradas">
          {reviews.loading && !reviews.data ? <Loading /> : reviews.error ? <ErrorBox message={reviews.error} /> : reviews.data?.length === 0 ? <Empty>Nenhuma avaliação registrada ainda.</Empty> : (
            <ul className="divide-y divide-line">
              {reviews.data?.map((r) => (
                <li key={r.id} className="space-y-1 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-medium hover:text-soul" to={`/dubladores/${r.dubberId}`}>{r.dubberName}</Link>
                    {r.previousClassification === r.newClassification ? <span className="text-ink-soft">manteve <ClassBadge value={r.newClassification} /></span> : (
                      <span className="flex items-center gap-1.5"><ClassBadge value={r.previousClassification} /><span aria-label="para">→</span><ClassBadge value={r.newClassification} /></span>
                    )}
                  </div>
                  <p className="text-xs text-ink-soft">{fmtDateTime(r.createdAt)} · {r.reviewerName}{r.criteria.length ? ` · critérios: ${r.criteria.map((c) => c.label).join(', ')}` : ''}</p>
                  {r.comments && <p>{r.comments}</p>}
                  {r.reason && r.previousClassification !== r.newClassification && <p className="text-ink-soft">Motivo: {r.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Aguardando revisão (${pending.length})`}>
          {pending.length === 0 ? <Empty>Nenhuma ficha pendente.</Empty> : (
            <ul className="divide-y divide-line">
              {pending.map((d) => (
                <li key={d.id}><Link to={`/dubladores/${d.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-soul"><span className="truncate font-medium">{d.displayName}</span><span title={CLASSIFICATION_LABELS[d.classification]}><ClassBadge value={d.classification} /></span></Link></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
