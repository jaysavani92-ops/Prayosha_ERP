import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/**
 * Starts a throwaway mongod bound to 127.0.0.1. Tests never read
 * MONGODB_URI from the environment, so they cannot reach a real database.
 */
export default async function setup(project: TestProject) {
  const server = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1' },
    // Same major/minor as the production image (docker-compose.prod.yml).
    binary: { version: process.env.MONGOMS_VERSION ?? '8.2.12' },
  });
  project.provide('mongoUri', server.getUri());
  return async () => {
    await server.stop();
  };
}
