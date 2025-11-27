import * as vscode from 'vscode';

// Simple Extension Host log tailer: best-effort attribution of error lines to extension IDs (publisher.name)
export async function startLogTailer(
  db: any,
  ctx: vscode.ExtensionContext,
  maxRecent: number,
  onUpdate: () => void
): Promise<() => void> {
  try {
    // Logs live under env.logUri/workspace or /user; look for files with 'exthost' in name
    const root = vscode.env.logUri;
    const dirEntries = await vscode.workspace.fs.readDirectory(root);
    // Find subdirectories (each session) and pick the latest
    const sessionDirs = dirEntries.filter(([_, t]) => t === vscode.FileType.Directory).map(([n,_]) => n).sort();
    const latest = sessionDirs.pop();
    if (!latest) return () => {};

    const exthostDir = vscode.Uri.joinPath(root, latest);
    const files = await vscode.workspace.fs.readDirectory(exthostDir);
    const exthostFileEntry = files.find(([name, _]) => name.includes('exthost'));
    if (!exthostFileEntry) return () => {};

    const logUri = vscode.Uri.joinPath(exthostDir, exthostFileEntry[0]);
    let offset = 0;

    const decoder = new TextDecoder();
    const readChunk = async () => {
      const stat = await vscode.workspace.fs.stat(logUri);
      if (stat.size <= offset) return;
      const slice = await vscode.workspace.fs.readFile(logUri);
      const text = decoder.decode(slice);
      const chunk = text.slice(offset);
      offset = text.length;
      parseChunk(chunk);
      onUpdate();
    };

    const parseChunk = (chunk: string) => {
      const lines = chunk.split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        if (!/(ERR|Error|UnhandledPromiseRejection|exception)/i.test(line)) continue;
        // Try to extract an extension id token like publisher.name
        const m = line.match(/([a-z0-9][\w.-]*\.[a-z0-9][\w.-]*)/i);
        const extId = m ? m[1] : 'unknown';
        db.addError(extId, line.slice(0, 500), maxRecent);
      }
    };

    // Initial read
    await readChunk();

    // Poll every 5s (FileSystemWatcher doesn't fire for log append reliably)
    const interval = setInterval(readChunk, 5000);
    return () => clearInterval(interval);
  } catch {
    return () => {};
  }
}
