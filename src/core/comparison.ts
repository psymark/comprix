import type { ComparisonSpec } from './model';

export class InvalidComparisonRangeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidComparisonRangeError';
  }
}

export function parseComparisonRange(input: string): ComparisonSpec {
  const value = input.trim();
  const match = /^(.+?)(\.\.\.?)(.+)$/.exec(value);

  if (match === null) {
    throw new InvalidComparisonRangeError(
      'Enter a range such as main..feature or main...feature.',
    );
  }

  const baseRef = match[1]?.trim() ?? '';
  const operator = match[2];
  const headRef = match[3]?.trim() ?? '';

  if (
    baseRef.length === 0 ||
    headRef.length === 0 ||
    value.includes('....') ||
    baseRef.includes('..') ||
    headRef.includes('..')
  ) {
    throw new InvalidComparisonRangeError(
      'Both sides of the range must be valid Git revisions.',
    );
  }

  return {
    baseRef,
    headRef,
    strategy: operator === '...' ? 'merge-base' : 'direct',
  };
}

export function formatComparison(spec: ComparisonSpec): string {
  const separator = spec.strategy === 'merge-base' ? '...' : '..';
  return `${spec.baseRef}${separator}${spec.headRef}`;
}
