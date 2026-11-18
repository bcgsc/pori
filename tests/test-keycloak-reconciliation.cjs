// Real Bash/jq/curl against a mock Admin API; no Docker or persisted DB needed.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'external_deployment/auth/kc_entrypoint.sh'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

async function fixture(t, options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pori-keycloak-'));
    const ready = path.join(dir, 'ready');
    const realmFile = path.join(dir, 'realm.json');
    const launcher = path.join(dir, 'kc.sh');
    const entrypoint = path.join(dir, 'entrypoint.sh');
    const state = {
        realm: {
            realm: 'PORI', smtpServer: { host: 'old.smtp', password: 'old-password', custom: 'keep' },
            users: [{ id: 'existing-user', username: 'keep-me' }], registrationAllowed: true,
        },
        clients: ['IPR', 'GraphKB'].map(clientId => ({
            id: `${clientId}-uuid`, clientId, enabled: true, secret: 'preserve-client-secret',
            redirectUris: ['https://manual.example/*', 'https://legacy.example/*'],
            attributes: { manual: 'keep' }, protocolMappers: [{ name: 'manual-mapper' }],
        })),
    };
    const initial = clone(state);
    fs.writeFileSync(realmFile, JSON.stringify({ ...state.realm, clients: state.clients }));
    fs.writeFileSync(launcher, `#!${process.execPath}
if (process.argv[2] !== 'start' && process.argv[2] !== 'start-dev') process.exit(0);
require('node:fs').writeFileSync(${JSON.stringify(path.join(dir, 'server.pid'))}, String(process.pid));
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 1000);
`, { mode: 0o755 });
    // Test copies replace only container-specific paths, not application logic.
    fs.writeFileSync(entrypoint, source.replaceAll('/opt/keycloak/bin/kc.sh', launcher)
        .replaceAll('/tmp/pori-realm-ready', ready));
    fs.writeFileSync(path.join(dir, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    const requests = [];
    let tokens = 0;
    const server = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        const url = new URL(req.url, 'http://localhost');
        requests.push({ method: req.method, pathname: url.pathname, body });
        res.setHeader('Content-Type', 'application/json');
        if (url.pathname === '/auth/realms/master/protocol/openid-connect/token') {
            const form = new URLSearchParams(body);
            assert.equal(form.get('username'), 'existing-admin');
            assert.equal(form.get('password'), 'admin & password');
            assert.equal(form.get('client_id'), 'admin-cli');
            assert.equal(form.get('grant_type'), 'password');
            tokens++;
            if (options.badCredentials || (options.retryToken && tokens === 1)) {
                res.writeHead(401).end('{}');
            } else {
                res.end(JSON.stringify({ access_token: 'private-access-token' }));
            }
            return;
        }
        assert.equal(req.headers.authorization, 'Bearer private-access-token');
        if (req.method === 'PUT' && options.failUpdate) {
            res.writeHead(500).end('{}');
            return;
        }
        if (url.pathname === '/auth/admin/realms/PORI') {
            if (req.method === 'GET') return res.end(JSON.stringify(state.realm));
            assert.equal(req.method, 'PUT');
            const payload = JSON.parse(body);
            assert.deepEqual(Object.keys(payload), ['smtpServer']);
            Object.assign(state.realm, payload);
            return res.writeHead(204).end();
        }
        if (url.pathname === '/auth/admin/realms/PORI/clients') {
            assert.equal(req.method, 'GET');
            return res.end(JSON.stringify(options.missingClient ? [] :
                state.clients.filter(client => client.clientId === url.searchParams.get('clientId'))));
        }
        const client = state.clients.find(client =>
            url.pathname === `/auth/admin/realms/PORI/clients/${client.id}`);
        assert.ok(client, `Unexpected request: ${req.method} ${req.url}`);
        assert.equal(req.method, 'PUT');
        const payload = JSON.parse(body);
        assert.deepEqual(Object.keys(payload).sort(), ['attributes', 'redirectUris']);
        Object.assign(client, payload);
        res.writeHead(204).end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let active;
    t.after(async () => {
        if (active && active.exitCode === null && active.signalCode === null) {
            active.kill('SIGTERM');
            await once(active, 'exit');
        }
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    });
    async function run(env = {}, success = true, args = ['start', '--import-realm']) {
        const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
            !/^(SMTP_|PORI_|IPR_CLIENT_URI$|GRAPHKB_CLIENT_URI$|KC_)/.test(key)));
        active = spawn('bash', [entrypoint, ...args], { env: {
            ...cleanEnv, PATH: `${dir}:${process.env.PATH}`, PORI_REALM_FILE: realmFile,
            KC_BOOTSTRAP_ADMIN_USERNAME: 'existing-admin', KC_BOOTSTRAP_ADMIN_PASSWORD: 'admin & password',
            KC_HTTP_PORT: String(server.address().port), KC_HTTP_RELATIVE_PATH: '/auth', ...env,
        } });
        const child = active;
        let output = '';
        child.stdout.on('data', data => { output += data; });
        child.stderr.on('data', data => { output += data; });
        const exited = once(child, 'exit');
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Entrypoint timed out: ${output}`)), 10000);
            const done = () => { clearTimeout(timer); resolve(); };
            child.stdout.on('data', () => {
                if (success && output.includes('Reconciled PORI')) done();
            });
            exited.then(done);
        });
        if (success) {
            assert.ok(fs.existsSync(ready), output);
            child.kill('SIGTERM');
            assert.deepEqual(await exited, [143, null], output);
        } else {
            const [code] = await exited;
            assert.notEqual(code, 0, output);
        }
        assert.equal(fs.existsSync(ready), false, 'readiness marker must be removed on exit');
        const pidFile = path.join(dir, 'server.pid');
        if (fs.existsSync(pidFile)) {
            assert.throws(() => process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 0),
                { code: 'ESRCH' }, 'Keycloak child must not outlive the entrypoint');
        }
        return output;
    }
    return { state, initial, requests, run, realmFile, ready };
}

test('reconciles persisted SMTP/URLs, preserves users, and replaces only managed redirects', async t => {
    const f = await fixture(t);
    const env = {
        SMTP_HOST: 'mail.example', SMTP_PASSWORD: 'secret"\\\n&password', SMTP_PORT: '',
        SMTP_FROM_DISPLAY_NAME: 'PORI "mail"\nteam',
        IPR_CLIENT_URI: 'https://ipr.example/reports/', GRAPHKB_CLIENT_URI: 'https://gkb.example/*',
    };
    const output = await f.run(env);
    assert.ok(!output.includes(env.SMTP_PASSWORD));
    assert.ok(!output.includes('private-access-token'));
    assert.equal(f.state.realm.smtpServer.password, env.SMTP_PASSWORD);
    assert.equal(f.state.realm.smtpServer.fromDisplayName, env.SMTP_FROM_DISPLAY_NAME);
    assert.equal(f.state.realm.smtpServer.port, '587');
    assert.equal(f.state.realm.smtpServer.custom, 'keep');
    assert.deepEqual(f.state.realm.users, f.initial.realm.users);
    assert.equal(f.state.realm.registrationAllowed, true);
    for (const [index, uri] of ['https://ipr.example/reports/*', 'https://gkb.example/*'].entries()) {
        const client = f.state.clients[index];
        assert.deepEqual(client.redirectUris, [...f.initial.clients[index].redirectUris, uri].sort());
        assert.equal(client.attributes.manual, 'keep');
        assert.equal(client.secret, 'preserve-client-secret');
        assert.deepEqual(client.protocolMappers, f.initial.clients[index].protocolMappers);
    }
    // Restart using the already rewritten import file, just like a container restart.
    env.SMTP_PASSWORD = 'rotated-password';
    env.IPR_CLIENT_URI = 'https://new-ipr.example';
    await f.run(env);
    assert.equal(f.state.realm.smtpServer.password, 'rotated-password');
    assert.deepEqual(f.state.clients[0].redirectUris,
        [...f.initial.clients[0].redirectUris, 'https://new-ipr.example/*'].sort());
    const imported = JSON.parse(fs.readFileSync(f.realmFile, 'utf8'));
    assert.equal(imported.smtpServer.password, 'rotated-password');
    assert.ok(imported.clients[0].redirectUris.includes('https://new-ipr.example/*'));
    const second = clone(f.state);
    await f.run(env);
    assert.deepEqual(f.state, second, 'same configuration is idempotent');
});

test('unset configurable fields leave persisted settings unchanged', async t => {
    const f = await fixture(t);
    await f.run();
    assert.deepEqual(f.state, f.initial);
    assert.equal(f.requests.filter(req => req.method === 'PUT').length, 0);
});

test('PORI_HOST fallbacks and transient admin-login retries', async t => {
    const f = await fixture(t, { retryToken: true });
    await f.run({ PORI_HOST: 'pori.example' });
    assert.ok(f.state.clients[0].redirectUris.includes('http://pori.example:3000/*'));
    assert.ok(f.state.clients[1].redirectUris.includes('http://pori.example:5000/*'));
    assert.equal(f.requests.filter(req => req.pathname.includes('/token')).length, 2);
});

test('failed updates stop Keycloak and never publish readiness', async t => {
    const f = await fixture(t, { failUpdate: true });
    fs.writeFileSync(f.ready, 'stale marker');
    await f.run({ SMTP_HOST: 'mail.example' }, false);
    assert.deepEqual(f.state, f.initial);
});

test('invalid persisted admin credentials fail with no writes', async t => {
    const f = await fixture(t, { badCredentials: true });
    const output = await f.run({ SMTP_HOST: 'mail.example' }, false);
    assert.match(output, /check the persisted admin credentials/);
    assert.ok(!output.includes('admin & password'));
    assert.deepEqual(f.state, f.initial);
});

test('missing clients fail rather than creating or replacing realm data', async t => {
    const f = await fixture(t, { missingClient: true });
    await f.run({ IPR_CLIENT_URI: 'https://ipr.example' }, false);
    assert.deepEqual(f.state, f.initial);
});