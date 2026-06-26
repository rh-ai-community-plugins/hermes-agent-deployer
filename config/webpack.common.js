const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack');
const path = require('path');
const { 'module-federation': moduleFederation } = require('../package.json');

const remoteEntry = path.posix.join(moduleFederation.remoteEntry);

module.exports = {
  entry: './src/index.ts',
  output: {
    publicPath: 'auto',
    filename: '[name].[contenthash].js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: { noEmit: false },
          },
        },
        include: /src/,
        exclude: /\.test\.(ts|tsx)$/,
      },
      {
        test: /\.css$/,
        use: [
          { loader: 'style-loader' },
          { loader: 'css-loader' },
        ],
        sideEffects: true,
      },
      {
        test: /\.mjs$/,
        include: /node_modules\/@patternfly\/react-styles/,
        sideEffects: true,
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg|woff2?|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx', '.jsx', '.mjs'],
    alias: { '~': path.resolve(__dirname, '../src') },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../src/index.html'),
    }),
    new ModuleFederationPlugin({
      name: 'hermesAgentDeployer',
      filename: remoteEntry,
      exposes: {
        './extensions': './src/rhoai/extensions.ts',
        './Icon': './src/rhoai/HermesNavIcon.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18', eager: true },
        'react-dom': { singleton: true, requiredVersion: '^18', eager: true },
        'react-router-dom': { singleton: true, requiredVersion: '^7', eager: true },
        '@patternfly/react-core': { singleton: true, requiredVersion: '^6', eager: true },
        '@openshift/dynamic-plugin-sdk': { singleton: true, requiredVersion: '^5', eager: true },
      },
    }),
  ],
};
