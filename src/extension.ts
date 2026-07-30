import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const showScaffoldMessage = (): void => {
    void vscode.window.showInformationMessage(
      'Comprix is ready. Comparison analysis will be available in the next implementation increment.',
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('comprix.compareRefs', showScaffoldMessage),
    vscode.commands.registerCommand('comprix.analyzeRange', showScaffoldMessage),
    vscode.commands.registerCommand('comprix.refresh', showScaffoldMessage),
    vscode.commands.registerCommand('comprix.clear', showScaffoldMessage),
    vscode.commands.registerCommand('comprix.openDiff', showScaffoldMessage),
    vscode.commands.registerCommand('comprix.openFile', showScaffoldMessage),
  );
}

export function deactivate(): void {}
