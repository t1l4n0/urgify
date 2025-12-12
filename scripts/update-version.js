#!/usr/bin/env node
/**
 * Updates version number in all JavaScript files
 * Reads version from VERSION.txt and replaces version strings in JS files
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read version from VERSION.txt
const versionFile = join(rootDir, 'VERSION.txt');
const version = readFileSync(versionFile, 'utf-8').trim();

console.log(`Updating version to ${version} in all JavaScript files...`);

// Files to update with their version patterns
const files = [
  {
    path: join(rootDir, 'extensions/urgify-theme/assets/urgify.js'),
    patterns: [
      { search: /this\.version = ['"]\d+['"];/, replace: `this.version = '${version}';` }
    ]
  },
  {
    path: join(rootDir, 'extensions/urgify-theme/assets/urgify-slide-cart-upsell.js'),
    patterns: [
      { search: /this\.version = ['"]\d+['"];/, replace: `this.version = '${version}';` }
    ]
  }
];

let updatedCount = 0;

files.forEach(({ path, patterns }) => {
  try {
    let content = readFileSync(path, 'utf-8');
    let modified = false;

    patterns.forEach(({ search, replace }) => {
      if (search.test(content)) {
        content = content.replace(search, replace);
        modified = true;
      }
    });

    if (modified) {
      writeFileSync(path, content, 'utf-8');
      console.log(`✓ Updated ${path}`);
      updatedCount++;
    } else {
      console.log(`⚠ No version found in ${path}`);
    }
  } catch (error) {
    console.error(`✗ Error updating ${path}:`, error.message);
  }
});

console.log(`\n✓ Version update complete! Updated ${updatedCount} file(s).`);





