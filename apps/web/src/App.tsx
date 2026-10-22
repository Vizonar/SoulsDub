import { useMemo, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { DEMO_ADMIN, DEMO_REVIEWER, type Actor } from '@soul/shared';
import { Layout } from './components/Layout.js';
import { ErrorBox } from './components/ui.js';
import { AppProvider } from './lib/app-context.js';
import { parseEnv } from './lib/env.js';
import { createBackend, type AppBackend } from './lib/repository-factory.js';
import { Activity } from './pages/Activity.js';
import { Dashboard } from './pages/Dashboard.js';
import { Directory } from './pages/Directory.js';
import { AuthLoading, LoginScreen, NoAccess, useSession, useStaffActor } from './pages/Login.js';
import { Reviews } from './pages/Reviews.js';

function Shell() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dubladores/:id?" element={<Directory />} />
        <Route path="/avaliacoes" element={<Reviews />} />
        <Route path="/atividade" element={<Activity />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Layout>
  );
}

function DemoApp({ backend }: { backend: Extract<AppBackend, { kind: 'demo' }> }) {
  const [role, setRole] = useState<Actor['role']>('admin');
  const actor = role === 'admin' ? DEMO_ADMIN : DEMO_REVIEWER;
  return (
    <AppProvider mode="demo" repo={backend.repo} actor={actor} setDemoRole={setRole}>
      <HashRouter><Shell /></HashRouter>
    </AppProvider>
  );
}

function ProductionApp({ backend }: { backend: Extract<AppBackend, { kind: 'production' }> }) {
  const session = useSession(backend.supabase);
  const staff = useStaffActor(backend.supabase, session);
  const signOut = () => void backend.supabase.auth.signOut();
  if (session === undefined || (session && staff.loading)) return <AuthLoading />;
  if (!session) return <LoginScreen supabase={backend.supabase} />;
  if (!staff.data) return <NoAccess onSignOut={signOut} error={staff.error} />;
  return (
    <AppProvider mode="production" repo={backend.repo} actor={staff.data} signOut={signOut}>
      <HashRouter><Shell /></HashRouter>
    </AppProvider>
  );
}

export default function App() {
  const backend = useMemo(() => createBackend(parseEnv(import.meta.env as Record<string, string | undefined>)), []);
  if (backend.kind === 'misconfigured') {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-8">
        <h1 className="text-xl font-semibold">Configuração incompleta</h1>
        {backend.problems.map((p) => <ErrorBox key={p} message={p} />)}
        <p className="text-sm text-ink-soft">Ajuste o arquivo .env e reinicie. Para apenas explorar, use VITE_APP_MODE=demo.</p>
      </div>
    );
  }
  return backend.kind === 'demo' ? <DemoApp backend={backend} /> : <ProductionApp backend={backend} />;
}
