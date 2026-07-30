import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  InvalidComparisonRangeError,
  formatComparison,
  parseComparisonRange,
} from '../core/comparison';

describe('comparison ranges', () => {
  it('parses direct and merge-base ranges', () => {
    assert.deepEqual(parseComparisonRange('main..feature'), {
      baseRef: 'main',
      headRef: 'feature',
      strategy: 'direct',
    });
    assert.deepEqual(parseComparisonRange(' release/v1...topic.with.dots '), {
      baseRef: 'release/v1',
      headRef: 'topic.with.dots',
      strategy: 'merge-base',
    });
  });

  it('formats a comparison without changing its semantics', () => {
    const parsed = parseComparisonRange('v1.0...HEAD');
    assert.equal(formatComparison(parsed), 'v1.0...HEAD');
  });

  it('rejects incomplete and ambiguous ranges', () => {
    assert.throws(
      () => parseComparisonRange('main'),
      InvalidComparisonRangeError,
    );
    assert.throws(
      () => parseComparisonRange('main....feature'),
      InvalidComparisonRangeError,
    );
    assert.throws(
      () => parseComparisonRange('..feature'),
      InvalidComparisonRangeError,
    );
  });
});
