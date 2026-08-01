import * as path from 'node:path';
import * as vscode from 'vscode';

import type { ChangedFile, ComparisonSnapshot } from '../core/model';
import { createEvidenceNavigation } from './evidenceNavigation';
import type { GitContentProvider } from './gitContentProvider';
import { EvidenceNode, OutcomeFileNode } from './outcomeTree';

interface DiffTarget {
  readonly beforePath: string;
  readonly beforeRevision: string;
  readonly afterPath: string;
  readonly afterRevision: string;
}

function fileDiffTarget(
  change: ChangedFile,
  comparison: ComparisonSnapshot,
): DiffTarget {
  return {
    beforePath: change.oldPath ?? change.path,
    beforeRevision: change.status === 'added' ? '' : comparison.baseRevision,
    afterPath: change.path,
    afterRevision: change.status === 'deleted' ? '' : comparison.headRevision,
  };
}

export class DiffService {
  public constructor(private readonly contentProvider: GitContentProvider) {}

  public async openDiff(node: unknown): Promise<void> {
    if (!(node instanceof OutcomeFileNode)) return;
    await this.openHistoricalDiff(
      fileDiffTarget(node.file.change, node.comparison),
      node.comparison,
    );
  }

  public async openEvidence(node: unknown): Promise<void> {
    if (!(node instanceof EvidenceNode)) return;
    const navigation = createEvidenceNavigation(node.evidence.unit, node.comparison);
    const uris = await this.openHistoricalDiff(navigation, node.comparison);
    const targetUri = navigation.reveal.side === 'before' ? uris.left : uris.right;
    const editor = vscode.window.visibleTextEditors.find(
      (candidate) => candidate.document.uri.toString() === targetUri.toString(),
    );
    if (editor === undefined) {
      await vscode.window.showInformationMessage(
        `Comprix opened the historical diff, but VS Code could not reveal the cited ${navigation.reveal.side} range automatically.`,
      );
      return;
    }
    const startLine = Math.min(
      navigation.reveal.startLine,
      Math.max(0, editor.document.lineCount - 1),
    );
    const endLine = Math.min(
      startLine + navigation.reveal.lineCount - 1,
      Math.max(0, editor.document.lineCount - 1),
    );
    const range = new vscode.Range(
      startLine,
      0,
      endLine,
      editor.document.lineAt(endLine).text.length,
    );
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  public async openCurrentFile(node: unknown): Promise<void> {
    if (!(node instanceof OutcomeFileNode)) return;
    if (node.file.change.status === 'deleted') {
      await this.openDiff(node);
      return;
    }
    const uri = vscode.Uri.file(
      path.join(node.comparison.repositoryRoot, ...node.file.path.split('/')),
    );
    try {
      await vscode.workspace.fs.stat(uri);
      await vscode.window.showTextDocument(uri, { preview: true });
    } catch {
      await this.openDiff(node);
    }
  }

  private async openHistoricalDiff(
    target: DiffTarget,
    comparison: ComparisonSnapshot,
  ): Promise<{ readonly left: vscode.Uri; readonly right: vscode.Uri }> {
    const left = this.contentProvider.createUri(
      {
        repositoryRoot: comparison.repositoryRoot,
        revision: target.beforeRevision,
        filePath: target.beforePath,
      },
      'before',
    );
    const right = this.contentProvider.createUri(
      {
        repositoryRoot: comparison.repositoryRoot,
        revision: target.afterRevision,
        filePath: target.afterPath,
      },
      'after',
    );
    const title = `${target.afterPath} (${comparison.baseRevision.slice(0, 7)} ↔ ${comparison.headRevision.slice(0, 7)})`;
    await vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true });
    return { left, right };
  }
}
