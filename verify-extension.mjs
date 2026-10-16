// 真正安装到隔离 Chrome 配置，触发工具栏动作并验证扩展页；仅用合成样例。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {launchBrowser,connect,wait,waitFor} from './tools/isolated-browser.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'qa','extension');fs.mkdirSync(out,{recursive:true});
const results=[],errors=[],remoteRequests=[];let page;
const record=name=>{results.push({name,status:'通过'});console.log('通过：'+name);};
const b=await launchBrowser({width:1600,height:1000});
try{
 const {id}=await b.browser.call('Extensions.loadUnpacked',{path:path.join(root,'dist-extension')});
 const installed=await b.browser.call('Extensions.getExtensions');
 assert.equal(installed.extensions.find(e=>e.id===id)?.enabled,true);record('Manifest V3 扩展在隔离 Chrome 中真实加载成功');
 // 安装返回不保证首次后台监听已经注册；只在真实监听就绪后触发一次动作。
 let workerTarget;for(let n=0;n<100;n++){workerTarget=(await b.tabs()).find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${id}/background.js`);if(workerTarget)break;await wait(100);}
 assert.ok(workerTarget,'扩展后台必须成功启动');const worker=await connect(workerTarget.webSocketDebuggerUrl);
 try{await waitFor(worker,'chrome.action.onClicked.hasListeners()');}finally{worker.close();}
 const tabTargets=await b.browser.call('Target.getTargets',{filter:[{type:'tab'},{exclude:true}]});
 const blankTab=tabTargets.targetInfos.find(t=>t.type==='tab'&&t.url==='about:blank');assert.ok(blankTab);
 await b.browser.call('Extensions.triggerAction',{id,targetId:blankTab.targetId});
 let target;for(let n=0;n<60;n++){target=(await b.tabs()).find(t=>t.type==='page'&&t.url===`chrome-extension://${id}/index.html`);if(target)break;await wait(100);}
 assert.ok(target,'工具栏动作必须实际打开扩展页');record('真实工具栏动作打开本地分析页，无需网站权限');
 page=await connect(target.webSocketDebuggerUrl);
 page.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 page.on('Network.requestWillBeSent',e=>{if(/^https?:/.test(e.request.url))remoteRequests.push(e.request.url);});
 await page.call('Runtime.enable');await page.call('Page.enable');await page.call('Network.enable');
 await page.call('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
 await page.call('Page.reload');await waitFor(page,"document.querySelectorAll('#orders-body [data-order]').length===5");
 const evalJS=page.evaluate;
 assert.equal(await evalJS('document.documentElement.lang'),'en');
 assert.equal(await evalJS("/[\\u3400-\\u9fff]/.test(document.body.innerText)"),false);
 assert.equal(await evalJS("[...document.scripts].every(s=>s.src.startsWith(location.origin))"),true);
 record('扩展内全英文界面正常运行，执行脚本全部本地外部资源');
 const row=id=>evalJS(`[...document.querySelectorAll('#orders-body tr')].find(r=>r.querySelector('[data-order]')?.dataset.order===${JSON.stringify(id)})?.innerText`);
 assert.match(await row('EP-1002'),/Needs inputs/);
 await evalJS(`document.querySelector('[data-order="EP-1002"]').click()`);
 assert.equal(await evalJS("document.getElementById('order-dialog').open"),true);
 await evalJS("document.getElementById('cost-shipping').value='4.50';document.getElementById('cost-packaging').value='0.50';document.getElementById('fees-reviewed').checked=true;document.getElementById('cost-form').requestSubmit()");
 assert.match(await row('EP-1002'),/10\.05/);assert.match(await row('EP-1002'),/Estimated contribution/);
 record('扩展中补成本与费用复核将 EP-1002 算为 $10.05 预计贡献');
 const detail=await page.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'order-costs.png'),Buffer.from(detail.data,'base64'));
 await evalJS("document.getElementById('close-dialog').click();document.getElementById('order-filter').value='negative';document.getElementById('order-filter').dispatchEvent(new Event('change'))");
 assert.equal(await evalJS("document.querySelectorAll('#orders-body [data-order]').length"),1);assert.match(await row('EP-1003'),/-\$2\.27/);
 record('亏损筛选保留 EP-1003，金额为 -$2.27');
 await evalJS("document.getElementById('order-filter').value='all';document.getElementById('order-filter').dispatchEvent(new Event('change'));document.getElementById('asof-date').value='2026-11-03';document.getElementById('period-form').requestSubmit()");
 assert.match(await row('EP-1001'),/17\.68/);record('扩展中的跨期退款与单文件核心口径相同');
 await evalJS("window.__downloads=[];const original=URL.createObjectURL;URL.createObjectURL=b=>{window.__downloads.push(b);return original(b)}");
 await b.browser.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(out,'downloads'),eventsEnabled:true});
 await evalJS("document.getElementById('export-report').click();document.getElementById('export-full').click()");
 const exports=await evalJS("Promise.all(window.__downloads.map(b=>b.text()))");assert.equal(exports.length,2);assert.match(exports[0],/17\.68/);assert.match(exports[1],/Source-net bridge/);assert.doesNotMatch(exports[1],/<script/i);
 const csvFile=path.join(out,'downloads','etsy-contribution-report.csv');const htmlFile=path.join(out,'downloads','etsy-analysis-report.html');
 for(let n=0;n<100&&(!fs.existsSync(csvFile)||!fs.existsSync(htmlFile));n++)await wait(100);
 assert.ok(fs.existsSync(csvFile)&&fs.existsSync(htmlFile),'两个主动下载必须真实落盘');
 record('CSV 与完整 HTML 报告由用户按钮触发真实下载，数据与当前状态一致');
 await evalJS("window.confirm=()=>true;document.getElementById('load-etsy-demo').click()");
 assert.equal(await evalJS("document.querySelectorAll('#native-rows tr').length"),10);assert.match(await evalJS("document.getElementById('native-kpis').innerText"),/14\.28/);assert.match(await evalJS("document.getElementById('native-kpis').innerText"),/Missing Net: 1/);
 record('扩展内月结样例保留 10 行，已知 Net $14.28 和 1 行未知金额');
 await evalJS("document.getElementById('native-view').scrollIntoView({block:'start'})");await wait(350);
 const native=await page.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'native-statement.png'),Buffer.from(native.data,'base64'));
 await page.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true);
 await evalJS("document.getElementById('load-demo').click()");assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true);
 const mobile=await page.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'mobile.png'),Buffer.from(mobile.data,'base64'));record('通用与月结视图在 390px 页面无横向溢出');
 await page.call('Page.reload');await waitFor(page,"document.querySelectorAll('#orders-body [data-order]').length===5");assert.match(await row('EP-1002'),/Needs inputs/);
 assert.equal(await evalJS('localStorage.length'),0);assert.equal(await evalJS('sessionStorage.length'),0);
 record('刷新后不保留手填财务数据，重新载入标明合成的默认案例');
 assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);record('扩展页测试过程无脚本异常且没有 HTTP/HTTPS 资源请求');
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({browser:b.version.Browser,extensionId:id,results,scriptErrors:errors,remoteRequests,scope:'隔离 Chrome，合成数据，本地未发布扩展；不等同真实 Etsy CSV 兼容验证'},null,2));
 console.log(`扩展浏览器验收通过，共 ${results.length} 项。`);
}finally{page?.close();await b.close();}
