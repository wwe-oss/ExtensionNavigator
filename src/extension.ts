import * as vscode from 'vscode';
import { MemDB } from './memdb';
import { startSampler } from './sampler';
import { NavigatorTreeProvider } from './tree';
import { addToWorkspaceRecommendations, removeFromWorkspaceRecommendations } from './recommendations';

let stopSampler: (() => void) | undefined;
const db = new MemDB();

export async function activate(ctx: vscode.ExtensionContext) {
  const samplingMs = vscode.workspace.getConfiguration('extensionNavigator').get('samplingPeriodMs', 60000);

  // Load snapshot before anything else
  const snapshot = ctx.globalState.get<any>('extNavigator.snapshot');
  if (snapshot) db.loadSnapshot(snapshot);

  // Helper to persist snapshot
  const persist = () => ctx.globalState.update('extNavigator.snapshot', db.snapshot());

  // Initial inventory snapshot
  for (const ext of vscode.extensions.all) db.ensureRecord(ext);

  // Tree View
  const tree = new NavigatorTreeProvider(db, ctx);
  vscode.window.registerTreeDataProvider('extNavigator.view', tree);

  // Commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand('extNavigator.openDetails', (extId?: string) => tree.openDetails(extId)),
    vscode.commands.registerCommand('extNavigator.like', (extId: string) => { db.setSentiment(extId, 'like'); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.dislike', (extId: string) => { db.setSentiment(extId, 'dislike'); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.clearSentiment', (extId: string) => { db.setSentiment(extId, undefined); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.uninstallAsLiked', async (extId: string) => { db.setSentiment(extId, 'like'); await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extId); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.uninstallAsDisliked', async (extId: string) => { db.setSentiment(extId, 'dislike'); await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extId); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.disableAsLiked', async (extId: string) => { db.setSentiment(extId, 'like'); await vscode.commands.executeCommand('workbench.extensions.disableExtension', extId); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.disableAsDisliked', async (extId: string) => { db.setSentiment(extId, 'dislike'); await vscode.commands.executeCommand('workbench.extensions.disableExtension', extId); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.addToWorkspaceRecommendations', async (extId: string) => { await addToWorkspaceRecommendations(extId); tree.refresh(); }),
    vscode.commands.registerCommand('extNavigator.removeFromWorkspaceRecommendations', async (extId: string) => { await removeFromWorkspaceRecommendations(extId); tree.refresh(); })
  );

  // Sampler @ configured period
  stopSampler = startSampler(db, tree, samplingMs);

  // Persist periodically & on dispose
  const saveInterval = setInterval(persist, 60000);
  ctx.subscriptions.push(new vscode.Disposable(() => clearInterval(saveInterval)));

  // Extension list change (installs/uninstalls/enables/disables)
  ctx.subscriptions.push(vscode.extensions.onDidChange(() => {
    for (const ext of vscode.extensions.all) db.ensureRecord(ext);
    tree.refresh();
    persist();
  }));

  // Workspace events → heuristic signals (simple, global)
  ctx.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => db.bumpLanguage(doc.languageId)));
  ctx.subscriptions.push(vscode.debug.onDidStartDebugSession(() => db.bumpDebug()));
}

export function deactivate() {
  if (stopSampler) stopSampler();
}
