import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AnalysisValidationError,
  parseAnalysisJson,
  validateAnalysis,
} from '../analysis/schema';

const validAnalysis = {
  version: 2,
  overview: 'The change adds input validation and coverage.',
  outcomes: [
    {
      title: 'Rejects unsupported input',
      description: 'Validation stops unsupported input before execution.',
      category: 'behavior',
      confidence: 'high',
      evidence: [
        {
          evidenceId: 'ev-validation',
          explanation: 'Adds the rejection branch.',
          kind: 'fact',
        },
      ],
    },
  ],
};

describe('analysis schema', () => {
  it('accepts and normalizes valid evidence citations', () => {
    const result = validateAnalysis(validAnalysis, new Set(['ev-validation']));
    assert.equal(result.version, 2);
    assert.equal(result.outcomes[0]?.evidence[0]?.evidenceId, 'ev-validation');
    assert.equal(result.outcomes[0]?.evidence[0]?.kind, 'fact');
  });

  it('rejects an unknown evidence identifier', () => {
    assert.throws(
      () => validateAnalysis(validAnalysis, new Set(['ev-other'])),
      (error: unknown) =>
        error instanceof AnalysisValidationError &&
        error.issues.some((issue) => issue.includes('not a supplied evidence unit')),
    );
  });

  it('rejects duplicated evidence within one outcome', () => {
    assert.throws(
      () =>
        validateAnalysis(
          {
            ...validAnalysis,
            outcomes: [
              {
                ...validAnalysis.outcomes[0],
                evidence: [
                  validAnalysis.outcomes[0]?.evidence[0],
                  validAnalysis.outcomes[0]?.evidence[0],
                ],
              },
            ],
          },
          new Set(['ev-validation']),
        ),
      (error: unknown) =>
        error instanceof AnalysisValidationError &&
        error.issues.some((issue) => issue.includes('duplicate identifier')),
    );
  });

  it('rejects missing and malformed citations', () => {
    assert.throws(
      () =>
        validateAnalysis(
          {
            ...validAnalysis,
            outcomes: [{ ...validAnalysis.outcomes[0], evidence: [] }],
          },
          new Set(['ev-validation']),
        ),
      AnalysisValidationError,
    );
    assert.throws(
      () =>
        validateAnalysis(
          {
            ...validAnalysis,
            outcomes: [
              {
                ...validAnalysis.outcomes[0],
                evidence: [
                  {
                    evidenceId: 'ev-validation',
                    explanation: '',
                    kind: 'certainty',
                  },
                ],
              },
            ],
          },
          new Set(['ev-validation']),
        ),
      AnalysisValidationError,
    );
  });

  it('requires a bare JSON object instead of extracting prose', () => {
    assert.throws(
      () => parseAnalysisJson(`\`\`\`json\n${JSON.stringify(validAnalysis)}\n\`\`\``, new Set(['ev-validation'])),
      AnalysisValidationError,
    );
  });
});
