import {IDS, EMOTIONS, validVisemes} from './story.js';
export const ACTORS=IDS;
const audioAllowed=url=>typeof url==='string' && /^\/audio\/[\w.-]+\.(wav|mp3|ogg)$/.test(url);
const textAllowed=text=>typeof text==='string' && text.trim().length>0 && text.length<=2000;
export class EventGate {
 constructor(){this.reset();}
 reset(sessionId='local'){this.sessionId=sessionId;this.seen=new Set();this.cancelled=new Set();this.lastSeq=-1;this.active=null;}
 accept(event){
  if(!event||typeof event!=='object'||typeof event.eventId!=='string'||event.eventId.length>120)return {ok:false,reason:'invalid-event'};
  if(event.type==='session.start'||event.type==='session.reset'){
   if(typeof event.sessionId!=='string'||!event.sessionId)return {ok:false,reason:'invalid-session'};
   if(this.seen.has(event.eventId))return {ok:false,reason:'duplicate'};
   this.reset(event.sessionId);this.seen.add(event.eventId);return {ok:true,cancel:true};
  }
  if(event.sessionId!==this.sessionId)return {ok:false,reason:'stale-session'};
  if(this.seen.has(event.eventId))return {ok:false,reason:'duplicate'};
  if(!Number.isInteger(event.seq)||event.seq<=this.lastSeq)return {ok:false,reason:'stale-sequence'};
  if(event.actorId&&!ACTORS.includes(event.actorId))return {ok:false,reason:'unknown-actor'};
  const types=['actors.spawn','actor.move','actor.speak','actor.react','actor.gaze','turn.cancel','selection.confirm','filter_done','utterance','user_input','user_choice'];
  if(!types.includes(event.type))return {ok:false,reason:'unsupported-type'};
  if(event.type.startsWith('actor.')&&!event.actorId)return {ok:false,reason:'missing-actor'};
  if(event.turnId&&this.cancelled.has(event.turnId))return {ok:false,reason:'cancelled-turn'};
  if(event.type==='actor.speak'){
   if(!event.turnId||typeof event.payload?.text!=='string'||event.payload.text.length>2000)return {ok:false,reason:'invalid-speech'};
   const mode=event.payload.speech?.mode??'text-preview';
   if(!['audio','text-preview'].includes(mode))return {ok:false,reason:'unsupported-speech-mode'};
   // This pilot only plays same-origin bundled files. Streaming is a future adapter.
   if(mode==='audio'&&!audioAllowed(event.payload.speech.audioUrl))return {ok:false,reason:'invalid-audio-url'};
   if(event.payload.speech?.visemes!==undefined&&!validVisemes(event.payload.speech.visemes))return {ok:false,reason:'invalid-visemes'};
  }
  if(event.type==='filter_done'){
   const rs=event.restaurants;
   if(!Array.isArray(rs)||rs.length!==3||new Set(rs.map(r=>r?.id)).size!==3||!rs.every(r=>r&&ACTORS.includes(r.id)&&typeof r.name==='string'&&r.name.length<=80&&Array.isArray(r.pos)&&r.pos.length===2&&r.pos.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))return {ok:false,reason:'invalid-restaurants'};
  }
  if(event.type==='utterance'){
   if(!ACTORS.includes(event.speaker)||!textAllowed(event.text))return {ok:false,reason:'invalid-utterance'};
   if(event.target&&(!ACTORS.includes(event.target)||event.target===event.speaker))return {ok:false,reason:'invalid-target'};
   if(event.emotion&&!EMOTIONS[event.emotion])return {ok:false,reason:'invalid-emotion'};
   if(event.reactions&&(typeof event.reactions!=='object'||Array.isArray(event.reactions)||!Object.entries(event.reactions).every(([id,name])=>ACTORS.includes(id)&&id!==event.speaker&&EMOTIONS[name])))return {ok:false,reason:'invalid-reactions'};
   if(event.audio_url&&!audioAllowed(event.audio_url))return {ok:false,reason:'invalid-audio-url'};
   if(event.visemes!==undefined&&!validVisemes(event.visemes))return {ok:false,reason:'invalid-visemes'};
  }
  if(event.type==='user_input'&&(!textAllowed(event.text)||(event.focus&&!ACTORS.includes(event.focus))))return {ok:false,reason:'invalid-input'};
  if(event.type==='user_choice'&&!ACTORS.includes(event.winner))return {ok:false,reason:'invalid-winner'};
  if(event.type==='turn.cancel'&&!event.turnId)return {ok:false,reason:'missing-turn'};
  this.seen.add(event.eventId);this.lastSeq=event.seq;
  if(this.seen.size>4096)this.seen.delete(this.seen.values().next().value);
  if(event.type==='turn.cancel'){this.cancelled.add(event.turnId);if(this.active===event.turnId)this.active=null;}
  if(event.type==='actor.speak')this.active=event.turnId;
  return {ok:true};
 }
}
