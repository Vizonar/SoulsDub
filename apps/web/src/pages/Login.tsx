import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      navigate('/fichas', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="brand">
          <span className="brand-mark">VT</span>
          <div>
            <h1>Vox Trupe Studios</h1>
            <p className="muted">Painel de elenco</p>
          </div>
        </div>

        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Usuário</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="muted tiny">
          Primeiro acesso? O administrador do estúdio cria o usuário com <code>npm run user:create</code>.
        </p>
      </div>
    </div>
  );
}
