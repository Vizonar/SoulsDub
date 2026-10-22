import { Link } from 'react-router-dom';
import {
  CLASSIFICATION_KEYS, CLASSIFICATION_LABELS, SELF_LEVEL_KEYS, SELF_LEVEL_LABELS, VOICE_TONE_KEYS, VOICE_TONE_LABELS,
  VOICE_TYPE_KEYS, VOICE_TYPE_LABELS, computeStats, type DashboardStats,
} from '@soul/shared';
import { BarList, ClassBadge, Empty, ErrorBox, Loading, Panel } from '../components/ui.js';
import { useApp } from '../lib/app-context.js';
import { fmtDate } from '../lib/format.js';
import { useAsync } from '../lib/useAsync.js';

function Kpi({ value, label, to }: { value: number; label: string; to?: string }) {
  const body = (
    <>
      <p className="tabular text-3xl font-semibold tracking-tight">{value}</p>
      <p className="text-sm text-ink-soft">{label}</p>
    </>
  );
  return to ? <Link to={to} className="block px-5 py-4 hover:bg-soul-tint">{body}</Link> : <div className="px-5 py-4">{body}</div>;
}

export function Dashboard() {
  const { repo, actor, version } = useApp();
  const { data: all, error, loading } = useAsync(() => repo.listAll(actor), [repo, actor, version]);
  if (loading && !all) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const s: DashboardStats = computeStats(all ?? []);
  const ladder = [...CLASSIFICATION_KEYS].reverse();
  const maxClass = Math.max(1, ...Object.values(s.byClassification));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-sm text-ink-soft">Indicadores calculados a partir das fichas carregadas.</p>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-xl border border-line bg-white lg:grid-cols-4 lg:divide-y-0">
        <Kpi value={s.total} label="Dubladores cadastrados" to="/dubladores" />
        <Kpi value={s.active} label="Cadastros ativos" />
        <Kpi value={s.availableForProjects} label="Disponíveis para projetos" />
        <Kpi value={s.needsReview.length} label="Fichas para revisar" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Classificação oficial">
          <ol className="space-y-2" aria-label="Degraus de classificação, do mais alto ao mais baixo">
            {ladder.map((k) => (
              <li key={k} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2">
                <ClassBadge value={k} />
                <span className="h-6 rounded-md bg-soul-tint">
                  <span className="block h-6 rounded-md bg-soul/80" style={{ width: `${(s.byClassification[k] / maxClass) * 100}%` }} title={CLASSIFICATION_LABELS[k]} />
                </span>
                <span className="tabular text-right font-semibold">{s.byClassification[k]}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Nível autodeclarado">
          <BarList rows={SELF_LEVEL_KEYS.map((k) => ({ label: SELF_LEVEL_LABELS[k], value: s.bySelfLevel[k] }))} />
        </Panel>
        <Panel title="Tom de voz">
          <BarList rows={VOICE_TONE_KEYS.map((k) => ({ label: VOICE_TONE_LABELS[k], value: s.byTone[k] }))} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Tipo de voz" aside={<span className="text-xs text-ink-soft">uma ficha pode ter vários</span>}>
          <BarList rows={VOICE_TYPE_KEYS.map((k) => ({ label: VOICE_TYPE_LABELS[k], value: s.byType[k] }))} />
        </Panel>
        <Panel title="Cadastros recentes">
          {s.recent.length === 0 ? <Empty>Nenhuma ficha ainda.</Empty> : (
            <ul className="divide-y divide-line">
              {s.recent.map((d) => (
                <li key={d.id}><Link to={`/dubladores/${d.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-soul">
                  <span className="truncate font-medium">{d.displayName}</span><span className="shrink-0 text-xs text-ink-soft">{fmtDate(d.createdAt)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Fichas que precisam de revisão" aside={<Link className="text-xs text-soul hover:underline" to="/avaliacoes">Ver todas</Link>}>
          {s.needsReview.length === 0 ? <Empty>Tudo revisado.</Empty> : (
            <ul className="divide-y divide-line">
              {s.needsReview.slice(0, 6).map((d) => (
                <li key={d.id}><Link to={`/dubladores/${d.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-soul">
                  <span className="truncate font-medium">{d.displayName}</span><ClassBadge value={d.classification} />
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
