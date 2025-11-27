import * as vscode from 'vscode';
import { MemDB, ExtRecord } from './memdb';
import { startSampler } from './sampler';
import { NavigatorTreeProvider } from './tree';
import { addToWorkspaceRecommendations, removeFromWorkspaceRecommendations } from './recommendations';
import { startLogTailer } from './logTailer';

let stopSampler: (() => void) | undefined;
let stopTailer: (() => void) | undefined;
const db = new MemDB();

function toExtId(arg: unknown): string | undefined {
  if (!arg) return undefined;
  if (typeof arg === 'string') return arg;
  const rec = arg as Partial<ExtRecord>;
  if (rec && typeof rec.id === 'string') return rec.id;
  return undefined;
}

async function pickExtensionId(): Promise<string | undefined> {
  const items = Array.from(db.byId.values()).map(r => ({
    label: r.displayName || r.id, description: r.id, extId: r.id
  })).sort((a,b)=>a.label.localeCompare(b.label));
  const sel = await vscode.window.showQuickPick(items, { placeHolder: 'Select an extension' });
  return sel?.extId;
}

export async function activate(ctx: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('extensionNavigator');
  const samplingMs = cfg.get('samplingPeriodMs', 60000);
  const errorParsing = cfg.get<'simple'|'off'>('errorParsing', 'simple');
  const maxRecentErrors = cfg.get<number>('maxRecentErrors', 20);

  const snapshot = ctx.globalState.get<any>('extNavigator.snapshot');
  if (snapshot) db.loadSnapshot(snapshot);
  const persist = () => ctx.globalState.update('extNavigator.snapshot', db.snapshot());

  for (const ext of vscode.extensions.all) db.ensureRecord(ext);

  const tree = new NavigatorTreeProvider(db, ctx);
  vscode.window.registerTreeDataProvider('extNavigator.view', tree);

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

    vscode.commands.registerCommand('extNavigator.uninstallAsLiked', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      db.setSentiment(id, 'like');
      await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', id);
      tree.refresh(); persist();
    }),
    vscode.commands.registerCommand('extNavigator.uninstallAsDisliked', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      db.setSentiment(id, 'dislike');
      await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', id);
      tree.refresh(); persist();
    }),
    vscode.commands.registerCommand('extNavigator.disableAsLiked', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      db.setSentiment(id, 'like');
      await vscode.commands.executeCommand('workbench.extensions.disableExtension', id);
      tree.refresh(); persist();
    }),
    vscode.commands.registerCommand('extNavigator.disableAsDisliked', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      db.setSentiment(id, 'dislike');
      await vscode.commands.executeCommand('workbench.extensions.disableExtension', id);
      tree.refresh(); persist();
    }),

    vscode.commands.registerCommand('extNavigator.addToWorkspaceRecommendations', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      await addToWorkspaceRecommendations(id); tree.refresh();
    }),
    vscode.commands.registerCommand('extNavigator.removeFromWorkspaceRecommendations', async (arg?: any) => {
      const id = toExtId(arg) ?? await pickExtensionId(); if (!id) return;
      await removeFromWorkspaceRecommendations(id); tree.refresh();
    }),

    vscode.commands.registerCommand('extNavigator.discoverLogs', async () => {
      const candidates = await discoverLogCandidates();
      if (!candidates.length) { vscode.window.showWarningMessage('No log candidates found.'); return; }
      const pick = await vscode.window.showQuickPick(candidates.map(c => ({ label: c.label, description: c.path })), { placeHolder: 'Select an Extension Host log file' });
      if (!pick) return;
      await ctx.globalState.update('extNavigator.customLogPath', pick.description);
      vscode.window.showInformationMessage('Using log: ' + pick.description);
      if (stopTailer) stopTailer();
      stopTailer = await startLogTailer(db, ctx, maxRecentErrors, () => { tree.refreshThrottled(); persist(); });
    })
  );

  stopSampler = startSampler(db, tree, samplingMs);
  if (errorParsing === 'simple') {
    stopTailer = await startLogTailer(db, ctx, maxRecentErrors, () => { tree.refreshThrottled(); persist(); });
  }

  const saveInterval = setInterval(persist, 60000);
  ctx.subscriptions.push(new vscode.Disposable(() => clearInterval(saveInterval)));

  ctx.subscriptions.push(vscode.extensions.onDidChange(() => {
    for (const ext of vscode.extensions.all) db.ensureRecord(ext);
    tree.refresh(); persist();
  }));

  ctx.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => db.bumpLanguage(doc.languageId)));
  ctx.subscriptions.push(vscode.debug.onDidStartDebugSession(() => db.bumpDebug()));
}

export function deactivate() { if (stopSampler) stopSampler(); if (stopTailer) stopTailer(); }

async function discoverLogCandidates(): Promise<Array<{ label: string; path: string }>> {
  const out: Array<{ label: string; path: string }> = [];
  const anyEnv = vscode.env as any;
  const roots: vscode.Uri[] = [];
  if (anyEnv?.logUri instanceof vscode.Uri) roots.push(anyEnv.logUri);
  if ((vscode.env as any).logPath) roots.push(vscode.Uri.file((vscode.env as any).logPath as string));

  const product = ((): string => {
    const n = vscode.env.appName || 'Visual Studio Code';
    if (/insiders/i.test(n)) return 'Code - Insiders';
    if (/oss/i.test(n)) return 'code-oss';
    if (/vscodium/i.test(n)) return 'VSCodium';
    return 'Code';
  })();
  const home = require('os').homedir();
  const path = require('path');
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || home, 'AppData', 'Roaming');
    roots.push(vscode.Uri.file(path.join(appData, product, 'logs')));
  } else if (process.platform === 'darwin') {
    roots.push(vscode.Uri.file(path.join(home, 'Library', 'Application Support', product, 'logs')));
  } else {
    const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    roots.push(vscode.Uri.file(path.join(xdg, product, 'logs')));
  }

  const seen = new Set<string>();
  for (const root of roots) {
    try {
      const sessions = await vscode.workspace.fs.readDirectory(root);
      const dirs = sessions.filter(([_, t]) => t === vscode.FileType.Directory).map(([n,_]) => n).sort().reverse().slice(0,3);
      for (const d of dirs) {
        const folder = vscode.Uri.joinPath(root, d);
        const files = await vscode.workspace.fs.readDirectory(folder);
        for (const [name, type] of files) {
          if (type === vscode.FileType.File && /exthost/i.test(name)) {
            const full = vscode.Uri.joinPath(folder, name).fsPath;
            if (!seen.has(full)) {
              seen.add(full);
              out.push({ label: name, path: full }); // <-- fixed
            }
          }
        }
      }
    } catch {}
  }
  return out;
}
