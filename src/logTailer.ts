import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export async function startLogTailer(
  db: { addError: (id: string, msg: string, maxRecent: number) => void },
  ctx: vscode.ExtensionContext,
  maxRecent: number,
  onUpdate: () => void
): Promise<() => void> {
  try {
    const custom = ctx.globalState.get<string>('extNavigator.customLogPath');
    const logUri = custom ? vscode.Uri.file(custom) : await autoFindExtHostLog();
    if (!logUri) { console.warn('[ext-navigator] No Extension Host log found'); return () => {}; }

    let offset = 0;
    const decoder = new TextDecoder();

    const readChunk = async () => {
      try {
        const stat = await vscode.workspace.fs.stat(logUri);
        if (stat.size < offset) offset = 0;
        if (stat.size === offset) return;
        const bytes = await vscode.workspace.fs.readFile(logUri);
        const text = decoder.decode(bytes);
        const chunk = text.slice(offset);
        offset = text.length;
        parseChunk(chunk, db, maxRecent);
        onUpdate();
      } catch (e) {
        console.warn('[ext-navigator] readChunk error', e);
      }
    };

    await readChunk();
    const handle = setInterval(readChunk, 5000);
    return () => clearInterval(handle);
  } catch (e) {
    console.warn('[ext-navigator] startLogTailer error', e);
    return () => {};
  }
}

async function autoFindExtHostLog(): Promise<vscode.Uri | undefined> {
  const roots: vscode.Uri[] = [];
  const anyEnv = vscode.env as any;
  if (anyEnv?.logUri instanceof vscode.Uri) roots.push(anyEnv.logUri);
  if ((vscode.env as any).logPath) roots.push(vscode.Uri.file((vscode.env as any).logPath as string));

  const product = ((): string => {
    const n = vscode.env.appName || 'Visual Studio Code';
    if (/insiders/i.test(n)) return 'Code - Insiders';
    if (/oss/i.test(n)) return 'code-oss';
    if (/vscodium/i.test(n)) return 'VSCodium';
    return 'Code';
  })();
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || home, 'AppData', 'Roaming');
    roots.push(vscode.Uri.file(path.join(appData, product, 'logs')));
  } else if (process.platform === 'darwin') {
    roots.push(vscode.Uri.file(path.join(home, 'Library', 'Application Support', product, 'logs')));
  } else {
    const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    roots.push(vscode.Uri.file(path.join(xdg, product, 'logs')));
  }

  for (const root of roots) {
    try {
      const sessions = await vscode.workspace.fs.readDirectory(root);
      const dirs = sessions.filter(([_, t]) => t === vscode.FileType.Directory).map(([n,_]) => n).sort().reverse();
      for (const d of dirs.slice(0, 3)) {
        const folder = vscode.Uri.joinPath(root, d);
        const files = await vscode.workspace.fs.readDirectory(folder);
        for (const [name, type] of files) {
          if (type === vscode.FileType.File && /exthost/i.test(name)) {
            return vscode.Uri.joinPath(folder, name);
          }
        }
      }
    } catch {}
  }
  return undefined;
}

function parseChunk(chunk: string, db: { addError: (id: string, msg: string, maxRecent: number) => void }, maxRecent: number) {
  const lines = chunk.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    if (!/(ERR|Error|UnhandledPromiseRejection|exception)/i.test(line)) continue;
    const m = line.match(/([a-z0-9][\w.-]*\.[a-z0-9][\w.-]*)/i);
    const extId = m ? m[1].toLowerCase() : 'unknown';
    db.addError(extId, line.slice(0, 500), maxRecent);
  }
}
