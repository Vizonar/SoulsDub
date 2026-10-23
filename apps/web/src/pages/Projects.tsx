import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Btn, Empty } from '../components/ui.js';

export function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    const u = new URL('https://mhscqhfrhbczcczcultf.supabase.co/rest/v1/projects?select=*&order=created_at.desc');
    fetch(u.toString(), { headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oc2NxaGZyaGJjemNjemN1bHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjYwMzEsImV4cCI6MjEwODI0MjA0NH0.3Lk2y2F0Xk8s4y3N7x9q0w5r6t7u7v7w7w7w7w7w7w7w7w7w7w7w7w7w', 'Content-Type': 'application/json' } })
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setProjects(data); }).catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await fetch('https://mhscqhfrhbczcczcultf.supabase.co/rest/v1/projects', {
        method: 'POST',
        headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oc2NxaGZyaGJjemNjemN1bHRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjY2NjAzMSwiZXhwIjoyMTA4MjQyMDMxfQ.DUbOF7m7hqt6fEBGPIleGnOHl89VnxRl9dpo0Jo3Ne8', 'Content-Type': 'application/json', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oc2NxaGZyaGJjemNjemN1bHRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjY2NjAzMSwiZXhwIjoyMTA4MjQyMDMxfQ.DUbOF7m7hqt6fEBGPIleGnOHl89VnxRl9dpo0Jo3Ne8', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ title: newTitle.trim(), status: 'planejamento' })
      });
      if (res.ok) {
        setProjects(prev => [...prev, { id: Date.now().toString(), title: newTitle.trim(), status: 'planejamento' }]);
        setNewTitle('');
        alert('Projeto criado!');
      } else {
        alert('Erro ao criar: ' + res.status);
      }
    } catch (err) {
      alert('Erro de rede');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-white uppercase brush-glow">Projetos</h1>
        <p className="text-xs text-purple-300/70 font-tech">Monte elencos por projeto e atribua personagens.</p>
      </div>
      <Panel title="Projetos Ativos">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length === 0 ? (
            <Empty>Nenhum projeto cadastrado ainda.</Empty>
          ) : (
            projects.map((p: any) => (
              <Link key={p.id} to={`/projetos/${p.id}`} className="neon-card rounded-xl p-4 block hover:border-accent-glow/60 transition-colors">
                <h3 className="font-display text-xl text-white">{p.title}</h3>
                <div className="flex justify-between items-center mt-3 text-xs font-tech">
                  <span className="text-accent-neon bg-accent-deep/40 px-2 py-0.5 rounded">{p.status || 'planejamento'}</span>
                  <span className="text-purple-300/60">{p.chars || 0} papéis</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </Panel>
      <Panel title="Criar Projeto">
        <form onSubmit={handleCreate} className="flex gap-2">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Nome do projeto..." className="flex-1 bg-void border border-accent-glow/30 rounded-xl px-3 py-2 text-xs text-accent-light placeholder:text-accent-neon/40 focus:border-accent-glow" />
          <Btn type="submit">Criar</Btn>
        </form>
      </Panel>
    </div>
  );
}
