import terser from '@rollup/plugin-terser';
import pkg from './package.json' assert { type: 'json'};

export default [
  {
    input: 'src/ShaderviewElement.js',
    output: {
      file: `dist/shaderview.esm.js`,
      format: 'esm'
    }
  },
  {
    input: 'src/ShaderviewElement.js',
    output: {
      file: `dist/shaderview.esm.min.js`,
      format: 'esm'
    },
    plugins: [terser({
      format: {
        preamble: `/*! ${pkg.name} v${pkg.version} - ${pkg.author} - ${pkg.license} license */`
      }
    })]
  }
];