const { composePlugins, withNx } = require('@nrwl/webpack');
const { withReact } = require('@nrwl/react');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), withReact(), (config) => {
  // Update the webpack config as needed here.
  // e.g. `config.plugins.push(new MyPlugin())`
  config.entry['renew'] = ['./src/renew.ts'];

  config.plugins.push(
    new HtmlWebpackPlugin({
      template: './src/renew.html',
      chunks: ['renew'],
      filename: 'renew.html',
    })
  );

  return config;
});
