import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AnalysisValidationError,
  parseAnalysisJson,
  validateAnalysis,
} from '../analysis/schema';

const validAnalysis = {
  version: 1,
  overview: 'The change adds input validation and coverage.',
  outcomes: [
    {
      title: 'Rejects unsupported input',
      description: 'Validation stops unsupported input before execution.',
      category: 'behavior',
      confidence: 'high',
      files: [
        {
          path: 'src/validate.ts',
          reason: 'Implements the validation branch.',
        },
      ],
    },
  ],
};

describe('analysis schema', () => {
  it('accepts and normalizes a valid structured result', () => {
    const result = validateAnalysis(
      validAnalysis,
      new Set(['src/validate.ts']),
    );
    assert.equal(result.version, 1);
    assert.equal(result.outcomes[0]?.files[0]?.path, 'src/validate.ts');
  });

  it('rejects unknown paths and invalid enum values', () => {
    assert.throws(
      () =>
        validateAnalysis(
          {
            ...validAnalysis,
            outcomes: [
              {
                ...validAnalysis.outcomes[0],
                category: 'made-up',
                files: [
                  {
                    path: 'src/invented.ts',
                    reason: 'Not in the comparison.',
                  },
                ],
              },
            ],
          },
          new Set(['src/validate.ts']),
        ),
      (error: unknown) =>
        error instanceof AnalysisValidationError &&
        error.issues.some((issue) => issue.includes('not a changed file')),
    );
  });

  it('requires a bare JSON object instead of extracting prose', () => {
    assert.throws(
      () =>
        parseAnalysisJson(
          `\`\`\`json\n${JSON.stringify(validAnalysis)}\n\`\`\``,
          new Set(['src/validate.ts']),
        ),
      AnalysisValidationError,
    );
  });
});
