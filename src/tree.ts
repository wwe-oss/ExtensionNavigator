import * as vscode from 'vscode';
import { MemDB, ExtRecord } from './memdb';
import { DetailsPanel } from './webview/detailsPanel';

function isBuiltin(id: string): boolean { return /^vscode\./i.test(id); }

type GroupNode = { kind: 'group', id: 'errors'|'top'|'recent', label: string };

export class NavigatorTreeProvider implements vscode.TreeDataProvider<ExtRecord | GroupNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  refresh() { this._onDidChangeTreeData.fire(); }
  private refreshTimeout: ReturnType<typeof setTimeout> | undefined;
  refreshThrottled() { if (this.refreshTimeout) clearTimeout(this.refreshTimeout); this.refreshTimeout = setTimeout(()=>this.refresh(), 300); }

  private filterText: string = '';

  constructor(public db: MemDB, public ctx: vscode.ExtensionContext) {}

  setFilter(text: string) {
    this.filterText = (text || '').trim();
    vscode.commands.executeCommand('setContext', 'extnav.filterActive', !!this.filterText);
    this.refresh();
  }
  clearFilter() { this.setFilter(''); }

  getTreeItem(el: ExtRecord | GroupNode): vscode.TreeItem {
    if ((el as GroupNode).kind === 'group') {
      const g = el as GroupNode;
      const item = new vscode.TreeItem(g.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'group';
      return item;
    }
    const r = el as ExtRecord;
    const mins = Math.round(r.usage.totals.activeMinutes);
    const errs = r.usage.errors.count;
    const senti = r.sentiment === 'like' ? '👍' : r.sentiment === 'dislike' ? '👎' : '';
    const label = r.displayName || r.id;
    const tagStr = r.tags && r.tags.length ? ` [${r.tags.slice(0,3).join(', ')}${r.tags.length>3?'…':''}]` : '';
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = `${mins}m${errs ? ' • errors:'+errs : ''} • v${r.version || '?'} ${senti}${tagStr}`.trim();
    item.contextValue = isBuiltin(r.id) ? 'ext-builtIn' : 'ext-item';
    item.command = { command: 'extNavigator.openDetails', title: 'Open Profile', arguments: [r.id] };
    if (errs) item.tooltip = `${label}\nErrors: ${errs}`;
    return item;
  }

  async getChildren(el?: ExtRecord | GroupNode): Promise<(ExtRecord | GroupNode)[]> {
    const all = [...this.db.byId.values()];

    const filter = this.filterText.toLowerCase();
    const matches = (r: ExtRecord) => {
      if (!filter) return true;
      if (r.id.toLowerCase().includes(filter)) return true;
      if ((r.displayName || '').toLowerCase().includes(filter)) return true;
      if (r.tags && r.tags.some(t => t.toLowerCase().includes(filter))) return true;
      return false;
    };

    if (!el) {
      return [
        { kind: 'group', id: 'errors', label: this.filterText ? `Has Errors — filtered: "${this.filterText}"` : 'Has Errors' },
        { kind: 'group', id: 'top', label: this.filterText ? `Top Used (7d) — filtered: "${this.filterText}"` : 'Top Used (7d)' },
        { kind: 'group', id: 'recent', label: this.filterText ? `Recently Installed — filtered: "${this.filterText}"` : 'Recently Installed' }
      ];
    }

    if ((el as GroupNode).kind === 'group') {
      const g = el as GroupNode;
      const arr = all.filter(matches);
      if (g.id === 'errors') {
        return arr.filter(r => r.usage.errors.count > 0)
                  .sort((a,b)=>b.usage.errors.count - a.usage.errors.count)
                  .slice(0, 100);
      }
      if (g.id === 'top') {
        const dayKeys = [...Array(7)].map((_,i)=>{const d=new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10);});
        return arr.map(r=>({ r, score: dayKeys.reduce((a,k)=>a+(r.usage.byDay[k]?.activeMinutes||0),0) }))
                  .sort((a,b)=>b.score-a.score)
                  .slice(0, 100)
                  .map(s=>s.r);
      }
      if (g.id === 'recent') {
        return arr.sort((a,b)=>b.firstSeen - a.firstSeen).slice(0, 100);
      }
    }

    return [];
  }

  openDetails(extId?: string) {
    const id = extId ?? [...this.db.byId.keys()][0];
    if (!id) { vscode.window.showInformationMessage('No extension selected.'); return; }
    DetailsPanel.show(this.db, this.ctx, id);
  }
}
