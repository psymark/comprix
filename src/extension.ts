import * as vscode from 'vscode';

import { ComparisonController } from './controller/comparisonController';
import { DiffService } from './view/diffService';
import { GitContentProvider } from './view/gitContentProvider';
import {
  OutcomeTreeProvider,
  type OutcomeTreeNode,
} from './view/outcomeTree';

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new OutcomeTreeProvider();
  const treeView = vscode.window.createTreeView<OutcomeTreeNode>(
    'comprix.outcomes',
    {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    },
  );
  const contentProvider = new GitContentProvider();
  const diffService = new DiffService(contentProvider);
  const controller = new ComparisonController(
    treeProvider,
    treeView,
    diffService,
  );

  context.subscriptions.push(
    treeView,
    vscode.workspace.registerTextDocumentContentProvider(
      GitContentProvider.scheme,
      contentProvider,
    ),
  );
  controller.register(context);
  void vscode.commands.executeCommand(
    'setContext',
    'comprix.hasResults',
    false,
  );
}

export function deactivate(): void {}
