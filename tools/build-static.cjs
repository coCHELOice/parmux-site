'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const publicDirectories = new Set(['assets', 'legal', 'proposals']);
const publicRootExtensions = new Set(['.css', '.html', '.js']);

function copyPublic(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyPublic(path.join(source, child), path.join(destination, child));
    }
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.rmSync(output, { force: true, recursive: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of fs.readdirSync(root)) {
  const source = path.join(root, entry);
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    if (publicDirectories.has(entry)) copyPublic(source, path.join(output, entry));
    continue;
  }
  if (publicRootExtensions.has(path.extname(entry).toLowerCase())) {
    copyPublic(source, path.join(output, entry));
  }
}

console.log(`Static output written to ${path.relative(root, output)}`);
