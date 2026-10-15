import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, readdir, rm, symlink, link, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { auditBackups } from './audit-backups.mjs';

const NOW = '2026-10-15T15:00:00.000Z';
const CAPTURED = '2026-09-15T15:00:00.000Z';
const CONTENT = 'synthetic backup fixture; no production records\n';
const SHA = createHash('sha256').update(CONTENT).digest('hex');

async function fixture(t, { createRoot = true } = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'buscarte-retention-test-'));
  // Test cleanup is restricted to the exact fresh synthetic mkdtemp directory.
  t.after(async () => {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('buscarte-retention-test-'));
    await rm(temporary, { recursive: true, force: true });
  });
  const root = path.join(temporary, 'managed-user-backups');
  if (createRoot) await mkdir(root);
  const config = { schemaVersion: 1, mode: 'audit_only', managedRoot: root, maximumAgeDays: 30 };
  const manifest = { schemaVersion: 1, backups: [] };
  const options = { now: NOW, allowedManagedRoot: root };
  async function add(overrides = {}) {
    const backup = {
      id: 'backup-one', relativePath: 'backup-one.sql', classification: 'user_data_backup',
      capturedAt: CAPTURED, bytes: Buffer.byteLength(CONTENT), sha256: SHA,
      hold: null, needForRecovery: false, requiresRestoreProof: true,
      restoreProof: { verifiedAt: '2026-09-16T15:00:00.000Z', backupSha256: SHA },
      ...overrides
    };
    await writeFile(path.join(root, 'backup-one.sql'), CONTENT);
    manifest.backups.push(backup);
    return backup;
  }
  return { temporary, root, config, manifest, options, add };
}

test('empty registry and missing dedicated root are a zero-action no-op', async t => {
  const f = await fixture(t, { createRoot: false });
  const report = await auditBackups(f.config, f.manifest, { ...f.options, registryInitialized: false });
  assert.equal(report.valid, true);
  assert.equal(report.rootExists, false);
  assert.equal(report.registryInitialized, false);
  assert.equal(report.dueForReview, 0);
  assert.equal(report.actionsPerformed, 0);
  assert.equal(report.rotationActive, false);
  await assert.rejects(lstat(f.root), { code: 'ENOENT' });
});

test('exact 30-day boundary uses registered capture time, not filesystem mtime', async t => {
  const f = await fixture(t);
  await f.add();
  await utimes(path.join(f.root, 'backup-one.sql'), new Date(NOW), new Date(NOW));
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, true);
  assert.equal(report.verified, 1);
  assert.equal(report.dueForReview, 1);
  assert.equal(report.actionsPerformed, 0);
  assert.equal(await readFile(path.join(f.root, 'backup-one.sql'), 'utf8'), CONTENT);
  assert.deepEqual(await readdir(f.root), ['backup-one.sql']);
});

test('one millisecond before expiry is not due', async t => {
  const f = await fixture(t);
  await f.add({ capturedAt: '2026-09-15T15:00:00.001Z' });
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, true);
  assert.equal(report.dueForReview, 0);
});

test('unregistered files are counted as protected and are never read or changed', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'unclassified.txt'), 'unknown synthetic fixture');
  await writeFile(path.join(f.root, 'buscarte-upload.keystore'), 'fake key fixture');
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.protectedUnknown, 2);
  assert.equal(report.verified, 0);
  assert.equal(report.dueForReview, 0);
  assert.equal(report.actionsPerformed, 0);
  assert.equal(await readFile(path.join(f.root, 'buscarte-upload.keystore'), 'utf8'), 'fake key fixture');
});

test('aggregate output omits private paths, identifiers, hashes and fixture content', async t => {
  const f = await fixture(t);
  await f.add();
  const report = await auditBackups(f.config, f.manifest, f.options);
  const output = JSON.stringify(report);
  for (const privateText of [f.root, 'backup-one.sql', 'backup-one', SHA, CONTENT]) assert.equal(output.includes(privateText), false);
  assert.equal('details' in report, false);
});

test('private details require explicit opt-in and still omit backup contents', async t => {
  const f = await fixture(t);
  await f.add();
  const report = await auditBackups(f.config, f.manifest, { ...f.options, privateDetails: true });
  assert.equal(report.details[0].relativePath, 'backup-one.sql');
  assert.equal(report.details[0].expiresAt, NOW);
  assert.equal(report.details[0].status, 'review_due');
  assert.equal(JSON.stringify(report).includes(CONTENT), false);
});

for (const [label, changes, expected] of [
  ['needed for recovery', { needForRecovery: true }, 'NEEDED_FOR_RECOVERY'],
  ['missing restore proof', { restoreProof: null }, 'RESTORE_PROOF_REQUIRED'],
  ['active legal hold', { hold: { reasonCode: 'legal', reviewBy: '2026-10-16T00:00:00.000Z' } }, 'HOLD']
]) {
  test(`${label} protects an expired registered copy`, async t => {
    const f = await fixture(t);
    await f.add(changes);
    const report = await auditBackups(f.config, f.manifest, { ...f.options, privateDetails: true });
    assert.equal(report.valid, true);
    assert.equal(report.dueForReview, 0);
    assert.equal(report.protectedRegistered, 1);
    assert.ok(report.details[0].protections.includes(expected));
  });
}

for (const [label, changes, code] of [
  ['future capture', { capturedAt: '2026-10-16T00:00:00.000Z' }, 'FUTURE_CAPTURE'],
  ['ambiguous date', { capturedAt: '2026-09-15' }, 'INVALID_CAPTURE_DATE'],
  ['overdue hold', { hold: { reasonCode: 'security', reviewBy: NOW } }, 'HOLD_REVIEW_OVERDUE'],
  ['unknown hold type', { hold: { reasonCode: 'forever', reviewBy: '2027-01-01T00:00:00.000Z' } }, 'INVALID_HOLD'],
  ['wrong classification', { classification: 'source_code' }, 'INVALID_CLASSIFICATION'],
  ['unknown classification list', { classification: ['user_data_backup', 'source_code'] }, 'INVALID_CLASSIFICATION'],
  ['missing size', { bytes: undefined }, 'INVALID_FINGERPRINT'],
  ['wrong size', { bytes: 1 }, 'SIZE_MISMATCH'],
  ['wrong hash', { sha256: '0'.repeat(64), restoreProof: null }, 'HASH_MISMATCH'],
  ['proof for another copy', { restoreProof: { verifiedAt: '2026-09-16T00:00:00.000Z', backupSha256: '0'.repeat(64) } }, 'INVALID_RESTORE_PROOF'],
  ['future proof', { restoreProof: { verifiedAt: '2026-10-16T00:00:00.000Z', backupSha256: SHA } }, 'INVALID_RESTORE_PROOF'],
  ['proof preceding capture', { restoreProof: { verifiedAt: '2026-09-14T00:00:00.000Z', backupSha256: SHA } }, 'INVALID_RESTORE_PROOF'],
  ['implicit recovery flag', { needForRecovery: undefined }, 'INVALID_RECOVERY_FLAGS']
]) {
  test(`${label} fails closed without candidates or path disclosure`, async t => {
    const f = await fixture(t);
    await f.add(changes);
    const report = await auditBackups(f.config, f.manifest, { ...f.options, privateDetails: true });
    assert.equal(report.valid, false);
    assert.deepEqual(report.issues, [code]);
    assert.equal(report.dueForReview, 0);
    assert.equal(report.actionsPerformed, 0);
    assert.deepEqual(report.details, []);
    assert.equal(JSON.stringify(report).includes(f.root), false);
  });
}

for (const unsafePath of ['../data.sql', '/data.sql', 'C:/data.sql', 'C:\\data.sql', '//server/share/data.sql', 'a/../../data.sql', './data.sql', 'a//data.sql', 'data.sql:stream', 'data.sql.', 'NUL.sql', 'a/CON/data.sql']) {
  test(`unsafe path rejected: ${unsafePath}`, async t => {
    const f = await fixture(t);
    await f.add({ relativePath: unsafePath });
    const report = await auditBackups(f.config, f.manifest, f.options);
    assert.equal(report.valid, false);
    assert.equal(report.dueForReview, 0);
    assert.deepEqual(report.issues, ['UNSAFE_PATH']);
  });
}

for (const protectedPath of ['buscarte-upload.keystore', 'upload.jks', 'secret.key', 'cert.pem', 'cert.p12', 'cert.pfx', '.env', '.env.local', 'credentials/data.sql', 'signing/data.sql', '.git/data.sql']) {
  test(`protected recovery/config path rejected: ${protectedPath}`, async t => {
    const f = await fixture(t);
    await f.add({ relativePath: protectedPath });
    const report = await auditBackups(f.config, f.manifest, f.options);
    assert.equal(report.valid, false);
    assert.equal(report.dueForReview, 0);
    assert.deepEqual(report.issues, ['PROTECTED_PATH']);
  });
}

test('duplicate registrations and case variants fail closed', async t => {
  const f = await fixture(t);
  const original = await f.add();
  f.manifest.backups.push({ ...original, id: 'backup-two', relativePath: 'BACKUP-ONE.sql' });
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.issues, ['DUPLICATE_BACKUP']);
});

test('overlapping directory/file registrations fail closed', async t => {
  const f = await fixture(t);
  const original = await f.add();
  f.manifest.backups.push({ ...original, id: 'backup-two', relativePath: 'backup-one.sql/nested.sql' });
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.issues, ['OVERLAPPING_PATHS']);
});

test('broad root and any non-audit mode are rejected', async t => {
  const f = await fixture(t);
  let report = await auditBackups({ ...f.config, managedRoot: f.temporary }, f.manifest, f.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.issues, ['UNSAFE_ROOT']);
  report = await auditBackups({ ...f.config, mode: 'delete' }, f.manifest, f.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.issues, ['INVALID_CONFIG']);
});

test('one failed file invalidates even earlier successful candidates', async t => {
  const f = await fixture(t);
  const original = await f.add();
  f.manifest.backups.push({ ...original, id: 'backup-two', relativePath: 'missing.sql' });
  const report = await auditBackups(f.config, f.manifest, { ...f.options, privateDetails: true });
  assert.equal(report.valid, false);
  assert.equal(report.verified, 1);
  assert.equal(report.dueForReview, 0);
  assert.deepEqual(report.details, []);
});

test('hard-linked registered file is protected', async t => {
  const f = await fixture(t);
  await f.add();
  await link(path.join(f.root, 'backup-one.sql'), path.join(f.temporary, 'outside.sql'));
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.issues, ['NOT_SINGLE_REGULAR_FILE']);
});

test('directory junction in a registered ancestor is never followed', async t => {
  const f = await fixture(t);
  const outside = path.join(f.temporary, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'data.sql'), CONTENT);
  await symlink(outside, path.join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const backup = await f.add({ relativePath: 'linked/data.sql' });
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, false);
  assert.equal(report.dueForReview, 0);
  assert.deepEqual(report.issues, ['LINK_OR_REPARSE_PATH']);
  assert.equal(await readFile(path.join(outside, 'data.sql'), 'utf8'), CONTENT);
  assert.equal(backup.sha256, SHA);
});

test('managed root that is a junction is rejected', async t => {
  const f = await fixture(t, { createRoot: false });
  const outside = path.join(f.temporary, 'outside');
  await mkdir(outside);
  await symlink(outside, f.root, process.platform === 'win32' ? 'junction' : 'dir');
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.issues, ['LINK_OR_REPARSE_PATH']);
});

test('unregistered junction is counted and protected, not traversed', async t => {
  const f = await fixture(t);
  const outside = path.join(f.temporary, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'not-inventory.sql'), CONTENT);
  await symlink(outside, path.join(f.root, 'unknown-link'), process.platform === 'win32' ? 'junction' : 'dir');
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, true);
  assert.equal(report.protectedLinks, 1);
  assert.equal(report.protectedUnknown, 0);
  assert.equal(report.verified, 0);
});

test('unexpected manifest fields fail closed rather than silently changing scope', async t => {
  const f = await fixture(t);
  f.manifest.purge = true;
  const report = await auditBackups(f.config, f.manifest, f.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.issues, ['INVALID_MANIFEST']);
});
