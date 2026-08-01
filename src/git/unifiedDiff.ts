import { createHash } from 'node:crypto';

import type { ChangedFile, EvidenceUnit } from '../core/model';

export class UnifiedDiffParseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UnifiedDiffParseError';
  }
}

interface ParsedHeader {
  readonly oldStart: number;
  readonly oldLength: number;
  readonly newStart: number;
  readonly newLength: number;
  readonly heading?: string;
}

interface FilePatch {
  readonly text: string;
  readonly oldPath: string;
  readonly newPath: string;
}

function decodeGitPath(value: string): string {
  if (!value.startsWith('"')) {
    return value;
  }
  if (!value.endsWith('"')) {
    throw new UnifiedDiffParseError('Git returned an unterminated quoted path.');
  }

  const bytes: number[] = [];
  const content = value.slice(1, -1);
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === undefined) {
      break;
    }
    if (character !== '\\') {
      bytes.push(...Buffer.from(character, 'utf8'));
      continue;
    }

    const escaped = content[index + 1];
    if (escaped === undefined) {
      throw new UnifiedDiffParseError('Git returned an invalid path escape.');
    }
    index += 1;
    const namedEscapes: Readonly<Record<string, number>> = {
      a: 0x07,
      b: 0x08,
      t: 0x09,
      n: 0x0a,
      v: 0x0b,
      f: 0x0c,
      r: 0x0d,
      '"': 0x22,
      '\\': 0x5c,
    };
    const named = namedEscapes[escaped];
    if (named !== undefined) {
      bytes.push(named);
      continue;
    }
    if (!/[0-7]/u.test(escaped)) {
      throw new UnifiedDiffParseError(`Git returned an unknown path escape: \\${escaped}.`);
    }
    let octal = escaped;
    for (let offset = 1; offset < 3; offset += 1) {
      const next = content[index + 1];
      if (next === undefined || !/[0-7]/u.test(next)) {
        break;
      }
      octal += next;
      index += 1;
    }
    bytes.push(Number.parseInt(octal, 8));
  }
  return Buffer.from(bytes).toString('utf8');
}

function readMarkerPath(line: string, prefix: '--- ' | '+++ '): string {
  const raw = line.slice(prefix.length);
  if (raw === '/dev/null') {
    return raw;
  }
  const decoded = decodeGitPath(raw);
  if (!decoded.startsWith(prefix === '--- ' ? 'a/' : 'b/')) {
    throw new UnifiedDiffParseError(`Git returned an unexpected ${prefix.trim()} path: ${decoded}.`);
  }
  return decoded.slice(2);
}

function splitFilePatches(patch: string): FilePatch[] {
  const starts = [...patch.matchAll(/^diff --git /gmu)].map((match) => match.index);
  if (patch.length > 0 && starts[0] !== 0) {
    throw new UnifiedDiffParseError('Git patch did not begin with a file header.');
  }

  const result: FilePatch[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1] ?? patch.length;
    if (start === undefined) {
      continue;
    }
    const text = patch.slice(start, end);
    const firstHunk = text.search(/^@@ /mu);
    if (firstHunk < 0) {
      continue;
    }
    const header = text.slice(0, firstHunk);
    const oldMatch = /^--- (.*)$/mu.exec(header);
    const newMatch = /^\+\+\+ (.*)$/mu.exec(header);
    if (oldMatch?.[1] === undefined || newMatch?.[1] === undefined) {
      throw new UnifiedDiffParseError('A text diff was missing its old or new file marker.');
    }
    result.push({
      text,
      oldPath: readMarkerPath(oldMatch[0], '--- '),
      newPath: readMarkerPath(newMatch[0], '+++ '),
    });
  }
  return result;
}

function parseHunkHeader(line: string): ParsedHeader {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/u.exec(line);
  if (match === null) {
    throw new UnifiedDiffParseError(`Git returned an unsupported hunk header: ${line}.`);
  }
  const oldStart = Number(match[1]);
  const oldLength = match[2] === undefined ? 1 : Number(match[2]);
  const newStart = Number(match[3]);
  const newLength = match[4] === undefined ? 1 : Number(match[4]);
  const rawHeading = match[5]?.trim();
  return {
    oldStart,
    oldLength,
    newStart,
    newLength,
    heading: rawHeading === undefined || rawHeading.length === 0 ? undefined : rawHeading,
  };
}

function validateHunkBody(patch: string, header: ParsedHeader): void {
  const firstNewline = patch.indexOf('\n');
  const body = firstNewline < 0 ? '' : patch.slice(firstNewline + 1);
  let oldLines = 0;
  let newLines = 0;
  for (const line of body.split('\n')) {
    if (line.length === 0 && body.endsWith('\n')) {
      continue;
    }
    const prefix = line[0];
    if (prefix === ' ') {
      oldLines += 1;
      newLines += 1;
    } else if (prefix === '-') {
      oldLines += 1;
    } else if (prefix === '+') {
      newLines += 1;
    } else if (prefix !== '\\') {
      throw new UnifiedDiffParseError('Git returned an invalid line inside a diff hunk.');
    }
  }
  if (oldLines !== header.oldLength || newLines !== header.newLength) {
    throw new UnifiedDiffParseError(
      `Git hunk line counts did not match its header (expected -${header.oldLength.toString()} +${header.newLength.toString()}, found -${oldLines.toString()} +${newLines.toString()}).`,
    );
  }
}

function evidenceId(
  file: ChangedFile,
  header: ParsedHeader,
  patch: string,
): string {
  const components = [
    file.path,
    file.oldPath ?? '',
    file.status,
    header.oldStart.toString(),
    header.oldLength.toString(),
    header.newStart.toString(),
    header.newLength.toString(),
    header.heading ?? '',
    patch,
  ];
  const hash = createHash('sha256');
  for (const component of components) {
    hash.update(component.length.toString());
    hash.update(':');
    hash.update(component);
  }
  return `ev-${hash.digest('hex').slice(0, 20)}`;
}

function findChangedFile(
  filePatch: FilePatch,
  files: readonly ChangedFile[],
): ChangedFile {
  const oldPath = filePatch.oldPath === '/dev/null' ? undefined : filePatch.oldPath;
  const newPath = filePatch.newPath === '/dev/null' ? undefined : filePatch.newPath;
  const matches = files.filter((file) => {
    const expectedOld = file.status === 'added' ? undefined : (file.oldPath ?? file.path);
    const expectedNew = file.status === 'deleted' ? undefined : file.path;
    return expectedOld === oldPath && expectedNew === newPath;
  });
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new UnifiedDiffParseError('A patch file could not be matched uniquely to changed-file metadata.');
  }
  return matches[0];
}

export function parseUnifiedDiff(
  patch: string,
  files: readonly ChangedFile[],
): EvidenceUnit[] {
  const evidence: EvidenceUnit[] = [];
  const ids = new Set<string>();
  for (const filePatch of splitFilePatches(patch)) {
    const file = findChangedFile(filePatch, files);
    const hunkStarts = [...filePatch.text.matchAll(/^@@ .*$/gmu)].map((match) => match.index);
    for (let index = 0; index < hunkStarts.length; index += 1) {
      const start = hunkStarts[index];
      const end = hunkStarts[index + 1] ?? filePatch.text.length;
      if (start === undefined) {
        continue;
      }
      const rawPatch = filePatch.text.slice(start, end);
      const patchText = rawPatch.endsWith('\n') ? rawPatch : `${rawPatch}\n`;
      const headerLine = patchText.slice(0, patchText.indexOf('\n'));
      const header = parseHunkHeader(headerLine);
      validateHunkBody(patchText, header);
      const id = evidenceId(file, header, patchText);
      if (ids.has(id)) {
        throw new UnifiedDiffParseError(`Git patch produced duplicate evidence identifier ${id}.`);
      }
      ids.add(id);
      evidence.push({
        id,
        path: file.path,
        ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
        status: file.status,
        oldRange: { start: header.oldStart, length: header.oldLength },
        newRange: { start: header.newStart, length: header.newLength },
        ...(header.heading === undefined ? {} : { heading: header.heading }),
        patch: patchText,
      });
    }
  }
  return evidence;
}

export function truncateEvidence(
  evidence: readonly EvidenceUnit[],
  maximumCharacters: number,
): EvidenceUnit[] {
  const included: EvidenceUnit[] = [];
  let used = 0;
  for (const unit of evidence) {
    if (used + unit.patch.length > maximumCharacters) {
      break;
    }
    included.push(unit);
    used += unit.patch.length;
  }
  return included;
}
