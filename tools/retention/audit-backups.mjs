// Local audit only: no deletion, moves, backup execution, network or scheduling.
// A candidate is a review finding, never permission to delete a recovery copy.
import { constants } from 'node:fs';
import { lstat, realpath, readdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MANAGED_ROOT = 'C:\\Users\\Usuario\\Documents\\ChatGPT\\BuscARTE-resguardos\\managed-user-backups';
const DAY_MS = 86_400_000;
const MAX_FILES = 5000;
const MAX_DEPTH = 16;
const PROTECTED = /(?:\.(?:keystore|jks|key|pem|p12|pfx)$|^\.env(?:\.|$)|credential|signing|service[-_]account)/i;
const HOLD_CODES = new Set(['legal', 'security', 'recovery', 'classification_pending']);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function exactKeys(value, keys, code) {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), code);
  requireCondition(Object.keys(value).sort().join('|') === [...keys].sort().join('|'), code);
}

function timestamp(value, code) {
  const parsed = typeof value === 'string' ? new Date(value) : new Date(NaN);
  requireCondition(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, code);
  return parsed.getTime();
}

function relativeName(value) {
  requireCondition(typeof value === 'string' && value.length > 0 && value.length <= 512, 'UNSAFE_PATH');
  requireCondition(!path.isAbsolute(value) && !path.win32.isAbsolute(value), 'UNSAFE_PATH');
  requireCondition(!/[\\\x00-\x1f:<>"|?*]/.test(value), 'UNSAFE_PATH');
  const parts = value.split('/');
  requireCondition(parts.every(part => part && part !== '.' && part !== '..' &&
    !/[. ]$/.test(part) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)), 'UNSAFE_PATH');
  requireCondition(parts.every(part => !PROTECTED.test(part) && !['.git', 'node_modules'].includes(part)), 'PROTECTED_PATH');
  return value;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validate(config, manifest, now, allowedManagedRoot) {
  exactKeys(config, ['schemaVersion', 'mode', 'managedRoot', 'maximumAgeDays'], 'INVALID_CONFIG');
  requireCondition(config.schemaVersion === 1 && config.mode === 'audit_only' && config.maximumAgeDays === 30, 'INVALID_CONFIG');
  requireCondition(path.isAbsolute(config.managedRoot) &&
    path.resolve(config.managedRoot) === path.resolve(allowedManagedRoot) &&
    path.basename(config.managedRoot) === 'managed-user-backups', 'UNSAFE_ROOT');
  exactKeys(manifest, ['schemaVersion', 'backups'], 'INVALID_MANIFEST');
  requireCondition(manifest.schemaVersion === 1 && Array.isArray(manifest.backups) && manifest.backups.length <= MAX_FILES, 'INVALID_MANIFEST');
  const names = new Set();
  const ids = new Set();
  for (const backup of manifest.backups) {
    exactKeys(backup, ['id', 'relativePath', 'classification', 'capturedAt', 'bytes', 'sha256', 'hold', 'needForRecovery', 'requiresRestoreProof', 'restoreProof'], 'INVALID_BACKUP');
    requireCondition(typeof backup.id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(backup.id), 'INVALID_ID');
    relativeName(backup.relativePath);
    const nameKey = backup.relativePath.toLowerCase();
    requireCondition(!names.has(nameKey) && !ids.has(backup.id), 'DUPLICATE_BACKUP');
    for (const existing of names) {
      requireCondition(!nameKey.startsWith(`${existing}/`) && !existing.startsWith(`${nameKey}/`), 'OVERLAPPING_PATHS');
    }
    names.add(nameKey);
    ids.add(backup.id);
    requireCondition(backup.classification === 'user_data_backup', 'INVALID_CLASSIFICATION');
    requireCondition(timestamp(backup.capturedAt, 'INVALID_CAPTURE_DATE') <= now, 'FUTURE_CAPTURE');
    requireCondition(Number.isSafeInteger(backup.bytes) && backup.bytes >= 0 && /^[0-9a-f]{64}$/.test(backup.sha256), 'INVALID_FINGERPRINT');
    requireCondition(typeof backup.needForRecovery === 'boolean' && typeof backup.requiresRestoreProof === 'boolean', 'INVALID_RECOVERY_FLAGS');
    if (backup.hold !== null) {
      exactKeys(backup.hold, ['reasonCode', 'reviewBy'], 'INVALID_HOLD');
      requireCondition(HOLD_CODES.has(backup.hold.reasonCode), 'INVALID_HOLD');
      requireCondition(timestamp(backup.hold.reviewBy, 'INVALID_HOLD') > now, 'HOLD_REVIEW_OVERDUE');
    }
    if (backup.restoreProof !== null) {
      exactKeys(backup.restoreProof, ['verifiedAt', 'backupSha256'], 'INVALID_RESTORE_PROOF');
      const verified = timestamp(backup.restoreProof.verifiedAt, 'INVALID_RESTORE_PROOF');
      requireCondition(verified >= timestamp(backup.capturedAt, 'INVALID_CAPTURE_DATE') && verified <= now &&
        backup.restoreProof.backupSha256 === backup.sha256, 'INVALID_RESTORE_PROOF');
    }
  }
  return path.resolve(config.managedRoot);
}

async function checkedPath(absolutePath, { allowMissingRoot = false } = {}) {
  // Inspect every ancestor, including the managed root. Never follow junctions
  // or symlinks into the original workspace, Android, or another backup tree.
  const absolute = path.resolve(absolutePath);
  let cursor = path.parse(absolute).root;
  const parts = absolute.slice(cursor.length).split(path.sep).filter(Boolean);
  for (const part of parts) {
    cursor = path.join(cursor, part);
    let stat;
    try { stat = await lstat(cursor); }
    catch (error) {
      if (allowMissingRoot && error.code === 'ENOENT' && cursor === absolute) return null;
      throw new Error('MISSING_OR_UNREADABLE_PATH');
    }
    requireCondition(!stat.isSymbolicLink(), 'LINK_OR_REPARSE_PATH');
    requireCondition(path.resolve(await realpath(cursor)).toLowerCase() === cursor.toLowerCase(), 'LINK_OR_REPARSE_PATH');
  }
  return lstat(absolute);
}

async function metadataInventory(root, ignoredPath) {
  const files = new Set();
  const stack = [{ directory: root, depth: 0 }];
  let protectedLinks = 0;
  while (stack.length) {
    const { directory, depth } = stack.pop();
    requireCondition(depth <= MAX_DEPTH, 'INVENTORY_LIMIT');
    await checkedPath(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      requireCondition(inside(root, target), 'UNSAFE_PATH');
      if (target === ignoredPath) continue;
      if (entry.isSymbolicLink()) { protectedLinks += 1; continue; }
      if (entry.isDirectory()) stack.push({ directory: target, depth: depth + 1 });
      else files.add(path.relative(root, target).split(path.sep).join('/').toLowerCase());
      requireCondition(files.size + stack.length + protectedLinks <= MAX_FILES, 'INVENTORY_LIMIT');
    }
  }
  return { files, protectedLinks };
}

async function verifyFile(root, backup) {
  const absolute = path.resolve(root, ...backup.relativePath.split('/'));
  requireCondition(inside(root, absolute), 'UNSAFE_PATH');
  const before = await checkedPath(absolute);
  requireCondition(before.isFile() && before.nlink === 1, 'NOT_SINGLE_REGULAR_FILE');
  requireCondition(before.size === backup.bytes, 'SIZE_MISMATCH');
  const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    requireCondition(opened.isFile() && opened.nlink === 1 && opened.dev === before.dev && opened.ino === before.ino, 'FILE_CHANGED');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    const current = await checkedPath(absolute);
    requireCondition(after.dev === before.dev && after.ino === before.ino && after.size === before.size &&
      after.mtimeMs === before.mtimeMs && current.dev === after.dev && current.ino === after.ino, 'FILE_CHANGED');
    requireCondition(hash.digest('hex') === backup.sha256, 'HASH_MISMATCH');
  } finally { await handle.close(); }
}

export async function auditBackups(config, manifest, options = {}) {
  const now = options.now === undefined ? Date.now() : timestamp(options.now, 'INVALID_AUDIT_TIME');
  const report = {
    schemaVersion: 1, mode: 'audit_only', rotationActive: false,
    auditedAt: new Date(now).toISOString(), registryInitialized: options.registryInitialized ?? true,
    scope: 'Explicit registered files only; historical mixed backups are not managed.',
    valid: true, registered: 0, verified: 0, dueForReview: 0,
    protectedRegistered: 0, protectedUnknown: 0, protectedLinks: 0,
    rootExists: false, issues: [], actionsPerformed: 0
  };
  let details = [];
  try {
    const root = validate(config, manifest, now, options.allowedManagedRoot ?? MANAGED_ROOT);
    report.registered = manifest.backups.length;
    const rootStat = await checkedPath(root, { allowMissingRoot: true });
    if (!rootStat) {
      requireCondition(report.registered === 0, 'MANAGED_ROOT_MISSING');
      if (options.privateDetails === true) report.details = [];
      return report;
    }
    requireCondition(rootStat.isDirectory(), 'UNSAFE_ROOT');
    report.rootExists = true;
    const inventory = await metadataInventory(root, options.manifestPath ? path.resolve(options.manifestPath) : undefined);
    const registeredNames = new Set(manifest.backups.map(item => item.relativePath.toLowerCase()));
    report.protectedUnknown = [...inventory.files].filter(name => !registeredNames.has(name)).length;
    report.protectedLinks = inventory.protectedLinks;
    for (const backup of manifest.backups) {
      await verifyFile(root, backup);
      report.verified += 1;
      const expiresAt = new Date(timestamp(backup.capturedAt, 'INVALID_CAPTURE_DATE') + config.maximumAgeDays * DAY_MS).toISOString();
      const protections = [];
      if (backup.hold) protections.push('HOLD');
      if (backup.needForRecovery) protections.push('NEEDED_FOR_RECOVERY');
      if (backup.requiresRestoreProof && backup.restoreProof === null) protections.push('RESTORE_PROOF_REQUIRED');
      const due = timestamp(expiresAt, 'INVALID_EXPIRY') <= now;
      if (protections.length) report.protectedRegistered += 1;
      else if (due) report.dueForReview += 1;
      details.push({ id: backup.id, relativePath: backup.relativePath, expiresAt, status: protections.length ? 'protected' : due ? 'review_due' : 'within_window', protections });
    }
  } catch (error) {
    // One invalid registration invalidates the whole candidate list. Error
    // codes only: file paths, email addresses and backup contents never leak.
    report.valid = false;
    report.issues = [/^[A-Z_]+$/.test(error.message) ? error.message : 'AUDIT_FAILED'];
    report.dueForReview = 0;
    report.protectedRegistered = report.registered;
    details = [];
  }
  if (options.privateDetails === true) report.details = details;
  return report;
}

async function runCli() {
  const args = process.argv.slice(2);
  let configPath = path.join(HERE, 'config.json');
  let manifestPath;
  let privateDetails = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--private-details') privateDetails = true;
    else if (['--config', '--manifest'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (args[i] === '--config') configPath = args[++i];
      else manifestPath = args[++i];
    } else throw new Error('INVALID_ARGUMENTS');
  }
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  let manifest = { schemaVersion: 1, backups: [] };
  if (manifestPath) {
    // Validate configuration before touching the private manifest. It must be
    // inside the exact dedicated root, never the original mixed resguardos.
    const root = validate(config, manifest, Date.now(), MANAGED_ROOT);
    const absoluteManifest = path.resolve(manifestPath);
    requireCondition(inside(root, absoluteManifest), 'MANIFEST_OUTSIDE_MANAGED_ROOT');
    relativeName(path.relative(root, absoluteManifest).split(path.sep).join('/'));
    const manifestStat = await checkedPath(absoluteManifest);
    requireCondition(manifestStat.isFile() && manifestStat.nlink === 1 && manifestStat.size <= 2_000_000, 'INVALID_MANIFEST_FILE');
    manifest = JSON.parse(await readFile(absoluteManifest, 'utf8'));
  }
  const report = await auditBackups(config, manifest, { privateDetails, registryInitialized: !!manifestPath, manifestPath });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(() => {
    process.stdout.write(`${JSON.stringify({ mode: 'audit_only', rotationActive: false, valid: false, dueForReview: 0, actionsPerformed: 0, issues: ['CONFIG_OR_MANIFEST_UNREADABLE'] })}\n`);
    process.exitCode = 1;
  });
}
