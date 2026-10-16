'use strict';

/**
 * build-extension.cjs
 * 
 * Packages the offline Etsy Profit Assistant into a local Chrome/Edge Manifest V3 extension.
 * 
 * Strict Guarantees:
 * 1. Pre-Copy Security Audit: Before any mkdir or write, auditDistSecurity() audits DIST_DIR itself
 *    and existing contents to reject symlinks/junctions (both allowlisted and unexpected).
 *    Prevents following pre-existing symlinks that could overwrite external sentinel files.
 * 2. Source Integrity: Verifies all source allowlisted files are regular files, not symlinks.
 * 3. Strict Allowlist & Fail-Closed: Rejects any unexpected or non-regular files without deletion.
 * 4. Post-Copy Defense-in-Depth: Secondary audit runs after copying to verify exact allowlist.
 * 5. Deterministic, Non-Recursive ZIP: createZip() strictly packages ONLY the exact allowlist entries,
 *    never recursively walking the filesystem. Archive entry paths are deterministic POSIX paths.
 * 6. CSP Sanitization: Sanitizes root index.html to remove 'unsafe-inline' from script-src,
 *    ensuring strict compliance with Manifest V3 CSP without modifying the source index.html.
 * 7. Safe & Non-Destructive: Safely overwrites known target files in dist-extension and zip in place;
 *    never uses destructive unlinkSync fallback or recursive deletions.
 * 8. Bundled Runtime: Prefers bundled Python executable with inherited stdio.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist-extension');
const DIST_ICONS_DIR = path.join(DIST_DIR, 'icons');
const EXT_SRC_DIR = path.join(ROOT_DIR, 'extension-src');
const EXT_ICONS_DIR = path.join(EXT_SRC_DIR, 'icons');
const ZIP_OUTPUT = path.join(ROOT_DIR, 'dist-extension.zip');

// Point ETSY_DEMO_PYTHON at an interpreter if `python` is not on PATH.
const BUNDLED_PYTHON = process.env.ETSY_DEMO_PYTHON || '';

// Strict allowlists
const ROOT_ALLOWLIST = ['index.html', 'styles.css', 'core.js', 'etsy.js', 'demo.js', 'app.js'];
const EXT_WRAPPER_FILES = ['manifest.json', 'background.js'];
const ICON_SIZES = [16, 32, 48, 128];
const ICON_REL_PATHS = ICON_SIZES.map(s => `icons/icon${s}.png`);

// The exact, complete allowlist of relative files expected in dist-extension
const EXACT_ALLOWLIST = [...ROOT_ALLOWLIST, ...EXT_WRAPPER_FILES, ...ICON_REL_PATHS].sort();

function getPythonExecutable() {
  if (fs.existsSync(BUNDLED_PYTHON)) {
    return BUNDLED_PYTHON;
  }
  return 'python';
}

function ensureIconsExist() {
  const missing = ICON_SIZES.some(s => !fs.existsSync(path.join(EXT_ICONS_DIR, `icon${s}.png`)));
  if (missing) {
    const genScript = path.join(EXT_SRC_DIR, 'generate-icons.py');
    if (fs.existsSync(genScript)) {
      console.log('Generating missing extension icons via generate-icons.py...');
      const pythonExe = getPythonExecutable();
      try {
        execFileSync(pythonExe, [genScript], { stdio: 'inherit' });
      } catch (err) {
        throw new Error('Failed to generate extension icons: ' + err.message);
      }
    } else {
      throw new Error('Icons missing in extension-src/icons and generate-icons.py not found.');
    }
  }
}

function verifySourcesExist() {
  for (const file of ROOT_ALLOWLIST) {
    const p = path.join(ROOT_DIR, file);
    if (!fs.existsSync(p)) {
      throw new Error(`Required source file missing: ${file}`);
    }
    const stat = fs.lstatSync(p);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Source file must be a regular file, not a symbolic link or directory: ${file}`);
    }
  }
  for (const file of EXT_WRAPPER_FILES) {
    const p = path.join(EXT_SRC_DIR, file);
    if (!fs.existsSync(p)) {
      throw new Error(`Required extension wrapper file missing: ${file}`);
    }
    const stat = fs.lstatSync(p);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Source wrapper file must be a regular file, not a symbolic link: ${file}`);
    }
  }
  for (const rel of ICON_REL_PATHS) {
    const p = path.join(EXT_SRC_DIR, rel);
    if (!fs.existsSync(p)) {
      throw new Error(`Required icon missing: ${rel}`);
    }
    const stat = fs.lstatSync(p);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Source icon must be a regular file, not a symbolic link: ${rel}`);
    }
  }
}

function sanitizeHtmlCsp(htmlContent) {
  let sanitized = htmlContent;
  sanitized = sanitized.replace(
    /script-src\s+'self'\s+'unsafe-inline'/g,
    "script-src 'self'"
  );

  const inlineScriptMatch = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi.exec(sanitized);
  if (inlineScriptMatch && inlineScriptMatch[1].trim().length > 0) {
    throw new Error('Detected inline script in index.html; MV3 requires all scripts to be external files.');
  }

  return sanitized;
}

function auditDistSecurity(distDir = DIST_DIR) {
  if (!fs.existsSync(distDir)) return;

  const distStat = fs.lstatSync(distDir);
  if (distStat.isSymbolicLink() || !distStat.isDirectory()) {
    throw new Error(
      `Security check failed (fail-closed): ${distDir} must be a regular directory, not a symbolic link or junction.`
    );
  }

  const unexpected = [];
  const rootEntries = fs.readdirSync(distDir, { withFileTypes: false });

  for (const entryName of rootEntries) {
    const entryPath = path.join(distDir, entryName);
    const entryStat = fs.lstatSync(entryPath);

    if (entryStat.isSymbolicLink()) {
      unexpected.push(`${entryName} (symbolic link/junction not allowed)`);
      continue;
    }

    if (entryName === 'icons') {
      if (!entryStat.isDirectory()) {
        unexpected.push('icons (must be a regular directory)');
        continue;
      }
      const iconEntries = fs.readdirSync(entryPath, { withFileTypes: false });
      for (const iconName of iconEntries) {
        const iconPath = path.join(entryPath, iconName);
        const iconStat = fs.lstatSync(iconPath);
        const rel = `icons/${iconName}`;

        if (iconStat.isSymbolicLink()) {
          unexpected.push(`${rel} (symbolic link/junction not allowed)`);
        } else if (!iconStat.isFile() || !EXACT_ALLOWLIST.includes(rel)) {
          unexpected.push(rel);
        }
      }
    } else {
      const rel = entryName;
      if (!entryStat.isFile() || !EXACT_ALLOWLIST.includes(rel)) {
        unexpected.push(rel);
      }
    }
  }

  if (unexpected.length > 0) {
    throw new Error(
      `Security check failed (fail-closed): unexpected or invalid entries detected in ${distDir}: ${unexpected.join(', ')}. ` +
      `No files were deleted. Remove unexpected entries before packaging.`
    );
  }
}

function build(customDistDir) {
  const targetDistDir = customDistDir || DIST_DIR;
  const targetIconsDir = path.join(targetDistDir, 'icons');
  console.log('Starting Etsy Profit Assistant extension build...');
  
  // 1. Verify sources and icons exist and are regular files (not symlinks)
  ensureIconsExist();
  verifySourcesExist();

  // 2. PRE-COPY AUDIT: Check destination BEFORE any mkdir or write operations!
  // Rejects symlink/junction targetDistDir, symlink/junction icons, and any pre-existing symlinked allowlisted/unexpected entries.
  auditDistSecurity(targetDistDir);

  // 3. Ensure dist directories exist (safe idempotent creation, no recursive deletion)
  fs.mkdirSync(targetDistDir, { recursive: true });
  fs.mkdirSync(targetIconsDir, { recursive: true });

  const writtenFiles = [];

  // 4. Process root allowlist
  for (const file of ROOT_ALLOWLIST) {
    const srcPath = path.join(ROOT_DIR, file);
    const destPath = path.join(targetDistDir, file);
    
    if (file === 'index.html') {
      const original = fs.readFileSync(srcPath, 'utf8');
      const sanitized = sanitizeHtmlCsp(original);
      fs.writeFileSync(destPath, sanitized, 'utf8');
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
    writtenFiles.push(file);
  }

  // 5. Process extension wrapper files
  for (const file of EXT_WRAPPER_FILES) {
    const srcPath = path.join(EXT_SRC_DIR, file);
    const destPath = path.join(targetDistDir, file);
    fs.copyFileSync(srcPath, destPath);
    writtenFiles.push(file);
  }

  // 6. Process icons
  for (const rel of ICON_REL_PATHS) {
    const srcPath = path.join(EXT_SRC_DIR, rel);
    const destPath = path.join(targetDistDir, rel);
    fs.copyFileSync(srcPath, destPath);
    writtenFiles.push(rel);
  }

  // 7. POST-COPY AUDIT: Defense-in-depth security check
  auditDistSecurity(targetDistDir);

  console.log(`Successfully assembled ${writtenFiles.length} allowlisted extension files in ${targetDistDir}:`);
  for (const f of writtenFiles) {
    const stat = fs.statSync(path.join(targetDistDir, f));
    console.log(`  - ${f} (${stat.size} bytes)`);
  }

  // 8. Create ZIP archive strictly using the exact allowlist (never recursive walk)
  if (!customDistDir) {
    createZip(EXACT_ALLOWLIST);
  }

  console.log('Extension build complete.');
}

function createZip(allowlist) {
  console.log(`Packaging extension ZIP archive: ${ZIP_OUTPUT}...`);
  let zipCreated = false;
  const pythonExe = getPythonExecutable();

  // 1. Primary: Use Python zipfile with explicit allowlist (strictly non-recursive)
  try {
    const pyScript = `
import zipfile, os, sys, json
dist_dir = sys.argv[1]
zip_path = sys.argv[2]
allowlist = json.loads(sys.argv[3])

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for rel_path in sorted(allowlist):
        full_path = os.path.join(dist_dir, rel_path.replace('/', os.sep))
        if not os.path.isfile(full_path):
            raise FileNotFoundError(f"Allowlisted file missing on disk: {full_path}")
        arcname = rel_path.replace('\\\\', '/')
        zf.write(full_path, arcname)
`;
    execFileSync(pythonExe, ['-c', pyScript, DIST_DIR, ZIP_OUTPUT, JSON.stringify(allowlist)], {
      stdio: 'inherit'
    });
    zipCreated = true;
    console.log(`ZIP created via Python zipfile using runtime: ${pythonExe}`);
  } catch (err) {
    console.warn('Python zipfile failed:', err.message);
  }

  // 2. Fallback: PowerShell packaging with explicit allowlist (no unlinkSync, no recursive *)
  if (!zipCreated) {
    try {
      const filesJson = JSON.stringify(allowlist.map(f => path.join(DIST_DIR, f).replace(/\\/g, '\\\\')));
      const psCommand = `
$distDir = '${DIST_DIR.replace(/'/g, "''")}';
$zipPath = '${ZIP_OUTPUT.replace(/'/g, "''")}';
$files = ConvertFrom-Json '${filesJson.replace(/'/g, "''")}';
Add-Type -AssemblyName System.IO.Compression.FileSystem;
$zipFile = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create);
try {
    foreach ($f in $files) {
        $rel = $f.Substring($distDir.Length + 1).Replace('\\', '/');
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipFile, $f, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;
    }
} finally {
    $zipFile.Dispose();
}
`;
      execFileSync('pwsh.exe', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' });
      zipCreated = true;
      console.log('ZIP created via PowerShell .NET ZipArchive with exact allowlist.');
    } catch (err) {
      console.warn('PowerShell fallback failed:', err.message);
    }
  }

  if (zipCreated && fs.existsSync(ZIP_OUTPUT)) {
    const zipStat = fs.statSync(ZIP_OUTPUT);
    console.log(`ZIP package verified: ${ZIP_OUTPUT} (${zipStat.size} bytes)`);
  } else {
    throw new Error('Failed to create extension ZIP archive.');
  }
}

if (require.main === module) {
  try {
    build();
  } catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }
}

module.exports = {
  build,
  auditDistSecurity,
  verifySourcesExist,
  sanitizeHtmlCsp,
  createZip,
  ROOT_ALLOWLIST,
  EXT_WRAPPER_FILES,
  ICON_SIZES,
  ICON_REL_PATHS,
  EXACT_ALLOWLIST,
  DIST_DIR,
  ZIP_OUTPUT
};
