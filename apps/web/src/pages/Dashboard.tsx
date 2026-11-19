import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

interface Stats {
  projects: number;
  episodes: number;
  activeDubbers: number;
  pendingSamples: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .dashboard()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch((e: unknown) => {
        if (alive) setError(errorText(e, 'Erro ao carregar o painel'));
      });
    return () => {
      alive = false;
    };
  }, []);

  async function baixarBackup() {
    try {
      const data = await api.backup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vox-trupe-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(errorText(e, 'Erro ao exportar backup'));
    }
  }

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h2>Visão geral</h2>
          <p className="muted">Resumo do estúdio em tempo real</p>
        </div>
        <button className="btn ghost small" onClick={() => void baixarBackup()}>
          Exportar backup (.json)
        </button>
      </header>

      {error && <p className="error">{error}</p>}
      {!stats && !error && <p className="muted">Carregando...</p>}

      {stats && (
        <div className="grid dash-grid">
          <div className="card dash-card">
            <strong className="dash-num">{stats.projects}</strong>
            <span className="muted small">Projetos</span>
          </div>
          <div className="card dash-card">
            <strong className="dash-num">{stats.episodes}</strong>
            <span className="muted small">Episódios</span>
          </div>
          <div className="card dash-card">
            <strong className="dash-num">{stats.activeDubbers}</strong>
            <span className="muted small">Dubladores ativos</span>
          </div>
          <div className="card dash-card">
            <strong className={`dash-num ${stats.pendingSamples > 0 ? 'dash-warn' : ''}`}>{stats.pendingSamples}</strong>
            <span className="muted small">Amostras pendentes</span>
          </div>
        </div>
      )}
    </div>
  );
}