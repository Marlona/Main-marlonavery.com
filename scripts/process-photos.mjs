import sharp from 'sharp';
import { readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const srcDir = 'public/images';
const outDir = 'src/assets/photos';
await mkdir(outDir, { recursive: true });

for (const file of await readdir(srcDir)) {
	if (!file.endsWith('.png')) continue;
	const base = path.basename(file, '.png');
	const out = path.join(outDir, `${base}.jpg`);
	const img = sharp(path.join(srcDir, file)).rotate();
	const meta = await img.metadata();
	await img
		.resize({ width: Math.min(meta.width ?? 2000, 2000), withoutEnlargement: true })
		.jpeg({ quality: 82, mozjpeg: true })
		.toFile(out);
	await rm(path.join(srcDir, file));
	console.log(`${file} -> ${out}`);
}
