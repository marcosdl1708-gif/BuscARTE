import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function checkedPath(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') ||
      relative.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) {
    throw new Error(`Invalid publication path: ${relative}`);
  }
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error(`Path escapes workspace: ${relative}`);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Links are not publishable: ${relative}`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

function existingFiles(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const name of fs.readdirSync(directory)) {
    const relative = prefix + name;
    const stat = fs.lstatSync(path.join(directory, name));
    if (stat.isSymbolicLink()) throw new Error(`Unexpected link in dist: ${relative}`);
    if (relative === 'netlify.toml' && !stat.isFile()) throw new Error(`Unexpected filesystem entry in dist: ${relative}`);
    if (stat.isDirectory()) result.push(...existingFiles(path.join(directory, name), relative + '/'));
    else if (stat.isFile()) {
      if (stat.nlink > 1) throw new Error(`Unexpected hard link in dist: ${relative}`);
      result.push(relative);
    }
    else throw new Error(`Unexpected filesystem entry in dist: ${relative}`);
  }
  return result;
}

function quarantineCachedNetlifyConfig(root, output) {
  // Netlify post-processing can leave its generated config in cached dist.
  // Keep it recoverable outside publication; never clean arbitrary output.
  const source = checkedPath(output, 'netlify.toml');
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error('Cached Netlify config must be a regular single-link file.');
  }
  const parent = checkedPath(root, '.netlify/build-quarantine');
  fs.mkdirSync(parent, { recursive: true });
  // Revalidate ancestors after mkdir as well. A unique destination prevents
  // overwriting an earlier quarantine or another task's recoverable file.
  checkedPath(root, '.netlify/build-quarantine');
  const directory = fs.mkdtempSync(path.join(parent, 'cached-dist-config-'));
  const destination = checkedPath(directory, 'netlify.toml');
  fs.renameSync(source, destination);
  return destination;
}

// No network calls, HTML transformations or recursive deletion. Only the explicit
// public files below can be copied. The parameter allows isolated fixture tests.
export function buildSite(sourceRoot = projectRoot) {
  const root = fs.realpathSync(sourceRoot);
  const output = checkedPath(root, 'dist');
  const manifest = JSON.parse(fs.readFileSync(checkedPath(root, 'site-files.json'), 'utf8'));
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('Publication list is empty or invalid.');
  const allowed = new Set();
  const entries = manifest.map(relative => {
    const source = checkedPath(root, relative);
    if (relative === 'dist' || relative.startsWith('dist/')) throw new Error('dist cannot be a source.');
    if (allowed.has(relative.toLowerCase())) throw new Error(`Duplicate publication path: ${relative}`);
    allowed.add(relative.toLowerCase());
    if (!fs.lstatSync(source).isFile()) throw new Error(`Source is not a regular file: ${relative}`);
    return { relative, bytes: fs.readFileSync(source) };
  });

  // Scan ALL output before making any changes, including symlinks/hard links.
  // Only trusted Netlify CI may quarantine its exact generated config; local
  // builds and any other unknown output remain fail-closed and untouched.
  const unexpected = existingFiles(output).filter(relative => !allowed.has(relative.toLowerCase()));
  let quarantinedConfig;
  if (unexpected.length) {
    if (process.env.NETLIFY === 'true' && unexpected.length === 1 && unexpected[0] === 'netlify.toml') {
      quarantinedConfig = quarantineCachedNetlifyConfig(root, output);
    } else {
      throw new Error(`Unexpected file in dist: ${unexpected[0]}. Review this generated folder before rebuilding.`);
    }
  }
  fs.mkdirSync(output, { recursive: true });
  for (const { relative, bytes } of entries) {
    const destination = checkedPath(output, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
    if (digest(fs.readFileSync(destination)) !== digest(bytes)) {
      throw new Error(`Copy verification failed: ${relative}`);
    }
  }
  if (existingFiles(output).length !== entries.length) throw new Error('Unexpected final publication file count.');
  return { output, files: entries.length, ...(quarantinedConfig ? { quarantinedConfig } : {}) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildSite();
  if (result.quarantinedConfig) console.log(`Retained cached Netlify config outside publish at ${result.quarantinedConfig}`);
  console.log(`Verified ${result.files} public files in ${result.output}`);
}
