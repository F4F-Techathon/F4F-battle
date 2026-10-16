const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Bryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Bryan/AppData/Local/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1500},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5273/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.avatarStage?.state.ready,{timeout:30000});
 const report={faces:[],files:[],errors};
 for(const id of ['sichuan_owner','cantonese_owner','french_chef']){
  for(const angle of [0,45,80]){
   await page.evaluate(({id,angle})=>window.avatarStage.inspectFace(id,angle),{id,angle});await page.waitForTimeout(200);
   const r=await page.locator('#viewport').boundingBox();const edge=Math.min(500,r.width,r.height);
   await page.screenshot({path:`reports/face-${id}-${angle}.png`,clip:{x:r.x+(r.width-edge)/2,y:r.y+(r.height-edge)/2,width:edge,height:edge}});
  }
  const a=await page.evaluate(id=>window.avatarStage.state.actors.find(a=>a.id===id),id);
  assert.ok(a.faceSurfaceVertices>100);assert.ok(a.faceSurfaceDepth>.02,'Face must conform to a curved surface, not a flat plane');report.faces.push(a);
 }
 const files=await page.evaluate(()=>window.avatarStage.exportAssets());
 const root=process.cwd()+path.sep;
 for(const file of files){const dest=path.resolve(file.path);assert.ok(dest.startsWith(root));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,file.encoding==='base64'?Buffer.from(file.content,'base64'):file.content,'utf8');report.files.push({path:file.path,bytes:fs.statSync(dest).size});}
 assert.deepEqual(errors,[]);fs.writeFileSync('reports/face-surface-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({faces:report.faces.map(a=>({id:a.id,vertices:a.faceSurfaceVertices,depth:a.faceSurfaceDepth})),files:report.files,errors},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
