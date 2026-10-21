/** Every collection name used by the application, in one place. */
export const Collections = {
  users: 'users',
  sessions: 'sessions',
  uploads: 'uploads',
  idempotencyKeys: 'idempotency_keys',
  migrations: '_migrations',
  migrationLock: '_migration_lock',
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];
