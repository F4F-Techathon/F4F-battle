import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvent, RESTAURANTS, shapeAt, normalizeVisemes, followup} from '../src/story.js';
import {EventGate} from '../src/events.js';
const envelope={sessionId:'local',eventId:'e1',seq:1};
test('business contract maps short IDs without discarding caller envelope',()=>{
 const e=normalizeEvent({type:'utterance',speaker:'sichuan',target:'french',text:'你好',emotion:'welcome',reactions:{french:'angry'},eventId:'caller'},envelope);
 assert.equal(e.speaker,'sichuan_owner');assert.equal(e.target,'french_chef');assert.equal(e.emotion,'smile');assert.equal(e.reactions.french_chef,'angry');assert.equal(e.eventId,'caller');
 assert.equal(new EventGate().accept(e).ok,true);
});
test('invalid filtering does not consume delivery sequence; duplicate roles are rejected',()=>{
 const g=new EventGate();
 assert.equal(g.accept({...envelope,type:'filter_done',restaurants:RESTAURANTS.map(r=>({...r,pos:[NaN,0]}))}).reason,'invalid-restaurants');
 assert.equal(g.accept({...envelope,type:'filter_done',restaurants:[RESTAURANTS[0],RESTAURANTS[0],RESTAURANTS[2]]}).reason,'invalid-restaurants');
 assert.equal(g.accept({...envelope,type:'filter_done',restaurants:RESTAURANTS}).ok,true);
});
test('viseme contract rejects unordered timestamps and unsupported shapes',()=>{
 const base={...envelope,type:'utterance',speaker:'sichuan_owner',text:'音频',audio_url:'/audio/sichuan.wav'};
 assert.equal(new EventGate().accept({...base,visemes:[{t:.2,shape:'D'},{t:.1,shape:'X'}]}).reason,'invalid-visemes');
 assert.equal(new EventGate().accept({...base,visemes:[{t:0,shape:'Z'}]}).reason,'invalid-visemes');
 assert.equal(new EventGate().accept({...base,visemes:[{t:0,shape:'A'},{t:.1,shape:'D'},{t:.2,shape:'X'}]}).ok,true);
});
test('mouth timeline holds the last state, including silence',()=>{
 const timeline=[{t:.12,shape:'A'},{t:.4,shape:'D'},{t:.9,shape:'X'}];
 assert.equal(shapeAt(timeline,0),'X');assert.equal(shapeAt(timeline,.4),'D');assert.equal(shapeAt(timeline,2),'X');
 assert.deepEqual(normalizeVisemes({cues:[{offsetMs:100,durationMs:80,viseme:'MBP'}]}),[{t:.1,shape:'A'},{t:.18,shape:'X'}]);
});
test('mock followup honors explicit focus and routes preferences deterministically',()=>{
 assert.equal(followup('想清淡一点').speaker,'cantonese_owner');
 assert.equal(followup('想清淡一点','french').speaker,'french_chef');
 assert.equal(followup('预算实惠').speaker,'sichuan_owner');
});
test('all four contract events retain cancellation and session protections',()=>{
 const g=new EventGate();
 assert.equal(g.accept({...envelope,type:'user_input',text:'安静一点'}).ok,true);
 assert.equal(g.accept({...envelope,type:'user_choice',winner:'french_chef'}).reason,'duplicate');
 g.accept({type:'session.start',sessionId:'next',eventId:'start'});
 assert.equal(g.accept({...envelope,eventId:'late',type:'user_choice',winner:'french_chef'}).reason,'stale-session');
});
