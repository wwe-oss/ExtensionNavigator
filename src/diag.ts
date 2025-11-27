import * as vscode from 'vscode';

export async function runSelfCheck(ctx: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel('Extensions+ Self-Check', { log: true });
  out.clear();
  out.show(true);
  const section = (title: string) => out.appendLine(`\n=== ${title} ===`);
  const ok = (msg: string) => out.appendLine(`✔ ${msg}`);
  const warn = (msg: string) => out.appendLine(`⚠ ${msg}`);
  const err = (msg: string) => out.appendLine(`✖ ${msg}`);

  section('Environment');
  ok(`VS Code ${vscode.version}`);
  ok(`Platform ${process.platform} ${process.arch}`);

  section('Activation & Commands');
  try {
    const cmds = await vscode.commands.getCommands(true);
    const expected = [
      'extNavigator.openDetails','extNavigator.like','extNavigator.dislike','extNavigator.clearSentiment',
      'extNavigator.setFilter','extNavigator.clearFilter','extNavigator.copyExtensionId','extNavigator.openMarketplace'
    ];
    const missing = expected.filter(c => !cmds.includes(c));
    if (missing.length) { err(`Missing commands: ${missing.join(', ')}`); }
    else ok('All expected commands are registered.');
  } catch (e:any) { err(`commands.getCommands failed: ${e?.message||e}`); }

  section('Views');
  try {
    await vscode.commands.executeCommand('workbench.view.extension.extNavigatorContainer');
    ok('Requested opening view container extNavigatorContainer');
  } catch (e:any) {
    warn(`Opening view container failed (may still be fine): ${e?.message||e}`);
  }

  section('Storage');
  try {
    const key = 'extNavigator.selfcheck.tmp';
    await ctx.globalState.update(key, Date.now());
    const val = ctx.globalState.get<number>(key);
    if (val) ok('globalState read/write works.'); else err('globalState read/write failed.');
  } catch (e:any) { err(`globalState failed: ${e?.message||e}`); }

  section('Webview Capability');
  try {
    const panel = vscode.window.createWebviewPanel('selfcheck', 'Self-Check Webview', vscode.ViewColumn.Two, { enableScripts: true });
    panel.webview.html = '<html><body>ok</body></html>';
    panel.dispose();
    ok('Webview creation works.');
  } catch (e:any) { err(`Webview creation failed: ${e?.message||e}`); }

  section('Final');
  ok('Self-check complete. If inline actions or filter are missing, reload window.');
}
