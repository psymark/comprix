import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(root: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', root, ...args], {
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

export interface FixtureRepository {
  readonly root: string;
  readonly baseRevision: string;
  readonly featureRevision: string;
  dispose(): Promise<void>;
}

export async function createFixtureRepository(): Promise<FixtureRepository> {
  const root = await mkdtemp(path.join(tmpdir(), 'comprix-fixture-'));
  await git(root, 'init', '--initial-branch=main');
  await git(root, 'config', 'user.name', 'Comprix Test');
  await git(root, 'config', 'user.email', 'comprix@example.invalid');

  const original = Array.from(
    { length: 20 },
    (_, index) => `stable line ${index.toString()}`,
  ).join('\n');
  await writeFile(path.join(root, 'app.txt'), `${original}\n`, 'utf8');
  await git(root, 'add', 'app.txt');
  await git(root, 'commit', '-m', 'add baseline behavior');
  const baseRevision = await git(root, 'rev-parse', 'HEAD');

  await git(root, 'switch', '-c', 'feature');
  await mkdir(path.join(root, 'src'));
  await git(root, 'mv', 'app.txt', 'src/app.txt');
  await writeFile(
    path.join(root, 'src', 'app.txt'),
    `${original}\nfeature behavior\n`,
    'utf8',
  );
  await writeFile(
    path.join(root, 'feature.test.txt'),
    'feature behavior is covered\n',
    'utf8',
  );
  await writeFile(
    path.join(root, 'odd\tname.txt'),
    'a safely handled unusual path\n',
    'utf8',
  );
  await git(root, 'add', '--all');
  await git(root, 'commit', '-m', 'add feature behavior');
  const featureRevision = await git(root, 'rev-parse', 'HEAD');

  return {
    root,
    baseRevision,
    featureRevision,
    async dispose(): Promise<void> {
      await rm(root, { recursive: true, force: true });
    },
  };
}
