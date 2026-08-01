import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { GitClient, RepositoryStateError } from '../git/gitClient';
import {
  createFixtureRepository,
  type FixtureRepository,
} from './fixtureRepository';

describe('GitClient', () => {
  let fixture: FixtureRepository | undefined;

  afterEach(async () => {
    await fixture?.dispose();
    fixture = undefined;
  });

  it('discovers refs and collects a rename-aware comparison', async () => {
    fixture = await createFixtureRepository();
    const client = await GitClient.discover(fixture.root);
    const refs = await client.listRefs();
    assert.ok(refs.some((ref) => ref.name === 'HEAD'));
    assert.ok(refs.some((ref) => ref.name === 'main'));
    assert.ok(refs.some((ref) => ref.name === 'feature'));

    const comparison = await client.collectComparison(
      {
        baseRef: 'main',
        headRef: 'feature',
        strategy: 'merge-base',
      },
      { maxFiles: 20, maxDiffCharacters: 100_000 },
    );

    assert.equal(comparison.baseRevision, fixture.baseRevision);
    assert.equal(comparison.headRevision, fixture.featureRevision);
    assert.equal(comparison.commits[0]?.subject, 'add feature behavior');
    assert.ok(
      comparison.files.some(
        (file) =>
          file.status === 'renamed' &&
          file.oldPath === 'app.txt' &&
          file.path === 'src/app.txt',
      ),
    );
    assert.ok(
      comparison.files.some((file) => file.path === 'odd\tname.txt'),
    );
    assert.ok(comparison.evidence.length > 0);
    assert.ok(
      comparison.evidence.some((unit) =>
        unit.patch.includes('feature behavior'),
      ),
    );
    assert.equal(
      comparison.evidence.length,
      comparison.totalEvidenceCount,
    );
  });

  it('truncates bounded analysis input and reads either revision', async () => {
    fixture = await createFixtureRepository();
    const client = new GitClient(fixture.root);
    const comparison = await client.collectComparison(
      {
        baseRef: fixture.baseRevision,
        headRef: fixture.featureRevision,
        strategy: 'direct',
      },
      { maxFiles: 2, maxDiffCharacters: 60 },
    );

    assert.equal(comparison.files.length, 2);
    assert.equal(comparison.totalFileCount, 3);
    assert.equal(comparison.truncated, true);
    assert.ok(comparison.evidence.length > 0);
    assert.ok(comparison.evidence.length < comparison.totalEvidenceCount);
    assert.ok(
      comparison.evidence.reduce(
        (total, unit) => total + unit.patch.length,
        0,
      ) <= 60,
    );

    const before = await client.readFileAtRevision(
      fixture.baseRevision,
      'app.txt',
    );
    const after = await client.readFileAtRevision(
      fixture.featureRevision,
      'src/app.txt',
    );
    assert.match(before, /stable line 19/);
    assert.match(after, /feature behavior/);
  });

  it('rejects option-like revisions before invoking Git', async () => {
    fixture = await createFixtureRepository();
    const client = new GitClient(fixture.root);
    await assert.rejects(
      client.resolveCommit('--help'),
      RepositoryStateError,
    );
  });
});
