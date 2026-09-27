import type * as vscode from 'vscode';
import type { Prompts } from '../commands/prompts';
import type { AiConsent } from '../services/aiConsent';
import type { AiService } from '../services/aiService';
import type { FileStore } from '../services/fileStore';
import type { WorkspaceIndex } from '../services/workspaceIndex';

/**
 * What the AI part of an editor needs from the extension. A module of its own: the panel runs the jobs, and the jobs
 * need these too, without importing the panel.
 */
export interface AiPanelServices {
  ai: AiService;
  consent: AiConsent;
  index: WorkspaceIndex;
  fileStore: FileStore;
  prompts: Prompts;
  log: vscode.LogOutputChannel;
}
