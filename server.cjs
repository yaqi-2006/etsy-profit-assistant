'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const allowed = new Map([
  ['/',['index.html','text/html; charset=utf-8']],
  ['/index.html',['index.html','text/html; charset=utf-8']],
  ['/styles.css',['styles.css','text/css; charset=utf-8']],
  ['/core.js',['core.js','text/javascript; charset=utf-8']],
  ['/etsy.js',['etsy.js','text/javascript; charset=utf-8']],
  ['/demo.js',['demo.js','text/javascript; charset=utf-8']],
  ['/app.js',['app.js','text/javascript; charset=utf-8']],
  ['/etsy-profit-demo.html',['etsy-profit-demo.html','text/html; charset=utf-8']]
]);
// 只提供公开演示资源，不枚举目录、不接收上传、不读取任何用户文件。
const server=http.createServer((req,res)=>{
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const key=new URL(req.url,'http://127.0.0.1').pathname;
  const item=allowed.get(key);
  if (!item) {res.writeHead(404);res.end();return;}
  fs.readFile(path.join(__dirname,item[0]),(err,data)=>{
    if(err){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'});
    res.end(req.method==='HEAD'?undefined:data);
  });
});
server.on('error',err=>{console.error('本地演示服务无法启动：'+err.code);process.exitCode=1;});
// 使用随机空闲端口且只监听回环地址，避免与本机其他服务冲突。
server.listen(process.env.PORT?Number(process.env.PORT):0,'127.0.0.1',()=>console.log('本地演示已启动：http://127.0.0.1:'+server.address().port));
process.on('SIGINT',()=>server.close());
