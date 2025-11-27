import * as vscode from 'vscode';
import { MemDB, ExtRecord } from './memdb';
import { DetailsPanel } from './webview/detailsPanel';

export class NavigatorTreeProvider implements vscode.TreeDataProvider<ExtRecord> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  refresh() { this._onDidChangeTreeData.fire(); }
  private refreshTimeout?: NodeJS.Timeout;
  refreshThrottled() { clearTimeout(this.refreshTimeout); this.refreshTimeout = setTimeout(()=>this.refresh(), 500); }

  constructor(public db: MemDB, public ctx: vscode.ExtensionContext) {}

  getTreeItem(el: ExtRecord): vscode.TreeItem {
    const item = new vscode.TreeItem(el.displayName || el.id, vscode.TreeItemCollapsibleState.None);
    const mins = Math.round(el.usage.totals.activeMinutes);
    const senti = el.sentiment === 'like' ? '👍' : el.sentiment === 'dislike' ? '👎' : '';
    item.description = `${mins}m • v${el.version} ${senti}`.trim();
    item.contextValue = 'extension';
    item.command = { command: 'extNavigator.openDetails', title: 'Open Profile', arguments: [el.id] };
    return item;
  }

  async getChildren(): Promise<ExtRecord[]> {
    const dayKeys = [...Array(7)].map((_,i)=>{const d=new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10);});
    const scored = [...this.db.byId.values()].map(r=>({
      r, score: dayKeys.reduce((a,k)=>a+(r.usage.byDay[k]?.activeMinutes||0),0)
    }));
    return scored.sort((a,b)=>b.score-a.score).map(s=>s.r);
  }

  openDetails(extId?: string) {
    const id = extId ?? [...this.db.byId.keys()][0];
    if (!id) { vscode.window.showInformationMessage('No extension selected.'); return; }
    DetailsPanel.show(this.db, this.ctx, id);
  }
}
