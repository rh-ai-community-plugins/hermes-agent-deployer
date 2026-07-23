const { merge } = require('webpack-merge');
const { execSync } = require('child_process');
const common = require('./webpack.common.js');

function getOcToken() {
  try {
    return execSync('oc whoami -t', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function getK8sApiBase() {
  try {
    return execSync('oc whoami --show-server', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

const ocToken = getOcToken();
const k8sApiBase = getK8sApiBase();

if (!ocToken) {
  console.warn('\n⚠  No oc token found — run `oc login` first for full functionality\n');
}

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-source-map',
  output: {
    publicPath: '/',
  },
  devServer: {
    port: parseInt(process.env.PORT, 10) || 9112, // [PLUGIN-SPECIFIC] dev port
    historyApiFallback: false,
    hot: true,
    proxy: [
      {
        context: ['/hermes-agent-deployer/api'], // [PLUGIN-SPECIFIC] BFF proxy
        target: 'http://localhost:3000',
        pathRewrite: { '^/hermes-agent-deployer/api': '/api' },
        onProxyReq: (proxyReq) => {
          if (ocToken) proxyReq.setHeader('Authorization', `Bearer ${ocToken}`);
        },
      },
      {
        context: ['/api/k8s'], // K8s API proxy (replaces dashboard proxy in dev)
        target: k8sApiBase,
        pathRewrite: { '^/api/k8s': '' },
        secure: false,
        onProxyReq: (proxyReq) => {
          if (ocToken) proxyReq.setHeader('Authorization', `Bearer ${ocToken}`);
        },
      },
    ],
    setupMiddlewares(middlewares) {
      middlewares.unshift({
        name: 'spa-rewrite',
        middleware: (req, _res, next) => {
          if (req.url.startsWith('/hermes-agent-deployer') && !req.url.startsWith('/hermes-agent-deployer/api')) {
            req.url = '/index.html';
          }
          next();
        },
      });
      return middlewares;
    },
  },
  optimization: {
    runtimeChunk: false,
    splitChunks: false,
  },
});
