const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    port: 9112,
    historyApiFallback: true,
    hot: true,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:8081',
      },
    ],
  },
  optimization: {
    runtimeChunk: false,
    splitChunks: false,
  },
});
