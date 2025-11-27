import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Navigator – smoke', () => {
  test('extension activates', async () => {
    const ext = vscode.extensions.getExtension('wayne.extension-navigator');
    assert.ok(ext, 'Extension not found by id (check package.json publisher/name)');
    await ext!.activate();
    assert.ok(ext!.isActive, 'Extension did not activate');
  });

  test('commands exist', async () => {
    const cmds = await vscode.commands.getCommands(true);
    for (const c of ['extNavigator.openDetails','extNavigator.like','extNavigator.dislike','extNavigator.clearSentiment']) {
      if (!cmds.includes(c)) {
        throw new Error('Missing command: ' + c);
      }
    }
  });
});
