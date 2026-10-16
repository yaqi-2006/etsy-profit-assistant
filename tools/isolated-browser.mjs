// 隔离浏览器仅用于本地合成样例验收，不读取日常浏览器配置。
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
export const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function connect(wsURL){
 const ws=new WebSocket(wsURL);await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no;});
 let seq=0;const pending=new Map();const listeners=new Map();
 ws.onmessage=ev=>{const d=JSON.parse(ev.data);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);clearTimeout(p.timer);d.error?p.no(new Error(d.error.message)):p.ok(d.result);}else if(d.method){for(const fn of listeners.get(d.method)||[])fn(d.params);}};
 const call=(method,params={})=>new Promise((ok,no)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);no(new Error('CDP 超时: '+method));},20000);pending.set(id,{ok,no,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
 return {call,evaluate,on:(name,fn)=>listeners.set(name,[...(listeners.get(name)||[]),fn]),close:()=>ws.close()};
}
export async function launchBrowser({width=1600,height=1000,headed=false}={}){
 const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/i,''));
 const profile=path.join(root,'browser-profiles','qa-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 const exe=[process.env.ETSY_DEMO_CHROME,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe')].filter(Boolean).find(p=>fs.existsSync(p))||'chrome';
 const child=spawn(exe,[...(headed?[]:['--headless=new']),'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-features=Translate,MediaRouter','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--user-data-dir='+profile,`--window-size=${width},${height}`,'about:blank'],{stdio:'ignore'});
 let launchError;child.on('error',e=>launchError=e);
 const active=path.join(profile,'DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(active);i++){if(launchError)throw launchError;await wait(100);}
 if(!fs.existsSync(active)){child.kill();throw new Error('隔离 Chrome 未就绪');}
 const port=Number(fs.readFileSync(active,'utf8').split('\n')[0]);
 const base=`http://127.0.0.1:${port}`;
 const version=await fetch(base+'/json/version').then(r=>r.json());
 const browser=await connect(version.webSocketDebuggerUrl);
 const tabs=()=>fetch(base+'/json/list').then(r=>r.json());
 const target=(await tabs()).find(t=>t.type==='page');
 const page=await connect(target.webSocketDebuggerUrl);
 await page.call('Page.enable');await page.call('Runtime.enable');await page.call('Network.enable');
 await page.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
 const protocol=()=>fetch(base+'/json/protocol').then(r=>r.json());
 return {browser,page,profile,version,base,target,tabs,protocol,close:async()=>{page.close();try{await browser.call('Browser.close');}catch{}browser.close();if(child.exitCode===null)child.kill();}};
}
export async function waitFor(page,expression,budget=10000){const end=Date.now()+budget;while(Date.now()<end){try{if(await page.evaluate(expression))return;}catch{}await wait(100);}throw new Error('等待页面条件超时：'+expression);}
