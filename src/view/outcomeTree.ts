import * as path from 'node:path';
import * as vscode from 'vscode';

import type { ComparisonSnapshot } from '../core/model';
import type {
  AnalysisViewModel,
  EvidenceCitationViewModel,
  OutcomeFileViewModel,
  OutcomeViewModel,
} from './viewModel';

export type OutcomeTreeNode = OutcomeNode | OutcomeFileNode | EvidenceNode;

function categoryIcon(category: OutcomeViewModel['category']): string {
  switch (category) {
    case 'api': return 'symbol-interface';
    case 'behavior': return 'sparkle';
    case 'documentation': return 'book';
    case 'infrastructure': return 'server-process';
    case 'performance': return 'dashboard';
    case 'security': return 'shield';
    case 'testing': return 'beaker';
    case 'user-interface': return 'layout';
    case 'other': return 'lightbulb';
  }
}

function evidenceIcon(kind: EvidenceCitationViewModel['citation']['kind']): string {
  switch (kind) {
    case 'fact': return 'verified';
    case 'inference': return 'lightbulb';
    case 'question': return 'question';
  }
}

function rangeLabel(evidence: EvidenceCitationViewModel): string {
  const range = evidence.unit.newRange.length > 0
    ? evidence.unit.newRange
    : evidence.unit.oldRange;
  const side = evidence.unit.newRange.length > 0 ? 'new' : 'old';
  return `${side} lines ${range.start.toString()}–${(range.start + range.length - 1).toString()}`;
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
    tooltip.appendMarkdown(`\n\nCategory: \`${outcome.category}\` · Confidence: \`${outcome.confidence}\``);
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
    super(file.path, vscode.TreeItemCollapsibleState.Expanded);
    this.id = file.id;
    this.description = `${file.evidence.length.toString()} ${file.evidence.length === 1 ? 'hunk' : 'hunks'}`;
    this.contextValue = 'comprixFile';
    this.iconPath = vscode.ThemeIcon.File;
    this.command = {
      command: 'comprix.openDiff',
      title: 'Open contributing diff',
      arguments: [this],
    };
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${path.basename(file.path)}**\n\n`);
    tooltip.appendText(`${file.evidence.length.toString()} cited evidence ${file.evidence.length === 1 ? 'hunk' : 'hunks'}. Select a child to reveal its exact range.`);
    if (file.change.oldPath !== undefined) {
      tooltip.appendMarkdown(`\n\nRenamed from \`${file.change.oldPath}\`.`);
    }
    this.tooltip = tooltip;
    this.accessibilityInformation = {
      label: `${file.path}, ${file.change.status}, ${file.evidence.length.toString()} cited hunks`,
    };
  }
}

export class EvidenceNode extends vscode.TreeItem {
  public readonly kind = 'evidence';

  public constructor(
    public readonly evidence: EvidenceCitationViewModel,
    public readonly comparison: ComparisonSnapshot,
  ) {
    super(
      evidence.unit.heading ?? rangeLabel(evidence),
      vscode.TreeItemCollapsibleState.None,
    );
    this.id = evidence.id;
    this.description = evidence.citation.kind;
    this.contextValue = 'comprixEvidence';
    this.iconPath = new vscode.ThemeIcon(evidenceIcon(evidence.citation.kind));
    this.command = {
      command: 'comprix.openEvidence',
      title: 'Open cited evidence',
      arguments: [this],
    };
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${evidence.citation.kind} · ${rangeLabel(evidence)}**\n\n`);
    tooltip.appendText(evidence.citation.explanation);
    if (evidence.unit.heading !== undefined) {
      tooltip.appendMarkdown(`\n\nHunk: \`${evidence.unit.heading}\``);
    }
    this.tooltip = tooltip;
    this.accessibilityInformation = {
      label: `${evidence.citation.kind}, ${evidence.unit.heading ?? rangeLabel(evidence)}. ${evidence.citation.explanation}. Select to open the cited historical diff range.`,
    };
  }
}

export class OutcomeTreeProvider implements vscode.TreeDataProvider<OutcomeTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<OutcomeTreeNode | undefined | void>();
  public readonly onDidChangeTreeData = this.changeEmitter.event;
  private viewModel: AnalysisViewModel | undefined;
  private comparison: ComparisonSnapshot | undefined;

  public getTreeItem(element: OutcomeTreeNode): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: OutcomeTreeNode): OutcomeTreeNode[] {
    if (this.viewModel === undefined || this.comparison === undefined) return [];
    if (element === undefined) return this.viewModel.outcomes.map((outcome) => new OutcomeNode(outcome));
    if (element instanceof OutcomeNode) {
      return element.outcome.files.map((file) => new OutcomeFileNode(file, this.comparison!));
    }
    if (element instanceof OutcomeFileNode) {
      return element.file.evidence.map((evidence) => new EvidenceNode(evidence, this.comparison!));
    }
    return [];
  }

  public setResults(viewModel: AnalysisViewModel, comparison: ComparisonSnapshot): void {
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
