import * as vscode from 'vscode';
import { MemDB, ExtRecord } from './memdb';
import { startSampler } from './sampler';
import { NavigatorTreeProvider } from './tree';
import { runSelfCheck } from './diag';

let stopSampler: (() => void) | undefined;
const db = new MemDB();
let tree: NavigatorTreeProvider;

function toExtId(arg: unknown): string | undefined {
  if (!arg) return undefined;
  if (typeof arg === 'string') return arg;
  const rec = arg as Partial<ExtRecord>;
  if (rec && typeof rec.id === 'string') return rec.id;
  return undefined;
}

export async function activate(ctx: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('extensionNavigator');
  const samplingMs = cfg.get('samplingPeriodMs', 60000);

  const snapshot = ctx.globalState.get<any>('extNavigator.snapshot');
  if (snapshot) db.loadSnapshot(snapshot);
  const persist = () => ctx.globalState.update('extNavigator.snapshot', db.snapshot());

  for (const ext of vscode.extensions.all) db.ensureRecord(ext);

  tree = new NavigatorTreeProvider(db, ctx);
  vscode.window.registerTreeDataProvider('extNavigator.view', tree);

  const pickExtensionId = async (): Promise<string | undefined> => {
    const items = Array.from(db.byId.values()).map(r => ({
      label: r.displayName || r.id, description: r.id, extId: r.id
    })).sort((a,b)=>a.label.localeCompare(b.label));
    const sel = await vscode.window.showQuickPick(items, { placeHolder: 'Select an extension' });
    return sel?.extId;
  };

  const setFilter = async () => {
    const text = await vscode.window.showInputBox({ prompt: 'Filter by name', placeHolder: 'e.g. python' });
    if (text === undefined) return;
    tree.setFilter(text);
  };
  const clearFilter = () => tree.clearFilter();

  ctx.subscriptions.push(
    vscode.commands.registerCommand('extNavigator.openDetails', (arg?: any) => {
      const id = toExtId(arg) ?? undefined;
      tree.openDetails(id);
    }),

    vscode.commands.registerCommand('extNavigator.like', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      db.setSentiment(id, 'like'); tree.refresh(); persist();
    }),
    vscode.commands.registerCommand('extNavigator.dislike', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      db.setSentiment(id, 'dislike'); tree.refresh(); persist();
    }),
    vscode.commands.registerCommand('extNavigator.clearSentiment', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      db.setSentiment(id, undefined); tree.refresh(); persist();
    }),

    vscode.commands.registerCommand('extNavigator.setFilter', setFilter),
    vscode.commands.registerCommand('extNavigator.clearFilter', clearFilter),

    vscode.commands.registerCommand('extNavigator.copyExtensionId', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      await vscode.env.clipboard.writeText(id);
      vscode.window.showInformationMessage(`Copied: ${id}`);
    }),
    vscode.commands.registerCommand('extNavigator.openMarketplace', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      await vscode.commands.executeCommand('workbench.extensions.search', `ext:${id}`);
    }),

    vscode.commands.registerCommand('extNavigator.selfCheck', async () => runSelfCheck(ctx))
  );

  stopSampler = startSampler(db, tree, samplingMs);

  const saveInterval = setInterval(persist, 60000);
  ctx.subscriptions.push(new vscode.Disposable(() => clearInterval(saveInterval)));

  ctx.subscriptions.push(vscode.extensions.onDidChange(() => {
    for (const ext of vscode.extensions.all) db.ensureRecord(ext);
    tree.refresh(); persist();
  }));
}

export function deactivate() { if (stopSampler) stopSampler(); }
