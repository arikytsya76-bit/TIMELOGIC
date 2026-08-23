const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
const buildEpoch = Number.parseInt(process.env.SOURCE_DATE_EPOCH ?? '0', 10);
if (!Number.isSafeInteger(buildEpoch) || buildEpoch < 0) {
  throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer');
}
const unpackedDir = path.join(projectDir, 'release', 'linux-unpacked');
const outputFile = path.join(
  projectDir,
  'release',
  `TimeLogic-Admin-${packageJson.version}-amd64.deb`,
);
const iconFile = path.resolve(projectDir, '..', 'mobile', 'assets', 'icon.png');

if (!fs.existsSync(path.join(unpackedDir, 'timelogic-admin'))) {
  throw new Error('Linux unpacked app is missing. Run electron-builder --linux dir --x64 first.');
}
if (!fs.existsSync(iconFile)) {
  throw new Error(`Linux icon is missing: ${iconFile}`);
}

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(String(value));
  if (bytes.length > length) throw new Error(`Tar field is too long: ${value}`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const encoded = Math.trunc(value).toString(8).padStart(length - 1, '0');
  writeString(buffer, offset, length - 1, encoded);
  buffer[offset + length - 1] = 0;
}

function tarHeader(entry) {
  const header = Buffer.alloc(512);
  const name = entry.name.replace(/\\/g, '/');
  if (Buffer.byteLength(name) > 100) throw new Error(`Tar path exceeds 100 bytes: ${name}`);

  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, entry.mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, entry.size || 0);
  writeOctal(header, 136, 12, entry.mtime ?? buildEpoch);
  header.fill(0x20, 148, 156);
  header[156] = (entry.type || '0').charCodeAt(0);
  if (entry.linkname) writeString(header, 157, 100, entry.linkname);
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, 'root');
  writeString(header, 297, 32, 'root');

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeString(header, 148, 6, checksum.toString(8).padStart(6, '0'));
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function copyFileToDescriptor(source, output) {
  const input = fs.openSync(source, 'r');
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(input, chunk, 0, chunk.length, null)) > 0) {
      fs.writeSync(output, chunk, 0, bytesRead);
    }
  } finally {
    fs.closeSync(input);
  }
}

function createTar(target, entries) {
  const output = fs.openSync(target, 'w');
  try {
    for (const entry of entries) {
      fs.writeSync(output, tarHeader(entry));
      if (entry.content !== undefined) {
        const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
        fs.writeSync(output, content);
      } else if (entry.source) {
        copyFileToDescriptor(entry.source, output);
      }
      const remainder = (entry.size || 0) % 512;
      if (remainder) fs.writeSync(output, Buffer.alloc(512 - remainder));
    }
    fs.writeSync(output, Buffer.alloc(1024));
  } finally {
    fs.closeSync(output);
  }
}

function listTarEntries(target) {
  const descriptor = fs.openSync(target, 'r');
  try {
    const entries = [];
    const total = fs.statSync(target).size;
    let offset = 0;
    while (offset + 512 <= total) {
      const header = Buffer.alloc(512);
      fs.readSync(descriptor, header, 0, 512, offset);
      if (header.every((byte) => byte === 0)) break;

      const storedChecksum = Number.parseInt(
        header.subarray(148, 156).toString('ascii').replace(/\0/g, '').trim(),
        8,
      );
      const checksumHeader = Buffer.from(header);
      checksumHeader.fill(0x20, 148, 156);
      const actualChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
      if (storedChecksum !== actualChecksum) throw new Error(`Invalid tar checksum at offset ${offset}`);

      const readField = (start, length) => header.subarray(start, start + length)
        .toString('utf8').replace(/\0.*$/, '');
      const name = readField(0, 100);
      const mode = Number.parseInt(readField(100, 8), 8);
      const size = Number.parseInt(readField(124, 12), 8) || 0;
      const type = readField(156, 1) || '0';
      const linkname = readField(157, 100);
      entries.push({ name, mode, size, type, linkname });
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return entries;
  } finally {
    fs.closeSync(descriptor);
  }
}

function directoryEntry(name) {
  return { name: name.endsWith('/') ? name : `${name}/`, mode: 0o755, size: 0, type: '5' };
}

function contentEntry(name, content, mode = 0o644) {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { name, mode, size: data.length, type: '0', content: data };
}

function sourceEntry(name, source, mode = 0o644) {
  return { name, mode, size: fs.statSync(source).size, type: '0', source };
}

function collectAppEntries() {
  const entries = [directoryEntry('opt'), directoryEntry('opt/timelogic-admin')];
  const executableNames = new Set(['timelogic-admin', 'chrome_crashpad_handler']);

  function walk(currentDir, relativeDir = '') {
    const children = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const relative = relativeDir ? `${relativeDir}/${child.name}` : child.name;
      const source = path.join(currentDir, child.name);
      const target = `opt/timelogic-admin/${relative}`;
      if (child.isDirectory()) {
        entries.push(directoryEntry(target));
        walk(source, relative);
      } else if (child.isFile()) {
        let mode = 0o644;
        if (child.name === 'chrome-sandbox') mode = 0o4755;
        else if (executableNames.has(child.name) || /^lib.*\.so(?:\.|$)/.test(child.name)) mode = 0o755;
        entries.push(sourceEntry(target, source, mode));
      }
    }
  }

  walk(unpackedDir);

  const desktopFile = [
    '[Desktop Entry]',
    'Name=TimeLogic Admin',
    'Comment=TimeLogic attendance administration',
    'Exec=/opt/timelogic-admin/timelogic-admin %U',
    'Terminal=false',
    'Type=Application',
    'Icon=timelogic-admin',
    'Categories=Office;',
    'StartupWMClass=TimeLogic Admin',
    '',
  ].join('\n');

  entries.push(
    directoryEntry('usr'),
    directoryEntry('usr/bin'),
    { name: 'usr/bin/timelogic-admin', mode: 0o777, size: 0, type: '2', linkname: '/opt/timelogic-admin/timelogic-admin' },
    directoryEntry('usr/share'),
    directoryEntry('usr/share/applications'),
    contentEntry('usr/share/applications/timelogic-admin.desktop', desktopFile),
    directoryEntry('usr/share/icons'),
    directoryEntry('usr/share/icons/hicolor'),
    directoryEntry('usr/share/icons/hicolor/1024x1024'),
    directoryEntry('usr/share/icons/hicolor/1024x1024/apps'),
    sourceEntry('usr/share/icons/hicolor/1024x1024/apps/timelogic-admin.png', iconFile),
  );
  return entries;
}

function compressXz(sevenZip, source, target) {
  const result = spawnSync(sevenZip, ['a', '-txz', '-mx=9', target, source], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`7-Zip failed to create ${path.basename(target)}`);
}

function arHeader(name, size) {
  const values = [
    `${name}/`.padEnd(16),
    `${buildEpoch}`.padEnd(12),
    '0'.padEnd(6),
    '0'.padEnd(6),
    '100644'.padEnd(8),
    `${size}`.padEnd(10),
    '`\n',
  ];
  const header = Buffer.from(values.join(''), 'ascii');
  if (header.length !== 60) throw new Error(`Invalid ar header for ${name}`);
  return header;
}

function createDeb(target, members) {
  const output = fs.openSync(target, 'w');
  try {
    fs.writeSync(output, Buffer.from('!<arch>\n', 'ascii'));
    for (const member of members) {
      const size = fs.statSync(member.path).size;
      fs.writeSync(output, arHeader(member.name, size));
      copyFileToDescriptor(member.path, output);
      if (size % 2) fs.writeSync(output, Buffer.from('\n'));
    }
  } finally {
    fs.closeSync(output);
  }
}

function listArMembers(target) {
  const descriptor = fs.openSync(target, 'r');
  try {
    const magic = Buffer.alloc(8);
    fs.readSync(descriptor, magic, 0, 8, 0);
    if (magic.toString('ascii') !== '!<arch>\n') throw new Error('Invalid Debian ar signature');
    const members = [];
    let offset = 8;
    const total = fs.statSync(target).size;
    while (offset < total) {
      const header = Buffer.alloc(60);
      if (fs.readSync(descriptor, header, 0, 60, offset) !== 60) throw new Error('Truncated ar header');
      const name = header.subarray(0, 16).toString('ascii').trim().replace(/\/$/, '');
      const size = Number.parseInt(header.subarray(48, 58).toString('ascii').trim(), 10);
      if (!name || !Number.isFinite(size)) throw new Error('Invalid ar member header');
      members.push(name);
      offset += 60 + size + (size % 2);
    }
    return members;
  } finally {
    fs.closeSync(descriptor);
  }
}

const tempRoot = fs.realpathSync(os.tmpdir());
const tempDir = fs.mkdtempSync(path.join(tempRoot, 'timelogic-deb-'));
try {
  const controlTar = path.join(tempDir, 'control.tar');
  const dataTar = path.join(tempDir, 'data.tar');
  const controlXz = `${controlTar}.xz`;
  const dataXz = `${dataTar}.xz`;
  const debianBinary = path.join(tempDir, 'debian-binary');

  const dataEntries = collectAppEntries();
  const installedSize = Math.ceil(
    dataEntries.reduce((total, entry) => total + (entry.size || 0), 0) / 1024,
  );
  const control = [
    'Package: timelogic-admin',
    `Version: ${packageJson.version}`,
    'Section: utils',
    'Priority: optional',
    'Architecture: amd64',
    'Maintainer: TimeLogic <support@timelogic.app>',
    `Installed-Size: ${installedSize}`,
    'Depends: libgtk-3-0 | libgtk-3-0t64, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0 | libatspi2.0-0t64, libuuid1, libsecret-1-0',
    'Recommends: libayatana-appindicator3-1 | libappindicator3-1',
    'Homepage: https://timelogic.pages.dev',
    'Description: TimeLogic attendance administration',
    ' Desktop administration app for the TimeLogic attendance platform.',
    '',
  ].join('\n');
  const postinst = '#!/bin/sh\nset -e\ncommand -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true\n';
  const postrm = '#!/bin/sh\nset -e\ncommand -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true\n';

  createTar(controlTar, [
    contentEntry('control', control),
    contentEntry('postinst', postinst, 0o755),
    contentEntry('postrm', postrm, 0o755),
  ]);
  createTar(dataTar, dataEntries);
  fs.writeFileSync(debianBinary, '2.0\n');

  const controlEntries = listTarEntries(controlTar);
  const packagedEntries = listTarEntries(dataTar);
  const expectedControl = ['control', 'postinst', 'postrm'];
  if (controlEntries.map((entry) => entry.name).join(',') !== expectedControl.join(',')) {
    throw new Error('The Debian control archive has unexpected members');
  }
  const requiredModes = new Map([
    ['opt/timelogic-admin/timelogic-admin', 0o755],
    ['opt/timelogic-admin/chrome-sandbox', 0o4755],
    ['usr/share/applications/timelogic-admin.desktop', 0o644],
  ]);
  for (const [name, mode] of requiredModes) {
    const entry = packagedEntries.find((candidate) => candidate.name === name);
    if (!entry || entry.mode !== mode) {
      throw new Error(`Invalid or missing Debian data entry: ${name}`);
    }
  }
  const launcher = packagedEntries.find((entry) => entry.name === 'usr/bin/timelogic-admin');
  if (!launcher || launcher.type !== '2' || launcher.linkname !== '/opt/timelogic-admin/timelogic-admin') {
    throw new Error('The Debian launcher symlink is invalid');
  }

  const sevenZip = require('7zip-bin').path7za;
  compressXz(sevenZip, controlTar, controlXz);
  compressXz(sevenZip, dataTar, dataXz);
  const xzMagic = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
  for (const archive of [controlXz, dataXz]) {
    const descriptor = fs.openSync(archive, 'r');
    const magic = Buffer.alloc(xzMagic.length);
    fs.readSync(descriptor, magic, 0, magic.length, 0);
    fs.closeSync(descriptor);
    if (!magic.equals(xzMagic)) throw new Error(`Invalid XZ stream: ${archive}`);
  }
  createDeb(outputFile, [
    { name: 'debian-binary', path: debianBinary },
    { name: 'control.tar.xz', path: controlXz },
    { name: 'data.tar.xz', path: dataXz },
  ]);

  const members = listArMembers(outputFile);
  if (members.join(',') !== 'debian-binary,control.tar.xz,data.tar.xz') {
    throw new Error(`Unexpected Debian members: ${members.join(', ')}`);
  }
  console.log(`Created ${outputFile}`);
  console.log(`Debian members: ${members.join(', ')}`);
} finally {
  const resolvedTemp = fs.realpathSync(tempDir);
  const safePrefix = `${tempRoot}${path.sep}`;
  if (!resolvedTemp.startsWith(safePrefix) || !path.basename(resolvedTemp).startsWith('timelogic-deb-')) {
    throw new Error(`Refusing to remove unexpected temporary path: ${resolvedTemp}`);
  }
  fs.rmSync(resolvedTemp, { recursive: true, force: true });
}
