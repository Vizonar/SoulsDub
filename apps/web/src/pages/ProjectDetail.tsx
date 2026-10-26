import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Panel } from '../components/ui.js';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [status, setStatus] = useState('planejamento');

  useEffect(() => {
    if (!id) return;
    fetch(`https://mhscqhfrhbczcczcultf.supabase.co/rest/v1/projects?id=eq.${id}`, {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFub24iLCJpYXQiOjE3OTI2NjYwMzEsImV4cCI6MjEwODI0MjAzMX0.FNoQ2pGSc3RJ5OonG_rnrnsOEw9cVZpKaRcHlcbUWwQ',
        'Content-Type': 'application/json'
      }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setProject(data[0]);
          setStatus(data[0].status || 'planejamento');
        }
      })
      .catch(() => {});
  }, [id]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projetos" className="text-xs text-purple-300 underline">← Voltar</Link>
        <h1 className="font-brush text-3xl text-white uppercase brush-glow">{project?.title || 'Projeto'}</h1>
        <div className="flex gap-2 mt-3 flex-wrap">
          {['não iniciado', 'em produção', 'pronto', 'planejamento', 'finalizado'].map(s => (
            <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1 rounded text-xs font-tech ${status === s ? 'bg-accent-glow text-white' : 'bg-void border border-white/10 text-purple-300'}`}>{s}</button>
          ))}
        </div>
      </div>
      <Panel title="Participantes / Elenco">
        <p className="text-xs text-purple-300">Em desenvolvimento — conectará a `castings`</p>
      </Panel>
      <Panel title="Episódios">
        <p className="text-xs text-purple-300">Em desenvolvimento — conectará a `episodes`</p>
      </Panel>
    </div>
  );
}
