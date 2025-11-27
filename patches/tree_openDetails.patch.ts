// Merge this patch into your src/tree.ts:
// 1) Add import:
// import { DetailsPanel } from './webview/detailsPanel';
// 2) Replace openDetails() with:
openDetails(extId?: string) {
  const id = extId ?? [...this.db.byId.keys()][0];
  if (!id) { vscode.window.showInformationMessage('No extension selected.'); return; }
  DetailsPanel.show(this.db, this.ctx, id);
}
