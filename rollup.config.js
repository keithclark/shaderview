import terser from '@rollup/plugin-terser';
import pkg from './package.json' assert { type: 'json'};

const production = !process.env.ROLLUP_WATCH;;

const bundles = [
  {
    input: 'src/ShaderviewElement.js',
    output: {
      file: `dist/shaderview.js`,
      format: 'esm'
    }
  }
];

if (production) {
  bundles.push({
    input: 'src/ShaderviewElement.js',
    output: {
      file: `dist/shaderview.min.js`,
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
