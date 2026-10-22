import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CLASSIFICATION_KEYS, CLASSIFICATION_LABELS, MAX_SAMPLES_PER_DUBBER, SAMPLE_MAX_BYTES, SELF_LEVEL_LABELS, VOICE_TONE_LABELS,
  INTENSITY_LABELS, SPEECH_SPEED_LABELS, ValidationError, can, formatBytes, type ClassificationKey, type DubberDetails,
} from '@soul/shared';
import { useApp } from '../lib/app-context.js';
import { fmtDate, fmtDateTime, actionLabel } from '../lib/format.js';
import { useAsync } from '../lib/useAsync.js';
import { EditForm } from './EditForm.js';
import { Btn, Chip, ClassBadge, Empty, ErrorBox, Field, Loading, Panel, Tags, inputCls } from './ui.js';

function useAction() {
  const { refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      refresh();
      return true;
    } catch (e) {
      setError(e instanceof ValidationError ? e.messages.join(' ') : e instanceof Error ? e.message : 'Erro inesperado.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}

const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm"><dt className="text-ink-soft">{k}</dt><dd>{children}</dd></div>
);

export function DubberPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo, actor, version } = useApp();
  const { data, error, loading } = useAsync(() => repo.getDetails(actor, id), [repo, actor, id, version]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Ficha do dublador">
      <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Fechar ficha" onClick={onClose} />
      <aside className="drawer relative h-full w-full max-w-2xl space-y-4 overflow-y-auto bg-paper p-4 shadow-2xl md:p-6">
        {loading && !data ? <Loading /> : error ? (<><ErrorBox message={error} /><Btn onClick={onClose}>Fechar</Btn></>) : data ? <Content d={data} onClose={onClose} /> : null}
      </aside>
    </div>
  );
}

function Content({ d, onClose }: { d: DubberDetails; onClose: () => void }) {
  const { repo, actor } = useApp();
  const { dubber: x } = d;
  const act = useAction();
  const [editing, setEditing] = useState(false);
  const canEdit = can(actor.role, 'dubber.edit');

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">{x.displayName}</h2>
          <p className="tabular text-xs text-ink-soft">ID do Discord {x.discordId}</p>
          <div className="flex flex-wrap items-center gap-1.5"><ClassBadge value={x.classification} />{!x.isActive && <Chip tone="signal">inativo</Chip>}{x.needsReview && <Chip tone="soul">precisa de revisão</Chip>}</div>
        </div>
        <Btn variant="ghost" onClick={onClose}>Fechar</Btn>
      </header>

      <div className="flex flex-wrap gap-2">
        {canEdit && <Btn onClick={() => setEditing((e) => !e)}>{editing ? 'Fechar edição' : 'Editar ficha'}</Btn>}
        {can(actor.role, 'dubber.setActive') && (
          <Btn disabled={act.busy} onClick={() => void act.run(() => repo.setActive(actor, x.id, !x.isActive))}>{x.isActive ? 'Marcar como inativo' : 'Marcar como ativo'}</Btn>
        )}
        {x.needsReview && can(actor.role, 'review.create') && <Btn disabled={act.busy} onClick={() => void act.run(() => repo.markReviewed(actor, x.id))}>Marcar como revisada</Btn>}
      </div>
      {act.error && <ErrorBox message={act.error} />}

      {editing && canEdit && (
        <EditForm dubber={x} busy={act.busy} error={act.error} onCancel={() => setEditing(false)}
          onSave={(p) => void act.run(() => repo.updateDubber(actor, x.id, p)).then((ok) => ok && setEditing(false))} />
      )}

      <Panel title="Cadastro e perfil vocal">
        <dl className="divide-y divide-line">
          <Row k="Idade">{x.age ?? '—'}</Row>
          <Row k="Pronomes">{x.pronouns ?? '—'}</Row>
          <Row k="Nível autodeclarado">{SELF_LEVEL_LABELS[x.selfLevel]}</Row>
          <Row k="Tom de voz">{VOICE_TONE_LABELS[x.voiceTone]}</Row>
          <Row k="Tipo de voz"><Tags items={x.voiceTypes} /></Row>
          <Row k="Intensidade">{INTENSITY_LABELS[x.intensity]}</Row>
          <Row k="Velocidade de fala">{SPEECH_SPEED_LABELS[x.speechSpeed]}</Row>
          <Row k="Dicção">{x.diction ?? '—'}</Row>
          <Row k="Cadastrado em">{fmtDate(x.createdAt)}</Row>
          <Row k="Atualizado em">{fmtDateTime(x.updatedAt)}</Row>
        </dl>
      </Panel>

      <Panel title="Experiência e interesses">
        <dl className="divide-y divide-line">
          <Row k="Experiência"><span className="whitespace-pre-wrap">{x.experience ?? '—'}</span></Row>
          <Row k="Especialidades"><Tags items={x.specialties} /></Row>
          <Row k="Disponibilidade"><Tags items={x.availability} /></Row>
          <Row k="Projetos de interesse"><Tags items={x.interests} /></Row>
          <Row k="Personagens desejados"><span className="whitespace-pre-wrap">{x.wantedCharacters ?? '—'}</span></Row>
        </dl>
      </Panel>

      {can(actor.role, 'sample.read') && <Samples d={d} />}
      <ClassificationSection d={d} />
      {can(actor.role, 'review.create') && <ReviewSection d={d} />}
      {can(actor.role, 'note.read') && <Notes d={d} />}

      <Panel title="Histórico de classificação">
        {d.history.length === 0 ? <Empty>Nenhuma alteração registrada. Classificação inicial: {CLASSIFICATION_LABELS[x.classification]}.</Empty> : (
          <ol className="space-y-3">
            {d.history.map((h) => (
              <li key={h.id} className="border-l-2 border-soul/40 pl-3 text-sm">
                <p className="flex flex-wrap items-center gap-1.5">{h.previousClassification ? <ClassBadge value={h.previousClassification} /> : '—'}<span aria-label="para">→</span><ClassBadge value={h.newClassification} /></p>
                <p>{h.reason}</p>
                <p className="text-xs text-ink-soft">{fmtDateTime(h.createdAt)} · {h.changedByName}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {can(actor.role, 'audit.read') && (
        <Panel title="Histórico de alterações administrativas">
          {d.audit.length === 0 ? <Empty>Sem registros.</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {d.audit.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{actionLabel(a.action)} <span className="text-ink-soft">· {a.actorName}</span></span><span className="tabular text-xs text-ink-soft">{fmtDateTime(a.createdAt)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}

function Samples({ d }: { d: DubberDetails }) {
  const { repo, actor } = useApp();
  const act = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [fileName, setFileName] = useState('');
  const full = d.samples.length >= MAX_SAMPLES_PER_DUBBER;

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const ok = await act.run(async () => repo.addSample(actor, d.dubber.id, { fileName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }, label));
    if (ok) { setLabel(''); setFileName(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <Panel title="Amostras de voz" aside={<span className="text-xs text-ink-soft">{d.samples.length}/{MAX_SAMPLES_PER_DUBBER}</span>}>
      {d.samples.length === 0 ? <Empty>Nenhuma amostra enviada ainda. O dublador pode enviar com <code>/sample-voz</code> no Discord.</Empty> : (
        <ul className="space-y-3">
          {d.samples.map((s) => (
            <li key={s.id} className="space-y-1.5 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{s.label ?? s.fileName}</span>
                <span className="text-xs text-ink-soft">{s.mimeType === 'audio/wav' ? 'WAV' : 'MP3'} · {formatBytes(s.sizeBytes)} · {s.source === 'discord' ? 'enviada pelo dublador' : `enviada por ${s.uploadedByName}`} · {fmtDate(s.createdAt)}</span>
              </div>
              {s.url ? <audio controls preload="none" src={s.url} className="w-full" aria-label={`Ouvir ${s.label ?? s.fileName}`} /> : <p className="text-xs text-ink-soft">Link de áudio indisponível.</p>}
              {can(actor.role, 'sample.delete') && (
                <Btn variant="ghost" disabled={act.busy} onClick={() => { if (window.confirm('Remover esta amostra? Essa ação não pode ser desfeita.')) void act.run(() => repo.deleteSample(actor, s.id)); }}>Remover</Btn>
              )}
            </li>
          ))}
        </ul>
      )}
      {can(actor.role, 'sample.upload') && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <Field label="Adicionar amostra (MP3 ou WAV)" hint={`Até ${formatBytes(SAMPLE_MAX_BYTES)} por arquivo, no máximo ${MAX_SAMPLES_PER_DUBBER} por dublador. O formato é conferido pelo conteúdo do arquivo.`}>
            <input ref={fileRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" disabled={full} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soul-tint file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-soul-deep" />
          </Field>
          <Field label="Descrição (opcional)"><input className={inputCls} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: leitura neutra, cena dramática" disabled={full} /></Field>
          {full && <p className="text-xs text-ink-soft">Limite atingido: remova uma amostra para enviar outra.</p>}
          {act.error && <ErrorBox message={act.error} />}
          <Btn variant="primary" disabled={act.busy || full || !fileName} onClick={() => void upload()}>{act.busy ? 'Enviando…' : 'Enviar amostra'}</Btn>
        </div>
      )}
    </Panel>
  );
}

function ClassificationSection({ d }: { d: DubberDetails }) {
  const { repo, actor } = useApp();
  const act = useAction();
  const cur = d.dubber.classification;
  const [next, setNext] = useState<ClassificationKey>(cur);
  const [reason, setReason] = useState('');
  const canChange = can(actor.role, 'classification.change');
  return (
    <Panel title="Classificação oficial">
      <p className="mb-3 flex items-center gap-2 text-sm">Atual: <ClassBadge value={cur} /><span className="text-xs text-ink-soft">independente do nível autodeclarado ({SELF_LEVEL_LABELS[d.dubber.selfLevel]})</span></p>
      {canChange ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act.run(() => repo.changeClassification(actor, d.dubber.id, next, reason)).then((ok) => { if (ok) setReason(''); }); }}>
          <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
            <Field label="Nova classificação"><select className={inputCls} value={next} onChange={(e) => setNext(e.target.value as ClassificationKey)}>{CLASSIFICATION_KEYS.map((k) => <option key={k} value={k}>{CLASSIFICATION_LABELS[k]}</option>)}</select></Field>
            <Field label="Motivo da mudança"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Obrigatório" /></Field>
          </div>
          {act.error && <ErrorBox message={act.error} />}
          <Btn type="submit" variant="primary" disabled={act.busy || next === cur}>Alterar classificação</Btn>
        </form>
      ) : <p className="text-sm text-ink-soft">Somente administradores alteram a classificação oficial.</p>}
    </Panel>
  );
}

function ReviewSection({ d }: { d: DubberDetails }) {
  const { repo, actor } = useApp();
  const act = useAction();
  const canChange = can(actor.role, 'classification.change');
  const [criteria, setCriteria] = useState('');
  const [comments, setComments] = useState('');
  const [next, setNext] = useState<ClassificationKey | ''>('');
  const [reason, setReason] = useState('');

  function submit() {
    const parsed = criteria.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? { label: l.slice(0, i).trim(), notes: l.slice(i + 1).trim() } : { label: l };
    });
    void act.run(() => repo.addReview(actor, { dubberId: d.dubber.id, criteria: parsed, comments, newClassification: next || undefined, reason })).then((ok) => {
      if (ok) { setCriteria(''); setComments(''); setNext(''); setReason(''); }
    });
  }

  return (
    <Panel title="Avaliações">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Critérios avaliados" hint="Um por linha. Use “critério: observação” se quiser anotar. Os critérios são definidos pela equipe."><textarea className={inputCls} rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={'Interpretação: boa variação emocional\nQualidade de áudio'} /></Field>
        <Field label="Comentários internos"><textarea className={inputCls} rows={2} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
        {canChange && (
          <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
            <Field label="Classificação após a avaliação"><select className={inputCls} value={next} onChange={(e) => setNext(e.target.value as ClassificationKey | '')}><option value="">Manter ({CLASSIFICATION_LABELS[d.dubber.classification]})</option>{CLASSIFICATION_KEYS.filter((k) => k !== d.dubber.classification).map((k) => <option key={k} value={k}>{CLASSIFICATION_LABELS[k]}</option>)}</select></Field>
            {next && <Field label="Motivo da mudança"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Obrigatório" /></Field>}
          </div>
        )}
        {act.error && <ErrorBox message={act.error} />}
        <Btn type="submit" variant="primary" disabled={act.busy}>Registrar avaliação</Btn>
      </form>
      {d.reviews.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {d.reviews.map((r) => (
            <li key={r.id} className="space-y-0.5 py-2.5 text-sm">
              <p className="flex flex-wrap items-center gap-1.5">{r.previousClassification === r.newClassification ? <>Manteve <ClassBadge value={r.newClassification} /></> : <><ClassBadge value={r.previousClassification} /><span aria-label="para">→</span><ClassBadge value={r.newClassification} /></>}</p>
              {r.criteria.length > 0 && <p className="text-ink-soft">Critérios: {r.criteria.map((c) => (c.notes ? `${c.label} (${c.notes})` : c.label)).join('; ')}</p>}
              {r.comments && <p>{r.comments}</p>}
              {r.reason && <p className="text-ink-soft">Motivo: {r.reason}</p>}
              <p className="text-xs text-ink-soft">{fmtDateTime(r.createdAt)} · {r.reviewerName}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Notes({ d }: { d: DubberDetails }) {
  const { repo, actor } = useApp();
  const act = useAction();
  const [body, setBody] = useState('');
  return (
    <Panel title="Observações internas" aside={<span className="text-xs text-ink-soft">visíveis só à equipe</span>}>
      {d.notes.length === 0 ? <Empty>Nenhuma observação.</Empty> : (
        <ul className="divide-y divide-line">
          {d.notes.map((n) => <li key={n.id} className="py-2 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="text-xs text-ink-soft">{fmtDateTime(n.createdAt)} · {n.authorName}</p></li>)}
        </ul>
      )}
      {can(actor.role, 'note.create') && (
        <form className="mt-3 space-y-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); void act.run(() => repo.addNote(actor, d.dubber.id, body)).then((ok) => ok && setBody('')); }}>
          <Field label="Nova observação"><textarea className={inputCls} rows={2} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          {act.error && <ErrorBox message={act.error} />}
          <Btn type="submit" disabled={act.busy || !body.trim()}>Adicionar observação</Btn>
        </form>
      )}
    </Panel>
  );
}
