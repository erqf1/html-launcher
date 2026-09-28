'use strict';

// Minimale, abhängigkeitsfreie Archiv-Schreiber (.tar.gz und .zip).
//
// Warum nicht einfach zippen? NTFS kennt keine Unix-Rechte. Ein unter Windows
// gepacktes Linux-/Mac-Paket würde ohne Ausführungsrecht ankommen und nicht
// starten. Hier werden die Rechte anhand der Dateikopfzeilen (ELF / Mach-O)
// gesetzt, Symlinks bleiben Symlinks (macOS-Frameworks brauchen sie).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EXEC_MAGICS = [
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), // Mach-O 64 Bit
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]), // Mach-O Universal
];

function looksExecutable(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(4);
    if (fs.readSync(fd, head, 0, 4, 0) < 4) return false;
    return EXEC_MAGICS.some((magic) => magic.equals(head));
  } finally {
    fs.closeSync(fd);
  }
}

/** Liest ein Verzeichnis rekursiv; Pfade werden relativ zu `parent` mit "/" geliefert. */
function collect(dir, unixModes) {
  const parent = path.dirname(dir);
  const entries = [];
  (function walk(current) {
    for (const name of fs.readdirSync(current).sort()) {
      const abs = path.join(current, name);
      const rel = path.relative(parent, abs).split(path.sep).join('/');
      const stat = fs.lstatSync(abs);
      if (stat.isSymbolicLink()) {
        entries.push({ rel, abs, type: 'link', target: fs.readlinkSync(abs).split(path.sep).join('/'), mode: 0o777, size: 0 });
      } else if (stat.isDirectory()) {
        entries.push({ rel, abs, type: 'dir', mode: 0o755, size: 0 });
        walk(abs);
      } else {
        let mode = 0o644;
        if (unixModes) {
          if (name === 'chrome-sandbox') mode = 0o4755;
          else if (looksExecutable(abs)) mode = 0o755;
        }
        entries.push({ rel, abs, type: 'file', mode, size: stat.size });
      }
    }
  })(dir);
  return [{ rel: path.basename(dir), abs: dir, type: 'dir', mode: 0o755, size: 0 }, ...entries];
}

// ---------------------------------------------------------------- tar.gz

function octal(buf, value, offset, length) {
  buf.write(value.toString(8).padStart(length - 1, '0'), offset, length - 1, 'ascii');
}

function tarHeader({ name, mode, size, type, linkname = '', mtime }) {
  const buf = Buffer.alloc(512);
  buf.write(name, 0, 100, 'utf8');
  octal(buf, mode, 100, 8);
  octal(buf, 0, 108, 8); // uid
  octal(buf, 0, 116, 8); // gid
  octal(buf, size, 124, 12);
  octal(buf, mtime, 136, 12);
  buf.fill(0x20, 148, 156); // Prüfsumme zählt mit Leerzeichen
  buf.write(type, 156, 1, 'ascii');
  buf.write(linkname, 157, 100, 'utf8');
  buf.write('ustar\0', 257, 'ascii');
  buf.write('00', 263, 'ascii');
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return buf;
}

function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 1;
  while (String(length).length + Buffer.byteLength(body) !== length) length = String(length).length + Buffer.byteLength(body);
  return Buffer.from(`${length}${body}`);
}

const pad512 = (n) => (512 - (n % 512)) % 512;

async function writeTarGz(outFile, dir) {
  const entries = collect(dir, true);
  const mtime = Math.floor(Date.now() / 1000);
  const gzip = zlib.createGzip({ level: 9 });
  const out = fs.createWriteStream(outFile);
  gzip.pipe(out);
  const write = (chunk) => (gzip.write(chunk) ? Promise.resolve() : new Promise((r) => gzip.once('drain', r)));

  for (const e of entries) {
    const name = e.type === 'dir' ? `${e.rel}/` : e.rel;
    const linkname = e.type === 'link' ? e.target : '';
    const typeflag = { file: '0', dir: '5', link: '2' }[e.type];

    // Lange oder nicht-ASCII-Namen gehen über einen PAX-Kopf
    const pax = [];
    const isPlain = (s) => Buffer.byteLength(s) <= 100 && /^[\x20-\x7e]*$/.test(s);
    if (!isPlain(name)) pax.push(paxRecord('path', name));
    if (!isPlain(linkname)) pax.push(paxRecord('linkpath', linkname));
    if (pax.length) {
      const body = Buffer.concat(pax);
      await write(tarHeader({ name: `PaxHeader/${path.basename(e.rel)}`.slice(0, 100), mode: 0o644, size: body.length, type: 'x', mtime }));
      await write(body);
      await write(Buffer.alloc(pad512(body.length)));
    }

    await write(
      tarHeader({
        name: isPlain(name) ? name : name.slice(0, 100).replace(/[^\x20-\x7e]/g, '_'),
        mode: e.mode,
        size: e.type === 'file' ? e.size : 0,
        type: typeflag,
        linkname: isPlain(linkname) ? linkname : '',
        mtime,
      })
    );
    if (e.type === 'file') {
      const data = fs.readFileSync(e.abs);
      await write(data);
      await write(Buffer.alloc(pad512(data.length)));
    }
  }
  await write(Buffer.alloc(1024)); // Ende-Markierung
  gzip.end();
  await new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

// ---------------------------------------------------------------- zip

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function writeZip(outFile, dir) {
  const entries = collect(dir, false).filter((e) => e.type !== 'link'); // Windows-Pakete haben keine Symlinks
  const { time, day } = dosDateTime(new Date());
  const fd = fs.openSync(outFile, 'w');
  let offset = 0;
  const put = (buf) => {
    fs.writeSync(fd, buf);
    offset += buf.length;
  };
  const central = [];

  for (const e of entries) {
    const name = Buffer.from(e.type === 'dir' ? `${e.rel}/` : e.rel, 'utf8');
    const data = e.type === 'file' ? fs.readFileSync(e.abs) : Buffer.alloc(0);
    const deflated = data.length ? zlib.deflateRawSync(data, { level: 9 }) : data;
    const method = data.length ? 8 : 0;
    const crc = data.length ? zlib.crc32(data) : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // Version
    local.writeUInt16LE(0x0800, 6); // UTF-8-Namen
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localOffset = offset;
    put(local);
    put(name);
    put(deflated);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // erzeugt mit
    cd.writeUInt16LE(20, 6); // benötigt
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(day, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(deflated.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(e.type === 'dir' ? 0x10 : 0, 38); // DOS-Attribut "Verzeichnis"
    cd.writeUInt32LE(localOffset, 42);
    central.push(Buffer.concat([cd, name]));
  }

  const cdStart = offset;
  for (const chunk of central) put(chunk);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - cdStart, 12);
  end.writeUInt32LE(cdStart, 16);
  put(end);
  fs.closeSync(fd);
}

module.exports = { writeTarGz, writeZip };
