import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CLASSIFICATION_LABELS, labelOf, type ClassificationKey } from '@soul/shared';

const CLASS_STYLE: Record<ClassificationKey, string> = {
  novato: 'bg-accent-deep/60 text-accent-neon ring-accent-glow/40',
  aprendiz: 'bg-accent-deep/50 text-accent-light ring-accent-glow/30',
  intermediario: 'bg-accent-deep/40 text-accent-light ring-accent-glow/20',
  avancado: 'bg-accent-dark/60 text-accent-neon ring-accent-glow/50',
  elite: 'bg-accent-glow/20 text-accent-light ring-accent-light/50',
};

export function ClassBadge({ value }: { value: ClassificationKey }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${CLASS_STYLE[value]}`}>
      {CLASSIFICATION_LABELS[value]}
    </span>
  );
}

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'mint' | 'signal' | 'soul' }) {
  const tones = {
    plain: 'bg-white text-ink-soft ring-line',
    mint: 'bg-mint-tint text-mint ring-mint/30',
    signal: 'bg-signal-tint text-signal ring-signal/30',
    soul: 'bg-soul-tint text-soul-deep ring-soul/30',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export const Tags = ({ items, empty = '—' }: { items: readonly string[]; empty?: string }) =>
  items.length === 0 ? (
    <span className="text-ink-soft">{empty}</span>
  ) : (
    <span className="flex flex-wrap gap-1">
      {items.map((t) => (
        <Chip key={t}>{labelOf(t)}</Chip>
      ))}
    </span>
  );

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'subtle' };
export function Btn({ variant = 'subtle', className = '', ...p }: BtnProps) {
  const v = {
    primary: 'bg-accent-glow text-white hover:bg-accent-light disabled:bg-accent-glow/40',
    subtle: 'bg-card text-ink border border-accent-glow/30 hover:bg-accent-deep/50 disabled:text-ink-soft/50',
    ghost: 'text-ink-soft hover:bg-accent-deep/30 hover:text-accent-light',
    danger: 'bg-signal text-white hover:bg-red-600 disabled:bg-signal/40',
  }[variant];
  return <button type="button" {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${v} ${className}`} />;
}

export const inputCls =
  'w-full rounded-xl border border-accent-glow/30 bg-void px-3.5 py-2 text-xs text-accent-light placeholder:text-accent-neon/40 focus:border-accent-glow focus:outline-none focus:ring-1 focus:ring-accent-glow';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-tech text-accent-neon uppercase tracking-wider">
      <span className="mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-accent-neon/50">{hint}</span>}
    </label>
  );
}

export function Select<T extends string>({
  value, onChange, options, all = 'Todos', label,
}: { value: T | ''; onChange: (v: T | '') => void; options: readonly { value: T; label: string }[]; all?: string; label: string }) {
  return (
    <Field label={label}>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T | '')}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export const Panel = ({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="neon-card rounded-xl border border-accent-glow/30 bg-surface/90">
    {title && (
      <header className="flex items-center justify-between border-b border-accent-glow/20 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-accent-light uppercase tracking-wider">{title}</h2>
        {aside}
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);

export const Loading = () => <p className="p-6 text-sm text-ink-soft" role="status">Carregando…</p>;
export const ErrorBox = ({ message }: { message: string }) => (
  <p role="alert" className="rounded-lg bg-signal-tint px-3 py-2 text-sm text-signal">{message}</p>
);
export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;

export function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-sm">
          <span className="truncate text-ink-soft">{r.label}</span>
          <span className="h-2 rounded-full bg-soul-tint">
            <span className="block h-2 rounded-full bg-soul" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="tabular text-right font-medium">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#5b3fd1" />
      <path d="M8 17v-2m4 5V12m4 11V9m4 11V12m4 5v-2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
