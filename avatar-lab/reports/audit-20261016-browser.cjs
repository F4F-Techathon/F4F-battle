const fs = require('node:fs');
const { chromium } = require('C:/Users/Bryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Bryan/AppData/Local/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5273/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.avatarStage?.state.ready,{timeout:30000});
 const report={url:page.url(),initial:await page.evaluate(()=>window.avatarStage.state),errors};
 await page.screenshot({path:'reports/audit-20261016-initial.png',fullPage:true});
 await page.click('#demo');
 await page.waitForTimeout(700);
 report.spawn=await page.evaluate(()=>window.avatarStage.state);
 await page.screenshot({path:'reports/audit-20261016-spawn.png',fullPage:true});
 await page.waitForFunction(()=>window.avatarStage.state.speaking!==null,{timeout:15000});
 await page.waitForTimeout(800);
 report.speaking=await page.evaluate(()=>window.avatarStage.state);
 await page.screenshot({path:'reports/audit-20261016-speaking.png',fullPage:true});
 await page.waitForFunction(()=>!document.querySelector('#demo').disabled,{timeout:45000});
 report.afterDemo=await page.evaluate(()=>window.avatarStage.state);
 report.specEvents=[];
 for(const type of ['filter_done','utterance','user_input','user_choice']){
  report.specEvents.push({type,result:await page.evaluate(type=>window.avatarStage.dispatch({type,eventId:'audit-'+type,sessionId:window.avatarStage.state.sessionId,seq:1000,restaurants:[],speaker:'sichuan',text:'测试',winner:'cantonese'}),type)});
 }
 report.expressions=[];
 let seq=1001;
 for(const name of ['neutral','smile','smug','disdain','shocked','angry','embarrassed','overjoyed','disappointed']){
  await page.evaluate(({name,seq})=>window.avatarStage.dispatch({type:'actor.react',eventId:'audit-expression-'+name,sessionId:window.avatarStage.state.sessionId,seq,actorId:'sichuan_owner',payload:{emotion:{name},gesture:'idle'}}),{name,seq:seq++});
  report.expressions.push({requested:name,actual:await page.evaluate(()=>window.avatarStage.state.actors[0].emotion)});
 }
 await page.evaluate(seq=>window.avatarStage.dispatch({type:'selection.confirm',eventId:'audit-winner',sessionId:window.avatarStage.state.sessionId,seq,actorId:'cantonese_owner',payload:{}}),seq++);
 await page.waitForTimeout(350);
 report.selection=await page.evaluate(()=>window.avatarStage.state);
 await page.screenshot({path:'reports/audit-20261016-selection.png',fullPage:true});
 await page.click('#reset');
 await page.click('#audio');await page.waitForTimeout(700);await page.click('#stop');
 report.cancel=await page.evaluate(()=>window.avatarStage.state);
 report.errors=errors;
 fs.writeFileSync('reports/audit-20261016-browser.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({ready:report.initial.ready,actors:report.initial.actors.map(a=>({id:a.id,bones:a.bones,clips:a.clips,morphs:a.morphs})),demoEvents:report.afterDemo.events.map(e=>e.type),specEvents:report.specEvents,expressions:report.expressions,selection:report.selection.actors.map(a=>({id:a.id,clip:a.clip,emotion:a.emotion})),cancel:{speaking:report.cancel.speaking,mouths:report.cancel.actors.map(a=>a.mouth)},errors},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

