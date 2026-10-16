'use strict';
const fs=require('node:fs');
const path=require('node:path');
// 合并本地资源，生成可双击的单文件；不下载或引入远程依赖。
const get=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
let page=get('index.html').replace('<link rel="stylesheet" href="styles.css">',()=>'<style>'+get('styles.css')+'</style>');
for(const name of ['core.js','etsy.js','demo.js','app.js']){
  const script=get(name).replace(/<\/script/gi,'<\\/script');
  page=page.replace('<script src="'+name+'"></script>',()=>'<script>'+script+'</script>');
}
fs.writeFileSync(path.join(__dirname,'etsy-profit-demo.html'),page,'utf8');
console.log('已生成可双击首版：'+path.join(__dirname,'etsy-profit-demo.html'));
// 发布目录只包含可公开的单文件，不包含测试配置、卖家文件或工作区其他内容。
const publish=path.join(__dirname,'publish');
fs.mkdirSync(publish,{recursive:true});
fs.writeFileSync(path.join(publish,'index.html'),page,'utf8');
console.log('已生成静态发布包：'+path.join(publish,'index.html'));

