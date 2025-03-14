import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import pkg from './package.json' assert { type: 'json'};

const production = !process.env.ROLLUP_WATCH;;
const outputDir = 'dist';

const bundles = [
  {
    input: 'src/ShaderviewElement.js',
    output: {
      file: `${outputDir}/shaderview.js`,
      format: 'esm',
      sourcemap: true
    }
  },
  {
    input: 'src/worker.js',
    output: {
      file: `${outputDir}/shaderview-worker.js`,
      format: 'esm'
    }
  }
];

if (production) {
  bundles.push({
    input: 'src/ShaderviewElement.js',
    output: {
      file: `${outputDir}/shaderview.min.js`,
      format: 'esm'
    },
    plugins: [
      replace({
        values: {
          'shaderview-worker.js': 'shaderview-worker.min.js'
        }
      }),
      terser({
        format: {
          preamble: `/*! ${pkg.name} v${pkg.version} - ${pkg.author} - ${pkg.license} license */`
        }
      })
    ]
  },
  {
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
  });
}

export default bundles;
