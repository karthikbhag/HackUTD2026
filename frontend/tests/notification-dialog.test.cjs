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

for (const shared of [false, true]) test(`${shared ? 'shared' : 'local'} help replies show automatic assignment; only overdue silence shows approval`, () => {
  const { NotificationDialog } = load('../src/components/map/notification-dialog.tsx', true);
  const { initialDashboardScenario, dashboardScenarioReducer } = load('../src/lib/map/dashboard-scenario.ts', true);
  const data = { zones: [zone], households: [customer, { ...customer, id: 'silent' }], teams: [
    { id: 'unit', name: 'Local response unit', zoneId: 'a', status: 'available', capacity: 2, capabilities: ['Welfare check'] },
  ] };
  const reduce = (state, action) => dashboardScenarioReducer(state, action, data);
  const render = state => renderToStaticMarkup(React.createElement(NotificationDialog, {
    data, zone, state, phase: 'after', shared, dispatch() {}, onClose() {},
  }));
  const impact = reduce(initialDashboardScenario, { type: 'impact' });
  const sent = reduce(impact, { type: 'send', areaId: 'a', message: 'Confirm safety' });
  assert.doesNotMatch(render(sent), />Approve response unit<\/button>/);
  const help = reduce(sent, { type: 'reply', areaId: 'a', id: 'home', reply: 'needs_help' });
  assert.match(render(help), /Local response unit automatically assigned/);
  assert.doesNotMatch(render(help), />Approve response unit<\/button>/);
  const overdue = reduce(help, { type: 'deadline' });
  assert.equal((render(overdue).match(/>Approve response unit<\/button>/g) ?? []).length, 1);
  assert.match(render(overdue), /No response · Overdue/);
});

for (const shared of [false, true]) test(`an unmatched ${shared ? 'shared' : 'local'} help request stays visible without a manual approval button`, () => {
  const { NotificationDialog } = load('../src/components/map/notification-dialog.tsx', true);
  const { initialDashboardScenario, dashboardScenarioReducer } = load('../src/lib/map/dashboard-scenario.ts', true);
  const data = { zones: [zone], households: [customer], teams: [] };
  const state = [
    { type: 'impact' }, { type: 'send', areaId: 'a', message: 'Confirm safety' },
    { type: 'reply', areaId: 'a', id: 'home', reply: 'needs_help' }, { type: 'deadline' },
  ].reduce((state, action) => dashboardScenarioReducer(state, action, data), initialDashboardScenario);
  const html = renderToStaticMarkup(React.createElement(NotificationDialog, { data, zone, state, phase: 'after', shared, dispatch() {}, onClose() {} }));
  assert.match(html, /Help requested · No matching available unit/);
  assert.doesNotMatch(html, />Approve response unit<\/button>/);
});

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

