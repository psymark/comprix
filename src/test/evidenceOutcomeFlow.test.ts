import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { parseAnalysisJson } from '../analysis/schema';
import { GitClient } from '../git/gitClient';
import { createEvidenceNavigation } from '../view/evidenceNavigation';
import { mapAnalysisToViewModel } from '../view/viewModel';
import {
  createFixtureRepository,
  type FixtureRepository,
} from './fixtureRepository';

describe('evidence-linked outcome flow', () => {
  let fixture: FixtureRepository | undefined;

  afterEach(async () => {
    await fixture?.dispose();
    fixture = undefined;
  });

  it('links validated claims to immutable ranges from an actual Git comparison', async () => {
    fixture = await createFixtureRepository();
    const client = new GitClient(fixture.root);
    const comparison = await client.collectComparison(
      {
        baseRef: fixture.baseRevision,
        headRef: fixture.featureRevision,
        strategy: 'direct',
      },
      { maxFiles: 20, maxDiffCharacters: 100_000 },
    );
    const renamed = comparison.evidence.find(
      (unit) => unit.status === 'renamed',
    );
    const deleted = comparison.evidence.find(
      (unit) => unit.status === 'deleted',
    );
    assert.ok(renamed !== undefined);
    assert.ok(deleted !== undefined);

    const analysis = parseAnalysisJson(
      JSON.stringify({
        version: 2,
        overview: 'Changes feature behavior and removes a legacy path.',
        outcomes: [
          {
            title: 'Changes feature behavior',
            description: 'Updates behavior in a renamed source file.',
            category: 'behavior',
            confidence: 'high',
            evidence: [
              {
                evidenceId: renamed.id,
                explanation: 'The cited hunk changes the behavior.',
                kind: 'fact',
              },
              {
                evidenceId: deleted.id,
                explanation: 'Review whether callers still need the deleted behavior.',
                kind: 'question',
              },
            ],
          },
        ],
      }),
      new Set(comparison.evidence.map((unit) => unit.id)),
    );
    const viewModel = mapAnalysisToViewModel(analysis, comparison);
    assert.equal(viewModel.outcomes[0]?.files.length, 2);
    assert.deepEqual(
      viewModel.outcomes[0]?.files.map((file) => file.path),
      ['src/app.txt', 'deleted behavior.txt'],
    );

    const renamedTarget = createEvidenceNavigation(renamed, comparison);
    assert.equal(renamedTarget.beforePath, 'app.txt');
    assert.equal(renamedTarget.afterPath, 'src/app.txt');
    assert.equal(renamedTarget.reveal.side, 'after');
    const deletedTarget = createEvidenceNavigation(deleted, comparison);
    assert.equal(deletedTarget.reveal.side, 'before');

    await writeFile(
      path.join(fixture.root, 'src', 'app.txt'),
      'uncommitted working-tree replacement\n',
      'utf8',
    );
    const historicalContent = await client.readFileAtRevision(
      renamedTarget.afterRevision,
      renamedTarget.afterPath,
    );
    assert.match(historicalContent, /feature behavior near the end/u);
    assert.doesNotMatch(historicalContent, /uncommitted working-tree replacement/u);
  });
});
