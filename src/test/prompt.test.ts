import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAnalysisPrompt } from '../analysis/prompt';
import type { ComparisonSnapshot } from '../core/model';

const snapshot: ComparisonSnapshot = {
  repositoryRoot: '/repo',
  spec: {
    baseRef: 'main',
    headRef: 'feature',
    strategy: 'merge-base',
  },
  baseRevision: '1111111111111111111111111111111111111111',
  headRevision: '2222222222222222222222222222222222222222',
  files: [
    {
      path: 'src/new.ts',
      oldPath: 'src/old.ts',
      status: 'renamed',
    },
  ],
  totalFileCount: 2,
  commits: [
    {
      hash: '2222222222222222222222222222222222222222',
      shortHash: '2222222',
      subject: 'change behavior',
      author: 'Test Author',
      authoredAt: '2026-01-01T00:00:00Z',
    },
  ],
  shortStat: '1 file changed, 2 insertions(+)',
  evidence: [
    {
      id: 'ev-123',
      path: 'src/new.ts',
      oldPath: 'src/old.ts',
      status: 'renamed',
      oldRange: { start: 2, length: 1 },
      newRange: { start: 2, length: 2 },
      heading: 'renameFeature()',
      patch: '@@ -2 +2,2 @@ renameFeature()\n-old\n+new\n+added\n',
    },
  ],
  totalEvidenceCount: 3,
  truncated: true,
};

describe('analysis prompt', () => {
  it('renders deterministic comparison context and truncation warnings', () => {
    const prompt = buildAnalysisPrompt(snapshot);
    assert.match(prompt, /Range: main\.\.\.feature/);
    assert.match(prompt, /\[renamed\] src\/new\.ts \(from src\/old\.ts\)/);
    assert.match(prompt, /2222222 change behavior — Test Author/);
    assert.match(prompt, /Input was truncated/);
    assert.match(prompt, /Evidence units supplied: 1 of 3/);
    assert.match(prompt, /EVIDENCE ev-123/);
    assert.match(prompt, /Previous path: src\/old\.ts/);
    assert.match(prompt, /Old range: 2,1/);
    assert.match(prompt, /New range: 2,2/);
    assert.match(prompt, /@@ -2 \+2,2 @@ renameFeature/);
  });
});
