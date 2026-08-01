import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ChangedFile } from '../core/model';
import {
  UnifiedDiffParseError,
  parseUnifiedDiff,
  truncateEvidence,
} from '../git/unifiedDiff';

describe('unified diff evidence parsing', () => {
  it('parses several hunks with headings and stable identifiers', () => {
    const files: ChangedFile[] = [
      { path: 'src/validator.ts', status: 'modified' },
    ];
    const patch = `diff --git a/src/validator.ts b/src/validator.ts
index 1111111..2222222 100644
--- a/src/validator.ts
+++ b/src/validator.ts
@@ -1,2 +1,3 @@ validate(input: Input) {
 context
-old
+new
+added
@@ -20 +21 @@ function punctuated(): void { // !?
-before
+after
`;

    const first = parseUnifiedDiff(patch, files);
    const second = parseUnifiedDiff(patch, files);
    assert.equal(first.length, 2);
    assert.deepEqual(first, second);
    assert.deepEqual(first[0]?.oldRange, { start: 1, length: 2 });
    assert.deepEqual(first[0]?.newRange, { start: 1, length: 3 });
    assert.equal(first[0]?.heading, 'validate(input: Input) {');
    assert.equal(
      first[1]?.heading,
      'function punctuated(): void { // !?',
    );
    assert.match(first[0]?.id ?? '', /^ev-[a-f0-9]{20}$/u);
    assert.notEqual(first[0]?.id, first[1]?.id);
  });

  it('parses added and deleted files with zero-length ranges', () => {
    const patch = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+first
+second
diff --git a/old.ts b/old.ts
deleted file mode 100644
index 2222222..0000000
--- a/old.ts
+++ /dev/null
@@ -4,2 +0,0 @@ removed()
-first
-second
`;
    const result = parseUnifiedDiff(patch, [
      { path: 'new.ts', status: 'added' },
      { path: 'old.ts', status: 'deleted' },
    ]);

    assert.deepEqual(result[0]?.oldRange, { start: 0, length: 0 });
    assert.deepEqual(result[0]?.newRange, { start: 1, length: 2 });
    assert.deepEqual(result[1]?.oldRange, { start: 4, length: 2 });
    assert.deepEqual(result[1]?.newRange, { start: 0, length: 0 });
  });

  it('maps a modified rename and Git-quoted unusual paths', () => {
    const patch = `diff --git a/old name\t.ts b/new name\t.ts
similarity index 80%
rename from old name\t.ts
rename to new name\t.ts
--- "a/old name\\t.ts"
+++ "b/new name\\t.ts"
@@ -1 +1 @@ symbol.with-punctuation()
-old
+new
`;
    const result = parseUnifiedDiff(patch, [
      {
        path: 'new name\t.ts',
        oldPath: 'old name\t.ts',
        status: 'renamed',
      },
    ]);

    assert.equal(result[0]?.path, 'new name\t.ts');
    assert.equal(result[0]?.oldPath, 'old name\t.ts');
  });

  it('supports an absent heading and the no-newline marker', () => {
    const result = parseUnifiedDiff(
      `diff --git a/plain.txt b/plain.txt
index 1111111..2222222 100644
--- a/plain.txt
+++ b/plain.txt
@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file`,
      [{ path: 'plain.txt', status: 'modified' }],
    );

    assert.equal(result[0]?.heading, undefined);
    assert.match(result[0]?.patch ?? '', /No newline at end of file\n$/u);
  });

  it('truncates only at evidence-unit boundaries', () => {
    const evidence = parseUnifiedDiff(
      `diff --git a/file.txt b/file.txt
index 1111111..2222222 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@ first
-a
+b
@@ -4 +4 @@ second
-c
+d
`,
      [{ path: 'file.txt', status: 'modified' }],
    );
    const firstLength = evidence[0]?.patch.length ?? 0;

    assert.equal(truncateEvidence(evidence, firstLength).length, 1);
    assert.equal(truncateEvidence(evidence, firstLength + 1).length, 1);
    assert.equal(
      truncateEvidence(
        evidence,
        evidence.reduce((total, unit) => total + unit.patch.length, 0),
      ).length,
      2,
    );
  });

  it('rejects malformed or mismatched hunk input', () => {
    assert.throws(
      () =>
        parseUnifiedDiff(
          `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1 @@
-only-one-old-line
+new
`,
          [{ path: 'file.txt', status: 'modified' }],
        ),
      UnifiedDiffParseError,
    );
  });
});
