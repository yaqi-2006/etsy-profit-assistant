'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// 从匿名已发布且哈希核验的首版构建仅修复两处汇总，不读取或覆盖正在改动的新界面。
async function main() {
  const response = await fetch('https://profit-pilot-etsy-demo.netlify.app/');
  assert.equal(response.status, 200);
  let page = await response.text();
  assert.equal(/<script\b[^>]*\bsrc=/i.test(page), false);
  page = page.replace(/<!-- This site is hosted on Netlify\.[\s\S]*?Netlify hosting facts for this site: static\/SSR served via Netlify Edge\. -->\n/, '');
  assert.equal(crypto.createHash('sha256').update(page).digest('hex'), 'c080b764f0460c07f069981b1c30f175861b2eb89454410ab24c40f58a973da9');
  for (const [before, after] of [
    ['const allOrderRevenue=orders.reduce((s,o)=>s+o.revenue,0);', 'const allOrderRevenue=orders.reduce((s,o)=>s+BigInt(o.revenue),0n);'],
    ['const bridgeTotal=bridge.reduce((s,b)=>s+b.amount,0);', 'const bridgeTotal=bridge.reduce((s,b)=>s+BigInt(b.amount),0n);']
  ]) {
    assert.equal(page.split(before).length, 2, '修复点必须唯一');
    page = page.replace(before, after);
  }
  const output = path.join(__dirname, 'release-public');
  const target = path.join(output, 'index.html');
  assert.equal(fs.existsSync(target), false, '不覆盖既有发布文件');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(target, page, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ path: target, bytes: Buffer.byteLength(page), sha256: crypto.createHash('sha256').update(page).digest('hex'), changes: '仅收入KPI与桥接汇总的BigInt求和', originalBuild: 'C080B764F0460C07F069981B1C30F175861B2EB89454410AB24C40F58A973DA9' }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
