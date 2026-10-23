import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { can } from '@soul/shared';
import { useApp } from '../lib/app-context.js';
import { Btn, Logo } from './ui.js';

const link = ({ isActive }: { isActive: boolean }) =>
  `flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-soul text-white' : 'text-ink-soft hover:bg-soul-tint hover:text-ink'}`;

export function Layout({ children }: { children: ReactNode }) {
  const { mode, actor, setDemoRole, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-1" onClick={() => setOpen(false)} aria-label="Principal">
      <NavLink to="/" end className={link}>Dashboard</NavLink>
      <NavLink to="/dubladores" className={link}>Dubladores</NavLink>
      <NavLink to="/projetos" className={link}>Projetos</NavLink>
      <NavLink to="/avaliacoes" className={link}>Avaliações</NavLink>
      {can(actor.role, 'audit.read') && <NavLink to="/atividade" className={link}>Atividade</NavLink>}
    </nav>
  );
  return (
    <div className="flex min-h-full flex-col">
      {mode === 'demo' && (
        <div role="note" className="bg-gold-tint px-4 py-1.5 text-center text-xs font-medium text-gold">
          MODO DEMONSTRAÇÃO — dados fictícios em memória. Não está conectado ao Discord nem ao banco de produção; ao recarregar, tudo volta ao início.
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-line bg-white p-4 md:flex">
          <div>
            <div className="mb-6 flex items-center gap-2.5 px-1">
              <Logo className="h-8 w-8" />
              <div className="leading-tight">
                <p className="font-semibold tracking-tight">Soul Dublers</p>
                <p className="text-xs text-ink-soft">Cadastro de dubladores</p>
              </div>
            </div>
            {nav}
          </div>
          <Session />
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-line bg-white px-4 py-2 md:hidden">
            <span className="flex items-center gap-2 font-semibold"><Logo className="h-6 w-6" />Soul Dublers</span>
            <Btn variant="ghost" aria-expanded={open} aria-controls="menu-movel" onClick={() => setOpen((o) => !o)}>Menu</Btn>
          </header>
          {open && <div id="menu-movel" className="space-y-3 border-b border-line bg-white p-3 md:hidden">{nav}<Session /></div>}
          <main className="mx-auto max-w-[88rem] p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  );

  function Session() {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">{actor.name}</p>
        {mode === 'demo' && setDemoRole ? (
          <label className="block text-xs text-ink-soft">
            Testar como
            <select className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink" value={actor.role} onChange={(e) => setDemoRole(e.target.value as 'admin' | 'reviewer')}>
              <option value="admin">Administrador</option>
              <option value="reviewer">Avaliador</option>
            </select>
          </label>
        ) : (
          <p className="text-xs text-ink-soft">{actor.role === 'admin' ? 'Administrador' : 'Avaliador'}</p>
        )}
        {signOut && <Btn variant="ghost" onClick={signOut} className="w-full justify-start">Sair</Btn>}
      </div>
    );
  }
}
