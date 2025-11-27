import * as vscode from 'vscode';
import { MemDB } from '../memdb';

export class DetailsPanel {
  static panels = new Map<string, vscode.WebviewPanel>();

  static show(db: MemDB, ctx: vscode.ExtensionContext, extId: string) {
    const existing = DetailsPanel.panels.get(extId);
    if (existing) { existing.reveal(); DetailsPanel.postState(existing, db, extId); return; }

    const panel = vscode.window.createWebviewPanel(
      'extNavigator.details',
      `Extension Profile — ${extId}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    DetailsPanel.panels.set(extId, panel);

    panel.onDidDispose(() => DetailsPanel.panels.delete(extId));

    panel.webview.html = DetailsPanel.html(ctx, panel);

    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'saveNote') {
        db.setNote(extId, msg.note || '');
        vscode.window.showInformationMessage('Note saved.');
        DetailsPanel.postState(panel, db, extId);
      }
    });

    DetailsPanel.postState(panel, db, extId);
  }

  private static postState(panel: vscode.WebviewPanel, db: MemDB, extId: string) {
    const rec = db.byId.get(extId);
    if (!rec) return;

    const dayRows = Object.entries(rec.usage.byDay).sort((a,b)=>a[0].localeCompare(b[0])).map(([day, v])=>({ day, ...(v as any) }));
    // top 5 languages
    const langs = Object.entries(rec.usage.signals.languages || {}).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,count])=>({id,count}));
    panel.webview.postMessage({
      type: 'state',
      data: {
        id: rec.id,
        displayName: rec.displayName || rec.id,
        version: rec.version,
        sentiment: rec.sentiment || null,
        totals: rec.usage.totals,
        byDay: dayRows,
        note: rec.notes || '',
        errors: rec.usage.errors,
        signals: { languages: langs, debugSessions: rec.usage.signals.debugSessions || 0 }
      }
    });
  }

  private static html(ctx: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
    const nonce = String(Date.now());
    const csp = [
      `default-src 'none'`,
      `img-src ${panel.webview.cspSource} https:`,
      `style-src 'unsafe-inline' ${panel.webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Extension Profile</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; }
    h1 { font-size: 1.1rem; margin: 0 0 8px; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; min-width: 260px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
    th { background: #f5f5f5; text-align: left; }
    textarea { width: 100%; min-height: 100px; }
    button { padding: 6px 10px; }
    .muted { color: #666; }
    .errors { max-height: 200px; overflow:auto; background:#faf5f5; border:1px solid #f0d0d0; padding:8px; }
    .errline { font-family: ui-monospace, Menlo, Consolas, monospace; font-size:12px; white-space: pre-wrap; border-bottom: 1px dashed #eee; padding:4px 0; }
    .kv { display:flex; gap:8px; flex-wrap:wrap; }
    .pill { border:1px solid #ddd; border-radius:999px; padding:2px 8px; font-size:12px; }
  </style>
</head>
<body>
  <h1 id="title"></h1>
  <div class="row">
    <div class="card">
      <div><strong>Version</strong>: <span id="version"></span></div>
      <div><strong>Sentiment</strong>: <span id="sentiment"></span></div>
      <div><strong>Total Active Minutes</strong>: <span id="mins"></span></div>
      <div><strong>Activations</strong>: <span id="acts"></span></div>
      <div><strong>Days Active</strong>: <span id="days"></span></div>
      <div><strong>Errors (count)</strong>: <span id="errcount"></span></div>
    </div>
    <div class="card" style="flex:1;">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>Notes</strong>
        <button id="save">Save</button>
      </div>
      <textarea id="note" placeholder="Why I like/dislike this, conflicts, extra requirements, links..."></textarea>
      <div class="muted">Notes are stored locally in your profile and can be exported as JSON.</div>
    </div>
  </div>

  <div class="row" style="margin-top:12px;">
    <div class="card" style="flex:1;min-width:320px;">
      <strong>Signals</strong>
      <div class="kv" id="langs"></div>
      <div class="muted">Debug sessions: <span id="dbg">0</span></div>
    </div>
  </div>

  <div class="card" style="margin-top:12px;">
    <strong>Daily Usage</strong>
    <table>
      <thead><tr><th>Date</th><th>Active Minutes</th><th>Activations</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>

  <div class="card" style="margin-top:12px;">
    <strong>Recent Errors</strong>
    <div id="errors" class="errors"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'state') {
        const d = msg.data;
        $('title').textContent = d.displayName + ' — ' + d.id;
        $('version').textContent = d.version;
        $('sentiment').textContent = d.sentiment ?? '—';
        $('mins').textContent = Math.round(d.totals.activeMinutes);
        $('acts').textContent = d.totals.activations;
        $('days').textContent = d.totals.daysActive;
        $('errcount').textContent = d.errors.count;
        $('note').value = d.note || '';

        const lwrap = $('langs'); lwrap.innerHTML = '';
        for (const l of d.signals.languages || []) {
          const span = document.createElement('span');
          span.className = 'pill';
          span.textContent = `${l.id} • ${l.count}`;
          lwrap.appendChild(span);
        }
        $('dbg').textContent = d.signals.debugSessions || 0;

        const tbody = $('tbody');
        tbody.innerHTML = '';
        for (const row of d.byDay) {
          const tr = document.createElement('tr');
          tr.innerHTML = '<td>'+row.day+'</td><td>'+Math.round(row.activeMinutes)+'</td><td>'+row.activations+'</td>';
          tbody.appendChild(tr);
        }

        const container = $('errors');
        container.innerHTML = '';
        for (const e of d.errors.recent || []) {
          const div = document.createElement('div');
          const t = new Date(e.ts).toLocaleTimeString();
          div.className = 'errline';
          div.textContent = '['+t+'] '+e.msg;
          container.appendChild(div);
        }
      }
    });

    $('save').addEventListener('click', () => {
      vscode.postMessage({ type: 'saveNote', note: $('note').value });
    });
  </script>
</body>
</html>`;
  }
}
