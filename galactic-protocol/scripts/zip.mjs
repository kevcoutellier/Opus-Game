// Minimal ZIP reader (stored and deflated entries), enough for the sound archives.
import { inflateRawSync } from 'node:zlib';

export function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip invalide');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error('répertoire zip corrompu');
    const nameLen = buf.readUInt16LE(offset + 28);
    entries.push({
      method: buf.readUInt16LE(offset + 10),
      compressed: buf.readUInt32LE(offset + 20),
      size: buf.readUInt32LE(offset + 24),
      local: buf.readUInt32LE(offset + 42),
      name: buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8'),
    });
    offset += 46 + nameLen + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
  }
  return entries;
}

export function readEntry(buf, entry) {
  const start = entry.local + 30 + buf.readUInt16LE(entry.local + 26) + buf.readUInt16LE(entry.local + 28);
  const raw = buf.subarray(start, start + entry.compressed);
  return entry.method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
}
