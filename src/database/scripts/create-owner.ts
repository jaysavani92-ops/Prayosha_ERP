import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { systemClock } from '../../common/utils/clock.js';
import { NoopAuthStateCache } from '../../modules/users/auth-state-cache.js';
import { Argon2PasswordHasher } from '../../modules/users/password-hasher.js';
import { UsersRepository } from '../../modules/users/users.repository.js';
import { createUserBody } from '../../modules/users/users.schema.js';
import { UsersService } from '../../modules/users/users.service.js';
import { connectForScript } from './script-env.js';

/**
 * Bootstraps the first owner account (there is no public sign-up).
 *   OWNER_USERNAME=... OWNER_DISPLAY_NAME=... npm run user:create-owner
 * The password is read from OWNER_PASSWORD or prompted on the terminal; it is
 * never accepted as a command-line argument (shell history, process list).
 */
async function readPassword(): Promise<string> {
  if (process.env.OWNER_PASSWORD) return process.env.OWNER_PASSWORD;
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    return await rl.question('Password for the owner account: ');
  } finally {
    rl.close();
  }
}

const input = createUserBody.safeParse({
  username: process.env.OWNER_USERNAME,
  displayName: process.env.OWNER_DISPLAY_NAME ?? process.env.OWNER_USERNAME,
  role: 'owner',
  password: await readPassword(),
});
if (!input.success) {
  console.error('[error] invalid input:', input.error.issues.map((issue) => issue.message).join('; '));
  process.exit(1);
}

const { client, dbName } = await connectForScript();
try {
  const service = new UsersService(
    new UsersRepository(client.db(dbName), 5000),
    new Argon2PasswordHasher({ concurrency: 1, queueLimit: 0 }),
    new NoopAuthStateCache(),
    systemClock,
  );
  const user = await service.createUser(null, input.data);
  console.log(`[info] owner created: ${user.username} (${user.id})`);
} catch (error) {
  console.error('[error] could not create owner:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
