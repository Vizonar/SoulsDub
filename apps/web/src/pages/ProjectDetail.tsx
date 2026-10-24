import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Panel, Btn, Empty } from '../components/ui.js';
import { useApp } from '../lib/app-context.js';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useApp() as any;
  const [project, setProject] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [status, setStatus] = useState('planejamento');
  const [newEpisode, setNewEpisode] = useState('');
  const [newChar, setNewChar] = useState('');

  useEffect(() => {
    if (!supabase || !id) return;
    supabase.from('projects').select('*').eq('id', id).single().then(({ data }: any) => {
      if (data) { setProject(data); setStatus(data.status || 'planejamento'); }
    });
    supabase.from('castings').select('*, dubbers(display_name)').eq('project_id', id).then(({ data }: any) => {
      if (data) setMembers(data);
    });
  }, [supabase, id]);

  const handleStatusChange = async (s: string) => {
    if (!supabase || !id) return;
    await supabase.from('projects').update({ status: s }).eq('id', id);
    setStatus(s);
  };

  const handleCreateEpisode = () => {
    const ep = { id: Date.now().toString(), title: newEpisode, status: 'não iniciado' };
    setEpisodes([...episodes, ep]);
    setNewEpisode('');
  };

  const handleAddChar = (memberId: string) => {
    const updated = members.map(m => m.dubber_id === memberId ? { ...m, character: newChar } : m);
    setMembers(updated);
    setNewChar('');
  };

  const statusColors: Record<string, string> = {
    'não iniciado': 'bg-slate-600',
    'em produção': 'bg-amber-500',
    'pronto': 'bg-emerald-500',
    'planejamento': 'bg-purple-500',
    'finalizado': 'bg-blue-500',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-3xl text-white uppercase brush-glow">{project?.title || 'Projeto'}</h1>
        <div className="flex gap-2 mt-3 flex-wrap">
          {['não iniciado', 'em produção', 'pronto', 'planejamento', 'finalizado'].map(s => (
            <button key={s} onClick={() => handleStatusChange(s)} className={`px-3 py-1 rounded text-xs font-tech ${status === s ? 'bg-accent-glow text-white' : 'bg-void border border-white/10 text-purple-300'}`}>{s}</button>
          ))}
        </div>
      </div>

      <Panel title="Participantes / Elenco">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {members.length === 0 ? <Empty>Nenhum participante.</Empty> : members.map((m: any) => (
            <div key={m.id} className="bg-void border border-accent-glow/20 rounded-xl p-3">
              <h3 className="font-display text-lg text-white">{m.dubbers?.display_name || 'Dublador'}</h3>
              <p className="text-xs text-purple-300/70">Personagem: <span className="text-white font-tech">{m.character || '—'}</span></p>
              <div className="flex gap-2 mt-2">
                <input value={newChar} onChange={e => setNewChar(e.target.value)} placeholder="Personagem..." className="flex-1 bg-void border border-accent-glow/30 rounded px-2 py-1 text-xs" />
                <Btn onClick={() => handleAddChar(m.dubber_id)} className="text-xs">Atribuir</Btn>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Episódios">
        <div className="space-y-2">
          {episodes.map(ep => (
            <div key={ep.id} className="flex items-center gap-3 bg-void border border-accent-glow/20 rounded-xl p-3">
              <span className={`w-2 h-2 rounded-full ${statusColors[ep.status] || 'bg-slate-500'}`}></span>
              <h3 className="font-display text-white flex-1">{ep.title}</h3>
              <span className="text-xs font-tech text-purple-300">{ep.status}</span>
            </div>
          ))}
          <form onSubmit={e => { e.preventDefault(); handleCreateEpisode(); }} className="flex gap-2">
            <input value={newEpisode} onChange={e => setNewEpisode(e.target.value)} placeholder="Título do EP..." className="flex-1 bg-void border border-accent-glow/30 rounded-xl px-3 py-2 text-xs" />
            <Btn type="submit">Criar EP</Btn>
          </form>
        </div>
      </Panel>
    </div>
  );
}
