import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type PublicDubber, type PublicDubberSummary } from '../lib/api';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function DubladoresPublicos() {
  const [lista, setLista] = useState<PublicDubberSummary[]>([]);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .catalogoPublico()
      .then((r) => {
        if (alive) setLista(r);
      })
      .catch((e: unknown) => {
        if (alive) setErro(errorText(e, 'Não foi possível carregar o catálogo.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="publico">
      <header className="publico-head">
        <h1>Vox Trupe Studios</h1>
        <p className="muted">Elenco de dublagem da comunidade</p>
      </header>

      {erro && <p className="error">{erro}</p>}
      {loading && <p className="muted">Carregando...</p>}

      <div className="grid">
        {lista.map((d) => (
          <Link key={d.public_slug} to={`/dubladores/${d.public_slug}`} className="card fichas-card">
            <div className="row space">
              <strong>{d.display_name}</strong>
              <span className={`badge ${d.classification}`}>{d.classification}</span>
            </div>
            <p className="muted small">
              {[d.voice_tone, ...(d.voice_types ?? [])].filter(Boolean).join(' · ')}
            </p>
            <p className="muted tiny">{d.approved_samples} amostra(s) de voz</p>
          </Link>
        ))}
      </div>

      {!loading && !lista.length && !erro && <p className="muted">Nenhuma ficha publicada ainda.</p>}
    </div>
  );
}

export function DubladorPublico() {
  const { slug = '' } = useParams();
  const [d, setD] = useState<PublicDubber | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .fichaPublica(slug)
      .then((r) => {
        if (alive) setD(r);
      })
      .catch((e: unknown) => {
        if (alive) setErro(errorText(e, 'Ficha não encontrada.'));
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (erro) return <p className="error">{erro}</p>;
  if (!d) return <p className="muted">Carregando...</p>;

  return (
    <div className="publico stack-lg">
      <header className="publico-head">
        <Link to="/dubladores" className="muted small">
          ← Elenco
        </Link>
        <h1>{d.displayName}</h1>
        <p className="muted">
          {[d.voiceTone, ...(d.voiceTypes ?? [])].filter(Boolean).join(' · ')} · {d.classification}
        </p>
      </header>

      <section className="card stack">
        <h3>Sobre</h3>
        <dl className="kv">
          <dt>Nível</dt>
          <dd>{d.selfLevel}</dd>
          <dt>Tom de voz</dt>
          <dd>{d.voiceTone}</dd>
          <dt>Especialidades</dt>
          <dd>{d.specialties.join(', ') || '—'}</dd>
          <dt>Interesses</dt>
          <dd>{d.interests.join(', ') || '—'}</dd>
          {d.experience && (
            <>
              <dt>Experiência</dt>
              <dd>{d.experience}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="card stack">
        <h3>Amostras de voz</h3>
        {d.samples.map((s) => (
          <div key={s.id} className="stack">
            <strong className="small">{s.label || s.fileName}</strong>
            <audio controls preload="none" src={api.audioPublico(s.id)} />
          </div>
        ))}
        {!d.samples.length && <p className="muted small">Nenhuma amostra aprovada ainda.</p>}
      </section>
    </div>
  );
}