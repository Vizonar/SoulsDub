import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  RECORDING_LABEL,
  api,
  type CastMember,
  type Episode,
  type EpisodeLine,
  type RecordingState,
  type RecordingStatus,
  type ScriptVersion,
} from '../lib/api';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const RECORDING_ORDER: RecordingState[] = ['pendente', 'gravando', 'gravado', 'aprovado', 'refazer'];

interface Props {
  episode: Episode;
  elenco: CastMember[];
}

export default function EpisodioDetalhe({ episode, elenco }: Props) {
  const [falas, setFalas] = useState<EpisodeLine[]>([]);
  const [gravacao, setGravacao] = useState<RecordingStatus[]>([]);
  const [versoes, setVersoes] = useState<ScriptVersion[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [characterName, setCharacterName] = useState('');
  const [lineText, setLineText] = useState('');

  const load = useCallback(async () => {
    try {
      const [f, g, v] = await Promise.all([api.falas(episode.id), api.gravacao(episode.id), api.versoes(episode.id)]);
      setFalas(f);
      setGravacao(g);
      setVersoes(v);
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao carregar o episódio'));
    }
  }, [episode.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [f, g, v] = await Promise.all([api.falas(episode.id), api.gravacao(episode.id), api.versoes(episode.id)]);
        if (!alive) return;
        setFalas(f);
        setGravacao(g);
        setVersoes(v);
      } catch (e: unknown) {
        if (alive) setError(errorText(e, 'Erro ao carregar o episódio'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [episode.id]);

  async function adicionarFala(e: FormEvent) {
    e.preventDefault();
    if (!characterName.trim() || !lineText.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.criarFala(episode.id, { characterName: characterName.trim(), text: lineText.trim() });
      setLineText('');
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao adicionar fala'));
    } finally {
      setBusy(false);
    }
  }

  async function removerFala(id: string) {
    if (!window.confirm('Remover esta fala?')) return;
    setBusy(true);
    try {
      await api.removerFala(id);
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao remover fala'));
    } finally {
      setBusy(false);
    }
  }

  async function definirGravacao(member: CastMember, status: RecordingState) {
    setBusy(true);
    try {
      await api.marcarGravacao(episode.id, {
        dubberId: member.dubber_id,
        characterName: member.character_name,
        status,
      });
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao atualizar gravação'));
    } finally {
      setBusy(false);
    }
  }

  async function criarVersao() {
    setBusy(true);
    try {
      await api.salvarVersao(episode.id);
      await load();
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao salvar versão'));
    } finally {
      setBusy(false);
    }
  }

  async function abrirVersao(id: string) {
    try {
      const v = await api.verVersao(id);
      window.alert(`Versão de ${v.author_name} em ${new Date(v.created_at).toLocaleString('pt-BR')}:\n\n${v.content}`);
    } catch (err: unknown) {
      setError(errorText(err, 'Erro ao abrir versão'));
    }
  }

  const personagens = [...new Set([...elenco.map((m) => m.character_name), ...falas.map((f) => f.character_name)])].sort();

  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}

      <section className="card stack">
        <h4>Status de gravação</h4>
        {!elenco.length && <p className="muted small">Escalone o elenco acima para controlar a gravação.</p>}
        {elenco.map((m) => {
          const atual = gravacao.find((g) => g.dubber_id === m.dubber_id && g.character_name === m.character_name);
          return (
            <div key={m.id} className="row space wrap gap">
              <span className="small">
                <strong>{m.character_name}</strong> — {m.dubber_name}
              </span>
              <select
                className="select"
                value={atual?.status ?? 'pendente'}
                disabled={busy}
                onChange={(e) => void definirGravacao(m, e.target.value as RecordingState)}
              >
                {RECORDING_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {RECORDING_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <h4>Falas por personagem ({falas.length})</h4>

        {falas.map((f) => (
          <div key={f.id} className="row space wrap gap">
            <span className="small">
              <strong>{f.character_name}</strong>: {f.text}
            </span>
            <button className="btn ghost small" disabled={busy} onClick={() => void removerFala(f.id)}>
              Remover
            </button>
          </div>
        ))}
        {!falas.length && <p className="muted small">Nenhuma fala cadastrada ainda.</p>}

        <form className="stack" onSubmit={adicionarFala}>
          <div className="row gap wrap">
            <input
              className="search"
              placeholder="Personagem"
              list="personagens-ep"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
            />
            <datalist id="personagens-ep">
              {personagens.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <textarea
            className="search"
            rows={3}
            placeholder="Fala do personagem..."
            value={lineText}
            onChange={(e) => setLineText(e.target.value)}
          />
          <button className="btn primary small" disabled={busy || !characterName.trim() || !lineText.trim()}>
            Adicionar fala
          </button>
        </form>
      </section>

      <section className="card stack">
        <h4>Versões do roteiro</h4>
        <button className="btn ghost small" disabled={busy} onClick={() => void criarVersao()}>
          Salvar versão atual
        </button>
        {versoes.map((v) => (
          <button key={v.id} className="linklike small" onClick={() => void abrirVersao(v.id)}>
            {new Date(v.created_at).toLocaleString('pt-BR')} · {v.author_name} · {v.chars} caracteres
          </button>
        ))}
        {!versoes.length && <p className="muted small">Nenhuma versão salva ainda.</p>}
      </section>
    </div>
  );
}