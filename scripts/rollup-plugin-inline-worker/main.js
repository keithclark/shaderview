import { readFile } from 'node:fs/promises';

/**
 * A quick and dirty Rollup plugin for inlining the web worker. Replaces the
 * `createWorker()` utility method with a new `Worker` instance populated with 
 * the resolved source code.
 * 
 * @param {Object<string,string>} opts - a Key/value pair of worker paths and code source file
 */
export default (opts = {}) => {
  return {
    name: 'inline-worker-source',
    async load(id) {
      const code = (await readFile(id)).toString();
      for (let [name, file] of Object.entries(opts)) {
        let worker = (await readFile(file)).toString();

        // remove the license header as it's included in the importer
        worker = worker.replace(/^\/\*.*?\*\/\s*/, '');

        return code.replace(
          `createWorker('${name}')`,
          `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}])))`
        );
      }
    }
  }
};
