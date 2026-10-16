// 对真实页面的新界面行为做定点回归，不修改应用状态模型或核心接口。
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {launchBrowser,waitFor} from './tools/isolated-browser.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));const output=path.join(root,'qa','ui-review');fs.mkdirSync(output,{recursive:true});
const b=await launchBrowser({width:1600,height:1000});const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'通过'});console.log('通过：'+name);}catch(e){results.push({name,status:'失败',error:e.message});console.error('失败：'+name+'\n'+e.message);process.exitCode=1;}}
try{
 await b.page.call('Page.navigate',{url:new URL('./index.html',import.meta.url).href});await waitFor(b.page,"document.querySelectorAll('#orders-body tr').length===5");const e=b.page.evaluate;
 async function importCSV(csv){await e("window.confirm=()=>true;document.getElementById('clear-data').click();document.getElementById('start-date').value='2026-10-01';document.getElementById('end-date').value='2026-10-31';document.getElementById('asof-date').value='2026-11-03';document.getElementById('period-form').requestSubmit();document.getElementById('import-panel').open=true");await e(`document.getElementById('csv-text').value=${JSON.stringify(csv)};document.getElementById('csv-text').dispatchEvent(new Event('input'));document.getElementById('preview-csv').click()`);await waitFor(b.page,"!document.getElementById('mapping-area').classList.contains('hidden')");await e("document.getElementById('confirm-import').checked=true;document.getElementById('commit-csv').click()");}
 const header='event_id,date,type,amount,order_id,currency\n';
 await check('跨截止日订单收入合计超出安全整数时仍保留精确美分',async()=>{
  await importCSV(header+'a,2026-10-01,sale,0.01,A,USD\nb,2026-10-01,sale,0.01,B,USD\na2,2026-11-01,sale,90071992547409.89,A,USD\nb2,2026-11-01,sale,0.02,B,USD\n');
  assert.match(await e("document.getElementById('kpi-grid').innerText"),/90,071,992,547,409\.93/);
 });
 await check('金额桥接中间越界后相消保持精确的 $0.02',async()=>{
  await importCSV(header+'old,2026-09-01,sale,0.01,B,USD\na,2026-10-01,sale,90071992547409.91,A,USD\ncredit,2026-10-02,fee_credit,0.02,B,USD\nexpense,2026-10-03,expense,-90071992547409.91,,USD\n');
  assert.match(await e("document.getElementById('bridge-summary').innerText"),/Bucket total \$0\.02 = imported event net \$0\.02/);
 });
 await check('原生月结单导航只指向可见区块',async()=>{
  await e("document.getElementById('load-etsy-demo').click()");
  const links=await e("[...document.querySelectorAll('.subnav a')].filter(a=>a.getClientRects().length).map(a=>({text:a.textContent,targetVisible:!!document.querySelector(a.getAttribute('href'))?.getClientRects().length}))");
  assert.ok(links.length>=2);assert.deepEqual(links.filter(x=>!x.targetVisible),[]);
 });
 await check('成本输入先于来源详情，并保留可展开来源',async()=>{
  await e("document.getElementById('load-demo').click();document.querySelector('[data-order=\"EP-1002\"]').click()");
  const layout=await e("(()=>{const dialog=document.getElementById('order-dialog');const source=dialog.querySelector('details');const shipping=document.getElementById('cost-shipping');return {hasDisclosure:!!source,closed:source?!source.open:false,shippingTop:shipping.getBoundingClientRect().top,dialogBottom:dialog.getBoundingClientRect().bottom,dialogWidth:dialog.clientWidth};})()");
  assert.ok(layout.hasDisclosure&&layout.closed);assert.ok(layout.shippingTop<layout.dialogBottom);
  const img=await b.page.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'dialog.png'),Buffer.from(img.data,'base64'));
 });
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({browser:b.version.Browser,results},null,2));
}finally{await b.close();}
