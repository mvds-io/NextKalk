#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const RELEASE_URL = 'https://github.com/mvds-io/NextKalk/releases/download/v1.0.0-data/powerlines.pmtiles';
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'powerlines.pmtiles');

console.log('📥 Downloading powerlines.pmtiles from GitHub Release...');
console.log(`🔗 URL: ${RELEASE_URL}`);
console.log(`📁 Output: ${OUTPUT_PATH}`);

// Create directory if it doesn't exist
const dir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Function to follow redirects and download
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        console.log(`↪️  Following redirect to: ${response.headers.location}`);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;
      let lastProgress = 0;

      const file = fs.createWriteStream(dest);

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const progress = Math.floor((downloaded / totalSize) * 100);

        if (progress >= lastProgress + 10) {
          process.stdout.write(`\r⏳ Progress: ${progress}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
          lastProgress = progress;
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`\n✅ Download complete! File saved to: ${dest}`);
        console.log(`📦 File size: ${(fs.statSync(dest).size / 1024 / 1024).toFixed(2)} MB`);
        resolve();
      });

      file.on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    }).on('error', reject);
  });
}

// Check if file already exists
if (fs.existsSync(OUTPUT_PATH)) {
  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`ℹ️  File already exists (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log('✅ Skipping download');
  process.exit(0);
}

// Download the file
downloadFile(RELEASE_URL, OUTPUT_PATH)
  .then(() => {
    console.log('🎉 Powerlines data ready!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Download failed:', error.message);
    process.exit(1);
  });
