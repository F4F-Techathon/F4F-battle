const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Bryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Bryan/AppData/Local/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.goto('http://127.0.0.1:5273/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.avatarStage?.state.ready,{timeout:30000}).catch(async e=>{console.error(await page.locator('body').innerText());await page.screenshot({path:'reports/p0-load-error.png',fullPage:true});await browser.close();throw e;});
 await page.waitForTimeout(800);
 const report={initial:await page.evaluate(()=>window.avatarStage.state)};
 assert.equal(report.initial.phase,0);assert.ok(report.initial.actors.every(a=>!a.visible));
 await page.screenshot({path:'reports/p0-map.png',fullPage:true});
 await page.locator('.rehearsal > summary').click();
 await page.locator('#expressions button[data-id=neutral]').click();await page.waitForTimeout(1000);
 await page.screenshot({path:'reports/p0-face-initial.png',fullPage:true});
 fs.writeFileSync('reports/p0-smoke.json',JSON.stringify({state:await page.evaluate(()=>window.avatarStage.state),errors},null,2));
 if(process.argv.includes('--smoke')){console.log(JSON.stringify({ok:true,errors}));await browser.close();return;}
 await page.click('#reset');
 await page.evaluate(async()=>{const script=await fetch('/scenarios/p0-roadshow.json').then(r=>r.json());window.__run=window.avatarStage.replay(script);});
 await page.waitForFunction(()=>window.avatarStage.state.phase===3&&window.avatarStage.state.speaking,{timeout:25000});
 await page.waitForTimeout(800);await page.screenshot({path:'reports/p0-speaking.png',fullPage:true});
 await page.waitForFunction(()=>window.avatarStage.state.phase===5,{timeout:45000});
 await page.waitForTimeout(800);await page.screenshot({path:'reports/p0-result.png',fullPage:true});
 report.result=await page.evaluate(()=>window.__run);
 report.complete=await page.evaluate(()=>window.avatarStage.state);
 assert.equal(report.result.ok,true);assert.equal(report.complete.winner,'cantonese_owner');assert.equal(report.complete.scene,'stage');
 assert.equal(report.complete.actors.filter(a=>a.visible).length,1);
 assert.deepEqual([...new Set(report.complete.events.filter(e=>e.type==='phase.changed').map(e=>e.phase))].sort(),[0,1,2,3,4,5]);
 assert.equal(report.complete.events.filter(e=>e.type==='actor.exited').length,2);
 await page.click('#reset');
 await page.evaluate(()=>{window.__filter=window.avatarStage.dispatch({type:'filter_done',restaurants:[{id:'sichuan',name:'川味小馆',pos:[.2,.6]},{id:'cantonese',name:'粤来茶楼',pos:[.5,.15]},{id:'french',name:'BONJOUR',pos:[.8,.6]}]});});
 await page.waitForTimeout(450);await page.click('#stop');report.cancelFilter=await page.evaluate(()=>window.__filter);assert.equal(report.cancelFilter.ok,false);
 await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.avatarStage.state.phase),0);
 await page.locator('#expressions button[data-id=smile]').click();
 report.expressions=[];
 for(const name of ['neutral','smile','smug','disdain','shocked','angry','embarrassed','overjoyed','disappointed']){
  await page.locator('#expressions button[data-id='+name+']').click();
  const actual=await page.evaluate(()=>window.avatarStage.state.actors[0].emotion);assert.equal(actual,name);report.expressions.push({name,actual});
 }
 report.shapes=[];
 for(const shape of ['X','A','B','C','D','E','F','G','H']){
  await page.locator('#visemes button[data-id='+shape+']').click();await page.waitForTimeout(50);
  const actual=await page.evaluate(()=>window.avatarStage.state.actors[0].mouthShape);assert.equal(actual,shape);report.shapes.push(actual);
 }
 await page.locator('#visemes button[data-id=auto]').click();
 await page.evaluate(()=>{window.__voice=window.avatarStage.dispatch({type:'utterance',speaker:'sichuan',text:'九种嘴型时间线测试',audio_url:'/audio/sichuan.wav',visemes:[{t:0,shape:'A'},{t:.3,shape:'F'},{t:.6,shape:'H'},{t:1.5,shape:'X'}],emotion:'angry'});});
 await page.waitForFunction(()=>window.avatarStage.state.actors[0].mouthShape==='H',{timeout:8000});report.timeline=await page.evaluate(()=>window.avatarStage.state);assert.equal(report.timeline.actors[0].emotion,'angry');
 await page.click('#stop');report.cancelSpeech=await page.evaluate(()=>window.__voice);assert.equal(report.cancelSpeech.ok,false);
 report.afterStop=await page.evaluate(()=>window.avatarStage.state);assert.equal(report.afterStop.speaking,null);assert.ok(report.afterStop.actors.every(a=>a.mouth===0));
 // A new session may reuse an old turn ID, even if that old turn was cancelled.
 await page.evaluate(()=>{window.__old=window.avatarStage.dispatch({type:'actor.speak',actorId:'sichuan_owner',turnId:'reused-turn',payload:{text:'旧会话',speech:{mode:'text-preview',estimatedDurationMs:8000}}});});
 await page.evaluate(()=>window.avatarStage.dispatch({type:'session.start',sessionId:'fresh-session',eventId:'fresh-start'}));
 await page.evaluate(()=>{window.__new=window.avatarStage.dispatch({type:'actor.speak',actorId:'sichuan_owner',turnId:'reused-turn',payload:{text:'新会话',speech:{mode:'text-preview',estimatedDurationMs:1800}}});});
 assert.equal(await page.evaluate(()=>window.avatarStage.state.speaking),'reused-turn');
 await page.click('#stop');await page.evaluate(()=>window.__new);report.sessionReuse=true;
 await page.setViewportSize({width:390,height:844});await page.click('#reset');await page.waitForTimeout(800);
 await page.screenshot({path:'reports/p0-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 report.errors=errors;assert.deepEqual(errors,[]);
 fs.writeFileSync('reports/p0-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,phases:[0,1,2,3,4,5],expressions:report.expressions.length,shapes:report.shapes.length,cancelFilter:report.cancelFilter,cancelSpeech:report.cancelSpeech,errors},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
