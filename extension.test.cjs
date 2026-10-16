'use strict';

/**
 * extension.test.cjs
 * 
 * Comprehensive test suite for the Etsy Profit Assistant Manifest V3 Extension:
 * 1. Manifest structure, semver, icons, and action configuration.
 * 2. Zero-permission isolation, no host permissions, no content scripts.
 * 3. Strict CSP in manifest and sanitized index.html without unsafe-inline.
 * 4. Strict allowlist adherence and safe idempotent build.
 * 5. Fail-closed security audits & regression tests:
 *    - Pre-copy audit rejects unexpected root/icon entries without deletion.
 *    - Allowlisted destination symlink/junction cannot modify external sentinel targets.
 *    - DIST_DIR itself as symlink/junction is rejected.
 *    - Source allowlisted files verified as regular files, not symlinks.
 * 6. ZIP package integrity and exact non-recursive allowlisted entries.
 * 7. Background service worker mock lifecycle and click handler behavior.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist-extension');
const DIST_ICONS_DIR = path.join(DIST_DIR, 'icons');
const EXT_SRC_DIR = path.join(ROOT_DIR, 'extension-src');
const ZIP_PATH = path.join(ROOT_DIR, 'dist-extension.zip');

const {
  build,
  auditDistSecurity,
  verifySourcesExist,
  sanitizeHtmlCsp,
  ROOT_ALLOWLIST,
  EXT_WRAPPER_FILES,
  ICON_SIZES,
  ICON_REL_PATHS,
  EXACT_ALLOWLIST
} = require('./build-extension.cjs');

const BUNDLED_PYTHON = process.env.ETSY_DEMO_PYTHON || '';
const pythonExe = BUNDLED_PYTHON && fs.existsSync(BUNDLED_PYTHON) ? BUNDLED_PYTHON : 'python';

describe('Etsy Profit Assistant - Extension Packaging Suite', () => {

  before(() => {
    // Ensure build is run and up to date before running tests
    build();
  });

  describe('1. Manifest V3 Schema & Configuration', () => {
    const manifestPath = path.join(DIST_DIR, 'manifest.json');

    test('manifest.json exists and is valid JSON', () => {
      assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in dist-extension');
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      assert.equal(typeof manifest, 'object');
      assert.equal(manifest.manifest_version, 3, 'Must be Manifest V3');
    });

    test('metadata: name, version and description are descriptive and valid', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.ok(manifest.name && manifest.name.length > 0, 'Name must be defined');
      assert.match(manifest.name, /Etsy Profit Assistant/i, 'Name must indicate the tool');
      assert.ok(manifest.version && /^\d+\.\d+\.\d+$/.test(manifest.version), 'Version must be semver formatted');
      assert.ok(manifest.description && manifest.description.length > 20, 'Description must explain offline nature');
    });

    test('action: configured to open tab on click, NO default_popup', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.ok(manifest.action, 'Action must be configured');
      assert.ok(manifest.action.default_title, 'Action must have a tooltip title');
      assert.equal(
        manifest.action.default_popup,
        undefined,
        'default_popup must NOT be configured so toolbar click triggers chrome.action.onClicked'
      );
      assert.ok(manifest.action.default_icon, 'Action must provide default_icon');
      assert.ok(manifest.action.default_icon['16'], 'Icon 16 defined for action');
      assert.ok(manifest.action.default_icon['32'], 'Icon 32 defined for action');
      assert.ok(manifest.action.default_icon['48'], 'Icon 48 defined for action');
      assert.ok(manifest.action.default_icon['128'], 'Icon 128 defined for action');
    });

    test('background: minimal service worker declared, no MV2 legacy scripts', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.ok(manifest.background, 'Background configuration must exist');
      assert.equal(manifest.background.service_worker, 'background.js', 'Service worker file must be background.js');
      assert.equal(manifest.background.scripts, undefined, 'Must not use legacy MV2 background.scripts');
    });

    test('icons: 16, 32, 48, 128 are present and valid PNG binaries', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      for (const size of [16, 32, 48, 128]) {
        const iconRel = manifest.icons[String(size)];
        assert.ok(iconRel, `Icon for ${size} must be declared in manifest`);
        const iconPath = path.join(DIST_DIR, iconRel);
        assert.ok(fs.existsSync(iconPath), `Icon file ${iconPath} must exist on disk`);
        
        const buf = fs.readFileSync(iconPath);
        assert.ok(buf.length > 100, `Icon file ${iconRel} must have non-trivial size`);
        // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
        const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
        assert.ok(isPng, `Icon ${iconRel} must be a valid PNG binary`);

        // Check PNG IHDR dimensions (offset 16: width, offset 20: height)
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        assert.equal(width, size, `Icon width must match ${size}`);
        assert.equal(height, size, `Icon height must match ${size}`);
      }
    });
  });

  describe('2. Security & Zero-Permission Isolation', () => {
    const manifestPath = path.join(DIST_DIR, 'manifest.json');

    test('permissions: strictly empty, no dangerous capabilities', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.deepEqual(
        manifest.permissions || [],
        [],
        'Extension must not declare any permissions; tabs.create is unprivileged'
      );
      assert.equal(manifest.optional_permissions, undefined, 'No optional permissions');
    });

    test('host_permissions: strictly absent or empty, no access to Etsy or external web', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.host_permissions, undefined, 'Must not have host_permissions');
    });

    test('content_scripts: strictly absent, zero page injection or tab inspection', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.content_scripts, undefined, 'Must not declare content scripts');
    });

    test('web_accessible_resources: absent, prevents third-party page fingerprinting', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.web_accessible_resources, undefined, 'Must not expose web accessible resources');
    });

    test('background.js: contains no network requests, telemetry, or storage APIs', () => {
      const workerCode = fs.readFileSync(path.join(DIST_DIR, 'background.js'), 'utf8');
      assert.doesNotMatch(workerCode, /\bfetch\s*\(/, 'Service worker must not call fetch');
      assert.doesNotMatch(workerCode, /\bXMLHttpRequest\b/, 'Service worker must not use XMLHttpRequest');
      assert.doesNotMatch(workerCode, /\bWebSocket\b/, 'Service worker must not use WebSocket');
      assert.doesNotMatch(workerCode, /\bsendBeacon\b/, 'Service worker must not send beacons');
      assert.doesNotMatch(workerCode, /chrome\.storage/, 'Service worker must not access chrome.storage');
      assert.doesNotMatch(workerCode, /chrome\.cookies/, 'Service worker must not access chrome.cookies');
      assert.doesNotMatch(workerCode, /chrome\.tabs\.query/, 'Service worker must not query user tabs');
      assert.doesNotMatch(workerCode, /chrome\.tabs\.executeScript|chrome\.scripting/, 'Service worker must not inject scripts');
    });
  });

  describe('3. Content Security Policy (CSP) & HTML Sanitization', () => {
    const manifestPath = path.join(DIST_DIR, 'manifest.json');
    const distHtmlPath = path.join(DIST_DIR, 'index.html');
    const rootHtmlPath = path.join(ROOT_DIR, 'index.html');

    test('manifest CSP enforces script-src self, object-src none, and connect-src none', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.ok(manifest.content_security_policy, 'CSP must be declared in manifest');
      const csp = manifest.content_security_policy.extension_pages;
      assert.ok(csp, 'extension_pages CSP must be declared');
      assert.match(csp, /script-src\s+'self'/, "CSP must contain script-src 'self'");
      assert.match(csp, /object-src\s+'none'/, "CSP must strengthen object-src 'none'");
      assert.match(csp, /connect-src\s+'none'/, "CSP must strengthen connect-src 'none' (blocks all network)");
      assert.doesNotMatch(csp, /'unsafe-inline'/, "Manifest CSP must not contain 'unsafe-inline'");
      assert.doesNotMatch(csp, /'unsafe-eval'/, "Manifest CSP must not contain 'unsafe-eval'");
    });

    test('dist index.html CSP meta tag is sanitized of unsafe-inline in script-src', () => {
      const html = fs.readFileSync(distHtmlPath, 'utf8');
      const cspMetaMatch = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])(.*?)\1/i);
      assert.ok(cspMetaMatch, 'index.html must have a Content-Security-Policy meta tag');
      const csp = cspMetaMatch[2];
      assert.match(csp, /script-src\s+'self'/, "Sanitized CSP must allow script-src 'self'");
      assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, "Sanitized script-src must NOT contain 'unsafe-inline'");
      assert.match(csp, /connect-src\s+'none'/, "connect-src must remain 'none' (no network)");
    });

    test('root index.html source is preserved and unmutated', () => {
      const rootHtml = fs.readFileSync(rootHtmlPath, 'utf8');
      assert.match(
        rootHtml,
        /script-src\s+'self'\s+'unsafe-inline'/,
        'The root index.html must keep its own CSP; the packaged copy is sanitized separately'
      );
    });

    test('dist index.html contains no inline executable script tags', () => {
      const html = fs.readFileSync(distHtmlPath, 'utf8');
      const inlineScriptRegex = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = inlineScriptRegex.exec(html)) !== null) {
        assert.equal(match[1].trim(), '', 'Found non-empty inline script which violates MV3 CSP');
      }
    });

    test('all external script tags in dist index.html exist on disk', () => {
      const html = fs.readFileSync(distHtmlPath, 'utf8');
      const srcRegex = /<script\s+[^>]*src=["']([^"']+)["']/gi;
      const foundScripts = [];
      let match;
      while ((match = srcRegex.exec(html)) !== null) {
        foundScripts.push(match[1]);
      }
      assert.ok(foundScripts.length >= 4, 'Must include core.js, etsy.js, demo.js, app.js');
      for (const scriptFile of foundScripts) {
        const fullPath = path.join(DIST_DIR, scriptFile);
        assert.ok(fs.existsSync(fullPath), `Script ${scriptFile} referenced in HTML must exist in dist-extension`);
      }
    });

    test('sanitizeHtmlCsp helper handles different whitespace variations', () => {
      const sample = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self'">`;
      const res = sanitizeHtmlCsp(sample);
      assert.equal(
        res,
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'">`
      );
    });
  });

  describe('4. Strict Allowlist & Packaging Integrity', () => {
    test('dist-extension contains ONLY allowlisted files and icons', () => {
      const actualRoot = fs.readdirSync(DIST_DIR).filter(f => f !== 'icons').sort();
      const expectedRoot = [...ROOT_ALLOWLIST, ...EXT_WRAPPER_FILES].sort();
      assert.deepEqual(actualRoot, expectedRoot, 'Only strictly allowlisted files may exist in dist-extension');

      const actualIcons = fs.readdirSync(path.join(DIST_DIR, 'icons')).sort();
      const expectedIcons = ICON_SIZES.map(s => `icon${s}.png`).sort();
      assert.deepEqual(actualIcons, expectedIcons, 'Only strictly allowlisted icons may exist in dist-extension/icons');
    });

    test('no private files, tests, git, or tooling directories in dist-extension', () => {
      const rootFiles = fs.readdirSync(DIST_DIR);
      assert.ok(!rootFiles.includes('.git'), 'No .git in dist');
      assert.ok(!rootFiles.includes('tools'), 'No tooling directory in dist');
      assert.ok(!rootFiles.includes('node_modules'), 'No node_modules in dist');
      assert.ok(!rootFiles.some(f => f.endsWith('.test.cjs')), 'No test files in dist');
      assert.ok(!rootFiles.some(f => f.startsWith('.verify-browser')), 'No browser verification folders in dist');
    });

    test('build is idempotent and safely overwrites without destructive side-effects', () => {
      // Run build a second time
      assert.doesNotThrow(() => build());
      
      // All files still exist and are valid
      for (const f of [...ROOT_ALLOWLIST, ...EXT_WRAPPER_FILES]) {
        assert.ok(fs.existsSync(path.join(DIST_DIR, f)));
      }
    });

    test('source allowlisted files are all regular files and not symlinks', () => {
      assert.doesNotThrow(() => verifySourcesExist(), 'verifySourcesExist must succeed on clean sources');
    });
  });

  describe('5. Fail-Closed Security Audits & Pre-Copy Symlink Defenses', () => {
    test('unexpected root file triggers fail-closed error without deleting the file', () => {
      const unexpectedPath = path.join(DIST_DIR, 'unexpected-stale.log');
      fs.writeFileSync(unexpectedPath, 'stale-data', 'utf8');
      try {
        assert.throws(
          () => auditDistSecurity(DIST_DIR),
          /Security check failed \(fail-closed\): unexpected or invalid entries detected/,
          'auditDistSecurity must fail closed when unexpected root file exists'
        );
        // Safe handling: ensure unexpected file was NOT deleted
        assert.ok(fs.existsSync(unexpectedPath), 'Unexpected file must not be destructively deleted by audit');
      } finally {
        if (fs.existsSync(unexpectedPath)) {
          fs.unlinkSync(unexpectedPath);
        }
      }
    });

    test('unexpected icon file triggers fail-closed error without deleting the file', () => {
      const unexpectedIconPath = path.join(DIST_ICONS_DIR, 'unexpected-icon.png');
      fs.writeFileSync(unexpectedIconPath, 'fake-icon-bytes', 'utf8');
      try {
        assert.throws(
          () => auditDistSecurity(DIST_DIR),
          /Security check failed \(fail-closed\): unexpected or invalid entries detected/,
          'auditDistSecurity must fail closed when unexpected icon exists'
        );
        assert.ok(fs.existsSync(unexpectedIconPath), 'Unexpected icon must not be deleted by audit');
      } finally {
        if (fs.existsSync(unexpectedIconPath)) {
          fs.unlinkSync(unexpectedIconPath);
        }
      }
    });

    test('unexpected symlink/junction triggers fail-closed error without deletion', () => {
      const junctionPath = path.join(DIST_DIR, 'unexpected-junction');
      try {
        fs.symlinkSync(DIST_ICONS_DIR, junctionPath, 'junction');
        assert.throws(
          () => auditDistSecurity(DIST_DIR),
          /Security check failed \(fail-closed\): unexpected or invalid entries detected/,
          'auditDistSecurity must fail closed when unexpected symlink or junction exists'
        );
        assert.ok(fs.existsSync(junctionPath), 'Junction must not be deleted by audit');
      } finally {
        if (fs.existsSync(junctionPath)) {
          fs.unlinkSync(junctionPath);
        }
      }
    });

    test('pre-copy audit prevents allowlisted destination symlink/junction from modifying sentinel target', () => {
      // Use isolated temporary fixture directory
      const fixtureRoot = path.join(__dirname, '.tmp-fixture-sentinel-test');
      fs.mkdirSync(fixtureRoot, { recursive: true });

      const sentinelDir = path.join(fixtureRoot, 'external-sentinel-dir');
      fs.mkdirSync(sentinelDir, { recursive: true });
      const sentinelFile = path.join(sentinelDir, 'sentinel.txt');
      fs.writeFileSync(sentinelFile, 'SENTINEL_UNTOUCHED_CONTENT', 'utf8');

      const mockDist = path.join(fixtureRoot, 'mock-dist');
      fs.mkdirSync(mockDist, { recursive: true });

      // Create an allowlisted entry ('icons') as a junction pointing to sentinelDir
      const mockIconsJunction = path.join(mockDist, 'icons');
      fs.symlinkSync(sentinelDir, mockIconsJunction, 'junction');

      try {
        // Calling build on mockDist must abort BEFORE writing files or following the junction
        assert.throws(
          () => build(mockDist),
          /Security check failed \(fail-closed\):.*icons \(symbolic link\/junction not allowed\)/,
          'build must abort before writes when allowlisted entry is a symlink/junction'
        );

        // Verify the external sentinel target was NOT modified or polluted
        assert.equal(
          fs.readFileSync(sentinelFile, 'utf8'),
          'SENTINEL_UNTOUCHED_CONTENT',
          'Sentinel file must remain untouched'
        );
        assert.ok(
          !fs.existsSync(path.join(sentinelDir, 'icon16.png')),
          'icon16.png must not have been copied into sentinel directory'
        );
      } finally {
        // Clean up only test-created fixtures, preserving all normal output
        if (fs.existsSync(mockIconsJunction)) {
          fs.unlinkSync(mockIconsJunction);
        }
        if (fs.existsSync(fixtureRoot)) {
          fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
      }
    });

    test('pre-copy audit rejects DIST_DIR itself when it is a symlink or junction', () => {
      const fixtureRoot = path.join(__dirname, '.tmp-fixture-distlink-test');
      fs.mkdirSync(fixtureRoot, { recursive: true });

      const realTargetDir = path.join(fixtureRoot, 'real-target');
      fs.mkdirSync(realTargetDir, { recursive: true });

      const linkDist = path.join(fixtureRoot, 'link-dist');
      fs.symlinkSync(realTargetDir, linkDist, 'junction');

      try {
        assert.throws(
          () => build(linkDist),
          /must be a regular directory, not a symbolic link or junction/,
          'build must reject DIST_DIR when it is a symlink or junction'
        );
      } finally {
        if (fs.existsSync(linkDist)) {
          fs.unlinkSync(linkDist);
        }
        if (fs.existsSync(fixtureRoot)) {
          fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
      }
    });
  });

  describe('6. ZIP Distribution Package Integrity & Exact Entries', () => {
    test('dist-extension.zip exists and has valid ZIP header', () => {
      assert.ok(fs.existsSync(ZIP_PATH), 'dist-extension.zip must exist');
      const buf = fs.readFileSync(ZIP_PATH);
      assert.ok(buf.length > 5000, 'ZIP must be a substantial archive');
      // Standard ZIP magic bytes: 'PK\x03\x04' -> 0x50, 0x4B, 0x03, 0x04
      const isZip = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
      assert.ok(isZip, 'ZIP archive must start with PK signature');
    });

    test('dist-extension.zip contains EXACTLY the allowlisted entries (non-recursive)', () => {
      const pyScript = `
import zipfile, sys, json
zf = zipfile.ZipFile(sys.argv[1])
print(json.dumps(sorted(zf.namelist())))
`;
      const stdout = execFileSync(pythonExe, ['-c', pyScript, ZIP_PATH], { encoding: 'utf8' });
      const entries = JSON.parse(stdout.trim());
      
      const expected = [...EXACT_ALLOWLIST].sort();
      assert.deepEqual(entries, expected, 'ZIP entries must match EXACT_ALLOWLIST with POSIX forward slashes');
      assert.equal(entries.length, 12, 'ZIP must contain exactly 12 allowlisted files');
      assert.ok(entries.every(e => !e.includes('\\')), 'All zip paths must use normalized forward slashes');
    });
  });

  describe('7. Service Worker Mock & Event Verification', () => {
    test('background.js registers onClicked listener and creates index.html tab', async () => {
      const code = fs.readFileSync(path.join(DIST_DIR, 'background.js'), 'utf8');
      
      let listenerRegistered = null;
      let createdTabArg = null;

      const mockChrome = {
        action: {
          onClicked: {
            addListener: (fn) => {
              listenerRegistered = fn;
            }
          }
        },
        tabs: {
          create: async (opts) => {
            createdTabArg = opts;
            return { id: 101, ...opts };
          }
        },
        runtime: {
          getURL: (subpath) => `chrome-extension://mock-id/${subpath}`
        }
      };

      const context = vm.createContext({
        chrome: mockChrome,
        console: console
      });

      vm.runInContext(code, context);

      assert.equal(typeof listenerRegistered, 'function', 'Listener must have been registered');

      // Trigger the toolbar action click
      await listenerRegistered({});

      assert.ok(createdTabArg, 'Tab create argument must be recorded');
      assert.equal(
        createdTabArg.url,
        'chrome-extension://mock-id/index.html',
        'Clicking action must create a new tab pointing to extension index.html'
      );
    });
  });
});
