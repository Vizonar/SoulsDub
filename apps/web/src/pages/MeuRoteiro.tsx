import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RECORDING_LABEL, api, type MyScript, type RecordingState } from '../lib/api';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const STATE_CLASS: Record<RecordingState, string> = {
  pendente: 'badge planejamento',
  gravando: 'badge gravando',
  gravado: 'badge roteiro_pronto',
  aprovado: 'badge concluido',
  refazer: 'badge mixando',
};

export default function MeuRoteiro() {
  const { projectId = '', dubberId = '' } = useParams();
  const [roteiro, setRoteiro] = useState<MyScript | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .meuRoteiro(projectId, dubberId)
      .then(setRoteiro)
      .catch((e: unknown) => setError(errorText(e, 'Erro ao carregar o roteiro')));

  useEffect(() => {
    let alive = true;
    api
      .meuRoteiro(projectId, dubberId)
      .then((r) => {
        if (alive) setRoteiro(r);
      })
      .catch((e: unknown) => {
        if (alive) setError(errorText(e, 'Erro ao carregar o roteiro'));
      });
    return () => {
      alive = false;
    };
  }, [projectId, dubberId]);

  async function marcar(episodeId: string, status: RecordingState) {
    if (!roteiro) return;
    setBusy(true);
    try {
      for (const characterName of roteiro.characters) {
        await api.marcarGravacao(episodeId, { dubberId, characterName, status });
      }
      await load();
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao atualizar status'));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!roteiro) return <p className="muted">Carregando...</p>;

  const todasLinhas = roteiro.episodes.flatMap((e) => e.lines);
  const gravadas = todasLinhas.filter((l) => l.recordingStatus === 'gravado' || l.recordingStatus === 'aprovado').length;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <Link to={`/projetos/${projectId}`} className="muted small">
            ← Projeto
          </Link>
          <h2>Minhas falas</h2>
          <p className="muted small">
            Personagens: <strong>{roteiro.characters.join(', ')}</strong> · {gravadas}/{todasLinhas.length} fala(s) gravadas
          </p>
        </div>
      </header>

      {roteiro.episodes.map((ep) => (
        <section key={ep.episodeId} className="card stack">
          <div className="row space wrap gap">
            <h3>{ep.episodeTitle}</h3>
            <select
              className="select"
              value={ep.lines[0]?.recordingStatus ?? 'pendente'}
              disabled={busy}
              onChange={(e) => void marcar(ep.episodeId, e.target.value as RecordingState)}
            >
              {(['pendente', 'gravando', 'gravado', 'aprovado', 'refazer'] as RecordingState[]).map((s) => (
                <option key={s} value={s}>
                  {RECORDING_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          {ep.lines.map((l) => (
            <div key={`${l.lineNumber}-${l.characterName}`} className="line-box">
              <span className={`badge ${STATE_CLASS[l.recordingStatus]}`}>{RECORDING_LABEL[l.recordingStatus]}</span>
              <p className="line-text">
                <strong>{l.characterName}:</strong> {l.text}
              </p>
              {l.context && <p className="muted tiny">({l.context})</p>}
            </div>
          ))}
        </section>
      ))}

      {!roteiro.episodes.length && <p className="muted">Nenhuma fala para os seus personagens ainda.</p>}
    </div>
  );
}