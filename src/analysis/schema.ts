import {
  confidenceLevels,
  outcomeCategories,
  type ChangeAnalysis,
  type ChangeOutcome,
  type Confidence,
  type OutcomeCategory,
  type OutcomeFile,
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
    issues.push(
      `${path} must not exceed ${maximumLength.toString()} characters`,
    );
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

function readOutcomeFile(
  value: unknown,
  index: number,
  allowedPaths: ReadonlySet<string>,
  issues: string[],
): OutcomeFile | undefined {
  const itemPath = `outcomes[].files[${index.toString()}]`;
  if (!isRecord(value)) {
    issues.push(`${itemPath} must be an object`);
    return undefined;
  }

  const filePath = readString(value.path, `${itemPath}.path`, issues, 1000);
  const reason = readString(
    value.reason,
    `${itemPath}.reason`,
    issues,
    500,
  );
  if (filePath !== undefined && !allowedPaths.has(filePath)) {
    issues.push(`${itemPath}.path is not a changed file: ${filePath}`);
  }

  return filePath !== undefined &&
    reason !== undefined &&
    allowedPaths.has(filePath)
    ? { path: filePath, reason }
    : undefined;
}

function readOutcome(
  value: unknown,
  index: number,
  allowedPaths: ReadonlySet<string>,
  issues: string[],
): ChangeOutcome | undefined {
  const itemPath = `outcomes[${index.toString()}]`;
  if (!isRecord(value)) {
    issues.push(`${itemPath} must be an object`);
    return undefined;
  }

  const title = readString(value.title, `${itemPath}.title`, issues, 160);
  const description = readString(
    value.description,
    `${itemPath}.description`,
    issues,
    1200,
  );
  const category = readEnum<OutcomeCategory>(
    value.category,
    outcomeCategories,
    `${itemPath}.category`,
    issues,
  );
  const confidence = readEnum<Confidence>(
    value.confidence,
    confidenceLevels,
    `${itemPath}.confidence`,
    issues,
  );

  if (!Array.isArray(value.files) || value.files.length === 0) {
    issues.push(`${itemPath}.files must be a non-empty array`);
    return undefined;
  }

  const files = value.files
    .map((file, fileIndex) =>
      readOutcomeFile(file, fileIndex, allowedPaths, issues),
    )
    .filter((file): file is OutcomeFile => file !== undefined);

  return title !== undefined &&
    description !== undefined &&
    category !== undefined &&
    confidence !== undefined &&
    files.length === value.files.length
    ? { title, description, category, confidence, files }
    : undefined;
}

export function validateAnalysis(
  value: unknown,
  allowedPaths: ReadonlySet<string>,
): ChangeAnalysis {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new AnalysisValidationError(['root must be an object']);
  }

  if (value.version !== 1) {
    issues.push('version must be 1');
  }
  const overview = readString(value.overview, 'overview', issues, 2000);

  if (
    !Array.isArray(value.outcomes) ||
    value.outcomes.length === 0 ||
    value.outcomes.length > 20
  ) {
    issues.push('outcomes must contain between 1 and 20 items');
  }

  const rawOutcomes = Array.isArray(value.outcomes) ? value.outcomes : [];
  const outcomes = rawOutcomes
    .map((outcome, index) =>
      readOutcome(outcome, index, allowedPaths, issues),
    )
    .filter((outcome): outcome is ChangeOutcome => outcome !== undefined);

  if (
    issues.length > 0 ||
    overview === undefined ||
    outcomes.length !== rawOutcomes.length
  ) {
    throw new AnalysisValidationError(issues);
  }

  return { version: 1, overview, outcomes };
}

export function parseAnalysisJson(
  response: string,
  allowedPaths: ReadonlySet<string>,
): ChangeAnalysis {
  let value: unknown;
  try {
    value = JSON.parse(response);
  } catch {
    throw new AnalysisValidationError([
      'model response must be a single JSON object with no prose or code fence',
    ]);
  }
  return validateAnalysis(value, allowedPaths);
}
