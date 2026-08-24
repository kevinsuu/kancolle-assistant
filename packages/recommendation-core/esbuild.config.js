const packageJson = require('./package.json')
const { build, createConfig } = require('../../build/esbuild/esbuild.config.base')

console.log(`building ${packageJson.name}`)

build(
  createConfig({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
    platform: 'node',
    format: 'cjs',
  }),
)
