const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    port: parseInt(process.env.PORT, 10) || 9112, // [PLUGIN-SPECIFIC] dev port
    historyApiFallback: true,
    hot: true,
    proxy: [
      {
        context: ['/hermes-agent-deployer/api'], // [PLUGIN-SPECIFIC] BFF proxy — must come before the general proxy
        target: 'http://localhost:3000',
        pathRewrite: { '^/hermes-agent-deployer/api': '/api' },
      },
      {
        context: ['/hermes-agent-deployer'], // [PLUGIN-SPECIFIC] must match route prefix
        target: 'http://localhost:8443',
        pathRewrite: { '^/hermes-agent-deployer': '/hermes-agent-deployer' },
      },
    ],
  },
  optimization: {
    runtimeChunk: false,
    splitChunks: false,
  },
});
