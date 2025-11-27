import * as vscode from 'vscode';
import { MemDB, ExtRecord } from './memdb';
import { DetailsPanel } from './webview/detailsPanel';

type GroupNode = { kind: 'group', id: 'errors'|'top'|'recent', label: string };

export class NavigatorTreeProvider implements vscode.TreeDataProvider<ExtRecord | GroupNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  refresh() { this._onDidChangeTreeData.fire(); }
  private refreshTimeout: ReturnType<typeof setTimeout> | undefined;
  refreshThrottled() { if (this.refreshTimeout) clearTimeout(this.refreshTimeout); this.refreshTimeout = setTimeout(()=>this.refresh(), 500); }

  constructor(public db: MemDB, public ctx: vscode.ExtensionContext) {}

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
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = `${mins}m${errs ? ' • errors:'+errs : ''} • v${r.version} ${senti}`.trim();
    item.contextValue = 'extension';
    item.command = { command: 'extNavigator.openDetails', title: 'Open Profile', arguments: [r.id] };
    if (errs) item.tooltip = `${label}\nErrors: ${errs}`;
    return item;
  }

  async getChildren(el?: ExtRecord | GroupNode): Promise<(ExtRecord | GroupNode)[]> {
    const all = [...this.db.byId.values()];

    if (!el) {
      return [
        { kind: 'group', id: 'errors', label: 'Has Errors' },
        { kind: 'group', id: 'top', label: 'Top Used (7d)' },
        { kind: 'group', id: 'recent', label: 'Recently Installed' },
      ];
    }

    if ((el as GroupNode).kind === 'group') {
      const g = el as GroupNode;
      if (g.id === 'errors') {
        return all.filter(r => r.usage.errors.count > 0)
                  .sort((a,b)=>b.usage.errors.count - a.usage.errors.count)
                  .slice(0, 50);
      }
      if (g.id === 'top') {
        const dayKeys = [...Array(7)].map((_,i)=>{const d=new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10);});
        return all.map(r=>({ r, score: dayKeys.reduce((a,k)=>a+(r.usage.byDay[k]?.activeMinutes||0),0) }))
                  .sort((a,b)=>b.score-a.score)
                  .slice(0, 50)
                  .map(s=>s.r);
      }
      if (g.id === 'recent') {
        return all.sort((a,b)=>b.firstSeen - a.firstSeen).slice(0, 50);
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
