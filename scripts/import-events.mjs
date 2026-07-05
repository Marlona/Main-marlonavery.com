/**
 * Import past speaking engagements from the CSV export into the events collection.
 * Usage: node scripts/import-events.mjs "<path-to-csv>"
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const csvPath = process.argv[2];
if (!csvPath) {
	console.error('Usage: node scripts/import-events.mjs <csv>');
	process.exit(1);
}

/** Minimal RFC-4180 parser: handles quoted fields, embedded commas and newlines. */
function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			if (row.some((f) => f.trim() !== '')) rows.push(row);
			row = [];
		} else {
			field += c;
		}
	}
	if (field !== '' || row.length > 0) {
		row.push(field);
		if (row.some((f) => f.trim() !== '')) rows.push(row);
	}
	return rows;
}

const TYPE_MAP = {
	workshop: 'workshop',
	podcast: 'podcast',
	panel: 'panel',
	keynote: 'keynote',
	'breakout session': 'workshop',
	conference: 'conference',
	meetup: 'meetup',
};

function parseDate(raw) {
	const m = raw?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (!m) return null;
	const [, month, day, year] = m;
	return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const slugify = (s) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const [, ...data] = rows; // drop header

const outDir = 'src/content/events/archive';
mkdirSync(outDir, { recursive: true });

let written = 0;
const seen = new Set();

for (const r of data) {
	const [name, type, start, , sessionTitle, location, url, recording] = r.map((f) => (f ?? '').trim());
	if (!name || !start) continue;
	const date = parseDate(start);
	if (!date) continue;

	const eventType = TYPE_MAP[type.toLowerCase()] ?? 'conference';
	const city = location && location.toLowerCase() !== 'virtual' ? location.replace(/\s+$/, '') : undefined;
	const virtual = location.toLowerCase() === 'virtual';

	const description = sessionTitle
		? sessionTitle
		: `${type || 'Speaking'} engagement${city ? ` in ${city}` : virtual ? ', delivered virtually' : ''}`;

	const resources = [];
	if (url && url.startsWith('http')) resources.push({ label: 'Event page', url, kind: 'link' });
	if (recording && recording.startsWith('http')) resources.push({ label: 'Watch the recording', url: recording, kind: 'video' });

	let slug = `${slugify(name)}-${date}`;
	let n = 2;
	while (seen.has(slug)) slug = `${slugify(name)}-${date}-${n++}`;
	seen.add(slug);

	const event = {
		title: name.replace(/\s+/g, ' ').trim(),
		date,
		type: eventType,
		status: 'past',
		...(city ? { city } : {}),
		...(virtual ? { venue: 'Virtual' } : {}),
		description: description.replace(/\s+/g, ' ').trim(),
		...(resources.length ? { resources } : {}),
	};

	writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(event, null, '\t') + '\n');
	written++;
}

console.log(`Imported ${written} events into ${outDir}`);
