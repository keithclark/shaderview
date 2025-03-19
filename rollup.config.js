import terser from '@rollup/plugin-terser';
import pkg from './package.json' assert { type: 'json'};
import inlineWorker from './scripts/rollup-plugin-inline-worker/main.js';

const production = !process.env.ROLLUP_WATCH;;
const outputDir = 'dist';

const bundles = [{
  input: 'src/worker.js',
    output: {
      file: `${outputDir}/shaderview-worker.js`,
      format: 'esm'
    }
  },
  {
    input: 'src/ShaderviewElement.js',
    output: {
      file: `${outputDir}/shaderview.js`,
      format: 'esm',
      sourcemap: true
    }
  }
];

if (production) {
  bundles.push({
    input: 'src/worker.js',
    output: {
      file: `${outputDir}/shaderview-worker.min.js`,
      format: 'esm'
    },
    plugins: [
      terser({
        format: {
          preamble: `/*! ${pkg.name} v${pkg.version} - ${pkg.author} - ${pkg.license} license */`
        }
      })
    ]
  },
  {
    input: 'src/ShaderviewElement.js',
    output: {
      file: `${outputDir}/shaderview.min.js`,
      format: 'esm',
    },
    plugins: [
      inlineWorker({
        'shaderview-worker.js': `${outputDir}/shaderview-worker.min.js`
      }),
      terser({
        format: {
          preamble: `/*! ${pkg.name} v${pkg.version} - ${pkg.author} - ${pkg.license} license */`
        }
      })
    ]
  });
}

export default bundles;
