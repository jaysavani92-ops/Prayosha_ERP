import { MongoClient } from 'mongodb';
import { z } from 'zod';

/**
 * Operational scripts need only MongoDB settings, not the full API config.
 * MONGODB_MIGRATION_URI should use the migration user (readWrite + dbAdmin on
 * the application database). The application user cannot run collMod.
 */
const scriptEnv = z.object({
  MONGODB_MIGRATION_URI: z.string().min(1).optional(),
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB_NAME: z.string().min(1).default('prayosha'),
});

export async function connectForScript(): Promise<{ client: MongoClient; dbName: string }> {
  const env = scriptEnv.parse(process.env);
  const uri = env.MONGODB_MIGRATION_URI ?? env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGODB_MIGRATION_URI (preferred) or MONGODB_URI');
  const client = new MongoClient(uri, { appName: 'prayosha-ops', serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  return { client, dbName: env.MONGODB_DB_NAME };
}

export const consoleLogger = {
  info: (message: string) => console.log(`[info] ${message}`),
  warn: (message: string) => console.warn(`[warn] ${message}`),
};
