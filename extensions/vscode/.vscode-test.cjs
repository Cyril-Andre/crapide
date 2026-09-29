const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  files: 'dist/test/integration/**/*.test.js',
  launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
  mocha: { ui: 'tdd', timeout: 20000 },
});
