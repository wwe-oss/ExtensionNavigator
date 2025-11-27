import * as vscode from 'vscode';
import { MemDB } from './memdb';
import { NavigatorTreeProvider } from './tree';

export function startSampler(db: MemDB, tree: NavigatorTreeProvider, samplingMs: number) {
  let disposed = false;

  // Every period, add 1 minute across the board (coarse heuristic)
  const timer = setInterval(() => {
    if (disposed) return;
    db.tickActiveMinute();
    if (typeof (tree as any).refreshThrottled === 'function') {
      (tree as any).refreshThrottled();
    } else {
      tree.refresh();
    }
  }, Math.max(5000, samplingMs));

  // Activation heuristic: when window gains focus, count an activation across the board
  const focusListener = vscode.window.onDidChangeWindowState((e) => {
    if (e.focused) db.bumpActivationAll();
  });

  return () => {
    disposed = true;
    clearInterval(timer);
    focusListener.dispose();
  };
}
