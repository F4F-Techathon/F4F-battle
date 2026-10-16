import * as T from 'three';
export const ACTIONS={idle:'待机',listen:'倾听',speakA:'说话 A',speakB:'说话 B',emerge:'跳出',run:'小跑',arrive:'停步',point:'指向',recoil:'受惊',celebrate:'庆祝',disappointed:'失落',stomp:'跺脚',scratch:'挠头',signature:'招牌动作',entrance:'亮相',wave:'招呼',nod:'点头',disagree:'反驳'};
export function addMotions(model,sourceClips,bones,id){
 const clips=[...sourceClips];
 const custom=['listen','speakA','speakB','emerge','disappointed','stomp','scratch','entrance','signature'];
 const names=['head','chest','spine','upper_arm.L','upper_arm.R','forearm.L','forearm.R','hand.L','hand.R','thigh.L','thigh.R'];
 const rest=Object.fromEntries(names.map(n=>[n,bones[n].quaternion.clone()]));
 for(const name of custom){
  const duration={listen:3.2,speakA:2.4,speakB:2.8,emerge:.75,disappointed:2.3,stomp:1.5,scratch:2.4,entrance:1.4,signature:2.6}[name],times=[],values=Object.fromEntries(names.map(n=>[n,[]]));
  for(let i=0;i<=48;i++){
   const t=i/48,s=Math.sin(t*Math.PI*2),e=Math.sin(t*Math.PI)**2;times.push(t*duration);
   const pose=Object.fromEntries(names.map(n=>[n,[0,0,0]]));const set=(n,x=0,y=0,z=0)=>{pose[n]=[x,y,z];};
   set('upper_arm.L',0,0,-8);set('upper_arm.R',0,0,8);set('chest',s*1.3);
   if(name==='listen'){set('head',3+3*Math.sin(t*Math.PI*4),0,1.3*s);set('forearm.L',-12);set('forearm.R',-12);}
   if(name==='speakA'||name==='speakB'){
    const amp=name==='speakB'?1.7:1;
    set('forearm.L',-35-12*s*amp);set('forearm.R',-35+12*s*amp);set('upper_arm.L',-12*amp,0,-8+9*s*amp);set('upper_arm.R',-12*amp,0,8-9*s*amp);set('head',2*s,3*s);set('chest',2*s*amp,2*s*amp);
   }
   if(name==='emerge'){set('chest',-15*e);set('upper_arm.L',-40*e,0,-40*e);set('upper_arm.R',-40*e,0,40*e);}
   if(name==='disappointed'){set('head',22*e);set('chest',10*e);set('upper_arm.L',0,0,-4);set('upper_arm.R',0,0,4);}
   if(name==='stomp'){set('thigh.R',22*e);set('head',-6*e);set('forearm.L',-65*e);set('forearm.R',-65*e);}
   if(name==='scratch'){set('upper_arm.R',-50*e,0,50*e);set('forearm.R',-95*e);set('hand.R',0,0,12*Math.sin(t*8*Math.PI)*e);set('head',6*e,0,-7*e);}
   if(name==='entrance'){set('chest',14*e);set('forearm.L',-45*e);set('forearm.R',-45*e);}
   if(name==='signature'){
    if(id==='sichuan_owner'){set('upper_arm.L',0,0,-30*e);set('forearm.L',-80*e);set('upper_arm.R',-25*e,0,15*e);set('forearm.R',-55*e+15*s*e);set('chest',0,8*s*e);}
    else if(id==='cantonese_owner'){set('forearm.L',-65*e);set('forearm.R',-60*e);set('hand.R',0,0,-35*e);set('chest',10*e);}
    else{set('upper_arm.R',-55*e,0,-25*e);set('forearm.R',-105*e);set('hand.R',0,0,15*e);set('chest',-7*e);set('head',-5*e);}
   }
   for(const n of names){const angles=pose[n].map(T.MathUtils.degToRad);const q=rest[n].clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...angles)));values[n].push(q.x,q.y,q.z,q.w);}
  }
  const tracks=names.map(n=>new T.QuaternionKeyframeTrack(bones[n].name+'.quaternion',times,values[n]));
  const old=clips.findIndex(c=>c.name===name);if(old>=0)clips.splice(old,1);clips.push(new T.AnimationClip(name,duration,tracks));
 }
 return clips;
}
