import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import Fichas from './pages/Fichas';
import FichaDetalhe from './pages/FichaDetalhe';
import Projetos from './pages/Projetos';
import ProjetoDetalhe from './pages/ProjetoDetalhe';

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
          <Route element={<Private />}>
            <Route path="/fichas" element={<Fichas />} />
            <Route path="/fichas/:id" element={<FichaDetalhe />} />
            <Route path="/projetos" element={<Projetos />} />
            <Route path="/projetos/:id" element={<ProjetoDetalhe />} />
            <Route path="/" element={<Navigate to="/fichas" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/fichas" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
