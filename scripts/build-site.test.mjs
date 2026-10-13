import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSite } from './build-site.mjs';

function fixture(t, manifest = ['index.html']) {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, 'buscarte-build-test-'));
  t.after(() => {
    const resolved = path.resolve(root);
    if (!resolved.startsWith(base + path.sep) ||
        !path.basename(resolved).startsWith('buscarte-build-test-') ||
        fs.lstatSync(resolved).isSymbolicLink()) {
      throw new Error('Refusing to remove an unexpected fixture path.');
    }
    fs.rmSync(resolved, { recursive: true });
  });
  fs.writeFileSync(path.join(root, 'site-files.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(root, 'index.html'), '<html>buscARTE</html>\r\n');
  return root;
}

function withNetlify(value, task) {
  const original = process.env.NETLIFY;
  if (value === undefined) delete process.env.NETLIFY;
  else process.env.NETLIFY = value;
  try { return task(); }
  finally {
    if (original === undefined) delete process.env.NETLIFY;
    else process.env.NETLIFY = original;
  }
}

function cachedConfig(root) {
  fs.mkdirSync(path.join(root, 'dist'));
  const filename = path.join(root, 'dist/netlify.toml');
  const bytes = Buffer.from('# Netlify-generated cached configuration\r\n[build]\r\npublish = "dist"\r\n');
  fs.writeFileSync(filename, bytes);
  return { filename, bytes };
}

test('copies only approved files, preserving bytes and Android asset links', t => {
  const root = fixture(t, ['index.html', '_redirects', '.well-known/assetlinks.json']);
  fs.mkdirSync(path.join(root, '.well-known'));
  fs.writeFileSync(path.join(root, '.well-known/assetlinks.json'), '[]\r\n');
  fs.writeFileSync(path.join(root, '_redirects'), '/ /index.html 200\r\n');
  fs.writeFileSync(path.join(root, 'private-export.csv'), 'must not publish');
  const result = buildSite(root);
  assert.equal(result.files, 3);
  for (const relative of ['index.html', '_redirects', '.well-known/assetlinks.json']) {
    assert.deepEqual(fs.readFileSync(path.join(result.output, relative)), fs.readFileSync(path.join(root, relative)));
  }
  assert.equal(fs.existsSync(path.join(result.output, 'private-export.csv')), false);
  assert.equal(fs.existsSync(path.join(result.output, 'site-files.json')), false);
});

test('can rebuild approved output without deleting files', t => {
  const root = fixture(t);
  buildSite(root);
  fs.writeFileSync(path.join(root, 'index.html'), 'updated');
  buildSite(root);
  assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'updated');
});

test('missing source fails before creating output', t => {
  const root = fixture(t, ['index.html', 'missing.html']);
  assert.throws(() => buildSite(root), /ENOENT/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
});

for (const invalid of ['../private.txt', '/absolute.txt', 'C:/private.txt', 'assets\\file.js', '', 'dist/file.html']) {
  test(`rejects unsafe source path ${JSON.stringify(invalid)}`, t => {
    const root = fixture(t, ['index.html', invalid]);
    assert.throws(() => buildSite(root), /Invalid publication path|dist cannot be a source/);
    assert.equal(fs.existsSync(path.join(root, 'dist')), false);
  });
}

test('rejects case-insensitive duplicate publication paths', t => {
  const root = fixture(t, ['index.html', 'INDEX.html']);
  assert.throws(() => buildSite(root), /Duplicate publication path/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
});

test('unexpected output is preserved and blocks the build', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist/internal.txt'), 'preserve me');
  assert.throws(() => buildSite(root), /Unexpected file in dist/);
  assert.equal(fs.readFileSync(path.join(root, 'dist/internal.txt'), 'utf8'), 'preserve me');
  assert.equal(fs.existsSync(path.join(root, 'dist/index.html')), false);
});

test('source directory junctions/symlinks are rejected', t => {
  const root = fixture(t, ['index.html', 'assets/private.txt']);
  fs.mkdirSync(path.join(root, 'private'));
  fs.writeFileSync(path.join(root, 'private/private.txt'), 'do not publish');
  fs.symlinkSync(path.join(root, 'private'), path.join(root, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => buildSite(root), /Links are not publishable/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
});

test('output directory junctions/symlinks are rejected', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'private'));
  fs.symlinkSync(path.join(root, 'private'), path.join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => buildSite(root), /Links are not publishable/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'private')), []);
});

test('directories cannot be published as files', t => {
  const root = fixture(t, ['index.html', 'assets']);
  fs.mkdirSync(path.join(root, 'assets'));
  assert.throws(() => buildSite(root), /Source is not a regular file/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
});

test('preexisting output hard links cannot overwrite another file', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'private.txt'), 'preserve this');
  fs.linkSync(path.join(root, 'private.txt'), path.join(root, 'dist/index.html'));
  assert.throws(() => buildSite(root), /Unexpected hard link in dist/);
  assert.equal(fs.readFileSync(path.join(root, 'private.txt'), 'utf8'), 'preserve this');
});

test('trusted Netlify CI quarantines only its cached generated config outside publish, preserving bytes', t => {
  const root = fixture(t);
  const { filename, bytes } = cachedConfig(root);
  const sourceConfig = Buffer.from('[build]\ncommand = "node scripts/build-site.mjs"\n');
  fs.writeFileSync(path.join(root, 'netlify.toml'), sourceConfig);
  const result = withNetlify('true', () => buildSite(root));
  assert.equal(result.files, 1);
  assert.equal(fs.existsSync(filename), false);
  assert.ok(result.quarantinedConfig.startsWith(path.join(root, '.netlify/build-quarantine') + path.sep));
  assert.ok(!result.quarantinedConfig.startsWith(result.output + path.sep));
  assert.deepEqual(fs.readFileSync(result.quarantinedConfig), bytes);
  assert.deepEqual(fs.readFileSync(path.join(root, 'netlify.toml')), sourceConfig, 'Source config is never moved or modified');
  assert.deepEqual(fs.readdirSync(result.output), ['index.html']);
  const repeat = withNetlify('true', () => buildSite(root));
  assert.equal(repeat.quarantinedConfig, undefined);
  assert.deepEqual(fs.readFileSync(result.quarantinedConfig), bytes);
});

for (const value of [undefined, 'false', 'TRUE', '1']) {
  test(`local/untrusted NETLIFY=${String(value)} leaves cached config intact and blocks publication`, t => {
    const root = fixture(t);
    const { filename, bytes } = cachedConfig(root);
    assert.throws(() => withNetlify(value, () => buildSite(root)), /Unexpected file in dist: netlify\.toml/);
    assert.deepEqual(fs.readFileSync(filename), bytes);
    assert.equal(fs.existsSync(path.join(root, '.netlify')), false);
    assert.equal(fs.existsSync(path.join(root, 'dist/index.html')), false);
  });
}

test('Netlify CI checks every unknown before touching cached config or approved output', t => {
  const root = fixture(t);
  const { filename, bytes } = cachedConfig(root);
  fs.writeFileSync(path.join(root, 'dist/internal.txt'), 'keep unknown');
  fs.writeFileSync(path.join(root, 'dist/index.html'), 'keep previous approved bytes');
  assert.throws(() => withNetlify('true', () => buildSite(root)), /Unexpected file in dist/);
  assert.deepEqual(fs.readFileSync(filename), bytes);
  assert.equal(fs.readFileSync(path.join(root, 'dist/internal.txt'), 'utf8'), 'keep unknown');
  assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'keep previous approved bytes');
  assert.equal(fs.existsSync(path.join(root, '.netlify')), false);
});

test('Netlify CI does not treat nested or differently-cased config as its exact generated file', t => {
  for (const relative of ['Netlify.toml', 'nested/netlify.toml']) {
    const root = fixture(t);
    fs.mkdirSync(path.dirname(path.join(root, 'dist', relative)), { recursive:true });
    fs.writeFileSync(path.join(root, 'dist', relative), 'keep exact unknown');
    assert.throws(() => withNetlify('true', () => buildSite(root)), /Unexpected file in dist/);
    assert.equal(fs.readFileSync(path.join(root, 'dist', relative), 'utf8'), 'keep exact unknown');
    assert.equal(fs.existsSync(path.join(root, '.netlify')), false);
  }
});

test('Netlify CI rejects a cached config hard link and preserves its other target', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'private.toml'), 'keep private hardlink');
  fs.linkSync(path.join(root, 'private.toml'), path.join(root, 'dist/netlify.toml'));
  assert.throws(() => withNetlify('true', () => buildSite(root)), /Unexpected hard link in dist/);
  assert.equal(fs.readFileSync(path.join(root, 'private.toml'), 'utf8'), 'keep private hardlink');
  assert.equal(fs.readFileSync(path.join(root, 'dist/netlify.toml'), 'utf8'), 'keep private hardlink');
  assert.equal(fs.existsSync(path.join(root, '.netlify')), false);
});

test('Netlify CI rejects a cached config junction/symlink without moving its target', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'dist'));
  fs.mkdirSync(path.join(root, 'private'));
  fs.writeFileSync(path.join(root, 'private/retained.txt'), 'keep link target');
  fs.symlinkSync(path.join(root, 'private'), path.join(root, 'dist/netlify.toml'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => withNetlify('true', () => buildSite(root)), /Unexpected link in dist/);
  assert.equal(fs.readFileSync(path.join(root, 'private/retained.txt'), 'utf8'), 'keep link target');
  assert.equal(fs.lstatSync(path.join(root, 'dist/netlify.toml')).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(root, '.netlify')), false);
});

test('Netlify CI rejects a linked quarantine parent and leaves cached config untouched', t => {
  const root = fixture(t);
  const { filename, bytes } = cachedConfig(root);
  fs.mkdirSync(path.join(root, 'private'));
  fs.symlinkSync(path.join(root, 'private'), path.join(root, '.netlify'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => withNetlify('true', () => buildSite(root)), /Links are not publishable/);
  assert.deepEqual(fs.readFileSync(filename), bytes);
  assert.deepEqual(fs.readdirSync(path.join(root, 'private')), []);
});

test('Netlify CI does not accept an empty directory named netlify.toml as its generated regular file', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'dist/netlify.toml'), { recursive:true });
  assert.throws(() => withNetlify('true', () => buildSite(root)), /Unexpected filesystem entry in dist: netlify\.toml/);
  assert.equal(fs.lstatSync(path.join(root, 'dist/netlify.toml')).isDirectory(), true);
  assert.equal(fs.existsSync(path.join(root, '.netlify')), false);
});
