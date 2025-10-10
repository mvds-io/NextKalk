#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const pmtilesPath = path.join(__dirname, '..', 'public', 'data', 'powerlines.pmtiles');

console.log('🔍 Checking for powerlines.pmtiles file...');
console.log(`📁 Looking at: ${pmtilesPath}`);

if (fs.existsSync(pmtilesPath)) {
  const stats = fs.statSync(pmtilesPath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  // Read first few bytes to check if it's a real PMTiles file or LFS pointer
  const buffer = Buffer.alloc(200);
  const fd = fs.openSync(pmtilesPath, 'r');
  fs.readSync(fd, buffer, 0, 200, 0);
  fs.closeSync(fd);

  const content = buffer.toString('utf8');

  if (content.includes('version https://git-lfs.github.com')) {
    console.error('❌ ERROR: File is a Git LFS pointer, not the actual file!');
    console.error('📄 Pointer content:');
    console.error(content);
    console.error('\n⚠️  Git LFS files were not fetched during build.');
    console.error('💡 Vercel needs Git LFS enabled in project settings.');
    process.exit(1);
  } else if (buffer.toString('utf8', 0, 7) === 'PMTiles') {
    console.log(`✅ File exists and is a valid PMTiles file (${fileSizeMB} MB)`);
    console.log('🎉 Powerlines data is ready!');
  } else {
    console.error(`⚠️  File exists (${fileSizeMB} MB) but format is unknown`);
    console.error('First bytes:', buffer.slice(0, 50).toString('hex'));
  }
} else {
  console.error('❌ ERROR: powerlines.pmtiles file not found!');
  console.error('📂 Expected location:', pmtilesPath);
  process.exit(1);
}
