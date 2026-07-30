import * as vscode from 'vscode';

import type { ChangeAnalysis, ComparisonSnapshot } from '../core/model';
import {
  analysisInstructions,
  buildAnalysisPrompt,
} from './prompt';
import type { AnalysisProvider } from './provider';
import {
  AnalysisValidationError,
  parseAnalysisJson,
} from './schema';

export class ModelUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export interface LanguageModelPreferences {
  readonly vendor?: string;
  readonly family?: string;
}

export class VsCodeLanguageModelProvider implements AnalysisProvider {
  public readonly id = 'vscode-language-model';

  public constructor(
    private readonly preferences: LanguageModelPreferences,
  ) {}

  public async analyze(
    comparison: ComparisonSnapshot,
    cancellation?: vscode.CancellationToken,
  ): Promise<ChangeAnalysis> {
    const selector: vscode.LanguageModelChatSelector = {};
    if (this.preferences.vendor !== undefined) {
      selector.vendor = this.preferences.vendor;
    }
    if (this.preferences.family !== undefined) {
      selector.family = this.preferences.family;
    }

    let models = await vscode.lm.selectChatModels(selector);
    if (
      models.length === 0 &&
      this.preferences.family !== undefined
    ) {
      delete selector.family;
      models = await vscode.lm.selectChatModels(selector);
    }
    if (models.length === 0) {
      throw new ModelUnavailableError(
        'No compatible VS Code language model is available. Install or enable a model provider such as GitHub Copilot Chat, sign in if required, then run the comparison again.',
      );
    }

    const model = models[0];
    if (model === undefined) {
      throw new ModelUnavailableError(
        'No compatible VS Code language model is available.',
      );
    }

    const prompt = buildAnalysisPrompt(comparison);
    const estimatedTokens =
      (await model.countTokens(analysisInstructions, cancellation)) +
      (await model.countTokens(prompt, cancellation));
    if (estimatedTokens > model.maxInputTokens) {
      throw new ModelUnavailableError(
        `The comparison needs approximately ${estimatedTokens.toString()} input tokens, but ${model.name} accepts ${model.maxInputTokens.toString()}. Lower Comprix's diff-character or file limit and try again.`,
      );
    }

    const messages = [
      vscode.LanguageModelChatMessage.User(analysisInstructions),
      vscode.LanguageModelChatMessage.User(prompt),
    ];
    const responseText = await this.request(
      model,
      messages,
      cancellation,
    );
    const allowedPaths = new Set(
      comparison.files.map((file) => file.path),
    );

    try {
      return parseAnalysisJson(responseText, allowedPaths);
    } catch (error) {
      if (!(error instanceof AnalysisValidationError)) {
        throw error;
      }

      const repairMessages = [
        ...messages,
        vscode.LanguageModelChatMessage.Assistant(
          responseText.slice(0, 20_000),
        ),
        vscode.LanguageModelChatMessage.User(
          `The response failed validation:\n- ${error.issues.join('\n- ')}\nReturn a corrected bare JSON object only. Preserve only claims supported by the supplied comparison.`,
        ),
      ];
      const repaired = await this.request(
        model,
        repairMessages,
        cancellation,
      );
      return parseAnalysisJson(repaired, allowedPaths);
    }
  }

  private async request(
    model: vscode.LanguageModelChat,
    messages: vscode.LanguageModelChatMessage[],
    cancellation?: vscode.CancellationToken,
  ): Promise<string> {
    const response = await model.sendRequest(
      messages,
      {
        justification:
          'Comprix uses the selected model to turn a user-requested Git comparison into structured functional outcomes.',
      },
      cancellation,
    );
    let responseText = '';
    for await (const fragment of response.text) {
      responseText += fragment;
    }
    return responseText.trim();
  }
}
