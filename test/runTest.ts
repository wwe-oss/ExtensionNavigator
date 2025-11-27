import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

function mkdtemp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Fresh, isolated dirs each run to avoid "Error mutex already exists"
    const userDataDir = mkdtemp('vscode-test-user-');
    const extDir = mkdtemp('vscode-test-ext-');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions',                 // only load this extension
        `--user-data-dir=${userDataDir}`,       // fresh profile
        `--extensions-dir=${extDir}`,           // fresh extensions dir
        '--disable-updates',
        '--disable-gpu',
        '--skip-welcome',
        '--skip-release-notes',
        '--no-proxy-server',
        '--disable-telemetry',
        '--disable-keytar',
        '--enable-smoke-test-driver'            // reduces some startup UI
      ]
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
