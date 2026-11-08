const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relative, riskNotices) {
  const filename = path.resolve(__dirname, relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = name => {
    if (name === '@/lib/map/backend-capabilities') return { supportsRiskNotices: riskNotices };
    if (name.startsWith('@/')) return load(`../src/${name.slice(2)}.ts`, riskNotices);
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`), riskNotices);
    return require(name);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return loaded.exports;
}

const zone = { id: 'a', name: 'Test area', hazard: 'tornado', severity: 'high', preparation: [] };
const customer = { id: 'home', zoneId: 'a', isCustomer: true, checkIn: 'unknown', needs: [], riskLevel: 'High', riskByArea: { a: 'High' } };

for (const riskNotices of [false, true]) {
  test(`step 1 approval is enabled and records recipients with ${riskNotices ? 'risk-tiered' : 'legacy'} notices`, () => {
    const { NotificationDialog } = load('../src/components/map/notification-dialog.tsx', riskNotices);
    const { initialDashboardScenario, dashboardScenarioReducer } = load('../src/lib/map/dashboard-scenario.ts', riskNotices);
    const data = { zones: [zone], households: [customer], teams: [] };
    const state = initialDashboardScenario;
    const props = { data, zone, state, phase: 'before', shared: true, dispatch() {}, onClose() {} };
    const html = renderToStaticMarkup(React.createElement(NotificationDialog, props));
    const button = html.match(/<button[^>]*>Approve &amp; send notifications<\/button>/)?.[0];
    assert.ok(button, 'initial notification approval is present');
    assert.doesNotMatch(button, /disabled/);
    assert.match(html, /1 households will receive/);
    const sent = dashboardScenarioReducer(state, { type: 'send', areaId: 'a', message: 'Please confirm safety' }, data);
    assert.deepEqual(sent.areas.a.before.recipients, ['home']);
    const sentHtml = renderToStaticMarkup(React.createElement(NotificationDialog, { ...props, state: sent }));
    assert.match(sentHtml, /<button[^>]*disabled=""[^>]*>Notification sent ✓<\/button>/);
  });
}

