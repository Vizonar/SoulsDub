import {
  AVAILABILITY_PRESETS, CLASSIFICATION_KEYS, CLASSIFICATION_LABELS, INTENSITY_KEYS, INTENSITY_LABELS, INTEREST_PRESETS,
  SELF_LEVEL_KEYS, SELF_LEVEL_LABELS, SPECIALTY_SUGGESTIONS, SPEECH_SPEED_KEYS, SPEECH_SPEED_LABELS, VOICE_TONE_KEYS,
  VOICE_TONE_LABELS, VOICE_TYPE_KEYS, VOICE_TYPE_LABELS, labelOf, type DubberFilters,
} from '@soul/shared';
import { Btn, Field, Select, inputCls } from './ui.js';

const o = <K extends string>(keys: readonly K[], labels: Record<string, string>) => keys.map((k) => ({ value: k, label: labels[k] ?? k }));
const dyn = (presets: readonly string[], extra: string[]) => [...new Set([...presets, ...extra])].map((v) => ({ value: v, label: labelOf(v) }));

export interface FilterOptions { specialties: string[]; availability: string[]; interests: string[] }

export function FilterBar({ filters, onChange, options }: { filters: DubberFilters; onChange: (f: DubberFilters) => void; options: FilterOptions }) {
  const set = <K extends keyof DubberFilters>(k: K) => (v: DubberFilters[K] | '') => onChange({ ...filters, [k]: v === '' ? undefined : v });
  const active = Object.values(filters).some((v) => v !== undefined && v !== '' && v !== 'all');
  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Buscar por nome, nick ou ID do Discord">
          <input className={inputCls} type="search" placeholder="Ex.: Aurora ou 990000…" value={filters.search ?? ''} onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })} />
        </Field>
        <Select label="Classificação oficial" value={filters.classification ?? ''} onChange={set('classification')} options={o(CLASSIFICATION_KEYS, CLASSIFICATION_LABELS)} />
        <Select label="Nível autodeclarado" value={filters.selfLevel ?? ''} onChange={set('selfLevel')} options={o(SELF_LEVEL_KEYS, SELF_LEVEL_LABELS)} />
        <Select label="Situação" value={filters.status ?? ''} all="Todas" onChange={set('status')} options={[{ value: 'active', label: 'Ativos' }, { value: 'inactive', label: 'Inativos' }]} />
        <Select label="Tom de voz" value={filters.voiceTone ?? ''} onChange={set('voiceTone')} options={o(VOICE_TONE_KEYS, VOICE_TONE_LABELS)} />
        <Select label="Tipo de voz" value={filters.voiceType ?? ''} onChange={set('voiceType')} options={o(VOICE_TYPE_KEYS, VOICE_TYPE_LABELS)} />
        <Select label="Intensidade" value={filters.intensity ?? ''} onChange={set('intensity')} options={o(INTENSITY_KEYS, INTENSITY_LABELS)} />
        <Select label="Velocidade de fala" value={filters.speechSpeed ?? ''} onChange={set('speechSpeed')} options={o(SPEECH_SPEED_KEYS, SPEECH_SPEED_LABELS)} />
        <Select label="Especialidade" value={filters.specialty ?? ''} onChange={set('specialty')} options={dyn(SPECIALTY_SUGGESTIONS, options.specialties)} />
        <Select label="Disponibilidade" value={filters.availability ?? ''} onChange={set('availability')} options={dyn(AVAILABILITY_PRESETS, options.availability)} />
        <Select label="Projeto de interesse" value={filters.interest ?? ''} onChange={set('interest')} options={dyn(INTEREST_PRESETS, options.interests)} />
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-soul" checked={filters.needsReview === true} onChange={(e) => onChange({ ...filters, needsReview: e.target.checked ? true : undefined })} />
            Só fichas para revisar
          </label>
        </div>
      </div>
      {active && <Btn variant="ghost" onClick={() => onChange({})}>Limpar filtros</Btn>}
    </div>
  );
}
