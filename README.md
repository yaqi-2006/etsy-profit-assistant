# Etsy Profit Assistant

**A browser-only analyzer that turns an Etsy payment statement into something you can argue with.**

Drop in an Etsy monthly-statement CSV (or a generic event CSV), enter what each order actually cost you, and see revenue, direct fees, order costs, missing inputs, and unlinked amounts side by side — with every number traceable back to a source row.

Everything runs client-side. No account, no upload, no backend, no telemetry. Refresh the page and the data is gone.

▶ **Live demo:** https://profit-pilot-etsy-demo.netlify.app/

---

## Status: archived, not commercialized

This is a **finished, verified prototype that was deliberately not taken to market.** It is published here as a portfolio and reference piece, not as a product.

Read why: **[docs/RETROSPECTIVE.zh-CN.md](docs/RETROSPECTIVE.zh-CN.md)** (Chinese). The short version:

- The feature set turned out to be **already covered by free tools** — see the retrospective for names and URLs.
- The channels where Etsy sellers actually gather **explicitly prohibit seller-tool promotion and even feedback requests**.
- Anything worth charging for (cross-month history, CPA-ready locked periods, multi-shop) **requires a backend**, which contradicts this project's entire premise.

**It was never validated against a real Etsy export.** The parser follows a documented historical 8-column monthly-statement format (`Date, Type, Title, Info, Currency, Amount, Fees & Taxes, Net`) corroborated by several independent third-party sources, but no real seller file was ever run through it. Treat compatibility as unproven.

---

## What it does

**Period view**

- Classifies every statement row into five mutually exclusive categories.
- Builds a money bridge from gross activity to what actually remained.
- Keeps buyer-paid sales tax/VAT separate from real fees.
- Does **not** re-deduct `Fees & Taxes` from `Net` — the statement's `Net` already includes them. Double-deducting is the single most common way these tools overstate costs.

**Order view**

- Per-order contribution after user-entered product, shipping, and packaging costs.
- Missing cost stays **unknown**, never silently zero. A blank is not a zero; zero means you confirmed the cost does not apply.
- Refunds do not silently restore product cost.
- Unlinked fees are reported as unlinked instead of being spread across orders by guesswork.

**Import**

- Auto-detects the native Etsy monthly statement, or maps an explicit generic event schema.
- Stable-ID deduplication; an ID whose financial values changed is **rejected as a whole batch** rather than overwritten.
- Invalid rows reject the entire batch instead of half-importing.
- Limits: 2 MiB, 5,000 rows, 80 columns, single currency, single month for the native profile.
- `Title`, `Info`, and any extra buyer fields are dropped and never exported.

**Output**

- Static HTML report (period categories, bridge, orders, sources), orders CSV, and a synthetic CSV template.
- Export is explicitly **not** a session backup.

## What it deliberately does not claim

- Not business net profit. Order contribution excludes shared overhead and income tax.
- Not a tax report, not accounting advice.
- Not "reconciled" — without source completeness or a balance, it reports only arithmetic relationships within the statement.
- No automatic Etsy sync, no Etsy affiliation, no Etsy trademark claim.

## Quick start

Two ways, neither needs a network connection:

```bash
# 1. Build the single-file version, then double-click it
node build.cjs          # writes etsy-profit-demo.html

# 2. Or serve the multi-file version locally
node server.cjs         # binds 127.0.0.1 only, prints the actual free port
```

Then press **Load synthetic demo** or **Try Etsy-format sample**. All bundled data is synthetic.

## Verification

Everything below runs offline against synthetic data.

```bash
npm test              # finance core, parser, native-statement safety, extension packaging
npm run test:browser  # isolated headless Chrome against the built single file
npm run test:extension# installs the MV3 extension in isolated Chrome and drives it
npm run test:ui       # targeted UI regressions
npm run build:extension
```

Verified counts recorded during development: 76 financial/parser/packaging checks, 20 offline browser checks, 11 extension interaction checks, and 4 focused UI regressions. Per-run output is written next to each script. Raw results are preserved in [`evidence/`](evidence/).

**Requirements.** Node ≥ 20 (no npm dependencies — only `node:*` builtins). `build:extension` and the extension test suite additionally need Python. The browser-based suites need Chrome; set `ETSY_DEMO_CHROME` to point at a non-standard install. Set `ETSY_DEMO_PYTHON` if `python` is not on your PATH.

## Repository layout

```
core.js  etsy.js  demo.js  app.js     finance core, native adapter, fixtures, UI logic
index.html  styles.css                UI
server.cjs  build.cjs                 local server; single-file bundler
build-extension.cjs  extension-src/   Manifest V3 packaging (strict file allowlist)
*.test.cjs                            Node test-runner suites
verify-*.cjs / verify-*.mjs           browser-driven verification
tools/                                minimal CDP browser driver used by those scripts
samples/                              synthetic CSVs used by tests
docs/                                 scope note, extension guide, launch records, retrospective
evidence/                             raw verification output from development
MANIFEST.sha256                       SHA-256 of every tracked file
```

[`MANIFEST.sha256`](MANIFEST.sha256) records the SHA-256 of every tracked file, so a clone can be verified with `sha256sum -c MANIFEST.sha256`. Line-ending conversion is disabled in [`.gitattributes`](.gitattributes) precisely so those hashes stay valid.

`docs/` also holds the development-era Chinese records. Those are kept verbatim as historical artifacts (only their links were rewritten to resolve inside this archive):

- [SCOPE-AND-LIMITATIONS.zh-CN.md](docs/SCOPE-AND-LIMITATIONS.zh-CN.md) — the original project scope and limitation notes
- [EXTENSION.md](docs/EXTENSION.md) — extension guide and privacy architecture
- [RELEASE-NOTES.txt](docs/RELEASE-NOTES.txt) — v0.1 delivery package notes
- [launch-guide.md](docs/launch-guide.md), [上线记录.md](docs/上线记录.md), [推广执行步骤.md](docs/推广执行步骤.md), [推广发布草稿.md](docs/推广发布草稿.md) — launch log and promotion drafts; **the promotion steps were never executed**, no post, video upload or message described in them was ever published
- [BGM-使用与署名说明.txt](docs/BGM-使用与署名说明.txt) — music attribution record

The demo video, delivery ZIP, extension build output and screen recordings referenced by those documents are **not** part of this archive.

## License

[MIT](LICENSE). Not affiliated with, endorsed by, or sponsored by Etsy, Inc. "Etsy" is a trademark of Etsy, Inc., used here only to describe compatibility.
