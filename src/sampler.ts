import * as vscode from 'vscode';
import { MemDB } from './memdb';
import { NavigatorTreeProvider } from './tree';

export function startSampler(db: MemDB, tree: NavigatorTreeProvider, periodMs: number) {
  const timer = setInterval(() => {
    const now = Date.now();
    const day = new Date().toISOString().slice(0,10);
    for (const ext of vscode.extensions.all) {
      const rec = db.ensureRecord(ext);
      if (ext.isActive) {
        rec.usage.totals.activeMinutes += periodMs/60000;
        if (!rec._wasActive) { rec.usage.totals.activations++; }
        rec._wasActive = true;
        const slot = rec.usage.byDay[day] ?? (rec.usage.byDay[day] = { activeMinutes: 0, activations: 0 });
        slot.activeMinutes += periodMs/60000;
      } else {
        rec._wasActive = false;
      }
      rec.lastSeen = now;
    }
    // recompute daysActive
    for (const r of db.byId.values()) r.usage.totals.daysActive = Object.values(r.usage.byDay).filter(x=>x.activeMinutes>0).length;
    tree.refreshThrottled();
  }, periodMs);
  return () => clearInterval(timer);
}
