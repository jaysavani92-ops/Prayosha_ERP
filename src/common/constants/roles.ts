/**
 * Roles are taken from the existing Prayosha frontend (main branch), normalised
 * to snake_case. Confirm this list with the business before adding domain
 * modules. Permissions are the only thing route handlers should check; never
 * compare role names inside business logic.
 */
export const ROLES = [
  'owner',
  'general_manager',
  'construction_head',
  'project_manager',
  'site_engineer',
  'supervisor',
  'store_keeper',
  'accountant',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'users:read',
  'users:manage',
  'uploads:create',
  'uploads:read:own',
  'uploads:read:any',
  'uploads:delete:own',
  'uploads:delete:any',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF_PERMISSIONS: readonly Permission[] = ['uploads:create', 'uploads:read:own', 'uploads:delete:own'];
const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...STAFF_PERMISSIONS,
  'users:read',
  'users:manage',
  'uploads:read:any',
  'uploads:delete:any',
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set(ADMIN_PERMISSIONS),
  general_manager: new Set(ADMIN_PERMISSIONS),
  construction_head: new Set(STAFF_PERMISSIONS),
  project_manager: new Set(STAFF_PERMISSIONS),
  site_engineer: new Set(STAFF_PERMISSIONS),
  supervisor: new Set(STAFF_PERMISSIONS),
  store_keeper: new Set(STAFF_PERMISSIONS),
  accountant: new Set(STAFF_PERMISSIONS),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Only an owner may create, modify or demote another owner. */
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (!hasPermission(actorRole, 'users:manage')) return false;
  return targetRole !== 'owner' || actorRole === 'owner';
}
