import * as path from 'node:path';

import type {
  ChangedFile,
  ChangedFileStatus,
  CommitSummary,
  ComparisonSnapshot,
  ComparisonSpec,
} from '../core/model';
import {
  GitCommandError,
  LocalGitRunner,
  type CancellationLike,
  type GitRunner,
} from './gitRunner';
import { parseUnifiedDiff, truncateEvidence } from './unifiedDiff';

export interface GitRef {
  readonly name: string;
  readonly shortHash: string;
  readonly subject: string;
}

export interface CollectionOptions {
  readonly maxFiles: number;
  readonly maxDiffCharacters: number;
  readonly cancellation?: CancellationLike;
}

export class RepositoryStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RepositoryStateError';
  }
}

function text(buffer: Buffer): string {
  return buffer.toString('utf8').trim();
}

function splitNul(buffer: Buffer): string[] {
  const fields = buffer.toString('utf8').split('\0');
  while (fields.at(-1) === '') {
    fields.pop();
  }
  return fields;
}

function mapStatus(value: string): ChangedFileStatus {
  switch (value.charAt(0)) {
    case 'A':
      return 'added';
    case 'C':
      return 'copied';
    case 'D':
      return 'deleted';
    case 'M':
      return 'modified';
    case 'R':
      return 'renamed';
    case 'T':
      return 'type-changed';
    default:
      return 'unknown';
  }
}

export function parseNameStatus(buffer: Buffer): ChangedFile[] {
  const fields = splitNul(buffer);
  const files: ChangedFile[] = [];

  for (let index = 0; index < fields.length; ) {
    const rawStatus = fields[index];
    if (rawStatus === undefined) {
      break;
    }
    index += 1;

    if (rawStatus.startsWith('R') || rawStatus.startsWith('C')) {
      const oldPath = fields[index];
      const newPath = fields[index + 1];
      if (oldPath === undefined || newPath === undefined) {
        throw new RepositoryStateError(
          'Git returned an incomplete rename or copy record.',
        );
      }
      files.push({
        path: newPath,
        oldPath,
        status: mapStatus(rawStatus),
      });
      index += 2;
      continue;
    }

    const filePath = fields[index];
    if (filePath === undefined) {
      throw new RepositoryStateError(
        'Git returned an incomplete changed-file record.',
      );
    }
    files.push({ path: filePath, status: mapStatus(rawStatus) });
    index += 1;
  }

  return files;
}

function parseRefs(buffer: Buffer): GitRef[] {
  const refs: GitRef[] = [];

  for (const line of buffer.toString('utf8').split('\n')) {
    if (line.length === 0) {
      continue;
    }
    const [name, shortHash, subject] = line.split('\0');
    if (
      name !== undefined &&
      shortHash !== undefined &&
      subject !== undefined
    ) {
      refs.push({ name, shortHash, subject });
    }
  }

  return refs;
}

function parseCommits(buffer: Buffer): CommitSummary[] {
  const fields = splitNul(buffer);
  const commits: CommitSummary[] = [];

  for (let index = 0; index + 4 < fields.length; index += 5) {
    const hash = fields[index];
    const shortHash = fields[index + 1];
    const subject = fields[index + 2];
    const author = fields[index + 3];
    const authoredAt = fields[index + 4];
    if (
      hash !== undefined &&
      shortHash !== undefined &&
      subject !== undefined &&
      author !== undefined &&
      authoredAt !== undefined
    ) {
      commits.push({ hash, shortHash, subject, author, authoredAt });
    }
  }

  return commits;
}

function assertSafeRevision(revision: string): void {
  if (
    revision.length === 0 ||
    revision.length > 512 ||
    revision.startsWith('-') ||
    /[\0-\x20\x7f]/u.test(revision)
  ) {
    throw new RepositoryStateError(`Invalid Git revision: "${revision}".`);
  }
}

export class GitClient {
  public constructor(
    public readonly repositoryRoot: string,
    private readonly runner: GitRunner = new LocalGitRunner(repositoryRoot),
  ) {}

  public static async discover(candidatePath: string): Promise<GitClient> {
    const runner = new LocalGitRunner(candidatePath);
    let root: string;
    try {
      root = text(
        await runner.run([
          'rev-parse',
          '--path-format=absolute',
          '--show-toplevel',
        ]),
      );
    } catch (error) {
      if (error instanceof GitCommandError) {
        if (error.message.includes('not installed')) {
          throw error;
        }
        throw new RepositoryStateError(
          `"${candidatePath}" is not inside a Git working tree.`,
        );
      }
      throw error;
    }

    return new GitClient(path.normalize(root));
  }

  public async ensureHasCommits(
    cancellation?: CancellationLike,
  ): Promise<void> {
    try {
      await this.runner.run(
        ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'],
        { cancellation },
      );
    } catch (error) {
      if (error instanceof GitCommandError) {
        throw new RepositoryStateError(
          'This Git repository has no commits to compare.',
        );
      }
      throw error;
    }
  }

  public async listRefs(cancellation?: CancellationLike): Promise<GitRef[]> {
    await this.ensureHasCommits(cancellation);
    const [refsOutput, headOutput] = await Promise.all([
      this.runner.run(
        [
          'for-each-ref',
          '--sort=-committerdate',
          '--format=%(refname:short)%00%(objectname:short)%00%(subject)',
          'refs/heads',
          'refs/remotes',
          'refs/tags',
        ],
        { cancellation },
      ),
      this.runner.run(
        ['show', '-s', '--format=HEAD%x00%h%x00%s', 'HEAD'],
        { cancellation },
      ),
    ]);
    return [...parseRefs(headOutput), ...parseRefs(refsOutput)];
  }

  public async resolveCommit(
    revision: string,
    cancellation?: CancellationLike,
  ): Promise<string> {
    assertSafeRevision(revision);
    try {
      return text(
        await this.runner.run(
          [
            'rev-parse',
            '--verify',
            '--end-of-options',
            `${revision}^{commit}`,
          ],
          { cancellation },
        ),
      );
    } catch (error) {
      if (error instanceof GitCommandError) {
        throw new RepositoryStateError(
          `Git revision "${revision}" does not name a commit.`,
        );
      }
      throw error;
    }
  }

  public async collectComparison(
    spec: ComparisonSpec,
    options: CollectionOptions,
  ): Promise<ComparisonSnapshot> {
    const resolvedBase = await this.resolveCommit(
      spec.baseRef,
      options.cancellation,
    );
    const headRevision = await this.resolveCommit(
      spec.headRef,
      options.cancellation,
    );
    let baseRevision = resolvedBase;
    if (spec.strategy === 'merge-base') {
      try {
        baseRevision = text(
          await this.runner.run(
            ['merge-base', resolvedBase, headRevision],
            { cancellation: options.cancellation },
          ),
        );
      } catch (error) {
        if (error instanceof GitCommandError) {
          throw new RepositoryStateError(
            `"${spec.baseRef}" and "${spec.headRef}" do not share a merge base.`,
          );
        }
        throw error;
      }
    }

    const changedFiles = parseNameStatus(
      await this.runner.run(
        [
          'diff',
          '--no-ext-diff',
          '--find-renames',
          '--name-status',
          '-z',
          baseRevision,
          headRevision,
          '--',
        ],
        { cancellation: options.cancellation },
      ),
    );

    if (changedFiles.length === 0) {
      throw new RepositoryStateError(
        'The selected comparison contains no file changes.',
      );
    }

    const files = changedFiles.slice(0, options.maxFiles);
    const pathspecs = [
      ...new Set(
        files.flatMap((file) =>
          file.oldPath === undefined
            ? [file.path]
            : [file.oldPath, file.path],
        ),
      ),
    ];
    const commonDiffArgs = [
      'diff',
      '--no-ext-diff',
      '--no-color',
      '--find-renames',
      '--unified=3',
      baseRevision,
      headRevision,
      '--',
      ...pathspecs,
    ];
    const [shortStatBuffer, patchBuffer, commitBuffer] = await Promise.all([
      this.runner.run(
        [
          'diff',
          '--no-ext-diff',
          '--shortstat',
          baseRevision,
          headRevision,
          '--',
          ...pathspecs,
        ],
        { cancellation: options.cancellation },
      ),
      this.runner.run(
        commonDiffArgs,
        {
          cancellation: options.cancellation,
          maxBufferBytes: 64 * 1024 * 1024,
        },
      ),
      this.runner.run(
        [
          'log',
          '--format=%H%x00%h%x00%s%x00%an%x00%aI',
          '-z',
          `${baseRevision}..${headRevision}`,
          '--',
        ],
        { cancellation: options.cancellation },
      ),
    ]);

    const allEvidence = parseUnifiedDiff(
      patchBuffer.toString('utf8'),
      files,
    );
    const evidence = truncateEvidence(
      allEvidence,
      options.maxDiffCharacters,
    );
    if (evidence.length === 0) {
      throw new RepositoryStateError(
        'The selected changes contain no complete text diff hunk within the configured analysis limit. Increase Comprix: Analysis Max Diff Characters and try again.',
      );
    }

    return {
      repositoryRoot: this.repositoryRoot,
      spec,
      baseRevision,
      headRevision,
      files,
      totalFileCount: changedFiles.length,
      commits: parseCommits(commitBuffer),
      shortStat: text(shortStatBuffer),
      evidence,
      totalEvidenceCount: allEvidence.length,
      truncated:
        evidence.length < allEvidence.length ||
        changedFiles.length > options.maxFiles,
    };
  }

  public async readFileAtRevision(
    revision: string,
    filePath: string,
    cancellation?: CancellationLike,
  ): Promise<string> {
    if (revision === '') {
      return '';
    }
    assertSafeRevision(revision);
    if (filePath.includes('\0')) {
      throw new RepositoryStateError('Invalid file path.');
    }

    try {
      const output = await this.runner.run(
        ['show', `${revision}:${filePath}`],
        {
          cancellation,
          maxBufferBytes: 16 * 1024 * 1024,
        },
      );
      return output.toString('utf8');
    } catch (error) {
      if (error instanceof GitCommandError) {
        throw new RepositoryStateError(
          `Unable to read "${filePath}" at ${revision.slice(0, 8)}.`,
        );
      }
      throw error;
    }
  }
}
