import { spawn } from 'node:child_process';

export interface CancellationLike {
  readonly isCancellationRequested: boolean;
  readonly onCancellationRequested?: (
    listener: () => void,
  ) => { dispose(): void };
}

export interface GitRunOptions {
  readonly cancellation?: CancellationLike;
  readonly maxBufferBytes?: number;
}

export interface GitRunner {
  run(args: readonly string[], options?: GitRunOptions): Promise<Buffer>;
}

export class GitCommandError extends Error {
  public constructor(
    message: string,
    public readonly args: readonly string[],
    public readonly exitCode?: number,
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

export class LocalGitRunner implements GitRunner {
  public constructor(private readonly workingDirectory: string) {}

  public run(
    args: readonly string[],
    options: GitRunOptions = {},
  ): Promise<Buffer> {
    const maxBufferBytes = options.maxBufferBytes ?? 32 * 1024 * 1024;

    return new Promise((resolve, reject) => {
      if (options.cancellation?.isCancellationRequested === true) {
        reject(new GitCommandError('Git command was cancelled.', args));
        return;
      }

      const child = spawn(
        'git',
        ['-C', this.workingDirectory, ...args],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutLength = 0;
      let stderrLength = 0;
      let settled = false;

      const cancellationSubscription =
        options.cancellation?.onCancellationRequested?.(() => {
          child.kill();
        });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutLength += chunk.length;
        if (stdoutLength > maxBufferBytes) {
          child.kill();
          if (!settled) {
            settled = true;
            reject(
              new GitCommandError(
                `Git output exceeded ${maxBufferBytes.toString()} bytes.`,
                args,
              ),
            );
          }
          return;
        }
        stdout.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderrLength < 64 * 1024) {
          stderr.push(chunk);
          stderrLength += chunk.length;
        }
      });

      child.on('error', (error) => {
        cancellationSubscription?.dispose();
        if (!settled) {
          settled = true;
          reject(
            new GitCommandError(
              error.message === 'spawn git ENOENT'
                ? 'Git is not installed or is not available on PATH.'
                : `Unable to run Git: ${error.message}`,
              args,
            ),
          );
        }
      });

      child.on('close', (exitCode) => {
        cancellationSubscription?.dispose();
        if (settled) {
          return;
        }
        settled = true;

        if (options.cancellation?.isCancellationRequested === true) {
          reject(new GitCommandError('Git command was cancelled.', args));
          return;
        }

        if (exitCode !== 0) {
          const details = Buffer.concat(stderr).toString('utf8').trim();
          reject(
            new GitCommandError(
              details.length > 0
                ? details
                : `Git exited with code ${String(exitCode)}.`,
              args,
              exitCode ?? undefined,
            ),
          );
          return;
        }

        resolve(Buffer.concat(stdout));
      });
    });
  }
}
