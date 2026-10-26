import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Btn, Empty } from '../components/ui.js';
import { useApp } from '../lib/app-context.js';

export function Projects() {
  const { actor } = useApp() as any;
  const [projects, setProjects] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');

  if (!actor) {
    return (
      <div className="space-y-6">
        <h1 className="font-brush text-3xl text-white uppercase brush-glow">Projetos</h1>
        <div className="bg-void border border-accent-glow/20 rounded-xl p-6 text-center">
          <h2 className="font-display text-xl text-white mb-2">Acesso Restrito</h2>
          <p className="text-sm text-purple-300">Apenas administradores e avaliadores autorizados podem acessar os projetos.</p>
          <p className="text-xs text-purple-300/60 mt-2">Faça login no <a href="/" className="underline text-acent-neon">Dashboard</a> para continuar.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    fetch('https://mhscqhfrhbczcczcultf.supabase.co/rest/v1/projects?select=*&order=created_at.desc', {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFub24iLCJpYXQiOjE3OTI2NjYwMzEsImV4cCI6MjEwODI0MjAzMX0.FNoQ2pGSc3RJ5OonG_rnrnsOEw9cVZpKaRcHlcbUWwQ'
      }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(err => console.log('Erro fetch:', err));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await fetch('https://mhscqhfrhbczcczcultf.supabase.co/rest/v1/projects', {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFub24iLCJpYXQiOjE3OTI2NjYwMzEsImV4cCI6MjEwODI0MjAzMX0.FNoQ2pGSc3RJ5OonG_rnrnsOEw9cVZpKaRcHlcbUWwQ',
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ title: newTitle.trim(), status: 'planejamento' })
      });
      const json = await res.json();
      const result = json.data || json;
      if (result && result.id) {
        setProjects(prev => [...prev, result]);
        setNewTitle('');
        alert('Projeto criado!');
      } else {
        alert('Projeto salvo, mas resposta inesperada: ' + JSON.stringify(json));
      }
    } catch (err) {
      alert('Erro ao criar projeto');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-brush text-3xl text-white uppercase brush-glow">Projetos</h1>
      <Panel title="Projetos Ativos">
        <div className="space-y-3">
          {projects.length === 0 ? <Empty>Nenhum projeto cadastrado ainda.</Empty> : projects.map((p: any) => (
            <Link key={p.id} to={`/projetos/${p.id}`} className="block bg-void border border-accent-glow/20 rounded-xl p-4 hover:border-accent-glow transition-colors">
              <h3 className="font-display text-xl text-white">{p.title}</h3>
              <p className="text-xs text-purple-300 font-tech">Status: {p.status || 'planejamento'}</p>
            </Link>
          ))}
        </div>
      </Panel>
      <Panel title="Criar Projeto">
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Nome do projeto..."
            className="flex-1 bg-void border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-glow"
          />
          <Btn type="submit">Criar</Btn>
        </form>
      </Panel>
    </div>
  );
}
