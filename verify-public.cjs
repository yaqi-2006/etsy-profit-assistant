'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const localMode = process.argv.includes('--local');
const publicURL = 'https://profit-pilot-etsy-demo.netlify.app/';
const targetURL = localMode ? require('node:url').pathToFileURL(path.join(__dirname, 'release-public', 'index.html')).href : publicURL;
const outputDir = path.join(__dirname, localMode ? 'release-check' : 'public-verification');

// 复用已读取的集成测试，只切换入口和独立产物，不覆盖本地新界面或本地截图。
async function main() {
  const response = localMode ? null : await fetch(publicURL, { redirect: 'follow' });
  if (!localMode) {
    assert.equal(response.status, 200, '公开入口必须匿名返回 200');
    assert.equal(response.url, publicURL, '不能跳转到登录或私有预览');
  }
  const bytes = localMode ? fs.readFileSync(path.join(__dirname, 'release-public', 'index.html')) : Buffer.from(await response.arrayBuffer());
  const html = bytes.toString('utf8');
  assert.equal(/<script\b[^>]*\bsrc=/i.test(html), false, '不允许托管注入外部脚本');
  const comment = /<!-- This site is hosted on Netlify\.[\s\S]*?Netlify hosting facts for this site: static\/SSR served via Netlify Edge\. -->\n/;
  const restored = html.replace(comment, '');
  const originalHash = crypto.createHash('sha256').update(restored).digest('hex');
  assert.equal(originalHash, '3513662b311a92692b4420ff07e4eaf30cf8688b3c283915ce84abadefe7c7ac', '公开网页必须是已审核上传包（允许托管说明注释）');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'deployment.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), url: targetURL, anonymous: !localMode,
    status: response?.status ?? null, bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    reviewedBuildSha256: originalHash, externalScripts: [],
    productionVisibility: 'public', plan: 'Free',
    accountPlanEvidence: '已在账户 Billing 页面核对 Free、$0、300 credits/月、无超额收费',
    sourceVersion: '首版构建仅修复两处汇总精度，100715字节；不包含正在改动的本地新界面',
  }, null, 2));

  const harnessPath = path.join(__dirname, 'verify-browser.cjs');
  let source = fs.readFileSync(harnessPath, 'utf8');
  function change(before, after) {
    assert.equal(source.split(before).length, 2, '复用测试的替换点必须唯一：' + before);
    source = source.replace(before, after);
  }
  const resultFolder = localMode ? 'release-check' : 'public-verification';
  change("const profile=path.join(root,'.verify-browser-'+Date.now());", "const profile=path.join(root," + JSON.stringify(resultFolder) + ",'profile-'+Date.now());");
  change(source.split('\n').find(line => line.trimStart().startsWith('const fileURL=')).trim(), 'const fileURL=' + JSON.stringify(targetURL) + ';');
  change("await cdp('Page.navigate',{url:fileURL});", "await cdp('Network.setCacheDisabled',{cacheDisabled:true});const navigation=await cdp('Page.navigate',{url:fileURL});assert.equal(navigation.errorText,undefined);");
  change("record('英文离线单文件无中文界面残留，$22.68 示例与亏损状态正确');", "record(" + JSON.stringify((localMode ? '本地候选发布包' : '匿名公开HTTPS') + '英文页面正常，$22.68 示例与亏损状态正确') + ");");
  change("path.join(root,'native-preview.png')", "path.join(root," + JSON.stringify(resultFolder) + ",'native-preview.png')");
  change("path.join(root,'preview.png')", "path.join(root," + JSON.stringify(resultFolder) + ",'preview.png')");
  change("assert.ok(requests.every(url=>url.startsWith('file:')||url.startsWith('data:')||url==='about:blank'),JSON.stringify(requests));", `
  assert.ok(requests.every(url=>url===fileURL||url===fileURL+'favicon.ico'||url.startsWith('data:')||url==='about:blank'),JSON.stringify(requests));
  assert.equal(await evaluate("document.querySelectorAll('script[src]').length"),0);
  assert.deepEqual(await evaluate("({local:localStorage.length,session:sessionStorage.length})"),{local:0,session:0});
  assert.deepEqual((await cdp('Network.getCookies')).cookies,[]);
  const primaryResponses=responses.filter(item=>item.url===fileURL);
  if(!fileURL.startsWith('file:'))assert.ok(primaryResponses.some(item=>item.status===200),'浏览器也必须取得公开200响应');
  await cdp('Page.reload',{ignoreCache:true});
  for(let i=0;i<60;i++){if(await evaluate("Boolean(document.getElementById('orders-body')?.children.length)"))break;await wait(100);}
  assert.match(await row('EP-1002'),/Needs inputs/);
  assert.equal(await evaluate("document.getElementById('native-view').classList.contains('hidden')"),true);
  record('刷新后会话成本与导入清空；没有默认持久化');
  `);
  change(`  await evaluate("document.getElementById('load-demo').click()");\n  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});`, `
  await evaluate("document.getElementById('load-demo').click();document.getElementById('clear-data').click();document.getElementById('asof-date').value='2026-11-03';document.getElementById('period-form').requestSubmit()");
  await pasteCSV(prefix+'a0,2026-10-01,sale,0,A,USD\\n'+'b0,2026-10-02,sale,0,B,USD\\n'+'c0,2026-10-03,sale,0,C,USD\\n'+'a1,2026-11-01,sale,90071992547409.91,A,USD\\n'+'b1,2026-11-01,sale,0.02,B,USD\\n'+'c1,2026-11-01,refund,-90071992547409.91,C,USD\\n');
  assert.match(await evaluate("document.getElementById('kpi-grid').innerText"),/\\$0\\.02 revenue across ALL orders/);
  await evaluate("document.getElementById('clear-data').click()");
  await pasteCSV(prefix+'current,2026-10-01,sale,90071992547409.91,A,USD\\n'+'previous,2026-09-01,sale,0,B,USD\\n'+'credit,2026-10-02,fee_credit,0.02,B,USD\\n'+'expense,2026-10-03,expense,-90071992547409.91,,USD\\n');
  assert.match(await evaluate("document.getElementById('bridge-summary').innerText"),/Bucket total \\$0\\.02 = imported event net \\$0\\.02/);
  record('订单收入KPI和金额桥接在极端正负相消后均保留精确两分');
  await evaluate("document.getElementById('load-demo').click()");
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  `);
  change("const errors=[];const requests=[];", "const errors=[];const requests=[];const responses=[];");
  change("requests.push(data.params.request.url);", "requests.push(data.params.request.url);}else if(data.method==='Network.responseReceived'){responses.push({url:data.params.response.url,status:data.params.response.status});");
  change("record('无脚本异常或远程资源请求；可断网使用');", "assert.deepEqual(errors,[]);record('除HTML与浏览器自动favicon请求外，无脚本／资源／上传请求、Cookie或默认存储');");
  change("path.join(root,'browser-verification.json')", "path.join(root," + JSON.stringify(resultFolder) + ",'browser-verification.json')");
  change("urlMode:'file 单文件离线'", "urlMode:" + JSON.stringify(localMode ? '本地候选发布包' : '匿名公开HTTPS') + ",url:fileURL,anonymous:" + !localMode + ",httpResponses:responses");
  change("remoteRequests:requests.filter(url=>!url.startsWith('file:')&&!url.startsWith('data:')&&url!=='about:blank')", "requests,unexpectedRequests:requests.filter(url=>url!==fileURL&&url!==fileURL+'favicon.ico'&&!url.startsWith('data:')&&url!=='about:blank')");
  const compiled = new Module(harnessPath, module);
  compiled.filename = harnessPath;
  compiled.paths = module.paths;
  compiled._compile(source, harnessPath);
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
