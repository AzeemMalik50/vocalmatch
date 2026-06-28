// backend/src/main.guards.ts
/**
 * Boot-time assertion that required environment variables are present.
 * Called from main.ts before NestFactory.create — failure exits the
 * process before any HTTP listener binds.
 *
 * Accepts an env object explicitly so unit tests can pass synthetic envs
 * without mutating process.env.
 */
export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET environment variable is required. Set it in your .env file or hosting environment.',
    );
  }
}
