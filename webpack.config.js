const path = require('path')
const webpack = require('webpack')

const sharedOptions = {
  mode: 'production',
  target: 'node',
  node: false, // counterintuitively, this turns off any messing with __dirname, __filename, etc
  optimization: { minimize: false, namedModules: true },
  output: {
    filename: 'index.js',
    libraryTarget: 'commonjs2',
  },
  plugins: [dedupePlugin()],
}

module.exports = [
  {
    ...sharedOptions,
    name: 'cli',
    entry: './cli/index.js',
    output: {
      ...sharedOptions.output,
      path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
      ...sharedOptions.plugins,
      new webpack.BannerPlugin({ banner: '#!/usr/bin/env node', raw: true }),
    ],
  },
  {
    ...sharedOptions,
    name: 'lambda',
    entry: './lambda/index.js',
    output: {
      ...sharedOptions.output,
      path: path.resolve(__dirname, 'lambda', 'dist'),
    },
  },
]

// Dedupes on exact npm versions - webpack doesn't do this by default
function dedupePlugin() {
  const cache = new Map()
  return new webpack.NormalModuleReplacementPlugin(/node_modules/, (resource) => {
    const {
      descriptionFileData: { name, version },
    } = resource.resourceResolveData
    const ix = resource.resource.lastIndexOf(path.join('node_modules', name) + path.sep)
    if (ix < 0) {
      return
    }
    const key = `${name}@${version}:${resource.resource.slice(ix)}`
    const cachedResource = cache.get(key)
    if (cachedResource == null) {
      cache.set(key, resource.resource)
      return
    }
    if (cachedResource !== resource.resource) {
      resource.request = resource.request.replace(resource.resource, cachedResource)
    }
  })
}
