const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (configuration) => {
  configuration.entry['renew'] = ['./renew.ts'];

  configuration.plugins.push(
    new HtmlWebpackPlugin({
      template: './renew.html',
      chunks: ['renew'],
      filename: 'renew.html',
    })
  );

  return configuration;
};
