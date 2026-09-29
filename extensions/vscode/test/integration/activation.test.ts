import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('registers the manual analysis command without running a CLI', async () => {
    const extension = vscode.extensions.getExtension('crapide.crapide-vscode');
    assert.ok(extension, 'CRAP IDE extension is installed in the test host');

    await extension.activate();

    assert.equal(extension.isActive, true);
    assert.ok(
      (await vscode.commands.getCommands(true)).includes(
        'crapide.analyzeWorkspace',
      ),
    );
  });
});
