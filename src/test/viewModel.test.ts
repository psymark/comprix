import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ChangeAnalysis, ComparisonSnapshot } from '../core/model';
import { mapAnalysisToViewModel } from '../view/viewModel';

const comparison = {
  files: [{ path: 'src/change.ts', status: 'modified' }],
  evidence: [
    {
      id: 'ev-one',
      path: 'src/change.ts',
      status: 'modified',
      oldRange: { start: 1, length: 1 },
      newRange: { start: 1, length: 2 },
      heading: 'change()',
      patch: '@@ -1 +1,2 @@ change()\n-old\n+new\n+more\n',
    },
    {
      id: 'ev-two',
      path: 'src/change.ts',
      status: 'modified',
      oldRange: { start: 10, length: 1 },
      newRange: { start: 11, length: 1 },
      patch: '@@ -10 +11 @@\n-a\n+b\n',
    },
  ],
} as unknown as ComparisonSnapshot;

describe('analysis view-model mapping', () => {
  it('groups distinct cited hunks beneath their contributing file', () => {
    const analysis: ChangeAnalysis = {
      version: 2,
      overview: 'Changes behavior.',
      outcomes: [
        {
          title: 'Changes behavior',
          description: 'Uses a new path.',
          category: 'behavior',
          confidence: 'high',
          evidence: [
            { evidenceId: 'ev-one', explanation: 'Implements it.', kind: 'fact' },
            { evidenceId: 'ev-two', explanation: 'May affect fallback.', kind: 'inference' },
          ],
        },
      ],
    };

    const result = mapAnalysisToViewModel(analysis, comparison);
    assert.equal(result.outcomes[0]?.files.length, 1);
    assert.equal(result.outcomes[0]?.files[0]?.evidence.length, 2);
    assert.equal(result.outcomes[0]?.files[0]?.evidence[0]?.unit, comparison.evidence[0]);
    assert.equal(result.outcomes[0]?.files[0]?.evidence[1]?.citation.kind, 'inference');
  });

  it('fails closed if validation and mapping become inconsistent', () => {
    const analysis: ChangeAnalysis = {
      version: 2,
      overview: 'Overview.',
      outcomes: [
        {
          title: 'Unknown evidence',
          description: 'Invalid test input.',
          category: 'other',
          confidence: 'low',
          evidence: [
            { evidenceId: 'ev-invented', explanation: 'Invalid.', kind: 'question' },
          ],
        },
      ],
    };
    assert.throws(() => mapAnalysisToViewModel(analysis, comparison), /unknown evidence/);
  });

  it('states deterministically when analysis input was incomplete', () => {
    const analysis: ChangeAnalysis = {
      version: 2,
      overview: 'Changes behavior.',
      outcomes: [
        {
          title: 'Changes behavior',
          description: 'Uses cited code.',
          category: 'behavior',
          confidence: 'high',
          evidence: [
            { evidenceId: 'ev-one', explanation: 'Changes it.', kind: 'fact' },
          ],
        },
      ],
    };
    const result = mapAnalysisToViewModel(analysis, {
      ...comparison,
      truncated: true,
    });
    assert.match(result.overview, /Analysis input was incomplete/u);
  });
});
