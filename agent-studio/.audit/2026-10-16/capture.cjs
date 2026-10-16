const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('C:/Users/Bryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out = __dirname;
 const browser = await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page = await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
 const errors=[], steps=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/api/sessions/**',async route=>{
  const req=route.request();
  if(req.method()==='PUT'||req.method()==='DELETE') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'audit',name:'audit',count:0,ok:true})});
  return route.continue();
 });
 async function snap(name){
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});
  const state = await page.evaluate(()=>({url:location.href,text:document.body.innerText,scrollWidth:document.documentElement.scrollWidth,width:innerWidth}));
  steps.push({name,...state}); console.log(name);
 }
 await page.goto('http://localhost:8770/#live',{waitUntil:'domcontentloaded'});
 await page.locator('.agent img').first().waitFor();
 await page.waitForTimeout(1600);
 await snap('01-live-start');
 const restore=page.locator('.restore .btn').first();
 if(await restore.count()){
  await restore.click(); await page.locator('.msg').first().waitFor();
  await snap('02-conversation');
  await page.locator('.msg').first().click(); await page.waitForTimeout(300);
  await snap('03-decision-inspector');
  await page.locator('.drawer.open button[title="关闭"]').click();
  await page.locator('.msg').first().locator('button[title="重播"]').click();
  await page.waitForFunction(()=>window.__live.engine.current?.phase==='speaking',{timeout:15000});
  await page.waitForTimeout(600);
  await snap('04-speaking');
  await page.locator('.convo-h button[title="停止"]').click();
 }
 await page.locator('.tabs button[data-tab="system"]').click(); await page.waitForTimeout(500);
 await snap('05-system');
 await page.locator('.tabs button[data-tab="library"]').click(); await page.waitForTimeout(1200);
 await snap('06-assets');
 await page.locator('.tabs button[data-tab="live"]').click();
 await page.setViewportSize({width:420,height:900}); await page.waitForTimeout(600);
 await snap('07-mobile');
 fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({errors,steps},null,2));
 console.log(JSON.stringify({errors,steps:steps.map(s=>({name:s.name,width:s.width,scrollWidth:s.scrollWidth,textLength:s.text.length}))}));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
