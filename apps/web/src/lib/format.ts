export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const ACTIONS: Record<string, string> = {
  'dubber.created': 'Ficha criada pelo bot',
  'dubber.self_updated': 'Ficha atualizada pelo dublador',
  'dubber.updated': 'Ficha editada',
  'dubber.active_changed': 'Status ativo/inativo alterado',
  'dubber.reviewed': 'Marcada como revisada',
  'classification.changed': 'Classificação alterada',
  'review.created': 'Avaliação registrada',
  'note.created': 'Observação interna adicionada',
  'dubbers.insert': 'Ficha criada',
  'dubbers.update': 'Ficha editada',
  'dubber_reviews.insert': 'Avaliação registrada',
  'dubber_classification_history.insert': 'Classificação alterada',
  'dubber_internal_notes.insert': 'Observação interna adicionada',
  'admin_users.insert': 'Administrador adicionado',
  'admin_users.update': 'Administrador alterado',
  'admin_users.delete': 'Administrador removido',
};
export const actionLabel = (a: string) => ACTIONS[a] ?? a;

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
