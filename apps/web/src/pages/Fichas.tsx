import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Dubber } from '../lib/api';

export default function Fichas() {
  const [items, setItems] = useState<Dubber[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .fichas(search ? { search, pageSize: '50' } : { pageSize: '50' })
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erro ao carregar');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [search]);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h2>Fichas</h2>
          <p className="muted">{total} dublador(es) cadastrado(s)</p>
        </div>
        <input
          className="search"
          placeholder="Buscar por nome ou ID do Discord"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Carregando...</p>}

      <div className="grid">
        {items.map((d) => (
          <Link key={d.id} to={`/fichas/${d.id}`} className="card fichas-card">
            <div className="row space">
              <strong>{d.displayName}</strong>
              <span className={`badge ${d.classification}`}>{d.classification}</span>
            </div>
            <p className="muted small">
              {[d.voiceTone, ...(d.voiceTypes ?? [])].filter(Boolean).join(' · ')}
            </p>
            <div className="row wrap gap">
              {d.isActive ? <span className="chip ok">Ativo</span> : <span className="chip off">Inativo</span>}
              {d.needsReview && <span className="chip warn">Revisar</span>}
            </div>
          </Link>
        ))}
      </div>

      {!loading && !items.length && !error && <p className="muted">Nenhuma ficha encontrada.</p>}
    </div>
  );
}