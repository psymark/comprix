import * as path from 'node:path';
import * as vscode from 'vscode';

import type { ComparisonSnapshot } from '../core/model';
import type {
  AnalysisViewModel,
  OutcomeFileViewModel,
  OutcomeViewModel,
} from './viewModel';

export type OutcomeTreeNode = OutcomeNode | OutcomeFileNode;

function categoryIcon(category: OutcomeViewModel['category']): string {
  switch (category) {
    case 'api':
      return 'symbol-interface';
    case 'behavior':
      return 'sparkle';
    case 'documentation':
      return 'book';
    case 'infrastructure':
      return 'server-process';
    case 'performance':
      return 'dashboard';
    case 'security':
      return 'shield';
    case 'testing':
      return 'beaker';
    case 'user-interface':
      return 'layout';
    case 'other':
      return 'lightbulb';
  }
}

export class OutcomeNode extends vscode.TreeItem {
  public readonly kind = 'outcome';

  public constructor(public readonly outcome: OutcomeViewModel) {
    super(outcome.title, vscode.TreeItemCollapsibleState.Expanded);
    this.id = outcome.id;
    this.description = outcome.confidence;
    this.contextValue = 'comprixOutcome';
    this.iconPath = new vscode.ThemeIcon(categoryIcon(outcome.category));
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${outcome.title}**\n\n`);
    tooltip.appendText(outcome.description);
    tooltip.appendMarkdown(
      `\n\nCategory: \`${outcome.category}\` · Confidence: \`${outcome.confidence}\``,
    );
    this.tooltip = tooltip;
    this.accessibilityInformation = {
      label: `${outcome.title}, ${outcome.confidence} confidence, ${outcome.files.length.toString()} contributing files`,
    };
  }
}

export class OutcomeFileNode extends vscode.TreeItem {
  public readonly kind = 'file';

  public constructor(
    public readonly file: OutcomeFileViewModel,
    public readonly comparison: ComparisonSnapshot,
  ) {
    super(file.path, vscode.TreeItemCollapsibleState.None);
    this.id = file.id;
    this.description = file.change.status;
    this.contextValue = 'comprixFile';
    this.iconPath = vscode.ThemeIcon.File;
    this.command = {
      command: 'comprix.openDiff',
      title: 'Open contributing diff',
      arguments: [this],
    };
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${path.basename(file.path)}**\n\n`);
    tooltip.appendText(file.reason);
    if (file.change.oldPath !== undefined) {
      tooltip.appendMarkdown(`\n\nRenamed from \`${file.change.oldPath}\`.`);
    }
    this.tooltip = tooltip;
    this.accessibilityInformation = {
      label: `${file.path}, ${file.change.status}. ${file.reason}`,
    };
  }
}

export class OutcomeTreeProvider
  implements vscode.TreeDataProvider<OutcomeTreeNode>
{
  private readonly changeEmitter =
    new vscode.EventEmitter<OutcomeTreeNode | undefined | void>();

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  private viewModel: AnalysisViewModel | undefined;
  private comparison: ComparisonSnapshot | undefined;

  public getTreeItem(element: OutcomeTreeNode): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: OutcomeTreeNode): OutcomeTreeNode[] {
    if (this.viewModel === undefined || this.comparison === undefined) {
      return [];
    }
    if (element === undefined) {
      return this.viewModel.outcomes.map(
        (outcome) => new OutcomeNode(outcome),
      );
    }
    if (element instanceof OutcomeNode) {
      return element.outcome.files.map(
        (file) => new OutcomeFileNode(file, this.comparison!),
      );
    }
    return [];
  }

  public setResults(
    viewModel: AnalysisViewModel,
    comparison: ComparisonSnapshot,
  ): void {
    this.viewModel = viewModel;
    this.comparison = comparison;
    this.changeEmitter.fire();
  }

  public clear(): void {
    this.viewModel = undefined;
    this.comparison = undefined;
    this.changeEmitter.fire();
  }
}
