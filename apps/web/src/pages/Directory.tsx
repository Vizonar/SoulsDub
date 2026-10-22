import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_PAGE_SIZE, DEFAULT_SORT, can, distinctValues, dubbersToCsv, filterDubbers, labelOf, sortDubbers,
  type Dubber, type DubberFilters, type SortKey, type SortSpec,
} from '@soul/shared';
import { FilterBar } from '../components/FilterBar.js';
import { DubberPanel } from '../components/DubberPanel.js';
import { Btn, ClassBadge, Chip, Empty, ErrorBox, Loading } from '../components/ui.js';
import { useApp } from '../lib/app-context.js';
import { downloadText, fmtDate } from '../lib/format.js';
import { useAsync } from '../lib/useAsync.js';

const COLS: { key?: SortKey; label: string; cell: (d: Dubber) => React.ReactNode; cls?: string }[] = [
  { key: 'displayName', label: 'Nome / Nick', cell: (d) => <span className="font-medium">{d.displayName}</span>, cls: 'sticky left-0 bg-white' },
  { label: 'ID do Discord', cell: (d) => <span className="tabular text-xs text-ink-soft">{d.discordId}</span> },
  { label: 'Idade', cell: (d) => d.age ?? '—' },
  { label: 'Pronomes', cell: (d) => d.pronouns ?? '—' },
  { key: 'selfLevel', label: 'Nível (autodecl.)', cell: (d) => labelOf(d.selfLevel) },
  { label: 'Tom', cell: (d) => labelOf(d.voiceTone) },
  { label: 'Tipo de voz', cell: (d) => d.voiceTypes.map(labelOf).join(', ') },
  { label: 'Intensidade', cell: (d) => labelOf(d.intensity) },
  { label: 'Fala', cell: (d) => labelOf(d.speechSpeed) },
  { label: 'Especialidades', cell: (d) => <span className="line-clamp-2 min-w-40">{d.specialties.map(labelOf).join(', ') || '—'}</span> },
  { label: 'Disponibilidade', cell: (d) => d.availability.map(labelOf).join(', ') || '—' },
  { label: 'Projetos de interesse', cell: (d) => <span className="line-clamp-2 min-w-40">{d.interests.map(labelOf).join(', ') || '—'}</span> },
  { key: 'classification', label: 'Classificação oficial', cell: (d) => <ClassBadge value={d.classification} /> },
  { key: 'updatedAt', label: 'Atualizado', cell: (d) => <span className="tabular">{fmtDate(d.updatedAt)}</span> },
];

export function Directory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, actor, version } = useApp();
  const [filters, setFilters] = useState<DubberFilters>({});
  const [sort, setSort] = useState<SortSpec>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const options = useAsync(() => repo.listAll(actor), [repo, actor, version]);
  const result = useAsync(() => repo.query(actor, { filters, sort, page, pageSize }), [repo, actor, version, JSON.stringify(filters), sort.key, sort.dir, page, pageSize]);
  const optionLists = useMemo(() => {
    const all = options.data ?? [];
    return { specialties: distinctValues(all, 'specialties'), availability: distinctValues(all, 'availability'), interests: distinctValues(all, 'interests') };
  }, [options.data]);

  const pages = result.data ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize)) : 1;
  const changeFilters = (f: DubberFilters) => { setFilters(f); setPage(1); };
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  async function exportCsv() {
    const all = await repo.listAll(actor);
    const rows = sortDubbers(filterDubbers(all, filters), sort);
    downloadText(`dubladores-soul-${new Date().toISOString().slice(0, 10)}.csv`, dubbersToCsv(rows));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dubladores</h1>
          <p className="text-sm text-ink-soft" aria-live="polite">{result.data ? `${result.data.total} ${result.data.total === 1 ? 'ficha' : 'fichas'} encontradas` : ' '}</p>
        </div>
        {can(actor.role, 'export.csv') && <Btn onClick={() => void exportCsv()}>Exportar CSV (filtros atuais)</Btn>}
      </div>

      <FilterBar filters={filters} onChange={changeFilters} options={optionLists} />
      {result.error && <ErrorBox message={result.error} />}

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[78rem] text-left text-sm">
          <thead className="border-b border-line bg-paper text-xs text-ink-soft">
            <tr>
              {COLS.map((c) => (
                <th key={c.label} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${c.key === 'displayName' ? 'sticky left-0 bg-paper' : ''}`} aria-sort={c.key && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.key ? (
                    <button type="button" onClick={() => toggleSort(c.key as SortKey)} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.label}<span aria-hidden="true">{sort.key === c.key ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span>
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.data?.items.map((d) => (
              <tr key={d.id} className="cursor-pointer hover:bg-soul-tint/50" onClick={() => navigate(`/dubladores/${d.id}`)}>
                {COLS.map((c, i) => (
                  <td key={c.label} className={`px-3 py-2 align-top ${c.cls ?? ''}`}>
                    {i === 0 ? (
                      <button type="button" className="text-left hover:text-soul" onClick={(e) => { e.stopPropagation(); navigate(`/dubladores/${d.id}`); }}>
                        {c.cell(d)}
                        <span className="ml-2 inline-flex gap-1 align-middle">
                          {!d.isActive && <Chip tone="signal">inativo</Chip>}
                          {d.needsReview && <Chip tone="soul">revisar</Chip>}
                        </span>
                      </button>
                    ) : c.cell(d)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {result.loading && !result.data && <Loading />}
        {result.data && result.data.items.length === 0 && <div className="p-4"><Empty>Nenhuma ficha corresponde aos filtros. Tente limpar alguns deles.</Empty></div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-ink-soft">Por página
          <select className="rounded-lg border border-line bg-white px-2 py-1 text-ink" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 25, 50].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Btn disabled={(result.data?.page ?? 1) <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Btn>
          <span className="tabular text-ink-soft">Página {result.data?.page ?? 1} de {pages}</span>
          <Btn disabled={(result.data?.page ?? 1) >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Btn>
        </div>
      </div>

      {id && <DubberPanel id={id} onClose={() => navigate('/dubladores')} />}
    </div>
  );
}
