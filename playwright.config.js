module.exports = {
  testDir: '.',
  testMatch: 'test-debug.spec.js',
  use: {
    headless: true,
  },
  webServer: {
    command: 'python3 -m http.server 9113 --directory dist',
    port: 9113,
    reuseExistingServer: true,
  },
};
