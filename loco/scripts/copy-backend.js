#!/usr/bin/env node

/**
 * Copy backend Python files to the extension directory for bundling
 * This ensures the backend is packaged with the .vsix file
 */

const fs = require('fs');
const path = require('path');

// Directories
const rootDir = path.resolve(__dirname, '..', '..');
const backendSrcDir = path.join(rootDir, 'backend');
const backendDestDir = path.join(__dirname, '..', 'backend');

console.log('📦 Copying backend files for packaging...');
console.log(`   Source: ${backendSrcDir}`);
console.log(`   Destination: ${backendDestDir}`);

// Helper to recursively copy directory
function copyDir(src, dest, excludeDirs = []) {
    // Create destination if it doesn't exist
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    // Read source directory
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        // Skip excluded directories
        if (excludeDirs.includes(entry.name)) {
            console.log(`   ⏭️  Skipping: ${entry.name}`);
            continue;
        }

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath, excludeDirs);
        } else {
            // Skip .env files
            if (entry.name === '.env' || entry.name.endsWith('.env')) {
                console.log(`   ⏭️  Skipping: ${entry.name}`);
                continue;
            }
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

try {
    // Remove existing backend directory in extension
    if (fs.existsSync(backendDestDir)) {
        console.log('   🗑️  Removing old backend directory...');
        fs.rmSync(backendDestDir, { recursive: true, force: true });
    }

    // Copy backend files (exclude venv, cache, tests)
    const excludeDirs = [
        'venv',
        '.venv',
        '__pycache__',
        '.pytest_cache',
        'tests',
        '.git',
        'node_modules',
        'ENV',
        'env'
    ];

    copyDir(backendSrcDir, backendDestDir, excludeDirs);

    console.log('✅ Backend copied successfully!');
    console.log(`   Location: ${backendDestDir}`);

    // List what was copied
    const filesCopied = countFiles(backendDestDir);
    console.log(`   📄 Files copied: ${filesCopied}`);

} catch (error) {
    console.error('❌ Error copying backend:', error.message);
    process.exit(1);
}

// Helper to count files recursively
function countFiles(dir) {
    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory()) {
            count += countFiles(path.join(dir, entry.name));
        } else {
            count++;
        }
    }

    return count;
}
