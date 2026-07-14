const { version } = require('../package.json');
const fs = require('fs');

const chartPath = 'chart/Chart.yaml';
let chart = fs.readFileSync(chartPath, 'utf8');
chart = chart.replace(/^version:.*/m, `version: ${version}`);
chart = chart.replace(/^appVersion:.*/m, `appVersion: "${version}"`);
fs.writeFileSync(chartPath, chart);

const bffPkgPath = 'bff/package.json';
const bffPkg = JSON.parse(fs.readFileSync(bffPkgPath, 'utf8'));
bffPkg.version = version;
fs.writeFileSync(bffPkgPath, JSON.stringify(bffPkg, null, 2) + '\n');

const pluginPath = 'plugin.yaml';
let plugin = fs.readFileSync(pluginPath, 'utf8');
plugin = plugin.replace(/^version:.*/m, `version: ${version}`);
plugin = plugin.replace(/^(\s+tag:)\s.*/gm, `$1 "${version}"`);
fs.writeFileSync(pluginPath, plugin);
