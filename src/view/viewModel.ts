import type {
  ChangeAnalysis,
  ChangedFile,
  ComparisonSnapshot,
  Confidence,
  EvidenceCitation,
  EvidenceUnit,
  OutcomeCategory,
} from '../core/model';

export interface EvidenceCitationViewModel {
  readonly id: string;
  readonly citation: EvidenceCitation;
  readonly unit: EvidenceUnit;
}

export interface OutcomeFileViewModel {
  readonly id: string;
  readonly path: string;
  readonly change: ChangedFile;
  readonly evidence: readonly EvidenceCitationViewModel[];
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
  const changesByPath = new Map(comparison.files.map((file) => [file.path, file]));
  const evidenceById = new Map(comparison.evidence.map((unit) => [unit.id, unit]));

  return {
    overview: comparison.truncated
      ? `${analysis.overview}\n\nAnalysis input was incomplete; configured limits omitted some files or diff hunks.`
      : analysis.overview,
    outcomes: analysis.outcomes.map((outcome, outcomeIndex) => {
      const files = new Map<string, OutcomeFileViewModel>();
      for (const citation of outcome.evidence) {
        const unit = evidenceById.get(citation.evidenceId);
        if (unit === undefined) {
          throw new Error(`Validated analysis refers to unknown evidence: ${citation.evidenceId}`);
        }
        const change = changesByPath.get(unit.path);
        if (change === undefined) {
          throw new Error(`Evidence refers to an unknown changed file: ${unit.path}`);
        }
        const citationViewModel: EvidenceCitationViewModel = {
          id: `outcome-${outcomeIndex.toString()}-${unit.id}`,
          citation,
          unit,
        };
        const existing = files.get(unit.path);
        if (existing === undefined) {
          files.set(unit.path, {
            id: `outcome-${outcomeIndex.toString()}-file-${files.size.toString()}`,
            path: unit.path,
            change,
            evidence: [citationViewModel],
          });
        } else {
          files.set(unit.path, {
            ...existing,
            evidence: [...existing.evidence, citationViewModel],
          });
        }
      }
      return {
        id: `outcome-${outcomeIndex.toString()}`,
        title: outcome.title,
        description: outcome.description,
        category: outcome.category,
        confidence: outcome.confidence,
        files: [...files.values()],
      };
    }),
  };
}
