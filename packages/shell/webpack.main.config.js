const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = {
  entry: {
    index: './index.js',
    'recommendation.worker': './browser/workers/recommendation-worker.js',
  },
  output: {
    filename: '[name].js',
  },
  module: {
    rules: [],
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        require.resolve('electron-chrome-extensions/preload'),
        require.resolve('electron-chrome-web-store/preload'),
      ],
    }),
  ],
  externals: {
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    _http_common: 'commonjs _http_common',
  },
}
