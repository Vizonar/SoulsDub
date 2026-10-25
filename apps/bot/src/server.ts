import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const app = express();
app.use(cors({ origin: ['https://Vizonar.github.io', 'http://localhost:5173', 'http://localhost:3080', 'https://soulsdub-1.onrender.com'], credentials: true }));
app.use(express.json());

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

app.get('/api/projetos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro' });
  }
});

app.post('/api/projetos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').insert(req.body).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro' });
  }
});

app.get('/api/projetos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Não encontrado' });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[proxy] /api/projetos em http://localhost:${PORT}`));
