import * as vscode from 'vscode';
import { MemDB } from './memdb';
import { startSampler } from './sampler';
import { NavigatorTreeProvider } from './tree';
import { addToWorkspaceRecommendations, removeFromWorkspaceRecommendations } from './recommendations';

let stopSampler: (() => void) | undefined;
const db = new MemDB();

async function pickExtensionId(db: MemDB): Promise<string | undefined> {
  const items = Array.from(db.byId.values()).map(r => ({
    label: r.displayName || r.id,
    description: r.id,
    extId: r.id
  })).sort((a,b)=>a.label.localeCompare(b.label));
  const sel = await vscode.window.showQuickPick(items, { placeHolder: 'Select an extension' });
  return sel?.extId;
}

export async function activate(ctx: vscode.ExtensionContext) {
  const samplingMs = vscode.workspace.getConfiguration('extensionNavigator').get('samplingPeriodMs', 60000);

  const snapshot = ctx.globalState.get<any>('extNavigator.snapshot');
  if (snapshot) db.loadSnapshot(snapshot);
  const persist = () => ctx.globalState.update('extNavigator.snapshot', db.snapshot());

  for (const ext of vscode.extensions.all) db.ensureRecord(ext);

  const tree = new NavigatorTreeProvider(db, ctx);
  vscode.window.registerTreeDataProvider('extNavigator.view', tree);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('extNavigator.openDetails', (extId?: string) => tree.openDetails(extId)),
    vscode.commands.registerCommand('extNavigator.like', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; db.setSentiment(extId, 'like'); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.dislike', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; db.setSentiment(extId, 'dislike'); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.clearSentiment', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; db.setSentiment(extId, undefined); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.uninstallAsLiked', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; db.setSentiment(extId, 'like'); await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extId); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.uninstallAsDisliked', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; db.setSentiment(extId, 'dislike'); await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extId); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.disableAsLiked', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; db.setSentiment(extId, 'like'); await vscode.commands.executeCommand('workbench.extensions.disableExtension', extId); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.disableAsDisliked', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; db.setSentiment(extId, 'dislike'); await vscode.commands.executeCommand('workbench.extensions.disableExtension', extId); tree.refresh(); persist(); }),
    vscode.commands.registerCommand('extNavigator.addToWorkspaceRecommendations', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; await addToWorkspaceRecommendations(extId); tree.refresh(); }),
    vscode.commands.registerCommand('extNavigator.removeFromWorkspaceRecommendations', async (extId?: string) => { extId = extId ?? await pickExtensionId(db); if (!extId) return; await removeFromWorkspaceRecommendations(extId); tree.refresh(); })
  );

  stopSampler = startSampler(db, tree, samplingMs);

  const saveInterval = setInterval(persist, 60000);
  ctx.subscriptions.push(new vscode.Disposable(() => clearInterval(saveInterval)));

  ctx.subscriptions.push(vscode.extensions.onDidChange(() => {
    for (const ext of vscode.extensions.all) db.ensureRecord(ext);
    tree.refresh();
    persist();
  }));

  ctx.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => db.bumpLanguage(doc.languageId)));
  ctx.subscriptions.push(vscode.debug.onDidStartDebugSession(() => db.bumpDebug()));
}

export function deactivate() { if (stopSampler) stopSampler(); }
