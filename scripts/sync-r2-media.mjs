/** Upload versioned public MP4 files to the environment-specific R2 bucket. */
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const environment = process.argv[2];
const buckets = {
  production: 'marlonavery-media',
  staging: 'marlonavery-media-staging',
};
const bucket = buckets[environment];
if (!bucket) throw new Error('Pass exactly one environment: staging or production.');

const projectRoot = resolve(import.meta.dirname, '..');
const videoDirectory = resolve(projectRoot, 'public', 'video');
const wrangler = resolve(projectRoot, 'node_modules', '.bin', 'wrangler');
const files = (await readdir(videoDirectory)).filter((name) => name.endsWith('.mp4')).sort();

function upload(name) {
  const objectPath = `${bucket}/video/${name}`;
  const file = resolve(videoDirectory, name);
  return new Promise((resolveUpload, rejectUpload) => {
    const child = spawn(wrangler, [
      'r2', 'object', 'put', objectPath,
      '--file', file,
      '--content-type', 'video/mp4',
      '--remote',
    ], { stdio: 'inherit', env: process.env });
    child.on('error', rejectUpload);
    child.on('exit', (code) => code === 0 ? resolveUpload() : rejectUpload(new Error(`R2 upload failed for ${name} (${code}).`)));
  });
}

for (const name of files) await upload(name);
console.log(`Uploaded ${files.length} MP4 files to ${bucket}.`);
