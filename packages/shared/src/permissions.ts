import type { Role } from './types.js';

export type Permission =
  | 'dubber.read'
  | 'dubber.edit'
  | 'dubber.setActive'
  | 'classification.change'
  | 'review.create'
  | 'note.read'
  | 'note.create'
  | 'audit.read'
  | 'export.csv'
  | 'sample.read'
  | 'sample.upload'
  | 'sample.delete';

/**
 * admin: tudo. reviewer (avaliador): lê fichas, registra avaliações e observações,
 * mas não altera classificação, não edita fichas, não exporta e não vê o log de auditoria.
 */
const MATRIX: Record<Role, readonly Permission[]> = {
  admin: [
    'dubber.read', 'dubber.edit', 'dubber.setActive', 'classification.change',
    'review.create', 'note.read', 'note.create', 'audit.read', 'export.csv',
    'sample.read', 'sample.upload', 'sample.delete',
  ],
  reviewer: ['dubber.read', 'review.create', 'note.read', 'note.create', 'sample.read'],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && MATRIX[role].includes(permission);
}

export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`Sem permissão para esta ação (${permission}).`);
    this.name = 'PermissionError';
  }
}

export function assertCan(role: Role | null | undefined, permission: Permission): void {
  if (!can(role, permission)) throw new PermissionError(permission);
}
