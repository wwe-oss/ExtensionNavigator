import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Navigator – smoke', () => {
  test('extension activates', async () => {
    const ext = vscode.extensions.getExtension('wayne.extension-navigator');
    assert.ok(ext, 'Extension not found by id (check package.json publisher/name)');
    await ext!.activate();
    assert.ok(ext!.isActive, 'Extension did not activate');
  });
});
