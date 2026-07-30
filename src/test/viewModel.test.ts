import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  ChangeAnalysis,
  ComparisonSnapshot,
} from '../core/model';
import { mapAnalysisToViewModel } from '../view/viewModel';

describe('analysis view-model mapping', () => {
  it('links each outcome citation to its changed-file metadata', () => {
    const comparison = {
      files: [{ path: 'src/change.ts', status: 'modified' }],
    } as unknown as ComparisonSnapshot;
    const analysis: ChangeAnalysis = {
      version: 1,
      overview: 'Changes behavior.',
      outcomes: [
        {
          title: 'Changes behavior',
          description: 'Uses a new path.',
          category: 'behavior',
          confidence: 'high',
          files: [
            {
              path: 'src/change.ts',
              reason: 'Implements the path.',
            },
          ],
        },
      ],
    };

    const result = mapAnalysisToViewModel(analysis, comparison);
    assert.equal(result.outcomes[0]?.id, 'outcome-0');
    assert.equal(
      result.outcomes[0]?.files[0]?.change,
      comparison.files[0],
    );
  });

  it('fails closed if validation and mapping become inconsistent', () => {
    const comparison = {
      files: [{ path: 'known.ts', status: 'added' }],
    } as unknown as ComparisonSnapshot;
    const analysis: ChangeAnalysis = {
      version: 1,
      overview: 'Overview.',
      outcomes: [
        {
          title: 'Unknown path',
          description: 'Invalid test input.',
          category: 'other',
          confidence: 'low',
          files: [{ path: 'invented.ts', reason: 'Invalid.' }],
        },
      ],
    };

    assert.throws(
      () => mapAnalysisToViewModel(analysis, comparison),
      /unknown file/,
    );
  });
});
