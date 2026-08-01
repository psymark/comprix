import {
  confidenceLevels,
  evidenceClaimKinds,
  outcomeCategories,
  type ChangeAnalysis,
  type ChangeOutcome,
  type Confidence,
  type EvidenceCitation,
  type EvidenceClaimKind,
  type OutcomeCategory,
} from '../core/model';

export class AnalysisValidationError extends Error {
  public constructor(public readonly issues: readonly string[]) {
    super(`Invalid structured analysis: ${issues.join('; ')}`);
    this.name = 'AnalysisValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(
  value: unknown,
  path: string,
  issues: string[],
  maximumLength: number,
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`);
    return undefined;
  }
  const result = value.trim();
  if (result.length > maximumLength) {
    issues.push(`${path} must not exceed ${maximumLength.toString()} characters`);
    return undefined;
  }
  return result;
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: string[],
): T | undefined {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues.push(`${path} must be one of: ${allowed.join(', ')}`);
    return undefined;
  }
  return value as T;
}

function readEvidenceCitation(
  value: unknown,
  outcomeIndex: number,
  citationIndex: number,
  allowedEvidenceIds: ReadonlySet<string>,
  issues: string[],
): EvidenceCitation | undefined {
  const itemPath = `outcomes[${outcomeIndex.toString()}].evidence[${citationIndex.toString()}]`;
  if (!isRecord(value)) {
    issues.push(`${itemPath} must be an object`);
    return undefined;
  }

  const evidenceId = readString(
    value.evidenceId,
    `${itemPath}.evidenceId`,
    issues,
    100,
  );
  const explanation = readString(
    value.explanation,
    `${itemPath}.explanation`,
    issues,
    500,
  );
  const kind = readEnum<EvidenceClaimKind>(
    value.kind,
    evidenceClaimKinds,
    `${itemPath}.kind`,
    issues,
  );
  if (evidenceId !== undefined && !allowedEvidenceIds.has(evidenceId)) {
    issues.push(`${itemPath}.evidenceId is not a supplied evidence unit: ${evidenceId}`);
  }

  return evidenceId !== undefined &&
    explanation !== undefined &&
    kind !== undefined &&
    allowedEvidenceIds.has(evidenceId)
    ? { evidenceId, explanation, kind }
    : undefined;
}

function readOutcome(
  value: unknown,
  index: number,
  allowedEvidenceIds: ReadonlySet<string>,
  issues: string[],
): ChangeOutcome | undefined {
  const itemPath = `outcomes[${index.toString()}]`;
  if (!isRecord(value)) {
    issues.push(`${itemPath} must be an object`);
    return undefined;
  }

  const title = readString(value.title, `${itemPath}.title`, issues, 160);
  const description = readString(value.description, `${itemPath}.description`, issues, 1200);
  const category = readEnum<OutcomeCategory>(value.category, outcomeCategories, `${itemPath}.category`, issues);
  const confidence = readEnum<Confidence>(value.confidence, confidenceLevels, `${itemPath}.confidence`, issues);

  if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
    issues.push(`${itemPath}.evidence must be a non-empty array`);
    return undefined;
  }

  const evidence = value.evidence
    .map((citation, citationIndex) =>
      readEvidenceCitation(
        citation,
        index,
        citationIndex,
        allowedEvidenceIds,
        issues,
      ),
    )
    .filter((citation): citation is EvidenceCitation => citation !== undefined);
  const seen = new Set<string>();
  for (const citation of evidence) {
    if (seen.has(citation.evidenceId)) {
      issues.push(`${itemPath}.evidence contains duplicate identifier ${citation.evidenceId}`);
    }
    seen.add(citation.evidenceId);
  }

  return title !== undefined &&
    description !== undefined &&
    category !== undefined &&
    confidence !== undefined &&
    evidence.length === value.evidence.length
    ? { title, description, category, confidence, evidence }
    : undefined;
}

export function validateAnalysis(
  value: unknown,
  allowedEvidenceIds: ReadonlySet<string>,
): ChangeAnalysis {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new AnalysisValidationError(['root must be an object']);
  }

  if (value.version !== 2) {
    issues.push('version must be 2');
  }
  const overview = readString(value.overview, 'overview', issues, 2000);
  if (!Array.isArray(value.outcomes) || value.outcomes.length === 0 || value.outcomes.length > 20) {
    issues.push('outcomes must contain between 1 and 20 items');
  }

  const rawOutcomes = Array.isArray(value.outcomes) ? value.outcomes : [];
  const outcomes = rawOutcomes
    .map((outcome, index) => readOutcome(outcome, index, allowedEvidenceIds, issues))
    .filter((outcome): outcome is ChangeOutcome => outcome !== undefined);

  if (issues.length > 0 || overview === undefined || outcomes.length !== rawOutcomes.length) {
    throw new AnalysisValidationError(issues);
  }
  return { version: 2, overview, outcomes };
}

export function parseAnalysisJson(
  response: string,
  allowedEvidenceIds: ReadonlySet<string>,
): ChangeAnalysis {
  let value: unknown;
  try {
    value = JSON.parse(response);
  } catch {
    throw new AnalysisValidationError([
      'model response must be a single JSON object with no prose or code fence',
    ]);
  }
  return validateAnalysis(value, allowedEvidenceIds);
}
