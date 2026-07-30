export type ComparisonStrategy = 'direct' | 'merge-base';

export interface ComparisonSpec {
  readonly baseRef: string;
  readonly headRef: string;
  readonly strategy: ComparisonStrategy;
}

export type ChangedFileStatus =
  | 'added'
  | 'copied'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'type-changed'
  | 'unknown';

export interface ChangedFile {
  readonly path: string;
  readonly oldPath?: string;
  readonly status: ChangedFileStatus;
}

export interface CommitSummary {
  readonly hash: string;
  readonly shortHash: string;
  readonly subject: string;
  readonly author: string;
  readonly authoredAt: string;
}

export interface ComparisonSnapshot {
  readonly repositoryRoot: string;
  readonly spec: ComparisonSpec;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly files: readonly ChangedFile[];
  readonly totalFileCount: number;
  readonly commits: readonly CommitSummary[];
  readonly shortStat: string;
  readonly patch: string;
  readonly truncated: boolean;
}

export const outcomeCategories = [
  'behavior',
  'api',
  'user-interface',
  'performance',
  'security',
  'testing',
  'infrastructure',
  'documentation',
  'other',
] as const;

export type OutcomeCategory = (typeof outcomeCategories)[number];

export const confidenceLevels = ['high', 'medium', 'low'] as const;

export type Confidence = (typeof confidenceLevels)[number];

export interface OutcomeFile {
  readonly path: string;
  readonly reason: string;
}

export interface ChangeOutcome {
  readonly title: string;
  readonly description: string;
  readonly category: OutcomeCategory;
  readonly confidence: Confidence;
  readonly files: readonly OutcomeFile[];
}

export interface ChangeAnalysis {
  readonly version: 1;
  readonly overview: string;
  readonly outcomes: readonly ChangeOutcome[];
}
