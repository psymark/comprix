import type { ChangeAnalysis, ComparisonSnapshot } from '../core/model';
import type { CancellationLike } from '../git/gitRunner';

export interface AnalysisProvider {
  readonly id: string;
  analyze(
    comparison: ComparisonSnapshot,
    cancellation?: CancellationLike,
  ): Promise<ChangeAnalysis>;
}
