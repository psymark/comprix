import type {
  ChangeAnalysis,
  ChangedFile,
  ComparisonSnapshot,
  Confidence,
  OutcomeCategory,
} from '../core/model';

export interface OutcomeFileViewModel {
  readonly id: string;
  readonly path: string;
  readonly reason: string;
  readonly change: ChangedFile;
}

export interface OutcomeViewModel {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: OutcomeCategory;
  readonly confidence: Confidence;
  readonly files: readonly OutcomeFileViewModel[];
}

export interface AnalysisViewModel {
  readonly overview: string;
  readonly outcomes: readonly OutcomeViewModel[];
}

export function mapAnalysisToViewModel(
  analysis: ChangeAnalysis,
  comparison: ComparisonSnapshot,
): AnalysisViewModel {
  const changesByPath = new Map(
    comparison.files.map((file) => [file.path, file]),
  );

  return {
    overview: analysis.overview,
    outcomes: analysis.outcomes.map((outcome, outcomeIndex) => ({
      id: `outcome-${outcomeIndex.toString()}`,
      title: outcome.title,
      description: outcome.description,
      category: outcome.category,
      confidence: outcome.confidence,
      files: outcome.files.map((file, fileIndex) => {
        const change = changesByPath.get(file.path);
        if (change === undefined) {
          throw new Error(
            `Validated analysis refers to an unknown file: ${file.path}`,
          );
        }
        return {
          id: `outcome-${outcomeIndex.toString()}-file-${fileIndex.toString()}`,
          path: file.path,
          reason: file.reason,
          change,
        };
      }),
    })),
  };
}
