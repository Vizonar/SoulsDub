import { labelOf, parseListText } from '@soul/shared';
import { inputCls } from './ui.js';

/** Sugestões marcáveis + campo livre para criar novas categorias (separadas por vírgula). */
export function TagPicker({ legend, presets, value, onChange }: { legend: string; presets: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  const customs = value.filter((t) => !presets.includes(t));
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter((t) => t !== p) : [...value, p]);
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {presets.map((p) => (
          <label key={p} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-soul" checked={value.includes(p)} onChange={() => toggle(p)} />{labelOf(p)}
          </label>
        ))}
      </div>
      <input
        className={inputCls}
        aria-label={`${legend}: outras categorias`}
        placeholder="Outras (separe por vírgula)"
        defaultValue={customs.join(', ')}
        onBlur={(e) => onChange([...new Set([...value.filter((t) => presets.includes(t)), ...parseListText(e.target.value)])])}
      />
    </fieldset>
  );
}
