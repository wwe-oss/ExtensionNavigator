import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 15000 });
  const testsRoot = path.resolve(__dirname);

  const files: string[] = await glob('**/*.test.js', { cwd: testsRoot });
  files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => failures ? reject(new Error(`${failures} tests failed.`)) : resolve());
    } catch (err) {
      reject(err);
    }
  });
}
