import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 15000 });
  const testsRoot = path.resolve(__dirname);
  return new Promise((resolve, reject) => {
    glob('**/*.test.js', { cwd: testsRoot }, (err, files) => {
      if (err) { return reject(err); }
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
      try {
        mocha.run(failures => (failures ? reject(new Error(`${failures} tests failed.`)) : resolve()));
      } catch (e) { reject(e); }
    });
  });
}
