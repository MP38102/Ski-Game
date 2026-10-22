// Packs the game into the ZIP you upload in the CrazyGames Developer Portal:
//   avalanche-rider/store/avalanche-rider-crazygames.zip
// Only runtime files go in (no tools, no store media). The ZIP writer is
// built in (deflate via zlib), so no extra packages are needed.
// Run from the repository root:  node avalanche-rider/tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const gameDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outFile = path.join(gameDir, 'store', 'avalanche-rider-crazygames.zip');
const INCLUDE = ['index.html', 'style.css', 'js', 'fonts', 'img'];

function walk(rel) {
  const abs = path.join(gameDir, rel);
  if (fs.statSync(abs).isDirectory()) {
    return fs.readdirSync(abs).sort().flatMap((f) => walk(path.posix.join(rel, f)));
  }
  return [rel];
}
const files = INCLUDE.flatMap(walk).filter((f) => !path.basename(f).startsWith('.'));

// Every reference inside the HTML must be relative (CrazyGames requirement).
const html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (m[1].startsWith('/') || /^https?:/.test(m[1])) throw new Error('absolute path in index.html: ' + m[1]);
  if (!files.includes(m[1])) throw new Error('index.html references a file that is not packed: ' + m[1]);
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed timestamp (2026-01-01 00:00) keeps the ZIP byte-identical between builds.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const locals = [];
const central = [];
let offset = 0;
let rawTotal = 0;
for (const rel of files) {
  const data = fs.readFileSync(path.join(gameDir, rel));
  rawTotal += data.length;
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const name = Buffer.from(rel, 'utf8');
  const crc = crc32(data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x0800, 6);
  lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
  lh.writeUInt16LE(DOS_TIME, 10);
  lh.writeUInt16LE(DOS_DATE, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(body.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(name.length, 26);
  lh.writeUInt16LE(0, 28);
  locals.push(lh, name, body);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
  ch.writeUInt16LE(DOS_TIME, 12);
  ch.writeUInt16LE(DOS_DATE, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(body.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, name);
  offset += lh.length + name.length + body.length;
}
const cdSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.concat([...locals, ...central, end]));

const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
const zipSize = fs.statSync(outFile).size;
console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
console.log(`  ${files.length} files, ${mb(rawTotal)} unpacked, ${mb(zipSize)} zipped`);
console.log(`  CrazyGames limits: initial download ≤ 50 MB (≤ 20 MB for the mobile homepage), ≤ 1500 files → ${rawTotal <= 20 * 1024 * 1024 && files.length <= 1500 ? 'OK' : 'CHECK'}`);
