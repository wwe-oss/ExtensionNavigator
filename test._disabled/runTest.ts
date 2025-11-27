import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

function mkd(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const userDir = mkd('vscode-test-user-');
    const extDir = mkd('vscode-test-ext-');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions',
        `--user-data-dir=${userDir}`,
        `--extensions-dir=${extDir}`,
        '--disable-updates',
        '--disable-gpu',
        '--skip-welcome',
        '--skip-release-notes',
        '--no-proxy-server',
        '--disable-telemetry',
        '--disable-keytar',
        '--enable-smoke-test-driver'
      ]
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}
main();
