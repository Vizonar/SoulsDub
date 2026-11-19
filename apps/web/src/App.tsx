import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import Fichas from './pages/Fichas';
import FichaDetalhe from './pages/FichaDetalhe';
import Projetos from './pages/Projetos';
import ProjetoDetalhe from './pages/ProjetoDetalhe';
import Dashboard from './pages/Dashboard';
import MeuRoteiro from './pages/MeuRoteiro';
import { DubladorPublico, DubladoresPublicos } from './pages/DubladorPublico';

function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand small">
          <span className="brand-mark">VT</span>
          <div>
            <strong>Vox Trupe</strong>
            <p className="muted tiny">Studios</p>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
            Visão geral
          </NavLink>
          <NavLink to="/fichas" className={({ isActive }) => (isActive ? 'active' : '')}>
            Fichas
          </NavLink>
          <NavLink to="/projetos" className={({ isActive }) => (isActive ? 'active' : '')}>
            Projetos
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <p className="small">{user?.name}</p>
          <p className="muted tiny">{user?.role === 'admin' ? 'Administrador' : 'Revisor'}</p>
          <button className="btn ghost small" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function Private() {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted center">Carregando...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dubladores" element={<DubladoresPublicos />} />
          <Route path="/dubladores/:slug" element={<DubladorPublico />} />
          <Route element={<Private />}>
            <Route path="/fichas" element={<Fichas />} />
            <Route path="/fichas/:id" element={<FichaDetalhe />} />
            <Route path="/projetos" element={<Projetos />} />
            <Route path="/projetos/:id" element={<ProjetoDetalhe />} />
            <Route path="/projetos/:projectId/roteiro/:dubberId" element={<MeuRoteiro />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
