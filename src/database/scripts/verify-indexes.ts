import { findIndexDrift } from '../migrations/runner.js';
import { connectForScript } from './script-env.js';

/** Exits non-zero when the database's indexes differ from index-specs.ts. */
const { client, dbName } = await connectForScript();
try {
  const drift = await findIndexDrift(client.db(dbName));
  if (drift.length === 0) {
    console.log('[info] indexes match the declared specification');
  } else {
    for (const item of drift) {
      if (item.missing.length)
        console.error(`[drift] ${item.collection}: missing ${item.missing.join(', ')}`);
      if (item.unexpected.length)
        console.error(`[drift] ${item.collection}: undeclared ${item.unexpected.join(', ')}`);
    }
    process.exitCode = 1;
  }
} finally {
  await client.close();
}
