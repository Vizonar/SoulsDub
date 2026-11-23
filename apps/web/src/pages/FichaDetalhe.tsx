import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Dubber, type DubberDetails, type ReviewStatus, type SampleWithReview } from '../lib/api';
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
  const [editandoFicha, setEditandoFicha] = useState(false);
  const [rascunho, setRascunho] = useState<Partial<Dubber>>({});
  const [salvo, setSalvo] = useState(false);

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

  function iniciarEdicao() {
    if (!data) return;
    setRascunho({ ...data.dubber });
    setEditandoFicha(true);
    setSalvo(false);
  }

  async function salvarEdicao() {
    if (!data) return;
    setBusy(true);
    setError('');
    setSalvo(false);
    try {
      await api.atualizarFicha(id, {
        displayName: rascunho.displayName,
        age: rascunho.age ?? null,
        pronouns: rascunho.pronouns ?? null,
        selfLevel: rascunho.selfLevel,
        experience: rascunho.experience ?? null,
        voiceTone: rascunho.voiceTone,
        voiceTypes: rascunho.voiceTypes,
        intensity: rascunho.intensity,
        diction: rascunho.diction ?? null,
        speechSpeed: rascunho.speechSpeed,
        specialties: rascunho.specialties,
        availability: rascunho.availability,
        interests: rascunho.interests,
        wantedCharacters: rascunho.wantedCharacters ?? null,
      });
      await load();
      setEditandoFicha(false);
      setSalvo(true);
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao salvar alterações da ficha'));
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
            Classificação: <strong>{d.classification}</strong> · Discord ID: {d.discordId} · Atualizada: {new Date(d.updatedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="row gap wrap">
          {user?.role === 'admin' && !editandoFicha && (
            <button className="btn primary" onClick={iniciarEdicao} disabled={busy}>Editar ficha</button>
          )}
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
      {salvo && <p className="success">Ficha atualizada com sucesso. A alteração foi registrada no histórico.</p>}

      {editandoFicha && user?.role === 'admin' && (
        <section className="card stack">
          <h3>Corrigir informações da ficha</h3>
          <p className="muted small">Edite os dados que a pessoa informou incorretamente. O Discord ID e a classificação oficial são alterados em seções próprias.</p>
          <label className="field">Nome ou nick<input value={rascunho.displayName ?? ''} maxLength={64} onChange={(e) => setRascunho({ ...rascunho, displayName: e.target.value })} /></label>
          <div className="form-grid">
            <label className="field">Idade<input type="number" min="1" max="120" value={rascunho.age ?? ''} onChange={(e) => setRascunho({ ...rascunho, age: e.target.value ? Number(e.target.value) : undefined })} /></label>
            <label className="field">Pronomes<input maxLength={40} value={rascunho.pronouns ?? ''} onChange={(e) => setRascunho({ ...rascunho, pronouns: e.target.value })} /></label>
            <label className="field">Nível autodeclarado<select className="select" value={rascunho.selfLevel ?? ''} onChange={(e) => setRascunho({ ...rascunho, selfLevel: e.target.value })}><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option><option value="profissional">Profissional</option></select></label>
            <label className="field">Tom de voz<select className="select" value={rascunho.voiceTone ?? ''} onChange={(e) => setRascunho({ ...rascunho, voiceTone: e.target.value })}><option value="grave">Grave</option><option value="medio">Médio</option><option value="agudo">Agudo</option><option value="variavel">Variável</option></select></label>
            <label className="field">Intensidade<select className="select" value={rascunho.intensity ?? ''} onChange={(e) => setRascunho({ ...rascunho, intensity: e.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></label>
            <label className="field">Velocidade de fala<select className="select" value={rascunho.speechSpeed ?? ''} onChange={(e) => setRascunho({ ...rascunho, speechSpeed: e.target.value })}><option value="lenta">Lenta</option><option value="moderada">Moderada</option><option value="rapida">Rápida</option></select></label>
          </div>
          <fieldset className="edit-fieldset"><legend>Tipos de voz (selecione todos que se aplicam)</legend><div className="choice-grid">{([['masculina', 'Masculina'], ['feminina', 'Feminina'], ['neutra', 'Neutra'], ['infantil', 'Infantil'], ['adolescente', 'Adolescente'], ['adulta', 'Adulta']] as const).map(([value, label]) => <label key={value}><input type="checkbox" checked={(rascunho.voiceTypes ?? []).includes(value)} onChange={(e) => setRascunho({ ...rascunho, voiceTypes: e.target.checked ? [...(rascunho.voiceTypes ?? []), value] : (rascunho.voiceTypes ?? []).filter((v) => v !== value) })} /> {label}</label>)}</div></fieldset>
          <label className="field">Dicção<input maxLength={500} value={rascunho.diction ?? ''} onChange={(e) => setRascunho({ ...rascunho, diction: e.target.value })} /></label>
          <label className="field">Experiência<textarea rows={4} maxLength={2000} value={rascunho.experience ?? ''} onChange={(e) => setRascunho({ ...rascunho, experience: e.target.value })} /></label>
          <label className="field">Especialidades (uma por linha)<textarea rows={3} value={(rascunho.specialties ?? []).join('\\n')} onChange={(e) => setRascunho({ ...rascunho, specialties: e.target.value.split('\\n').map((x) => x.trim()).filter(Boolean) })} /></label>
          <label className="field">Disponibilidade (uma por linha)<textarea rows={3} value={(rascunho.availability ?? []).join('\\n')} onChange={(e) => setRascunho({ ...rascunho, availability: e.target.value.split('\\n').map((x) => x.trim()).filter(Boolean) })} /></label>
          <label className="field">Projetos de interesse (um por linha)<textarea rows={3} value={(rascunho.interests ?? []).join('\\n')} onChange={(e) => setRascunho({ ...rascunho, interests: e.target.value.split('\\n').map((x) => x.trim()).filter(Boolean) })} /></label>
          <label className="field">Personagens que gostaria de interpretar<textarea rows={3} maxLength={2000} value={rascunho.wantedCharacters ?? ''} onChange={(e) => setRascunho({ ...rascunho, wantedCharacters: e.target.value })} /></label>
          <div className="row gap"><button className="btn primary" disabled={busy || !(rascunho.voiceTypes?.length)} onClick={() => void salvarEdicao()}>{busy ? 'Salvando…' : 'Salvar correções'}</button><button className="btn ghost" disabled={busy} onClick={() => setEditandoFicha(false)}>Cancelar</button></div>
        </section>
      )}

      <section className="card stack">
        <h3>Informações do formulário</h3>
        <dl className="kv">
          <dt>Nome / nick</dt><dd>{d.displayName || '—'}</dd>
          <dt>Idade</dt><dd>{d.age ?? '—'}</dd>
          <dt>Pronomes</dt><dd>{d.pronouns || '—'}</dd>
          <dt>Nível autodeclarado</dt><dd>{d.selfLevel || '—'}</dd>
          <dt>Experiência</dt><dd className="preserve-lines">{d.experience || '—'}</dd>
          <dt>Tom de voz</dt><dd>{d.voiceTone || '—'}</dd>
          <dt>Tipos de voz</dt><dd>{d.voiceTypes.join(', ') || '—'}</dd>
          <dt>Intensidade</dt><dd>{d.intensity || '—'}</dd>
          <dt>Dicção</dt><dd className="preserve-lines">{d.diction || '—'}</dd>
          <dt>Velocidade de fala</dt><dd>{d.speechSpeed || '—'}</dd>
          <dt>Especialidades</dt><dd>{d.specialties.join(', ') || '—'}</dd>
          <dt>Disponibilidade</dt><dd>{d.availability.join(', ') || '—'}</dd>
          <dt>Projetos de interesse</dt><dd>{d.interests.join(', ') || '—'}</dd>
          <dt>Personagens desejados</dt><dd className="preserve-lines">{d.wantedCharacters || '—'}</dd>
          <dt>Discord ID</dt><dd>{d.discordId}</dd>
          <dt>Cadastro criado</dt><dd>{new Date(d.createdAt).toLocaleString('pt-BR')}</dd>
          <dt>Última atualização</dt><dd>{new Date(d.updatedAt).toLocaleString('pt-BR')}</dd>
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
