import * as vscode from 'vscode';

/**
 * Resilient Extension Host log tailer.
 * - Works with both env.logUri (new) and env.logPath (old string path).
 * - Avoids type errors by feature-detecting logUri.
 * - Best-effort attribution of error lines to extension id tokens like publisher.name.
 */
export async function startLogTailer(
  db: { addError: (id: string, msg: string, maxRecent: number) => void },
  ctx: vscode.ExtensionContext,
  maxRecent: number,
  onUpdate: () => void
): Promise<() => void> {
  try {
    const root = resolveLogsRoot();
    if (!root) {
      console.warn('[ext-navigator] No logs root found (env.logUri/env.logPath unavailable).');
      return () => {};
    }

    const logUri = await findExtHostLog(root);
    if (!logUri) {
      console.warn('[ext-navigator] No Extension Host log file found.');
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

    // Initial read
    await readChunk();
    // Poll every 5s (FS watcher isn't reliable for append-only logs)
    const handle = setInterval(readChunk, 5000);
    return () => clearInterval(handle);
  } catch (e) {
    console.warn('[ext-navigator] startLogTailer error', e);
    return () => {};
  }
}

function resolveLogsRoot(): vscode.Uri | undefined {
  // Newer API: env.logUri (Uri). Older: env.logPath (string).
  const anyEnv = vscode.env as any;
  if (anyEnv && anyEnv.logUri && anyEnv.logUri instanceof vscode.Uri) {
    return anyEnv.logUri as vscode.Uri;
  }
  if ((vscode.env as any).logPath) {
    const p = (vscode.env as any).logPath as string;
    try { return vscode.Uri.file(p); } catch { /* ignore */ }
  }
  return undefined;
}

async function findExtHostLog(root: vscode.Uri): Promise<vscode.Uri | undefined> {
  // The structure is typically <logsRoot>/<sessionId>/exthost1.log (names can vary)
  // 1) Find latest session directory (max by name)
  const entries = await vscode.workspace.fs.readDirectory(root);
  const dirs = entries.filter(([_, t]) => t === vscode.FileType.Directory).map(([n, _]) => n).sort();
  const latestName = dirs.pop();
  if (!latestName) return undefined;
  const latest = vscode.Uri.joinPath(root, latestName);

  // 2) Inside latest, look for a file containing 'exthost' (first match)
  const files = await vscode.workspace.fs.readDirectory(latest);
  const candidate = files.find(([name, t]) => t === vscode.FileType.File && /exthost/i.test(name));
  if (candidate) return vscode.Uri.joinPath(latest, candidate[0]);

  // Some builds nest logs differently; fallback: scan subdirs for exthost files
  for (const [name, type] of files) {
    if (type !== vscode.FileType.Directory) continue;
    const sub = vscode.Uri.joinPath(latest, name);
    const subFiles = await vscode.workspace.fs.readDirectory(sub);
    const hit = subFiles.find(([n, t]) => t === vscode.FileType.File && /exthost/i.test(n));
    if (hit) return vscode.Uri.joinPath(sub, hit[0]);
  }
  return undefined;
}

function parseChunk(chunk: string, db: { addError: (id: string, msg: string, maxRecent: number) => void }, maxRecent: number) {
  const lines = chunk.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    if (!/(ERR|Error|UnhandledPromiseRejection|exception)/i.test(line)) continue;
    // Extract something that looks like publisher.name (extension id)
    const m = line.match(/([a-z0-9][\w.-]*\.[a-z0-9][\w.-]*)/i);
    const extId = m ? m[1].toLowerCase() : 'unknown';
    db.addError(extId, line.slice(0, 500), maxRecent);
  }
}
