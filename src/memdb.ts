import * as vscode from 'vscode';

export type Sentiment = 'like'|'dislike'|undefined;

export interface DayRollup { activeMinutes: number; activations: number }
export interface ExtUsage {
  totals: { activeMinutes: number; activations: number; daysActive: number };
  byDay: Record<string, DayRollup>;
  signals: { languages: Record<string, number>; debugSessions: number };
  errors: { count: number; recent: { ts: number; msg: string }[] };
}
export interface ExtRecord {
  id: string; version: string; displayName?: string;
  firstSeen: number; lastSeen: number;
  status: 'installed'|'disabled'|'uninstalled';
  sentiment?: Sentiment;
  notes?: string; tags?: string[]; issues?: { id: string; title: string; status: 'open'|'closed' }[];
  usage: ExtUsage;
  _wasActive?: boolean; // transient
}

export class MemDB {
  byId = new Map<string, ExtRecord>();
  hasErrors = new Set<string>();

  ensureRecord(ext: vscode.Extension<any>) {
    let rec = this.byId.get(ext.id);
    const now = Date.now();
    if (!rec) {
      rec = {
        id: ext.id,
        version: (ext.packageJSON as any)?.version ?? '0.0.0',
        displayName: (ext.packageJSON as any)?.displayName,
        firstSeen: now, lastSeen: now,
        status: 'installed',
        usage: { totals: { activeMinutes: 0, activations: 0, daysActive: 0 }, byDay: {}, signals: { languages: {}, debugSessions: 0 }, errors: { count: 0, recent: [] } }
      };
      this.byId.set(ext.id, rec);
    } else {
      rec.version = (ext.packageJSON as any)?.version ?? rec.version;
      rec.lastSeen = now;
    }
    return rec;
  }

  setSentiment(id: string, s: Sentiment) { const r = this.byId.get(id); if (r) r.sentiment = s; }
  setNote(id: string, note: string) { const r = this.byId.get(id); if (r) r.notes = note; }

  addError(id: string, msg: string, maxRecent: number) {
    const r = this.byId.get(id) || { id, version: '0.0.0', firstSeen: Date.now(), lastSeen: Date.now(), status: 'installed', usage: { totals:{activeMinutes:0,activations:0,daysActive:0}, byDay:{}, signals:{languages:{},debugSessions:0}, errors:{count:0,recent:[]} } } as ExtRecord;
    this.byId.set(id, r);
    r.usage.errors.count++;
    r.usage.errors.recent.push({ ts: Date.now(), msg });
    if (r.usage.errors.recent.length > maxRecent) r.usage.errors.recent.splice(0, r.usage.errors.recent.length - maxRecent);
    this.hasErrors.add(id);
  }

  bumpLanguage(id: string) {
    for (const r of this.byId.values()) r.usage.signals.languages[id] = (r.usage.signals.languages[id]||0)+1;
  }
  bumpDebug() { for (const r of this.byId.values()) r.usage.signals.debugSessions++; }

  snapshot() { return { extensions: Array.from(this.byId.values()) }; }
  loadSnapshot(s: any) { if (!s?.extensions) return; this.byId = new Map(s.extensions.map((r: ExtRecord)=>[r.id,r])); }
}
