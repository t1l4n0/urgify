#!/usr/bin/env node
/**
 * Increments the version number in VERSION.txt
 * This script is called before deployment to automatically bump the version
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const versionFile = join(rootDir, 'VERSION.txt');

try {
  // Read current version
  const currentVersion = parseInt(readFileSync(versionFile, 'utf-8').trim(), 10);
  
  if (isNaN(currentVersion)) {
    throw new Error('Invalid version number in VERSION.txt');
  }

  // Increment version
  const newVersion = currentVersion + 1;

  // Write new version
  writeFileSync(versionFile, `${newVersion}\n`, 'utf-8');
  
  console.log(`Version incremented: ${currentVersion} → ${newVersion}`);
  console.log(`Updated VERSION.txt`);
  
  // Now update all JS files with the new version
  execSync('node scripts/update-version.js', { stdio: 'inherit', cwd: rootDir });
  
} catch (error) {
  console.error('Error incrementing version:', error.message);
  process.exit(1);
}









