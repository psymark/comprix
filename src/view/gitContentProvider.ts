import * as path from 'node:path';
import * as vscode from 'vscode';

import { GitClient } from '../git/gitClient';

interface GitDocumentDescriptor {
  readonly repositoryRoot: string;
  readonly revision: string;
  readonly filePath: string;
}

function decodeDescriptor(uri: vscode.Uri): GitDocumentDescriptor {
  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(uri.query));
  } catch {
    throw new Error('Invalid Comprix Git document URI.');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('repositoryRoot' in value) ||
    !('revision' in value) ||
    !('filePath' in value) ||
    typeof value.repositoryRoot !== 'string' ||
    typeof value.revision !== 'string' ||
    typeof value.filePath !== 'string'
  ) {
    throw new Error('Invalid Comprix Git document descriptor.');
  }
  return value as unknown as GitDocumentDescriptor;
}

export class GitContentProvider
  implements vscode.TextDocumentContentProvider
{
  public static readonly scheme = 'comprix-git';

  public createUri(
    descriptor: GitDocumentDescriptor,
    side: 'before' | 'after',
  ): vscode.Uri {
    const basename = path.basename(descriptor.filePath);
    return vscode.Uri.from({
      scheme: GitContentProvider.scheme,
      authority: side,
      path: `/${basename}`,
      query: encodeURIComponent(JSON.stringify(descriptor)),
    });
  }

  public async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const descriptor = decodeDescriptor(uri);
    const client = new GitClient(descriptor.repositoryRoot);
    return client.readFileAtRevision(
      descriptor.revision,
      descriptor.filePath,
      token,
    );
  }
}
