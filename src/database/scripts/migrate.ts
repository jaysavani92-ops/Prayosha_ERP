import { MIGRATIONS } from '../migrations/index.js';
import { runMigrations } from '../migrations/runner.js';
import { connectForScript, consoleLogger } from './script-env.js';

/** Deployment step: `npm run db:migrate` before starting new API/worker versions. */
const { client, dbName } = await connectForScript();
try {
  const applied = await runMigrations(client.db(dbName), MIGRATIONS, consoleLogger);
  console.log(
    `[info] migration complete; data migrations applied: ${applied.length === 0 ? 'none' : applied.join(', ')}`,
  );
} catch (error) {
  console.error('[error] migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
