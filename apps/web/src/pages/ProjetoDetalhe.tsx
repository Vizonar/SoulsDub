import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  EPISODE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  api,
  type CastMember,
  type Dubber,
  type Episode,
  type EpisodeStatus,
  type Project,
} from '../lib/api';

const EPISODE_STATUS_ORDER: EpisodeStatus[] = ['planejamento', 'roteiro_pronto', 'gravando', 'mixando', 'concluido'];

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function ProjetoDetalhe() {
  const { id = '' } = useParams();

  const [projeto, setProjeto] = useState<Project | null>(null);
  const [episodios, setEpisodios] = useState<Episode[]>([]);
  const [elenco, setElenco] = useState<CastMember[]>([]);
  const [dubbers, setDubbers] = useState<Dubber[]>([]);
  const [error, setError] = useState('');

  // formulários
  const [epTitle, setEpTitle] = useState('');
  const [castDubber, setCastDubber] = useState('');
  const [castCharacter, setCastCharacter] = useState('');
  const [busy, setBusy] = useState(false);
  const [scriptEdit, setScriptEdit] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, eps, cast, fichas] = await Promise.all([
        api.projeto(id),
        api.episodios(id),
        api.elenco(id),
        api.fichas({ pageSize: '100' }),
      ]);
      setProjeto(p);
      setEpisodios(eps);
      setElenco(cast);
      setDubbers(fichas.items);
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao carregar o projeto'));
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, eps, cast, fichas] = await Promise.all([
          api.projeto(id),
          api.episodios(id),
          api.elenco(id),
          api.fichas({ pageSize: '100' }),
        ]);
        if (!alive) return;
        setProjeto(p);
        setEpisodios(eps);
        setElenco(cast);
        setDubbers(fichas.items);
      } catch (e: unknown) {
        if (alive) setError(errorText(e, 'Erro ao carregar o projeto'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function criarEpisodio(e: FormEvent) {
    e.preventDefault();
    if (!epTitle.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.criarEpisodio(id, { title: epTitle.trim(), status: 'planejamento' });
      setEpTitle('');
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao criar episódio'));
    } finally {
      setBusy(false);
    }
  }

  async function mudarStatusEp(ep: Episode, status: EpisodeStatus) {
    setBusy(true);
    try {
      await api.atualizarEpisodio(ep.id, { status });
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao atualizar episódio'));
    } finally {
      setBusy(false);
    }
  }

  async function salvarRoteiro(ep: Episode) {
    if (!scriptEdit) return;
    setBusy(true);
    try {
      await api.atualizarEpisodio(ep.id, { script: scriptEdit.text });
      setScriptEdit(null);
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao salvar roteiro'));
    } finally {
      setBusy(false);
    }
  }

  async function escalar(e: FormEvent) {
    e.preventDefault();
    if (!castDubber || !castCharacter.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.escalar(id, { dubberId: castDubber, characterName: castCharacter.trim() });
      setCastCharacter('');
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao escalar dublador'));
    } finally {
      setBusy(false);
    }
  }

  async function removerEscalacao(castId: string) {
    if (!window.confirm('Remover esta escalação?')) return;
    setBusy(true);
    try {
      await api.removerEscalacao(castId);
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao remover escalação'));
    } finally {
      setBusy(false);
    }
  }

  if (error && !projeto) return <p className="error">{error}</p>;
  if (!projeto) return <p className="muted">Carregando projeto...</p>;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <Link to="/projetos" className="muted small">
            ← Projetos
          </Link>
          <h2>{projeto.title}</h2>
          <p className="muted small">
            Status: <strong>{PROJECT_STATUS_LABEL[projeto.status] ?? projeto.status}</strong>
          </p>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="card stack">
        <h3>Elenco ({elenco.length})</h3>

        {elenco.map((m) => (
          <div key={m.id} className="row space">
            <span>
              <strong>{m.character_name}</strong>{' '}
              <span className="muted small">
                — {m.dubber_name} ({m.classification})
                {m.role_note ? ` · ${m.role_note}` : ''}
              </span>
            </span>
            <button className="btn ghost small" disabled={busy} onClick={() => void removerEscalacao(m.id)}>
              Remover
            </button>
          </div>
        ))}
        {!elenco.length && <p className="muted small">Nenhum dublador escalado ainda.</p>}

        <form className="row gap wrap" onSubmit={escalar}>
          <select className="select" value={castDubber} onChange={(e) => setCastDubber(e.target.value)}>
            <option value="">Escolher dublador...</option>
            {dubbers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName}
              </option>
            ))}
          </select>
          <input
            className="search"
            placeholder="Personagem (ex.: Luffy)"
            value={castCharacter}
            onChange={(e) => setCastCharacter(e.target.value)}
          />
          <button className="btn primary" disabled={busy || !castDubber || !castCharacter.trim()}>
            Escalar
          </button>
        </form>
      </section>

      <section className="card stack">
        <h3>Episódios ({episodios.length})</h3>

        {episodios.map((ep) => (
          <div key={ep.id} className="stack">
            <div className="row space wrap gap">
              <strong>{ep.title}</strong>
              <select
                className="select"
                value={ep.status}
                disabled={busy}
                onChange={(e) => void mudarStatusEp(ep, e.target.value as EpisodeStatus)}
              >
                {EPISODE_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {EPISODE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            {scriptEdit?.id === ep.id ? (
              <div className="stack">
                <textarea
                  className="search"
                  rows={10}
                  value={scriptEdit.text}
                  onChange={(e) => setScriptEdit({ id: ep.id, text: e.target.value })}
                />
                <div className="row gap">
                  <button className="btn primary small" disabled={busy} onClick={() => void salvarRoteiro(ep)}>
                    Salvar roteiro
                  </button>
                  <button className="btn ghost small" onClick={() => setScriptEdit(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="stack">
                <p className="muted small">
                  {ep.script ? `${ep.script.slice(0, 160)}${ep.script.length > 160 ? '…' : ''}` : 'Sem roteiro escrito.'}
                </p>
                <button
                  className="btn ghost small"
                  onClick={() => setScriptEdit({ id: ep.id, text: ep.script ?? '' })}
                >
                  {ep.script ? 'Editar roteiro' : 'Escrever roteiro'}
                </button>
              </div>
            )}
          </div>
        ))}
        {!episodios.length && <p className="muted small">Nenhum episódio cadastrado ainda.</p>}

        <form className="row gap wrap" onSubmit={criarEpisodio}>
          <input
            className="search"
            placeholder="Título do episódio (ex.: EP 01)"
            value={epTitle}
            onChange={(e) => setEpTitle(e.target.value)}
          />
          <button className="btn primary" disabled={busy || !epTitle.trim()}>
            Adicionar episódio
          </button>
        </form>
      </section>
    </div>
  );
}