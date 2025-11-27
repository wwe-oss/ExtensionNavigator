import * as assert from 'assert';
import * as vscode from 'vscode';
import { describe, it } from 'mocha';  // use explicit Mocha API (no globals)

describe('Extension Navigator – smoke', () => {
  it('activates the extension', async () => {
    const ext = vscode.extensions.getExtension('wayne.extension-navigator');
    assert.ok(ext, 'Extension id mismatch: check package.json publisher/name');
    await ext!.activate();
    assert.ok(ext!.isActive, 'Extension did not activate');
  });

  it('registers core commands', async () => {
    const cmds = await vscode.commands.getCommands(true);
    for (const c of [
      'extNavigator.openDetails',
      'extNavigator.like',
      'extNavigator.dislike',
      'extNavigator.clearSentiment'
    ]) {
      assert.ok(cmds.includes(c), 'Missing command: ' + c);
    }
  });
});
