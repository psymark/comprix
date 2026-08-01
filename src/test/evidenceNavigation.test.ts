import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ComparisonSnapshot, EvidenceUnit } from '../core/model';
import { createEvidenceNavigation } from '../view/evidenceNavigation';

const comparison = {
  baseRevision: '1111111111111111111111111111111111111111',
  headRevision: '2222222222222222222222222222222222222222',
} as ComparisonSnapshot;

describe('evidence navigation', () => {
  it('targets the new side for additions and modifications', () => {
    const modified = {
      id: 'ev-modified',
      path: 'new name.ts',
      oldPath: 'old name.ts',
      status: 'renamed',
      oldRange: { start: 7, length: 2 },
      newRange: { start: 9, length: 3 },
      patch: '',
    } satisfies EvidenceUnit;
    const target = createEvidenceNavigation(modified, comparison);
    assert.equal(target.beforePath, 'old name.ts');
    assert.equal(target.afterPath, 'new name.ts');
    assert.deepEqual(target.reveal, { side: 'after', startLine: 8, lineCount: 3 });

    const added = createEvidenceNavigation(
      {
        ...modified,
        id: 'ev-added',
        oldPath: undefined,
        status: 'added',
        oldRange: { start: 0, length: 0 },
      },
      comparison,
    );
    assert.equal(added.beforeRevision, '');
    assert.equal(added.reveal.side, 'after');
  });

  it('targets the old side for deleted files and deletion-only hunks', () => {
    const deletedEvidence = {
      id: 'ev-deleted',
      path: 'gone.ts',
      status: 'deleted',
      oldRange: { start: 12, length: 4 },
      newRange: { start: 0, length: 0 },
      patch: '',
    } satisfies EvidenceUnit;
    const deleted = createEvidenceNavigation(deletedEvidence, comparison);
    assert.equal(deleted.afterRevision, '');
    assert.deepEqual(deleted.reveal, { side: 'before', startLine: 11, lineCount: 4 });

    const deletionHunk = createEvidenceNavigation(
      {
        ...deletedEvidence,
        id: 'ev-hunk',
        path: 'kept.ts',
        status: 'modified',
      },
      comparison,
    );
    assert.equal(deletionHunk.afterRevision, comparison.headRevision);
    assert.equal(deletionHunk.reveal.side, 'before');
  });
});
