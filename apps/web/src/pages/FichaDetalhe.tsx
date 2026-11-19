import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type DubberDetails, type ReviewStatus, type SampleWithReview } from '../lib/api';
import { useAuth } from '../lib/auth';

const CLASSIFICATIONS = ['novato', 'aprendiz', 'intermediario', 'avancado', 'elite'] as const;

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function kb(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/** Base64 em blocos para não estourar a pilha com áudios de alguns MB. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function AudioPlayer({ sampleId }: { sampleId: string }) {
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function load() {
    setLoading(true);
    try { setUrl(await api.audio(sampleId)); }
    catch { window.alert('Não foi possível carregar este áudio.'); }
    finally { setLoading(false); }
  }
  if (!url) return <button className="btn ghost small" disabled={loading} onClick={() => void load()}>{loading ? 'Carregando áudio…' : 'Reproduzir áudio'}</button>;
  return <audio controls preload="none" src={url} />;
}

export default function FichaDetalhe() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<DubberDetails | null>(null);
  const [error, setError] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [amostras, setAmostras] = useState<SampleWithReview[]>([]);
  const [publicacao, setPublicacao] = useState<{ is_public: boolean; public_slug: string | null }>({ is_public: false, public_slug: null });
  const [slug, setSlug] = useState('');
  const [discordTag, setDiscordTag] = useState('');

  const load = () =>
    api
      .ficha(id)
      .then(setData)
      .catch((e: unknown) => setError(errorText(e, 'Erro')));

  const loadExtra = async () => {
    try {
      const [a, p, d] = await Promise.all([api.amostras(id), api.publicacao(id), api.discordLink(id)]);
      setAmostras(a);
      setPublicacao(p);
      setSlug(p.public_slug ?? '');
      setDiscordTag(d.discordTag ?? '');
    } catch {
      /* silencioso: recursos opcionais */
    }
  };

  useEffect(() => {
    let alive = true;
    api
      .ficha(id)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e: unknown) => {
        if (alive) setError(errorText(e, 'Erro'));
      });
    Promise.all([api.amostras(id), api.publicacao(id), api.discordLink(id)])
      .then(([a, p, d]) => {
        if (!alive) return;
        setAmostras(a);
        setPublicacao(p);
        setSlug(p.public_slug ?? '');
        setDiscordTag(d.discordTag ?? '');
      })
      .catch(() => {
        /* opcional: a ficha carrega mesmo sem estes dados */
      });
    return () => {
      alive = false;
    };
  }, [id]);

  async function avaliar(sampleId: string, status: ReviewStatus) {
    setBusy(true);
    try {
      await api.aprovarAmostra(sampleId, status);
      await Promise.all([load(), loadExtra()]);
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao avaliar amostra'));
    } finally {
      setBusy(false);
    }
  }

  async function publicar(isPublic: boolean) {
    setBusy(true);
    try {
      const r = await api.publicarFicha(id, isPublic, slug.trim() || undefined);
      setPublicacao(r);
      if (r.public_slug) setSlug(r.public_slug);
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao publicar ficha'));
    } finally {
      setBusy(false);
    }
  }

  async function salvarDiscord() {
    setBusy(true);
    try {
      await api.salvarDiscord(id, discordTag.trim());
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao salvar contato'));
    } finally {
      setBusy(false);
    }
  }

  async function classificar(next: string) {
    const reason = window.prompt(`Motivo da mudança para ${next.toUpperCase()}:`);
    if (!reason) return;
    setBusy(true);
    try {
      await api.classificar(id, next, reason);
      await load();
    } catch (e: unknown) {
      setError(errorText(e, 'Erro'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAtivo() {
    if (!data) return;
    setBusy(true);
    try {
      await api.setAtivo(id, !data.dubber.isActive);
      await load();
    } catch (e: unknown) {
      setError(errorText(e, 'Erro'));
    } finally {
      setBusy(false);
    }
  }

  async function enviarNota() {
    if (!nota.trim()) return;
    setBusy(true);
    try {
      await api.adicionarNota(id, nota.trim());
      setNota('');
      await load();
    } catch (e: unknown) {
      setError(errorText(e, 'Erro'));
    } finally {
      setBusy(false);
    }
  }

  async function enviarAudio(file: File) {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await api.enviarSample(id, file.name, file.type, toBase64(bytes));
      await load();
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao enviar áudio'));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Carregando ficha...</p>;

  const d = data.dubber;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <Link to="/fichas" className="muted small">
            ← Fichas
          </Link>
          <h2>{d.displayName}</h2>
          <p className="muted small">
            Classificação: <strong>{d.classification}</strong> · Discord: {d.discordId}
          </p>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={toggleAtivo} disabled={busy}>
            {d.isActive ? 'Desativar' : 'Ativar'}
          </button>
          {user?.role === 'admin' && (
            <select className="select" value="" onChange={(e) => e.target.value && classificar(e.target.value)} disabled={busy}>
              <option value="">Classificar...</option>
              {CLASSIFICATIONS.filter((c) => c !== d.classification).map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="card stack">
        <h3>Perfil</h3>
        <dl className="kv">
          <dt>Nível</dt>
          <dd>{d.selfLevel}</dd>
          <dt>Tom de voz</dt>
          <dd>{d.voiceTone}</dd>
          <dt>Tipos de voz</dt>
          <dd>{d.voiceTypes.join(', ') || '—'}</dd>
          <dt>Intensidade</dt>
          <dd>{d.intensity}</dd>
          <dt>Velocidade</dt>
          <dd>{d.speechSpeed}</dd>
          <dt>Disponibilidade</dt>
          <dd>{d.availability.join(', ') || '—'}</dd>
          <dt>Interesses</dt>
          <dd>{d.interests.join(', ') || '—'}</dd>
          <dt>Personagens</dt>
          <dd>{d.wantedCharacters || '—'}</dd>
        </dl>
      </section>

      <section className="card stack">
        <h3>Samples de áudio ({data.samples.length})</h3>
        {data.samples.map((s) => (
          <div key={s.id} className="stack">
            <div className="row space">
              <span>
                <strong>{s.label || s.fileName}</strong>{' '}
                <span className="muted small">
                  ({kb(s.sizeBytes)} · {s.source === 'discord' ? 'Discord' : 'Painel'})
                </span>
              </span>
              <button
                className="btn ghost small"
                onClick={async () => {
                  if (window.confirm('Remover esta amostra?')) {
                    await api.removerSample(s.id);
                    await load();
                  }
                }}
              >
                Remover
              </button>
            </div>
            <AudioPlayer sampleId={s.id} />
          </div>
        ))}
        {!data.samples.length && <p className="muted small">Nenhuma amostra enviada ainda.</p>}
        <label className="btn ghost small upload">
          Enviar áudio
          <input
            type="file"
            accept="audio/mpeg,audio/wav"
            hidden
            onChange={(e) => e.target.files?.[0] && enviarAudio(e.target.files[0])}
          />
        </label>
        <p className="muted tiny">MP3 ou WAV, até 10 MB por arquivo.</p>
      </section>

      <section className="card stack">
        <h3>Aprovação das amostras</h3>
        {!amostras.length && <p className="muted small">Nenhuma amostra para avaliar.</p>}
        {amostras.map((s) => (
          <div key={s.id} className="stack">
            <div className="row space wrap gap">
              <span className="small">
                <strong>{s.label || s.file_name}</strong> ({kb(s.size_bytes)})
              </span>
              <div className="row gap">
                <button
                  className="btn ghost small"
                  disabled={busy || s.review_status === 'aprovada'}
                  onClick={() => void avaliar(s.id, 'aprovada')}
                >
                  Aprovar
                </button>
                <button
                  className="btn ghost small"
                  disabled={busy || s.review_status === 'recusada'}
                  onClick={() => void avaliar(s.id, 'recusada')}
                >
                  Recusar
                </button>
              </div>
            </div>
            <span className="muted tiny">
              Status: {s.review_status}
              {s.reviewed_by ? ` · por ${s.reviewed_by}` : ''}
              {s.review_note ? ` · ${s.review_note}` : ''}
            </span>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h3>Ficha pública</h3>
        {publicacao.is_public ? (
          <p className="muted small">
            Publicada em <code>/dubladores/{publicacao.public_slug}</code>
          </p>
        ) : (
          <p className="muted small">Esta ficha não está visível fora do painel.</p>
        )}
        <div className="row gap wrap">
          <input
            className="search"
            placeholder="endereco-da-ficha"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <button className="btn primary small" disabled={busy || !slug.trim()} onClick={() => void publicar(true)}>
            {publicacao.is_public ? 'Atualizar' : 'Publicar ficha'}
          </button>
          {publicacao.is_public && (
            <button className="btn ghost small" disabled={busy} onClick={() => void publicar(false)}>
              Despublicar
            </button>
          )}
        </div>
      </section>

      <section className="card stack">
        <h3>Contato (Discord)</h3>
        <p className="muted small">Tag visível apenas para a equipe do painel.</p>
        <div className="row gap wrap">
          <input
            className="search"
            placeholder="@usuario ou usuario#0000"
            value={discordTag}
            onChange={(e) => setDiscordTag(e.target.value)}
          />
          <button
            className="btn primary small"
            disabled={busy || !discordTag.trim()}
            onClick={() => void salvarDiscord()}
          >
            Salvar
          </button>
        </div>
      </section>

      <section className="card stack">
        <h3>Notas internas</h3>
        {data.notes.map((n) => (
          <div key={n.id} className="note">
            <p>{n.body}</p>
            <span className="muted small">
              {n.authorName} · {new Date(n.createdAt).toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
        <div className="row gap">
          <input className="search" placeholder="Nova nota interna..." value={nota} onChange={(e) => setNota(e.target.value)} />
          <button className="btn primary" onClick={enviarNota} disabled={busy || !nota.trim()}>
            Adicionar
          </button>
        </div>
      </section>
    </div>
  );
}
