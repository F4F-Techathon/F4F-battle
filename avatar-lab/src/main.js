import './style.css';
import './story.css';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EventGate} from './events.js';
import {IDS,EMOTIONS,SHAPES,RESTAURANTS,DEMO_LINES,normalizeEvent,emotionName,shapeAt,normalizeVisemes,followup} from './story.js';
import {Face,loadFaceAtlas} from './faces.js';
import {atlasSvg} from './face-art.js';
import {createSet,mapPosition} from './set.js';
import {ACTIONS,addMotions} from './motions.js';

const $=s=>document.querySelector(s);
const cast=[
 {id:IDS[0],name:'川味老板娘',restaurant:'川味小馆',tag:'热情直球 · 麻辣有主张',ref:'sichuan',color:0xc8402f,pos:RESTAURANTS[0].pos,slot:[-1.55,.085,0],prop:'ladle'},
 {id:IDS[1],name:'粤菜老板',restaurant:'粤来茶楼',tag:'温润从容 · 一盅好滋味',ref:'cantonese',color:0x2f7d6b,pos:RESTAURANTS[1].pos,slot:[0,.085,-.12],prop:'teapot'},
 {id:IDS[2],name:'法式厨师长',restaurant:'BONJOUR',tag:'优雅俏皮 · 浪漫有讲究',ref:'french',color:0x2b3a67,pos:RESTAURANTS[2].pos,slot:[1.55,.085,0],prop:'whisk'},
];
const phaseNames=['说说想吃什么','筛选与汇合','主理人亮相','推销与拆台','追问与比较','今晚的选择'];
let selected=0,ready=false,seq=0,serial=0,token=0,speech=null,context=null,analyser=null,signal=null;
let phase=0,winner=null,cameraMove=null,filterStart=null,last=performance.now(),fps=0,frameCount=0,statTime=last;
const gate=new EventGate(),actors=[],events=[],waiters=new Set();
const status=t=>{$('#stage-status').textContent=t;};
const emit=(type,detail={})=>{const e={type,sessionId:gate.sessionId,...detail};events.push(e);if(events.length>300)events.shift();window.dispatchEvent(new CustomEvent('avatar-stage',{detail:e}));};
const actor=id=>actors.find(a=>a.config.id===id);

const scene=new T.Scene();scene.background=new T.Color('#F6EFE4');scene.fog=new T.Fog('#F6EFE4',13,28);
const camera=new T.PerspectiveCamera(35,1,.05,80);camera.position.set(0,7.4,8.5);
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;$('#viewport').prepend(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,-.6);controls.enableDamping=true;controls.minDistance=2.5;controls.maxDistance=14;controls.maxPolarAngle=Math.PI*.49;controls.enablePan=false;
scene.add(new T.HemisphereLight(0xfff8ed,0x9a9f9b,1.3));
const key=new T.DirectionalLight(0xfff3df,1.6);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-5});key.shadow.normalBias=.03;scene.add(key);
const fill=new T.DirectionalLight(0xe3edf7,.6);fill.position.set(4,4,-3);scene.add(fill);
const set=createSet(scene,cast);

function setPhase(n){
 const changed=phase!==n;phase=n;$('#phase-name').textContent=phaseNames[n];
 document.querySelectorAll('#steps span').forEach((el,i)=>{el.classList.toggle('current',i===n);el.classList.toggle('done',i<n);el.setAttribute('aria-current',i===n?'step':'false');});
 $('#request').hidden=n!==0;$('#decision').hidden=![3,4,5].includes(n);$('#followup-form').hidden=n===5;$('#choose').hidden=n===5;
 $('#demo').textContent=n===0?'开始一场小辩论 ↗':'重新演示 ↻';if(changed)emit('phase.changed',{phase:n,name:phaseNames[n]});
}
function wait(ms,mine=token){if(mine!==token)return Promise.resolve(false);return new Promise(resolve=>{const w={timer:null,finish:value=>{clearTimeout(w.timer);waiters.delete(w);resolve(value);}};w.timer=setTimeout(()=>w.finish(mine===token),ms);waiters.add(w);});}
function aim(position,target,duration=.8){
 cameraMove?.resolve?.(false);controls.enabled=false;
 return new Promise(resolve=>{cameraMove={from:camera.position.clone(),to:new T.Vector3(...position),targetFrom:controls.target.clone(),targetTo:new T.Vector3(...target),start:performance.now(),duration:duration*1000,resolve};});
}
function stageCamera(focus,closeup=false){controls.minDistance=2.5;const x=focus?.root.position.x??0,fit=4.9/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.aspect),z=closeup?5.8:Math.max(focus?6.5:7.8,fit);return aim([x*(closeup?.7:.2),2.35,z],[x*(closeup?.8:.3),1.01,0],.75);}
function play(a,name,loop=['idle','run','listen','speakA','speakB'].includes(name)){
 if(!a)return;const actual=a.actions[name]?name:'idle',next=a.actions[actual];if(a.current===next&&loop)return;
 a.current?.fadeOut(.2);next.reset().setLoop(loop?T.LoopRepeat:T.LoopOnce,loop?Infinity:1);next.clampWhenFinished=!loop;next.enabled=true;next.setEffectiveWeight(1).setEffectiveTimeScale(1);next.fadeIn(.2).play();a.current=next;a.clip=actual;
}
function emotion(a,name='neutral'){if(!a)return;a.emotion=emotionName(name);if(!EMOTIONS[a.emotion])a.emotion='neutral';a.face.setExpression(a.emotion);a.expressionAt=performance.now();}
function bubble(a,text){if(!a)return;a.fullText=text;a.bubble.querySelector('span').textContent='';a.bubble.classList.toggle('visible',!!text);a.bubble.setAttribute('aria-hidden',String(!text));}
function select(i){
 selected=i;document.querySelectorAll('.actor-card').forEach((b,n)=>{b.classList.toggle('active',n===i);b.setAttribute('aria-pressed',String(n===i));});$('#dialogue').value=DEMO_LINES[i].text;
 if($('#solo').checked&&set.stage.visible)actors.forEach((a,n)=>a.root.visible=n===i);
 $('#choose').textContent='今晚选 '+cast[i].restaurant;refresh();
}
function refresh(){
 const a=actors[selected];if(!a)return;
 document.querySelectorAll('#actions button').forEach(b=>b.classList.toggle('active',b.dataset.id===a.clip));document.querySelectorAll('#expressions button').forEach(b=>b.classList.toggle('active',b.dataset.id===a.emotion));document.querySelectorAll('#visemes button').forEach(b=>b.classList.toggle('active',b.dataset.id===(a.face.manual??'auto')));
}
function stopSpeech(reason='cancelled'){
 if(!speech)return;const s=speech;speech=null;clearTimeout(s.timer);s.audio?.pause();s.source?.disconnect();if(s.audio){s.audio.onended=s.audio.onerror=null;s.audio.removeAttribute('src');s.audio.load();}
 s.actor.mouth=0;s.actor.mouthShape=null;bubble(s.actor,'');actors.forEach(a=>{a.lookTarget=null;play(a,'idle');});$('#caption').classList.remove('visible');$('#voice-mode').textContent='文本不动嘴 · 音频驱动口型';
 emit(reason==='ended'?'speech.ended':'speech.cancelled',{actorId:s.actor.config.id,turnId:s.turnId});s.resolve({ok:reason==='ended',...(reason==='ended'?{}:{reason})});
}
function cancelAll(markCancelled=true){
 token++;if(speech&&markCancelled)gate.cancelled.add(speech.turnId);stopSpeech();for(const w of [...waiters])w.finish(false);cameraMove?.resolve?.(false);cameraMove=null;controls.enabled=true;filterStart=null;
 actors.forEach(a=>{a.move?.resolve(false);a.move=null;a.jump=null;a.root.scale.setScalar(1);a.mouth=0;a.mouthShape=null;a.lookTarget=null;a.face.manual=null;bubble(a,'');play(a,'idle');});$('#demo').disabled=false;
}
function reset(markCancelled=true){
 cancelAll(markCancelled);winner=null;set.map.visible=true;set.stage.visible=false;set.reset();set.plates.forEach(p=>p.visible=false);actors.forEach(a=>{a.root.visible=false;a.root.rotation.set(0,0,0);emotion(a);});$('#solo').checked=false;$('#result').hidden=true;$('#caption').classList.remove('visible');setPhase(0);select(0);aim([0,8.5,11],[0,.65,-.6],.7);status('说说今晚想吃什么，三位主理人等你开场。');
}
function move(a,to,duration=1.5,{curve=true,exit=false}={}){
 a.move?.resolve(false);return new Promise(resolve=>{const from=a.root.position.clone(),end=new T.Vector3(...to),mid=from.clone().lerp(end,.5);mid.x+=(a.config.id===IDS[0]?-.35:.35);a.move={curve:curve?new T.CatmullRomCurve3([from,mid,end]):null,from,to:end,start:performance.now(),duration:duration*1000,resolve,exit};play(a,'run');});
}
async function filterDone(e){
 cancelAll();const mine=token;winner=null;$('#solo').checked=false;$('#result').hidden=true;set.map.visible=true;set.stage.visible=false;set.plates.forEach(p=>p.visible=false);actors.forEach(a=>{a.root.visible=false;emotion(a);});
 setPhase(1);set.select(e.restaurants);filterStart=performance.now();status('留下三家不同的选择，主理人正赶来汇合。');aim([0,7.5,9.8],[0,.6,-.5],1);
 if(!await wait(650,mine))return {ok:false,reason:'cancelled'};
 const arrivals=actors.map(async(a,i)=>{
  if(!await wait(i*160,mine))return false;
  const r=e.restaurants.find(r=>r.id===a.config.id);a.restaurant=r.name;a.root.position.copy(mapPosition(r.pos));a.root.position.z+=.42;a.root.position.y=set.environment.ground;a.root.visible=true;a.root.rotation.y=0;a.jump={start:performance.now(),base:a.root.position.y};play(a,'emerge');
  if(!await wait(750,mine))return false;a.jump=null;a.root.scale.setScalar(1);a.root.position.y=set.environment.ground;return move(a,[(i-1)*.68,set.environment.ground,1.05],1.45);
 });
 const arrived=await Promise.all(arrivals);if(mine!==token||arrived.some(v=>!v))return {ok:false,reason:'cancelled'};emit('actors.gathered');if(!await wait(200,mine))return {ok:false,reason:'cancelled'};
 setPhase(2);set.map.visible=false;set.stage.visible=true;actors.forEach(a=>{a.root.position.fromArray(a.config.slot);a.root.rotation.y=0;play(a,'idle');});if(!await stageCamera())return {ok:false,reason:'cancelled'};
 for(let i=0;i<actors.length;i++){const a=actors[i];select(i);set.plates[i].visible=true;emotion(a,'smile');play(a,'signature');status(a.config.name+' · '+a.restaurant);emit('actor.introduced',{actorId:a.config.id});if(!await wait(1400,mine))return {ok:false,reason:'cancelled'};}
 actors.forEach(a=>{play(a,'idle');emotion(a);});setPhase(3);status('三位已亮相，听听他们各自的主张。');emit('stage.ready');return {ok:true};
}
function speak(a,e){
 if(speech){gate.cancelled.add(speech.turnId);stopSpeech();}
 const {text,gesture='speakA',emotion:em={name:'smile'},speech:sp={mode:'text-preview'}}=e.payload;const target=actor(e.target),reactions=e.reactions??{};
 actors.forEach(listener=>{listener.face.manual=null;if(listener!==a){emotion(listener,reactions[listener.config.id]??'neutral');listener.lookTarget=a;play(listener,reactions[listener.config.id]==='shocked'?'recoil':reactions[listener.config.id]==='angry'?'stomp':'listen');}});
 a.lookTarget=target??null;emotion(a,em.name);play(a,gesture);bubble(a,text);$('#caption').textContent=a.config.name+'：'+text;$('#caption').classList.add('visible');status(a.config.name+' · 发言中');stageCamera(a);
 return new Promise(resolve=>{
  const s={actor:a,turnId:e.turnId,resolve,audio:null,text,startedAt:performance.now(),duration:T.MathUtils.clamp(sp.estimatedDurationMs??text.length*115,1800,12000),timeline:normalizeVisemes(sp,sp.visemes)};speech=s;
  if(sp.mode==='audio'){
   $('#voice-mode').textContent=s.timeline.length?'九嘴型时间线 · 音频时钟':'音量兜底 · X / B / C / D';
   try{context??=new AudioContext();context.resume();if(!analyser){analyser=context.createAnalyser();analyser.fftSize=256;analyser.connect(context.destination);signal=new Uint8Array(256);}const audio=new Audio(sp.audioUrl);s.audio=audio;s.source=context.createMediaElementSource(audio);s.source.connect(analyser);
    audio.onended=()=>{if(speech===s){stopSpeech('ended');status('这一轮说完了。');}};
    const fail=()=>{if(speech===s){emit('audio.failed',{actorId:a.config.id,turnId:e.turnId});stopSpeech('audio-failed');status('音频未能播放，可以用文字排练继续。');}};
    audio.onerror=fail;audio.play().then(()=>{if(speech===s){s.startedAt=performance.now();emit('speech.started',{actorId:a.config.id,turnId:e.turnId});}}).catch(fail);s.timer=setTimeout(()=>{if(speech===s)fail();},120000);
   }catch{stopSpeech('audio-failed');}
  }else{$('#voice-mode').textContent='文字排练 · 表情嘴保持，不模拟发声';emit('speech.started',{actorId:a.config.id,turnId:e.turnId});s.timer=setTimeout(()=>{if(speech===s)stopSpeech('ended');},s.duration);}
 });
}
async function choose(id){
 cancelAll();const mine=token;winner=id;$('#solo').checked=false;setPhase(5);const chosen=actor(id);
 actors.forEach(a=>{a.root.visible=true;a.root.position.fromArray(a.config.slot);a.root.rotation.y=0;emotion(a,a===chosen?'overjoyed':'disappointed');play(a,a===chosen?'celebrate':'disappointed');});
 $('#result').hidden=false;$('#result strong').textContent='今晚，就选 '+(chosen.restaurant??chosen.config.restaurant);$('#result p').textContent='这是你的选择。随时可以重新开场，换一个在意的条件。';status('今晚，就选 '+chosen.config.name);emit('user.selected',{actorId:id});await stageCamera(chosen,true);
 if(!await wait(1800,mine))return {ok:false,reason:'cancelled'};const losers=actors.filter(a=>a!==chosen);losers.forEach(a=>play(a,'wave'));if(!await wait(650,mine))return {ok:false,reason:'cancelled'};
 await Promise.all(losers.map(a=>move(a,[Math.sign(a.root.position.x-chosen.root.position.x||1)*3.6,.085,-.6],1.5,{exit:true})));
 if(mine!==token)return {ok:false,reason:'cancelled'};await stageCamera();if(mine!==token)return {ok:false,reason:'cancelled'};emit('story.completed',{winner:id});return {ok:true};
}
async function dispatch(raw){
 if(!ready)return {ok:false,reason:'assets-not-ready'};const next=Math.max(seq,gate.lastSeq)+1;
 let e;try{e=normalizeEvent(raw,{version:'0.2',sessionId:gate.sessionId,eventId:'local-'+(++serial),seq:next});}catch{return {ok:false,reason:'invalid-event'};}if(!e)return {ok:false,reason:'invalid-event'};
 if(['utterance','user_input','user_choice'].includes(e.type)&&![3,4,5].includes(phase))return {ok:false,reason:'stage-not-ready'};
 if(['user_input','utterance'].includes(e.type)&&phase===5)return {ok:false,reason:'selection-finished'};
 if(e.type==='actor.move'){const p=e.payload?.position;if(!Array.isArray(p)||p.length!==3||!p.every(n=>Number.isFinite(n)&&Math.abs(n)<=5))return {ok:false,reason:'invalid-position'};}
 const accepted=gate.accept(e);if(!accepted.ok)return accepted;seq=Math.max(seq,e.seq??0);const a=actor(e.actorId);
 if(e.type==='session.start'||e.type==='session.reset'){reset(false);return {ok:true};}
 if(e.type==='filter_done')return filterDone(e);if(e.type==='actors.spawn')return filterDone({...e,restaurants:RESTAURANTS});
 if(e.type==='utterance'){
  setPhase(3);select(IDS.indexOf(e.speaker));return speak(actor(e.speaker),{...e,turnId:e.turnId??e.eventId,payload:{text:e.text,gesture:e.gesture??'speakA',emotion:{name:e.emotion??'smile'},speech:{mode:e.audio_url?'audio':'text-preview',audioUrl:e.audio_url,visemes:e.visemes,estimatedDurationMs:e.estimatedDurationMs}}});
 }
 if(e.type==='user_input'){
  cancelAll();const mine=token;setPhase(4);status('你的偏好：'+e.text);emit('user.preference',{text:e.text,focus:e.focus??null});const response=followup(e.text,e.focus);select(IDS.indexOf(response.speaker));
  const answer=await speak(actor(response.speaker),{...response,turnId:e.turnId??e.eventId,payload:{text:response.text,gesture:response.gesture,emotion:{name:response.emotion},speech:{mode:'text-preview',estimatedDurationMs:response.estimatedDurationMs}}});
  if(mine===token){setPhase(4);stageCamera();status('可以继续追问，也可以选一位主理人。');}return answer;
 }
 if(e.type==='user_choice')return choose(e.winner);if(e.type==='selection.confirm')return choose(e.actorId??cast[selected].id);
 if(e.type==='actor.move')return {ok:await move(a,e.payload.position,T.MathUtils.clamp(e.payload.durationMs/1000||1.5,.2,10))};
 if(e.type==='actor.react'){emotion(a,e.payload?.emotion?.name);play(a,e.payload?.gesture??'nod');}
 if(e.type==='actor.gaze')a.lookTarget=e.payload?.target==='left'?actors[0]:e.payload?.target==='right'?actors[2]:null;
 if(e.type==='turn.cancel'&&speech?.turnId===e.turnId)stopSpeech();if(e.type==='actor.speak'){if(set.map.visible)rehearse();return speak(a,e);}return {ok:true};
}
async function demo({autoChoose=false}={}){
 if(!ready)return {ok:false,reason:'assets-not-ready'};context??=new AudioContext();await context.resume();
 const first=await dispatch({type:'filter_done',restaurants:RESTAURANTS});if(!first.ok)return first;const mine=token;$('#demo').disabled=true;
 for(const line of DEMO_LINES){if(mine!==token)return {ok:false,reason:'cancelled'};const result=await dispatch({type:'utterance',...line});if(!result.ok)return result;if(!await wait(350,mine))return {ok:false,reason:'cancelled'};}
 if(mine!==token)return {ok:false,reason:'cancelled'};setPhase(4);stageCamera();status('你更在意哪一点？追问一句，或选出今晚想去的店。');$('#demo').disabled=false;emit('story.awaiting-choice');
 if(autoChoose){const reply=await dispatch({type:'user_input',text:'想清淡一点',focus:'cantonese'});if(!reply.ok)return reply;return dispatch({type:'user_choice',winner:'cantonese'});}return {ok:true};
}
function rehearse(){
 cancelAll();winner=null;set.map.visible=false;set.stage.visible=true;set.plates.forEach(p=>p.visible=true);$('#result').hidden=true;actors.forEach((a,i)=>{a.root.visible=!$('#solo').checked||i===selected;a.root.position.fromArray(a.config.slot);a.root.rotation.y=0;emotion(a);});setPhase(3);stageCamera();
}
function inspectFace(id=cast[selected].id,angle=0){
 const index=IDS.indexOf(id);if(!ready||index<0)return Promise.resolve(false);rehearse();select(index);$('#solo').checked=true;actors.forEach((a,i)=>a.root.visible=i===index);controls.minDistance=.55;
 const x=actors[index].root.position.x,r=T.MathUtils.degToRad(angle);return aim([x+Math.sin(r)*1.2,1.53,Math.cos(r)*1.2],[x,1.43,0],.5);
}

cast.forEach((c,i)=>{const b=document.createElement('button');b.className='actor-card'+(!i?' active':'');b.setAttribute('aria-pressed',String(!i));b.innerHTML=`<img class="portrait" src="/references/${c.ref}-front.png" alt="${c.name}"><div><strong>${c.name}</strong><small>${c.tag}</small></div><span class="actor-number">0${i+1}</span>`;b.onclick=()=>select(i);$('#actors').append(b);});
for(const [id,label]of Object.entries(ACTIONS)){const b=document.createElement('button');b.dataset.id=id;b.textContent=label;b.onclick=()=>{if(!ready)return;rehearse();play(actors[selected],id);status(cast[selected].name+' · '+label);};$('#actions').append(b);}
for(const [id,label]of Object.entries(EMOTIONS)){const b=document.createElement('button');b.dataset.id=id;b.textContent=label;b.onclick=()=>{if(!ready)return;if(!set.stage.visible)rehearse();emotion(actors[selected],id);refresh();};$('#expressions').append(b);}
for(const id of ['auto',...SHAPES]){const b=document.createElement('button');b.dataset.id=id;b.textContent=id==='auto'?'自动':id;b.onclick=()=>{if(!ready)return;if(!set.stage.visible)rehearse();actors[selected].face.manual=id==='auto'?null:id;refresh();};$('#visemes').append(b);}
$('#reset').onclick=reset;$('#demo').onclick=()=>demo();
$('#stop').onclick=()=>{cancelAll();if(set.stage.visible)setPhase(4);else reset();status('已打断。可以继续追问、选店或重新开场。');};
$('#request-form').onsubmit=e=>{e.preventDefault();if(!ready)return;emit('user.request',{text:$('#request-text').value});demo();};
$('#followup-form').onsubmit=e=>{e.preventDefault();dispatch({type:'user_input',text:$('#preference').value,focus:cast[selected].id});};
document.querySelectorAll('[data-preference]').forEach(b=>b.onclick=()=>{$('#preference').value=b.dataset.preference;dispatch({type:'user_input',text:b.dataset.preference});});
document.querySelectorAll('[data-face-angle]').forEach(b=>b.onclick=()=>inspectFace(cast[selected].id,Number(b.dataset.faceAngle)));
$('#choose').onclick=()=>dispatch({type:'user_choice',winner:cast[selected].id});
$('#speak').onclick=()=>{if(!ready)return;const text=$('#dialogue').value,em=actors[selected].emotion;rehearse();dispatch({type:'actor.speak',actorId:cast[selected].id,turnId:'rehearse-'+(++serial),payload:{text,emotion:{name:em},gesture:'speakA',speech:{mode:'text-preview'}}});};
$('#audio').onclick=()=>{if(!ready)return;rehearse();dispatch({type:'utterance',...DEMO_LINES[selected]});};
 $('#solo').onchange=()=>{if(set.stage.visible)actors.forEach((a,i)=>a.root.visible=!$('#solo').checked||i===selected);};$('#face-mode').onchange=()=>actors.forEach(a=>a.face.setEnabled($('#face-mode').checked));

async function load(){
 const loader=new GLTFLoader(),street=set.loadStreet(loader);const result=await Promise.all(cast.map(async c=>{
  const atlas=await loadFaceAtlas(c.id);
  const g=await loader.loadAsync('/models/'+c.id+'.glb?v=20261016-p0'),root=new T.Group();scene.add(root);root.add(g.scene);const boneMap={},facial=[];let triangles=0,bones=0;
  g.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(o.morphTargetDictionary)facial.push(o);if(o.material.map){const old=o.material;o.material=new T.MeshToonMaterial({map:old.map,color:old.color,side:old.side});}}if(o.isBone){boneMap[o.name]=o;bones++;}});
  if(!bones)throw Error(c.name+' 缺少骨骼');
  // GLTFLoader sanitizes the dots in Blender's hand.R / upper_arm.L names.
  for(const [name,bone]of Object.entries(boneMap)){const match=name.match(/^(upper_arm|forearm|hand|clavicle|thigh|shin|foot|toe)([LR])$/);if(match)boneMap[match[1]+'.'+match[2]]=bone;}
  const mixer=new T.AnimationMixer(g.scene),actions={};addMotions(g.scene,g.animations,boneMap,c.id).forEach(clip=>actions[clip.name]=mixer.clipAction(clip));
  const el=document.createElement('div');el.className='bubble';el.setAttribute('aria-hidden','true');el.innerHTML='<strong></strong><span></span>';el.querySelector('strong').textContent=c.name;$('#bubbles').append(el);const skeleton=new T.SkeletonHelper(g.scene);skeleton.visible=false;scene.add(skeleton);
  const a={config:c,model:g.scene,root,mixer,actions,boneMap,facial,skeleton,bubble:el,clip:'idle',emotion:'neutral',mouth:0,mouthShape:null,triangles,bones,nextBlink:performance.now()+2000+Math.random()*4000};a.face=new Face(a,atlas);
  const propFile=await loader.loadAsync('/props/'+c.prop+'.glb');const prop=propFile.scene;prop.name=c.prop;boneMap['hand.R'].add(prop);prop.position.set(0,.07,.01);prop.rotation.z=Math.PI*.12;a.prop=prop;
  mixer.addEventListener('finished',e=>{if(a.current===e.action){emit('animation.completed',{actorId:c.id,animation:a.clip});if(phase===5&&['celebrate','disappointed'].includes(a.clip))return;play(a,speech?(speech.actor===a?'speakA':'listen'):'idle');}});emit('actor.ready',{actorId:c.id});return a;
 }));
 actors.push(...result);const environment=await street;emit(environment.status==='ready'?'environment.ready':'environment.failed',{triangles:environment.triangles});ready=true;$('#loading').remove();$('#model-stats').textContent='本地模拟 · 三位主理人 · 六阶段体验';document.querySelectorAll('[data-needs-ready]').forEach(b=>b.disabled=false);reset();select(0);
}
load().catch(err=>{$('#loading').textContent='模型暂未就绪：'+err.message;$('#loading').classList.add('error');emit('asset.failed',{message:err.message});console.error(err);});
new ResizeObserver(()=>{const r=$('#viewport').getBoundingClientRect();camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height);}).observe($('#viewport'));
const projected=new T.Vector3(),lookRotation=new T.Quaternion(),up=new T.Vector3(0,1,0);
function frame(now){
 requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;frameCount++;if(now-statTime>1000){fps=Math.round(frameCount*1000/(now-statTime));frameCount=0;statTime=now;}
 if(cameraMove){const m=cameraMove,t=Math.min(1,(now-m.start)/m.duration),s=t*t*(3-2*t);camera.position.lerpVectors(m.from,m.to,s);controls.target.lerpVectors(m.targetFrom,m.targetTo,s);if(t===1){cameraMove=null;controls.enabled=true;m.resolve(true);}}
 controls.update();set.update(now/1000,filterStart===null?null:(now-filterStart)/650);let amplitude=0;
 if(speech?.audio&&!speech.audio.paused&&analyser){analyser.getByteTimeDomainData(signal);let sum=0;for(const v of signal)sum+=((v-128)/128)**2;amplitude=Math.min(1,Math.sqrt(sum/signal.length)*5.5);}const rect=$('#viewport').getBoundingClientRect();
 actors.forEach(a=>{
  a.mixer.update(dt);if(a.jump){const t=T.MathUtils.clamp((now-a.jump.start)/750,0,1);a.root.position.y=a.jump.base+Math.sin(t*Math.PI)*.43;a.root.scale.setScalar(.5+.5*Math.min(1,t*3));}
  if(a.move){const m=a.move,t=Math.min(1,(now-m.start)/m.duration),s=t*t*(3-2*t);if(m.curve){a.root.position.copy(m.curve.getPoint(s));const tangent=m.curve.getTangent(s);a.root.rotation.y=Math.atan2(tangent.x,tangent.z);}else a.root.position.lerpVectors(m.from,m.to,s);
   if(t===1){a.move=null;a.root.rotation.y=0;if(m.exit){a.root.visible=false;emit('actor.exited',{actorId:a.config.id});}else{play(a,'arrive');emit('actor.arrived',{actorId:a.config.id});}m.resolve(true);}}
  let shape=null;
  if(speech?.actor===a){const s=speech,elapsed=s.audio?s.audio.currentTime*1000:now-s.startedAt,duration=s.audio&&Number.isFinite(s.audio.duration)?s.audio.duration*1000:s.duration;a.bubble.querySelector('span').textContent=s.text.slice(0,Math.min(s.text.length,Math.floor(s.text.length*elapsed/Math.max(1,duration)*1.15)+1));
   if(s.audio){shape=s.audio.paused?'X':s.timeline.length?shapeAt(s.timeline,s.audio.currentTime):amplitude<.06?'X':amplitude<.23?'B':amplitude<.58?'C':'D';a.mouth=amplitude;}
  }else a.mouth=0;a.mouthShape=shape;
  let blink=false;if(now>a.nextBlink){blink=now-a.nextBlink<85;if(now-a.nextBlink>=85)a.nextBlink=now+2000+Math.random()*4000;}a.face.update(shape,blink,now/1000);
  const desired=a.lookTarget&&!a.move?Math.sign(a.lookTarget.root.position.x-a.root.position.x)*.24:0;a.gaze=T.MathUtils.damp(a.gaze??0,desired,5,dt);if(a.boneMap.head){lookRotation.setFromAxisAngle(up,a.gaze);a.boneMap.head.quaternion.multiply(lookRotation);}
  for(const m of a.facial)for(const [name,index]of Object.entries(m.morphTargetDictionary))m.morphTargetInfluences[index]=$('#face-mode').checked?0:(name==='MouthOpen'?a.mouth:0);
  a.root.updateMatrixWorld(true);projected.set(0,1.92,0).applyMatrix4(a.root.matrixWorld).project(camera);a.bubble.style.left=`${T.MathUtils.clamp((projected.x*.5+.5)*rect.width,130,Math.max(130,rect.width-130))}px`;a.bubble.style.top=`${Math.max(65,(-projected.y*.5+.5)*rect.height)}px`;a.bubble.hidden=!a.root.visible;a.skeleton.visible=$('#skeleton').checked&&a.root.visible;
 });renderer.render(scene,camera);
 if(frameCount%15===0){$('#diagnostics').textContent=`阶段 ${phase} · ${phaseNames[phase]}\n`+actors.map(a=>`${a.config.name}: ${a.clip} / ${a.emotion} / mouth ${a.face.manual??a.mouthShape??'表情'}`).join('\n')+`\n约 ${fps} FPS · 回合 ${speech?.turnId??'无'}`;refresh();}
}
requestAnimationFrame(frame);
window.avatarStage={dispatch,demo,reset,inspectFace,cancel:()=>$('#stop').click(),exportAtlas:atlasSvg,
 async replay(events){if(!Array.isArray(events)||events.length>200)return {ok:false,reason:'invalid-script'};for(let index=0;index<events.length;index++){const result=await dispatch(events[index]);if(!result.ok)return {...result,index};}return {ok:true};},
 async exportAssets(){const {exportRuntimeAssets}=await import('./runtime-exports.js');return exportRuntimeAssets(actors);},
 get state(){return {ready,phase,phaseName:phaseNames[phase],sessionId:gate.sessionId,selected:cast[selected].id,speaking:speech?.turnId??null,audioTime:speech?.audio?.currentTime??null,winner,fps,scene:set.map.visible?'map':'stage',environment:{status:set.environment.status,triangles:set.environment.triangles,ground:set.environment.ground},actors:actors.map(a=>({id:a.config.id,visible:a.root.visible,clip:a.clip,emotion:a.emotion,mouth:a.mouth,mouthShape:a.face.manual??a.mouthShape,position:a.root.position.toArray(),bones:a.bones,triangles:a.triangles,clips:Object.keys(a.actions),morphs:Object.keys(a.facial[0]?.morphTargetDictionary??{}),faceLayers:3,faceSurfaceVertices:a.face.surfaceVertices,faceSurfaceDepth:a.face.surfaceDepthMeters,prop:a.prop.name})),events:[...events]};}
};
