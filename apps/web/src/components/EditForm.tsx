import { useState } from 'react';
import {
  AVAILABILITY_PRESETS, INTENSITY_KEYS, INTENSITY_LABELS, INTEREST_PRESETS, SELF_LEVEL_KEYS, SELF_LEVEL_LABELS,
  SPECIALTY_SUGGESTIONS, SPEECH_SPEED_KEYS, SPEECH_SPEED_LABELS, VOICE_TONE_KEYS, VOICE_TONE_LABELS, VOICE_TYPE_KEYS,
  VOICE_TYPE_LABELS, labelOf, parseListText, type Dubber, type DubberFormInput, type VoiceType,
} from '@soul/shared';
import { Btn, ErrorBox, Field, inputCls } from './ui.js';

function TagPicker({ label, presets, value, onChange }: { label: string; presets: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState(value.filter((v) => !presets.includes(v)).join(', '));
  const chosen = value.filter((v) => presets.includes(v));
  const emit = (picked: string[], text: string) => onChange([...new Set([...picked, ...parseListText(text)])]);
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {presets.map((p) => (
          <label key={p} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-soul" checked={chosen.includes(p)} onChange={(e) => emit(e.target.checked ? [...chosen, p] : chosen.filter((x) => x !== p), custom)} />
            {labelOf(p)}
          </label>
        ))}
      </div>
      <input className={inputCls} placeholder="Outras categorias, separadas por vírgula" value={custom} onChange={(e) => { setCustom(e.target.value); emit(chosen, e.target.value); }} />
    </fieldset>
  );
}

const opts = (keys: readonly string[], labels: Record<string, string>) => keys.map((k) => <option key={k} value={k}>{labels[k]}</option>);

export function EditForm({ dubber, onSave, onCancel, busy, error }: { dubber: Dubber; onSave: (p: Partial<DubberFormInput>) => void; onCancel: () => void; busy: boolean; error?: string }) {
  const [f, setF] = useState<DubberFormInput>({ ...dubber, age: dubber.age });
  const set = <K extends keyof DubberFormInput>(k: K, v: DubberFormInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = (k: 'displayName' | 'pronouns' | 'diction') => (
    <input className={inputCls} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
  );
  return (
    <form className="space-y-4 rounded-xl border border-soul/40 bg-white p-4" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <h3 className="font-semibold">Editar ficha</h3>
      <p className="text-xs text-ink-soft">A classificação oficial não é editada aqui: use “Alterar classificação”.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome / Nick">{text('displayName')}</Field>
        <Field label="Idade"><input className={inputCls} inputMode="numeric" value={f.age ?? ''} onChange={(e) => set('age', e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
        <Field label="Pronomes">{text('pronouns')}</Field>
        <Field label="Nível autodeclarado"><select className={inputCls} value={f.selfLevel} onChange={(e) => set('selfLevel', e.target.value as DubberFormInput['selfLevel'])}>{opts(SELF_LEVEL_KEYS, SELF_LEVEL_LABELS)}</select></Field>
        <Field label="Tom de voz"><select className={inputCls} value={f.voiceTone} onChange={(e) => set('voiceTone', e.target.value as DubberFormInput['voiceTone'])}>{opts(VOICE_TONE_KEYS, VOICE_TONE_LABELS)}</select></Field>
        <Field label="Intensidade"><select className={inputCls} value={f.intensity} onChange={(e) => set('intensity', e.target.value as DubberFormInput['intensity'])}>{opts(INTENSITY_KEYS, INTENSITY_LABELS)}</select></Field>
        <Field label="Velocidade de fala"><select className={inputCls} value={f.speechSpeed} onChange={(e) => set('speechSpeed', e.target.value as DubberFormInput['speechSpeed'])}>{opts(SPEED_KEYS, SPEECH_SPEED_LABELS)}</select></Field>
        <Field label="Dicção">{text('diction')}</Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Tipo de voz (uma ou mais)</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {VOICE_TYPE_KEYS.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-soul" checked={f.voiceTypes.includes(t)} onChange={(e) => set('voiceTypes', e.target.checked ? [...f.voiceTypes, t] : f.voiceTypes.filter((x: VoiceType) => x !== t))} />
              {VOICE_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <TagPicker label="Especialidades" presets={SPECIALTY_SUGGESTIONS} value={f.specialties ?? []} onChange={(v) => set('specialties', v)} />
      <TagPicker label="Disponibilidade" presets={AVAILABILITY_PRESETS} value={f.availability ?? []} onChange={(v) => set('availability', v)} />
      <TagPicker label="Projetos de interesse" presets={INTEREST_PRESETS} value={f.interests ?? []} onChange={(v) => set('interests', v)} />
      <Field label="Experiência"><textarea className={inputCls} rows={3} value={f.experience ?? ''} onChange={(e) => set('experience', e.target.value)} /></Field>
      <Field label="Personagens que gostaria de interpretar"><textarea className={inputCls} rows={3} value={f.wantedCharacters ?? ''} onChange={(e) => set('wantedCharacters', e.target.value)} /></Field>
      {error && <ErrorBox message={error} />}
      <div className="flex gap-2"><Btn type="submit" variant="primary" disabled={busy}>Salvar alterações</Btn><Btn onClick={onCancel}>Cancelar</Btn></div>
    </form>
  );
}
const SPEED_KEYS = SPEECH_SPEED_KEYS;
