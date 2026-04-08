export const SYSTEM_ROLES = {
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Admin',
  TECNICO: 'Tecnico',
  CLIENTE: 'Cliente',
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export const DEFAULT_SYSTEM_ROLES: SystemRoleName[] = [
  SYSTEM_ROLES.SUPERADMIN,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.TECNICO,
  SYSTEM_ROLES.CLIENTE,
];
