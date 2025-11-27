import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

/**
 * Path-corrected Extension Host log tailer.
 * If env.logUri is unavailable, we derive the logs directory based on OS and appName:
 *  - Windows: %APPDATA%/<ProductFolder>/logs
 *  - macOS:   ~/Library/Application Support/<ProductFolder>/logs
 *  - Linux:   $XDG_CONFIG_HOME/<ProductFolder>/logs  (or ~/.config/<ProductFolder>/logs)
 */
export async function startLogTailer(
  db: { addError: (id: string, msg: string, maxRecent: number) => void },
  _ctx: vscode.ExtensionContext,
  maxRecent: number,
  onUpdate: () => void
): Promise<() => void> {
  try {
    const root = resolveLogsRoot();
    if (!root) {
      console.warn('[ext-navigator] No logs root found.');
      return () => {};
    }

    const logUri = await findExtHostLog(root);
    if (!logUri) {
      console.warn('[ext-navigator] No Extension Host log file found under', root.fsPath);
      return () => {};
    }

    let offset = 0;
    const decoder = new TextDecoder();

    const readChunk = async () => {
      try {
        const stat = await vscode.workspace.fs.stat(logUri);
        if (stat.size < offset) offset = 0; // rotated
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

function resolveLogsRoot(): vscode.Uri | undefined {
  const anyEnv = vscode.env as any;
  if (anyEnv?.logUri && anyEnv.logUri instanceof vscode.Uri) {
    return anyEnv.logUri as vscode.Uri;
  }
  // Fallback: derive path
  const productFolder = getProductFolder();
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Roaming');
      return vscode.Uri.file(path.join(appData, productFolder, 'logs'));
    } else if (platform === 'darwin') {
      return vscode.Uri.file(path.join(os.homedir(), 'Library', 'Application Support', productFolder, 'logs'));
    } else {
      const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      return vscode.Uri.file(path.join(xdg, productFolder, 'logs'));
    }
  } catch {
    return undefined;
  }
}

function getProductFolder(): string {
  const name = vscode.env.appName || 'Visual Studio Code';
  if (/insiders/i.test(name)) return 'Code - Insiders';
  if (/oss/i.test(name)) return 'code-oss';
  if (/vscodium/i.test(name)) return 'VSCodium';
  return 'Code';
}

async function findExtHostLog(root: vscode.Uri): Promise<vscode.Uri | undefined> {
  // Find the newest session folder and then an *exthost* file
  const entries = await safeReadDir(root);
  if (!entries) return undefined;
  const dirs = entries.filter(([_, t]) => t === vscode.FileType.Directory).map(([n, _]) => n).sort();
  const latestName = dirs.pop();
  if (!latestName) return undefined;
  const latest = vscode.Uri.joinPath(root, latestName);

  const files = await safeReadDir(latest) || [];
  const file = files.find(([n, t]) => t === vscode.FileType.File && /exthost/i.test(n));
  if (file) return vscode.Uri.joinPath(latest, file[0]);

  // One level deeper (some builds nest)
  for (const [n, t] of files) {
    if (t !== vscode.FileType.Directory) continue;
    const sub = vscode.Uri.joinPath(latest, n);
    const subFiles = await safeReadDir(sub) || [];
    const hit = subFiles.find(([nn, tt]) => tt === vscode.FileType.File && /exthost/i.test(nn));
    if (hit) return vscode.Uri.joinPath(sub, hit[0]);
  }
  return undefined;
}

async function safeReadDir(uri: vscode.Uri) {
  try { return await vscode.workspace.fs.readDirectory(uri); } catch { return undefined; }
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
