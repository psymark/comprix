import type { ComparisonSnapshot, EvidenceUnit } from '../core/model';

export interface EvidenceNavigation {
  readonly beforePath: string;
  readonly beforeRevision: string;
  readonly afterPath: string;
  readonly afterRevision: string;
  readonly reveal: {
    readonly side: 'before' | 'after';
    readonly startLine: number;
    readonly lineCount: number;
  };
}

export function createEvidenceNavigation(
  evidence: EvidenceUnit,
  comparison: ComparisonSnapshot,
): EvidenceNavigation {
  const revealOldSide =
    evidence.status === 'deleted' || evidence.newRange.length === 0;
  const range = revealOldSide ? evidence.oldRange : evidence.newRange;
  if (range.length === 0) {
    throw new Error(`Evidence ${evidence.id} has no changed range to reveal.`);
  }
  return {
    beforePath: evidence.oldPath ?? evidence.path,
    beforeRevision: evidence.status === 'added' ? '' : comparison.baseRevision,
    afterPath: evidence.path,
    afterRevision: evidence.status === 'deleted' ? '' : comparison.headRevision,
    reveal: {
      side: revealOldSide ? 'before' : 'after',
      startLine: Math.max(0, range.start - 1),
      lineCount: range.length,
    },
  };
}
