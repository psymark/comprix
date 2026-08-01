import { formatComparison } from '../core/comparison';
import type { ComparisonSnapshot } from '../core/model';

export const analysisInstructions = `You are a change-comprehension engine. Analyze supplied Git diff evidence and identify user-visible, developer-visible, or operational functional outcomes.

Return exactly one JSON object. Do not use Markdown or a code fence. The object must have this schema:
{
  "version": 2,
  "overview": "one concise paragraph",
  "outcomes": [
    {
      "title": "specific outcome stated as an action",
      "description": "what changed and why it matters",
      "category": "behavior | api | user-interface | performance | security | testing | infrastructure | documentation | other",
      "confidence": "high | medium | low",
      "evidence": [
        {
          "evidenceId": "an exact opaque ID from SUPPLIED EVIDENCE",
          "explanation": "how this hunk supports the outcome",
          "kind": "fact | inference | question"
        }
      ]
    }
  ]
}

Rules:
- Describe functional outcomes, not a file-by-file changelog.
- Group files that jointly produce one outcome.
- Every outcome must cite at least one exact evidence ID.
- Cite only complete evidence units supplied below. Never invent an ID, path, line number, behavior, motivation, issue, or runtime effect.
- Use "fact" only for a claim directly established by its cited hunk, "inference" for a plausible implication not completely established by the supplied code, and "question" for something the reviewer should investigate.
- Do not duplicate an evidence ID within one outcome.
- Separate test-only and documentation-only changes when they are not part of a broader outcome.
- Use low confidence when the patch does not establish the effect clearly.
- Keep titles distinct, concrete, and under 120 characters.`;

export function buildAnalysisPrompt(snapshot: ComparisonSnapshot): string {
  const files = snapshot.files
    .map((file) => {
      const rename =
        file.oldPath === undefined ? '' : ` (from ${file.oldPath})`;
      return `- [${file.status}] ${file.path}${rename}`;
    })
    .join('\n');
  const commits =
    snapshot.commits.length === 0
      ? '- No commits are exclusive to the head side.'
      : snapshot.commits
          .map(
            (commit) =>
              `- ${commit.shortHash} ${commit.subject} — ${commit.author}`,
          )
          .join('\n');
  const truncation = snapshot.truncated
    ? '\nNOTICE: Input was truncated at a complete evidence-unit boundary by configured safety limits. Do not infer omitted changes or cite anything not supplied.'
    : '';
  const evidence = snapshot.evidence
    .map((unit) => {
      const oldPath = unit.oldPath === undefined ? '' : `\nPrevious path: ${unit.oldPath}`;
      const heading = unit.heading === undefined ? '' : `\nHunk context: ${unit.heading}`;
      return `EVIDENCE ${unit.id}
File: ${unit.path}${oldPath}
Status: ${unit.status}
Old range: ${unit.oldRange.start.toString()},${unit.oldRange.length.toString()}
New range: ${unit.newRange.start.toString()},${unit.newRange.length.toString()}${heading}
PATCH
${unit.patch}`;
    })
    .join('\n');

  return `REPOSITORY COMPARISON
Range: ${formatComparison(snapshot.spec)}
Resolved base: ${snapshot.baseRevision}
Resolved head: ${snapshot.headRevision}
Statistics: ${snapshot.shortStat || 'not available'}
Changed files included: ${snapshot.files.length.toString()} of ${snapshot.totalFileCount.toString()}${truncation}
Evidence units supplied: ${snapshot.evidence.length.toString()} of ${snapshot.totalEvidenceCount.toString()}

COMMITS
${commits}

CHANGED FILES
${files}

SUPPLIED EVIDENCE
${evidence}`;
}
