export interface ShutdownStep {
  name: string;
  run(): Promise<void>;
}

export interface ShutdownLogger {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface GracefulShutdownOptions {
  logger: ShutdownLogger;
  /** Hard deadline; if exceeded the process exits with code 1. */
  timeoutMs: number;
  /** Ordered steps. Each runs even if an earlier one failed. */
  steps: ShutdownStep[];
  exit?: (code: number) => void;
}

/**
 * Returns an idempotent shutdown function. The first call runs every step in
 * order; later calls return the same promise. Exit code is 0 only when every
 * step succeeded and the shutdown was not triggered by a fatal error.
 */
export function createGracefulShutdown(options: GracefulShutdownOptions) {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let inFlight: Promise<void> | undefined;

  return function shutdown(reason: string, exitCode = 0): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      options.logger.info({ reason }, 'Shutting down');
      const deadline = setTimeout(() => {
        options.logger.error({ timeoutMs: options.timeoutMs }, 'Shutdown timed out; forcing exit');
        exit(1);
      }, options.timeoutMs);
      deadline.unref();

      let code = exitCode;
      for (const step of options.steps) {
        try {
          await step.run();
        } catch (error) {
          code = 1;
          options.logger.error({ err: error, step: step.name }, 'Shutdown step failed');
        }
      }
      clearTimeout(deadline);
      options.logger.info({ code }, 'Shutdown complete');
      exit(code);
    })();
    return inFlight;
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wires SIGTERM/SIGINT and fatal process errors to the shutdown function. */
export function installProcessHandlers(
  shutdown: (reason: string, exitCode?: number) => Promise<void>,
  logger: { fatal(obj: object, msg: string): void },
): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void shutdown(signal));
  }
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException', 1);
  });
}
