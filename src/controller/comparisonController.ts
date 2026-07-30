import * as vscode from 'vscode';

import { CodexCliAnalysisProvider } from '../analysis/codexCliProvider';
import type { AnalysisProvider } from '../analysis/provider';
import { VsCodeLanguageModelProvider } from '../analysis/vsCodeLanguageModelProvider';
import { formatComparison, parseComparisonRange } from '../core/comparison';
import type { ComparisonSpec } from '../core/model';
import {
  GitClient,
  RepositoryStateError,
  type GitRef,
} from '../git/gitClient';
import type { DiffService } from '../view/diffService';
import type { OutcomeTreeProvider } from '../view/outcomeTree';
import { mapAnalysisToViewModel } from '../view/viewModel';

interface RefQuickPickItem extends vscode.QuickPickItem {
  readonly ref: GitRef;
}

interface RepositoryQuickPickItem extends vscode.QuickPickItem {
  readonly client: GitClient;
}

interface LastComparison {
  readonly client: GitClient;
  readonly spec: ComparisonSpec;
}

type ProviderMode = 'codexCli' | 'vscodeLanguageModel';

function optionalSetting(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class ComparisonController implements vscode.Disposable {
  private lastComparison: LastComparison | undefined;
  private readonly output =
    vscode.window.createOutputChannel('Comprix', { log: true });

  public constructor(
    private readonly treeProvider: OutcomeTreeProvider,
    private readonly treeView: vscode.TreeView<unknown>,
    private readonly diffService: DiffService,
    private readonly extensionUri: vscode.Uri,
  ) {}

  public register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this,
      vscode.commands.registerCommand('comprix.compareRefs', () =>
        this.executeSafely(() => this.compareRefs()),
      ),
      vscode.commands.registerCommand('comprix.analyzeRange', () =>
        this.executeSafely(() => this.analyzeRange()),
      ),
      vscode.commands.registerCommand('comprix.refresh', () =>
        this.executeSafely(() => this.refresh()),
      ),
      vscode.commands.registerCommand('comprix.clear', () => this.clear()),
      vscode.commands.registerCommand(
        'comprix.openDiff',
        (node: unknown) =>
          this.executeSafely(() => this.diffService.openDiff(node)),
      ),
      vscode.commands.registerCommand(
        'comprix.openFile',
        (node: unknown) =>
          this.executeSafely(() => this.diffService.openCurrentFile(node)),
      ),
    );
  }

  public dispose(): void {
    this.output.dispose();
  }

  private async compareRefs(): Promise<void> {
    const client = await this.pickRepository();
    if (client === undefined) {
      return;
    }

    const refs = await client.listRefs();
    const base = await this.pickRef(
      refs,
      'Choose the base reference',
      'Comprix compares from the common ancestor of this ref',
    );
    if (base === undefined) {
      return;
    }
    const head = await this.pickRef(
      refs.filter((ref) => ref.name !== base.name),
      'Choose the head reference',
      'Comprix explains changes introduced on this ref',
    );
    if (head === undefined) {
      return;
    }
    await this.runAnalysis(client, {
      baseRef: base.name,
      headRef: head.name,
      strategy: 'merge-base',
    });
  }

  private async analyzeRange(): Promise<void> {
    const client = await this.pickRepository();
    if (client === undefined) {
      return;
    }

    const input = await vscode.window.showInputBox({
      title: 'Analyze a Git commit range',
      prompt:
        'Use A..B for a direct comparison or A...B for changes on B since the merge base',
      placeHolder: 'main...feature/my-change',
      validateInput: (value) => {
        try {
          parseComparisonRange(value);
          return undefined;
        } catch (error) {
          return errorMessage(error);
        }
      },
    });
    if (input === undefined) {
      return;
    }

    await this.runAnalysis(client, parseComparisonRange(input));
  }

  private async refresh(): Promise<void> {
    if (this.lastComparison === undefined) {
      await this.compareRefs();
      return;
    }
    await this.runAnalysis(
      this.lastComparison.client,
      this.lastComparison.spec,
    );
  }

  private async runAnalysis(
    client: GitClient,
    spec: ComparisonSpec,
  ): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('comprix');
    const maxFiles = configuration.get<number>('analysis.maxFiles', 80);
    const maxDiffCharacters = configuration.get<number>(
      'analysis.maxDiffCharacters',
      60000,
    );
    const providerMode = configuration.get<ProviderMode>(
      'analysis.provider',
      'vscodeLanguageModel',
    );
    const codexExecutable = configuration
      .get<string>('codex.executable', 'codex')
      .trim();
    const vendor = optionalSetting(
      configuration.get<string>('languageModel.vendor', 'copilot'),
    );
    const family = optionalSetting(
      configuration.get<string>('languageModel.family', ''),
    );
    const provider = this.createAnalysisProvider(
      providerMode,
      codexExecutable,
      vendor,
      family,
    );

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Comprix: analyzing ${formatComparison(spec)}`,
        cancellable: true,
      },
      async (progress, token) => {
        try {
          progress.report({ message: 'Collecting Git comparison…' });
          const comparison = await client.collectComparison(spec, {
            maxFiles,
            maxDiffCharacters,
            cancellation: token,
          });
          if (token.isCancellationRequested) {
            return;
          }

          progress.report({
            message:
              providerMode === 'codexCli'
                ? 'Generating outcomes with Codex…'
                : 'Generating outcomes with a VS Code language model…',
          });
          const analysis = await provider.analyze(comparison, token);
          if (token.isCancellationRequested) {
            return;
          }

          this.treeProvider.setResults(
            mapAnalysisToViewModel(analysis, comparison),
            comparison,
          );
          this.lastComparison = { client, spec };
          this.treeView.description = formatComparison(spec);
          this.treeView.message = analysis.overview;
          await vscode.commands.executeCommand(
            'setContext',
            'comprix.hasResults',
            true,
          );
          await vscode.commands.executeCommand(
            'workbench.view.scm',
          );
          await vscode.commands.executeCommand(
            'comprix.outcomes.focus',
          );
        } catch (error) {
          if (!token.isCancellationRequested) {
            throw error;
          }
        }
      },
    );
  }

  private clear(): void {
    this.lastComparison = undefined;
    this.treeProvider.clear();
    this.treeView.description = undefined;
    this.treeView.message = undefined;
    void vscode.commands.executeCommand(
      'setContext',
      'comprix.hasResults',
      false,
    );
  }

  private async pickRepository(): Promise<GitClient | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (folders === undefined || folders.length === 0) {
      await vscode.window.showInformationMessage(
        'Open a folder containing a Git repository before running Comprix.',
      );
      return undefined;
    }

    const discovered = await Promise.all(
      folders.map(async (folder) => {
        try {
          return await GitClient.discover(folder.uri.fsPath);
        } catch {
          return undefined;
        }
      }),
    );
    const clients = [
      ...new Map(
        discovered
          .filter((client): client is GitClient => client !== undefined)
          .map((client) => [client.repositoryRoot, client]),
      ).values(),
    ];

    if (clients.length === 0) {
      throw new RepositoryStateError(
        'No Git repository was found in the open workspace folders.',
      );
    }
    if (clients.length === 1) {
      return clients[0];
    }

    const selection =
      await vscode.window.showQuickPick<RepositoryQuickPickItem>(
        clients.map((client) => ({
          label: vscode.workspace.asRelativePath(
            vscode.Uri.file(client.repositoryRoot),
            false,
          ),
          description: client.repositoryRoot,
          client,
        })),
        {
          title: 'Choose a Git repository',
          placeHolder: 'Repository to analyze',
          matchOnDescription: true,
        },
      );
    return selection?.client;
  }

  private async pickRef(
    refs: readonly GitRef[],
    title: string,
    placeHolder: string,
  ): Promise<GitRef | undefined> {
    const selection = await vscode.window.showQuickPick<RefQuickPickItem>(
      refs.map((ref) => ({
        label: ref.name,
        description: ref.shortHash,
        detail: ref.subject,
        ref,
      })),
      {
        title,
        placeHolder,
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    return selection?.ref;
  }

  private async reportError(error: unknown): Promise<void> {
    const message = errorMessage(error);
    this.output.error(message);
    if (error instanceof Error && error.stack !== undefined) {
      this.output.debug(error.stack);
    }
    await vscode.window.showErrorMessage(`Comprix: ${message}`);
  }

  private async executeSafely(
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      await this.reportError(error);
    }
  }

  private createAnalysisProvider(
    mode: ProviderMode,
    codexExecutable: string,
    vendor: string | undefined,
    family: string | undefined,
  ): AnalysisProvider {
    if (mode === 'codexCli') {
      return new CodexCliAnalysisProvider({
        executable:
          codexExecutable.length === 0 ? 'codex' : codexExecutable,
        schemaPath: vscode.Uri.joinPath(
          this.extensionUri,
          'resources',
          'analysis-schema.json',
        ).fsPath,
      });
    }

    return new VsCodeLanguageModelProvider({ vendor, family });
  }
}
