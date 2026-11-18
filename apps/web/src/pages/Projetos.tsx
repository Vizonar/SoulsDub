import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PROJECT_STATUS_LABEL, api, type Project, type ProjectStatus } from '../lib/api';

const STATUS_ORDER: ProjectStatus[] = ['planejamento', 'nao_iniciado', 'em_producao', 'pronto', 'finalizado'];

export default function Projetos() {
  const [projetos, setProjetos] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('planejamento');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .projetos()
      .then(setProjetos)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar projetos'))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.criarProjeto(title.trim(), status);
      setTitle('');
      setStatus('planejamento');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar projeto');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h2>Projetos</h2>
          <p className="muted">{projetos.length} projeto(s) no estúdio</p>
        </div>
      </header>

      <form className="card stack" onSubmit={criar}>
        <h3>Novo projeto</h3>
        <div className="row gap wrap">
          <input
            className="search"
            placeholder="Nome do projeto (ex.: Dublagem de One Piece)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={busy || !title.trim()}>
            {busy ? 'Criando...' : 'Adicionar projeto'}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Carregando...</p>}

      <div className="grid">
        {projetos.map((p) => (
          <Link key={p.id} to={`/projetos/${p.id}`} className="card fichas-card">
            <div className="row space">
              <strong>{p.title}</strong>
              <span className={`badge ${p.status}`}>{PROJECT_STATUS_LABEL[p.status] ?? p.status}</span>
            </div>
            <p className="muted small">Criado em {new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
          </Link>
        ))}
      </div>

      {!loading && !projetos.length && !error && <p className="muted">Nenhum projeto cadastrado ainda.</p>}
    </div>
  );
}