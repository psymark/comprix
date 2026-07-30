import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CodexCliAnalysisProvider,
  buildCodexArguments,
  type CodexExecutionRequest,
} from '../analysis/codexCliProvider';
import type { ComparisonSnapshot } from '../core/model';

const comparison: ComparisonSnapshot = {
  repositoryRoot: '/workspace/repository',
  spec: {
    baseRef: 'main',
    headRef: 'feature',
    strategy: 'merge-base',
  },
  baseRevision: '1111111111111111111111111111111111111111',
  headRevision: '2222222222222222222222222222222222222222',
  files: [{ path: 'src/change.ts', status: 'modified' }],
  totalFileCount: 1,
  commits: [],
  shortStat: '1 file changed',
  patch: 'diff --git a/src/change.ts b/src/change.ts',
  truncated: false,
};

describe('Codex CLI provider', () => {
  it('uses ephemeral read-only execution with a JSON Schema', () => {
    assert.deepEqual(
      buildCodexArguments('/extension/schema.json', '/workspace/repository'),
      [
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--sandbox',
        'read-only',
        '--output-schema',
        '/extension/schema.json',
        '--color',
        'never',
        '--skip-git-repo-check',
        '--cd',
        '/workspace/repository',
        '-',
      ],
    );
  });

  it('validates the structured Codex response and supplied file paths', async () => {
    let request: CodexExecutionRequest | undefined;
    const provider = new CodexCliAnalysisProvider(
      {
        executable: '/usr/bin/codex',
        schemaPath: '/extension/schema.json',
      },
      (value) => {
        request = value;
        return Promise.resolve(
          JSON.stringify({
            version: 1,
            overview: 'Updates behavior.',
            outcomes: [
              {
                title: 'Updates behavior',
                description: 'Changes the existing behavior.',
                category: 'behavior',
                confidence: 'high',
                files: [
                  {
                    path: 'src/change.ts',
                    reason: 'Implements the behavior.',
                  },
                ],
              },
            ],
          }),
        );
      },
    );

    const analysis = await provider.analyze(comparison);
    assert.equal(analysis.outcomes[0]?.title, 'Updates behavior');
    assert.equal(request?.executable, '/usr/bin/codex');
    assert.match(
      request?.workingDirectory ?? '',
      /comprix-codex-/,
    );
    assert.match(
      request?.input ?? '',
      /Do not run commands or inspect files/,
    );
  });
});
