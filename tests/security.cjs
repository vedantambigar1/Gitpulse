const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

// Execute the actual TypeScript routes without starting a server or calling external services.
const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitpulse-test-'));
process.env.DATA_DIR = dataDir;
process.env.APP_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.NODE_ENV = 'test';
const modules = new Map();
function load(name) {
  const file = path.resolve(root, name);
  if (modules.has(file)) return modules.get(file).exports;
  const mod = { exports: {} };
  modules.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => {
    if (id.startsWith('@/') || id.startsWith('.')) {
      const resolved = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id);
      return load(resolved + (path.extname(resolved) ? '' : '.ts'));
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports);
  return mod.exports;
}
after(() => {
  clearTimeout(globalThis.__gpTimer);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
const store = load('lib/store.ts');
const licensing = load('lib/license.ts');
const license = store.createLicense({ email: 'buyer@example.com', plan: 'lifetime', sessionId: 'cs_test_security' });
const token = licensing.managementKey(license.key);
const request = (body, credential) => new Request('http://localhost/api/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
  body: JSON.stringify(body),
});

test('public embed keys cannot authorize account management; signed private keys can', () => {
  assert.equal(licensing.authLicense(request({}, license.key)), undefined);
  assert.equal(licensing.authLicense(request({}, token)), license);
  assert.equal(licensing.authLicense(request({}, token.slice(0, -1) + (token.endsWith('0') ? '1' : '0'))), undefined);
  store.updateLicense(license.key, { status: 'canceled' });
  assert.equal(licensing.authLicense(request({}, token)), undefined);
  store.updateLicense(license.key, { status: 'active' });
});

test('invalid widget paths cannot consume username slots', () => {
  for (const username of ['bad/name', '__proto__', '', 'a--b']) {
    assert.equal(licensing.verifyKey(license.key, username).valid, false);
  }
  assert.deepEqual(license.usernames, []);
  assert.equal(licensing.verifyKey(license.key, 'Octocat').valid, true);
  assert.deepEqual(license.usernames, ['octocat']);
});

test('analytics records legitimate usernames matching Object prototype properties', () => {
  for (const user of ['constructor', 'toString', 'hasOwnProperty']) {
    store.recordView(user, 'visitor', 'constructor');
    store.recordView(user, 'visitor', '__proto__');
    const stats = store.getStats(user, 7);
    assert.equal(stats.totals.views, 2);
    assert.equal(stats.totals.uniques, 1);
    assert.deepEqual(stats.referrers.map(r => r.views), [1, 1]);
  }
  assert.equal(Object.prototype.views, undefined);
});

test('APIs reject JSON null and arrays with 400 instead of throwing', async () => {
  for (const route of ['checkout', 'domains', 'domains/verify', 'license/recover', 'license/verify', 'track']) {
    const { POST } = load(`app/api/${route}/route.ts`);
    for (const body of [null, []]) {
      assert.equal((await POST(request(body, token))).status, 400, route);
    }
  }
});

test('checkout rejects inherited object properties as plans', async () => {
  const { POST } = load('app/api/checkout/route.ts');
  for (const plan of ['constructor', '__proto__', 'toString', {}, 1]) {
    assert.equal((await POST(request({ plan }))).status, 400);
  }
});

test('session recovery returns separate keys and prohibits caching credentials', async () => {
  const { GET } = load('app/api/license/session/route.ts');
  const response = await GET(new Request('http://localhost/api/license/session?session_id=cs_test_security'));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const json = await response.json();
  assert.equal(json.key, license.key);
  assert.equal(json.managementKey, token);
});

test('rate-limit storage stays bounded without resetting active clients', () => {
  const { rateLimit } = load('lib/ratelimit.ts');
  globalThis.__gpRate.clear();
  assert.equal(rateLimit('existing', 1), true);
  for (let i = 0; i < 6000; i++) rateLimit(`flood:${i}`, 1);
  assert.equal(globalThis.__gpRate.size, 5000);
  assert.equal(rateLimit('existing', 1), false);
  assert.equal(rateLimit('extra', 1), false);
  globalThis.__gpRate.clear();
});

test('DNS verification rechecks ownership after awaiting the lookup', async () => {
  const domains = load('lib/domains.ts');
  const other = store.createLicense({ email: 'other@example.com', plan: 'lifetime' });
  const host = 'activity.example.com';
  store.updateLicense(license.key, { domains: [{ host, username: 'octocat', query: '', verified: false }] });
  const previous = domains.hasVerifyRecord;
  domains.hasVerifyRecord = async () => {
    store.updateLicense(other.key, { domains: [{ host, username: 'other', query: '', verified: true }] });
    return true;
  };
  try {
    const { POST } = load('app/api/domains/verify/route.ts');
    assert.equal((await POST(request({ host }, token))).status, 409);
    assert.equal(license.domains[0].verified, false);
  } finally {
    domains.hasVerifyRecord = previous;
  }
});

test('Stripe fulfillment requires an explicit supported plan and matching checkout mode', () => {
  const { checkoutPlan, sessionIsPaid } = load('lib/stripe.ts');
  assert.equal(checkoutPlan({ metadata: null, mode: 'payment' }), undefined);
  assert.equal(checkoutPlan({ metadata: { plan: 'other-product' }, mode: 'payment' }), undefined);
  assert.equal(checkoutPlan({ metadata: { plan: 'lifetime' }, mode: 'subscription' }), undefined);
  assert.equal(checkoutPlan({ metadata: { plan: 'monthly' }, mode: 'payment' }), undefined);
  assert.equal(checkoutPlan({ metadata: { plan: 'monthly' }, mode: 'subscription' }), 'monthly');
  assert.equal(checkoutPlan({ metadata: { plan: 'lifetime' }, mode: 'payment' }), 'lifetime');
  assert.equal(sessionIsPaid({ payment_status: 'unpaid' }), false);
  assert.equal(sessionIsPaid({ payment_status: 'paid' }), true);
});
