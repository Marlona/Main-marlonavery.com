/** Remove R2-owned video bodies from generated Workers Assets output. */
import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const videoDirectory = resolve(projectRoot, 'dist', 'video');
if (!videoDirectory.startsWith(`${projectRoot}/dist/`)) throw new Error('Refusing to modify a path outside generated dist.');

const entries = await readdir(videoDirectory, { withFileTypes: true });
const removed = [];
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.mp4')) continue;
  await rm(resolve(videoDirectory, entry.name));
  removed.push(`video/${entry.name}`);
}

console.log(`Prepared Workers Assets; ${removed.length} MP4 files are served from R2.`);
