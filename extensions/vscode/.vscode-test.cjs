const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  files: 'dist/test/integration/**/*.test.js',
  version: process.env.CRAPIDE_VSCODE_VERSION || '1.139.1',
  launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
  mocha: { ui: 'tdd', timeout: 20000 },
});
