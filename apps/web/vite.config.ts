import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// O .env fica na raiz do monorepo. Só variáveis com prefixo VITE_ chegam ao navegador.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../..',
  server: { port: 5173, open: true },
});
