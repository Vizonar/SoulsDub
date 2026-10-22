// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeToneWav } from '@soul/shared';
import App from './App.js';

beforeAll(() => {
  URL.createObjectURL = () => 'blob:teste';
  URL.revokeObjectURL = () => {};
  window.confirm = () => true;
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function (this: File) {
      return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(this); });
    };
  }
});
afterEach(() => { cleanup(); window.location.hash = ''; });

const dataRows = () => screen.getAllByRole('row').slice(1);
async function openDirectory() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('link', { name: 'Dubladores' }));
  await screen.findByRole('heading', { name: 'Dubladores' });
  await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
  return user;
}

describe('painel em modo DEMO (interface)', () => {
  it('abre sem credenciais, identifica o modo demo e mostra indicadores derivados dos 24 perfis', async () => {
    render(<App />);
    expect(await screen.findByText(/MODO DEMONSTRAÇÃO/)).toBeTruthy();
    expect(screen.getByText(/Não está conectado ao Discord nem ao banco de produção/)).toBeTruthy();
    await screen.findByRole('heading', { name: 'Visão geral' });
    expect(await screen.findByText('Dubladores cadastrados')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('Fichas para revisar')).toBeTruthy();
    expect(screen.getByRole('list', { name: /Degraus de classificação/ })).toBeTruthy();
  });

  it('diretório: pagina, busca por nome, combina filtros e limpa', async () => {
    const user = await openDirectory();
    expect(dataRows()).toHaveLength(10);
    expect(screen.getByText('24 fichas encontradas')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Página 2 de 3');

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'aurora');
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    expect(within(dataRows()[0]!).getByText('Aurora Eco')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    await user.selectOptions(screen.getByLabelText('Tom de voz'), 'medio');
    await waitFor(() => expect(screen.getByText(/fichas? encontradas?/).textContent).not.toBe('24 fichas encontradas'));
    const onlyTone = Number(/^(\d+)/.exec(screen.getByText(/fichas? encontradas?/).textContent ?? '')?.[1]);
    await user.selectOptions(screen.getByLabelText('Intensidade'), 'media');
    await waitFor(() => expect(Number(/^(\d+)/.exec(screen.getByText(/fichas? encontradas?/).textContent ?? '')?.[1])).toBeLessThanOrEqual(onlyTone));
    for (const r of dataRows()) { expect(within(r).getAllByText('Médio').length).toBeGreaterThan(0); expect(within(r).getAllByText('Média').length).toBeGreaterThan(0); }
  });

  it('abre a ficha completa, altera a classificação com motivo e registra no histórico', async () => {
    const user = await openDirectory();
    await user.selectOptions(screen.getByLabelText('Classificação oficial'), 'novato');
    await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
    await user.click(within(dataRows()[0]!).getAllByRole('button')[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do dublador' });
    expect(within(dialog).getByText('Cadastro e perfil vocal')).toBeTruthy();
    expect(within(dialog).getByText('Histórico de classificação')).toBeTruthy();

    await user.selectOptions(within(dialog).getByLabelText('Nova classificação'), 'aprendiz');
    const submit = within(dialog).getByRole('button', { name: 'Alterar classificação' });
    await user.click(submit); // sem motivo: deve falhar com mensagem
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await user.type(within(dialog).getByLabelText('Motivo da mudança'), 'Passou na avaliação prática');
    await user.click(submit);
    await waitFor(() => expect(within(dialog).getByText('Passou na avaliação prática')).toBeTruthy());
    expect(within(dialog).getAllByText('APRENDIZ').length).toBeGreaterThan(0);
  });

  it('avaliador ouve amostras mas não altera classificação, edita, envia áudio nem exporta', async () => {
    const user = await openDirectory();
    expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Testar como'), 'reviewer');
    await waitFor(() => expect(screen.queryByRole('button', { name: /Exportar CSV/ })).toBeNull());
    expect(screen.queryByRole('link', { name: 'Atividade' })).toBeNull();
    await user.click(within(dataRows()[0]!).getAllByRole('button')[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Alterar classificação' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Editar ficha' })).toBeNull();
    expect(within(dialog).getByText(/Somente administradores alteram a classificação oficial/)).toBeTruthy();
    expect(within(dialog).getByText('Amostras de voz')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Enviar amostra' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Registrar avaliação' })).toBeTruthy();
  });

  it('admin envia amostra WAV (validada pelo conteúdo) e rejeita arquivo falso', async () => {
    const user = await openDirectory();
    await user.type(screen.getByRole('searchbox'), 'Lia');
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    await user.click(within(dataRows()[0]!).getAllByRole('button')[0]!);
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(/Adicionar amostra/) as HTMLInputElement;
    const before = within(dialog).queryAllByLabelText(/^Ouvir /).length;

    await user.upload(input, new File([new TextEncoder().encode('isto não é áudio')], 'falso.mp3', { type: 'audio/mpeg' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enviar amostra' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/não parece ser um áudio/);

    await user.upload(input, new File([makeToneWav(330, 0.3) as BlobPart], 'minha-voz.wav', { type: 'audio/wav' }));
    await user.type(within(dialog).getByLabelText('Descrição (opcional)'), 'Leitura neutra');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar amostra' }));
    await waitFor(() => expect(within(dialog).queryAllByLabelText(/^Ouvir /).length).toBe(before + 1));
    expect(within(dialog).getByLabelText('Ouvir Leitura neutra')).toBeTruthy();
  });

  it('recarregar o app descarta as alterações do demo (dados isolados em memória)', async () => {
    vi.spyOn(Storage.prototype, 'setItem');
    await openDirectory();
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
  });
});
