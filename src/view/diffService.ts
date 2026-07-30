import * as path from 'node:path';
import * as vscode from 'vscode';

import type { GitContentProvider } from './gitContentProvider';
import { OutcomeFileNode } from './outcomeTree';

export class DiffService {
  public constructor(
    private readonly contentProvider: GitContentProvider,
  ) {}

  public async openDiff(node: unknown): Promise<void> {
    if (!(node instanceof OutcomeFileNode)) {
      return;
    }

    const { change } = node.file;
    const { comparison } = node;
    const beforePath = change.oldPath ?? change.path;
    const beforeRevision =
      change.status === 'added' ? '' : comparison.baseRevision;
    const afterRevision =
      change.status === 'deleted' ? '' : comparison.headRevision;
    const left = this.contentProvider.createUri(
      {
        repositoryRoot: comparison.repositoryRoot,
        revision: beforeRevision,
        filePath: beforePath,
      },
      'before',
    );
    const right = this.contentProvider.createUri(
      {
        repositoryRoot: comparison.repositoryRoot,
        revision: afterRevision,
        filePath: change.path,
      },
      'after',
    );
    const title = `${change.path} (${comparison.baseRevision.slice(0, 7)} ↔ ${comparison.headRevision.slice(0, 7)})`;

    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      title,
      { preview: true },
    );
  }

  public async openCurrentFile(node: unknown): Promise<void> {
    if (!(node instanceof OutcomeFileNode)) {
      return;
    }
    if (node.file.change.status === 'deleted') {
      await this.openDiff(node);
      return;
    }

    const uri = vscode.Uri.file(
      path.join(
        node.comparison.repositoryRoot,
        ...node.file.path.split('/'),
      ),
    );
    try {
      await vscode.workspace.fs.stat(uri);
      await vscode.window.showTextDocument(uri, { preview: true });
    } catch {
      await this.openDiff(node);
    }
  }
}
