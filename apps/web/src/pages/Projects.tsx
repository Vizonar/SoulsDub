import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Btn, Empty, Loading } from '../components/ui.js';
import { useApp } from '../lib/app-context.js';

export function Projects() {
  const { repo, actor } = useApp();
  const [projects, setProjects] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
    const { data, error } = await (repo as any).db.from('projects').insert({ title: newTitle.trim(), status: 'planejamento' }).select('*').single();
      if (error) { alert('Erro: ' + error.message); return; }
      setProjects(prev => [...prev, data]);
      setNewTitle('');
    } catch (err) {
      alert('Erro ao criar projeto. Verifique se a tabela projects existe no Supabase.');
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
                  <span className="text-accent-neon bg-accent-deep/40 px-2 py-0.5 rounded">{p.status}</span>
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
