import * as vscode from 'vscode';

export type Sentiment = 'like' | 'dislike' | undefined;

export interface ExtRecord {
  id: string;
  displayName?: string;
  version?: string;
  repoUrl?: string | null;
  notes?: string;
  sentiment?: Sentiment;
  tags: string[];
  firstSeen: number;
  usage: {
    totals: { activeMinutes: number; activations: number; daysActive: number };
    byDay: Record<string, { activeMinutes: number; activations: number }>;
    errors: { count: number; recent: Array<{ ts: number; msg: string }> };
    signals: { languages: Record<string, number>; debugSessions: number };
  };
}

export class MemDB {
  byId = new Map<string, ExtRecord>();

  ensureRecord(ext: vscode.Extension<any>) {
    const id = ext.id;
    let rec = this.byId.get(id);
    const now = Date.now();
    if (!rec) {
      rec = {
        id,
        displayName: ext.packageJSON?.displayName || ext.packageJSON?.name || id,
        version: ext.packageJSON?.version,
        repoUrl: (ext.packageJSON?.repository && (typeof ext.packageJSON.repository === 'string' ? ext.packageJSON.repository : ext.packageJSON.repository.url)) || null,
        tags: [],
        firstSeen: now,
        usage: {
          totals: { activeMinutes: 0, activations: 0, daysActive: 0 },
          byDay: {},
          errors: { count: 0, recent: [] },
          signals: { languages: {}, debugSessions: 0 }
        }
      };
      this.byId.set(id, rec);
    } else {
      rec.displayName = ext.packageJSON?.displayName || ext.packageJSON?.name || rec.displayName;
      rec.version = ext.packageJSON?.version || rec.version;
      rec.repoUrl = (ext.packageJSON?.repository && (typeof ext.packageJSON.repository === 'string' ? ext.packageJSON.repository : ext.packageJSON.repository.url)) || rec.repoUrl || null;
    }
    return rec;
  }

  setSentiment(id: string, s: Sentiment) {
    const r = this.byId.get(id); if (!r) return;
    r.sentiment = s;
  }

  setNote(id: string, note: string) {
    const r = this.byId.get(id); if (!r) return;
    r.notes = note;
  }

  addTag(id: string, tag: string) {
    tag = tag.trim();
    if (!tag) return;
    const r = this.byId.get(id); if (!r) return;
    if (!r.tags.includes(tag)) r.tags.push(tag);
  }

  removeTag(id: string, tag: string) {
    const r = this.byId.get(id); if (!r) return;
    r.tags = r.tags.filter(t => t.toLowerCase() != tag.toLowerCase());
  }

  bumpLanguage(langId: string) {
    if (!langId) return;
    for (const r of this.byId.values()) {
      r.usage.signals.languages[langId] = (r.usage.signals.languages[langId] || 0) + 1;
    }
  }

  bumpDebug() {
    for (const r of this.byId.values()) r.usage.signals.debugSessions++;
  }

  bumpActivationAll() {
    const key = new Date().toISOString().slice(0,10);
    for (const r of this.byId.values()) {
      const day = r.usage.byDay[key] || (r.usage.byDay[key] = { activeMinutes: 0, activations: 0 });
      day.activations += 1;
      r.usage.totals.activations += 1;
    }
  }

  tickActiveMinute() {
    const key = new Date().toISOString().slice(0,10);
    for (const r of this.byId.values()) {
      const day = r.usage.byDay[key] || (r.usage.byDay[key] = { activeMinutes: 0, activations: 0 });
      day.activeMinutes += 1;
      r.usage.totals.activeMinutes += 1;
    }
    // recompute daysActive = number of days with any activity
    for (const r of this.byId.values()) {
      const days = Object.values(r.usage.byDay).filter(d => d.activeMinutes > 0 || d.activations > 0).length;
      r.usage.totals.daysActive = days;
    }
  }

  addError(id: string, msg: string, maxRecent: number) {
    const r = this.byId.get(id); if (!r) return;
    r.usage.errors.count++;
    r.usage.errors.recent.unshift({ ts: Date.now(), msg });
    if (r.usage.errors.recent.length > maxRecent) r.usage.errors.recent.length = maxRecent;
  }

  snapshot() {
    return { version: 1, at: Date.now(), items: [...this.byId.values()] };
  }

  loadSnapshot(obj: any) {
    if (!obj || !Array.isArray(obj.items)) return;
    this.byId.clear();
    for (const it of obj.items) {
      const rec: ExtRecord = {
        id: it.id,
        displayName: it.displayName,
        version: it.version,
        repoUrl: it.repoUrl ?? null,
        notes: it.notes,
        sentiment: it.sentiment,
        tags: Array.isArray(it.tags) ? it.tags.slice(0,50) : [],
        firstSeen: it.firstSeen || Date.now(),
        usage: {
          totals: it.usage?.totals || { activeMinutes: 0, activations: 0, daysActive: 0 },
          byDay: it.usage?.byDay || {},
          errors: it.usage?.errors || { count: 0, recent: [] },
          signals: it.usage?.signals || { languages: {}, debugSessions: 0 }
        }
      };
      // normalize daysActive on load
      const days = Object.values(rec.usage.byDay).filter(d => d.activeMinutes > 0 || d.activations > 0).length;
      rec.usage.totals.daysActive = days;
      this.byId.set(rec.id, rec);
    }
  }
}
