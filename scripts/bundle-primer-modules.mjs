// Bundles the three official Primer starter modules during the build.
// Files become read-only deployment assets; user-created data remains ephemeral.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import unzipper from 'unzipper';

const registryUrl = 'https://raw.githubusercontent.com/wharton-generative-ai-labs/primer-modules/main/modules.json';
const root = path.resolve('public/primer-bundled');
const selected = ['experience-creator-with-workflows', 'roleplay-template-with-workflows', 'teachback-template-with-workflows'];
const maximumArchiveBytes = 70 * 1024 * 1024;
const maximumExtractedBytes = 200 * 1024 * 1024;

async function download(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error('Module download failed (' + response.status + '): ' + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximumArchiveBytes) throw new Error('Module ZIP exceeds size limit');
  return bytes;
}

async function run() {
  const manifestResponse = await fetch(registryUrl, { signal: AbortSignal.timeout(30000) });
  if (!manifestResponse.ok) throw new Error('Registry unavailable: ' + manifestResponse.status);
  const registry = (await manifestResponse.json()).modules;
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });

  for (const moduleId of selected) {
    const module = registry[moduleId];
    if (!module?.url) throw new Error('Required module unavailable: ' + moduleId);
    const zip = await download(module.url);
    if (module.sha256 && crypto.createHash('sha256').update(zip).digest('hex') !== module.sha256) {
      throw new Error('Module SHA mismatch: ' + moduleId);
    }
    const archive = await unzipper.Open.buffer(zip);
    const filePaths = archive.files.filter(f => f.type === 'File' && !f.path.startsWith('__MACOSX/'));
    const parts = filePaths.map(f => f.path.replaceAll('\\', '/').split('/'));
    const hasWrapper = parts.length > 0 && parts.every(p => p.length > 1 && p[0] === parts[0][0]);
    const prefix = hasWrapper ? parts[0][0] + '/' : '';
    let total = 0;
    let count = 0;
    for (const entry of filePaths) {
      const raw = entry.path.replaceAll('\\', '/');
      const relative = prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
      const segments = relative.split('/');
      if (!relative || segments.some(s => !s || s === '.' || s === '..') || path.posix.isAbsolute(relative) || relative.includes('\\0')) {
        throw new Error('Unsafe archive path: ' + entry.path);
      }
      const target = path.join(root, moduleId, ...segments);
      const bytes = await entry.buffer();
      total += bytes.length;
      if (total > maximumExtractedBytes) throw new Error('Extracted module exceeds size limit: ' + moduleId);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
      count++;
    }
    await fs.access(path.join(root, moduleId, 'experience.json'));
    console.log('Bundled ' + moduleId + ' (' + count + ' files, version ' + module.version + ')');
  }
}

run().catch(async (error) => {
  console.error('Primer module bundling failed:', error);
  await fs.rm(root, { recursive: true, force: true });
  process.exitCode = 1;
});
