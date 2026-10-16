export const IDS = ['sichuan_owner', 'cantonese_owner', 'french_chef'];
const aliases = {sichuan: IDS[0], cantonese: IDS[1], french: IDS[2], rong: IDS[0], hua: IDS[1], pierre: IDS[2]};
export const actorId = id => aliases[id] ?? id;
export const EMOTIONS = {
  neutral: '中性', smile: '微笑', smug: '得意', disdain: '不屑', shocked: '震惊',
  angry: '生气', embarrassed: '尴尬', overjoyed: '狂喜', disappointed: '失落',
  laugh: '大笑', warm: '热情', mysterious: '神秘', provocative: '挑衅', hurt: '委屈',
  thinking: '思考', doubt: '怀疑', agree: '认同', defiant: '不服气',
};
const oldEmotions = {welcome:'smile', confident:'smug', curious:'thinking', skeptical:'doubt', surprised:'shocked', delighted:'overjoyed', thoughtful:'thinking', amused:'laugh', conceding:'agree'};
export const emotionName = name => oldEmotions[name] ?? name ?? 'neutral';
export const SHAPES = ['X','A','B','C','D','E','F','G','H'];
const legacyShapes = {rest:'X', MBP:'A', A:'D', EI:'C', O:'E', UW:'F', FV:'G', L:'H'};
export function normalizeVisemes(speech = {}, visemes) {
  if (visemes !== undefined) return visemes;
  return speech.cues?.flatMap(c => [
    {t:c.offsetMs/1000, shape:legacyShapes[c.viseme] ?? c.viseme},
    {t:(c.offsetMs+c.durationMs)/1000, shape:'X'},
  ]).sort((a,b)=>a.t-b.t) ?? [];
}
export function normalizeEvent(raw, envelope) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const e = {...envelope, ...raw};
  for (const field of ['actorId','speaker','target','focus','winner']) if(e[field]) e[field] = actorId(e[field]);
  if(e.restaurants) e.restaurants = e.restaurants.map(r => ({...r, id:actorId(r.id)}));
  if(e.reactions) e.reactions = Object.fromEntries(Object.entries(e.reactions).map(([id,name])=>[actorId(id),emotionName(name)]));
  if(e.emotion) e.emotion = emotionName(e.emotion);
  if(e.payload) {
    e.payload = {...e.payload};
    if(e.payload.emotion) e.payload.emotion = {...e.payload.emotion, name:emotionName(e.payload.emotion.name)};
  }
  return e;
}
export function shapeAt(timeline, time) {
  let lo=0, hi=timeline.length;
  while(lo<hi) { const mid=(lo+hi)>>>1; if(timeline[mid].t<=time) lo=mid+1; else hi=mid; }
  return lo ? timeline[lo-1].shape : 'X';
}
export function validVisemes(list) {
  return Array.isArray(list) && list.length<=10000 && list.every((c,i)=>c && Number.isFinite(c.t) && c.t>=0 && SHAPES.includes(c.shape) && (!i || c.t>=list[i-1].t));
}
export const RESTAURANTS = [
  {id:IDS[0],name:'川味小馆',pos:[.16,.65]},
  {id:IDS[1],name:'粤来茶楼',pos:[.5,.14]},
  {id:IDS[2],name:'BONJOUR',pos:[.84,.65]},
];
export const DEMO_LINES = [
  {speaker:'sichuan', target:'french', text:'来我屋头嘛！正宗川菜，麻辣鲜香，人均才八十五！',emotion:'smug',gesture:'speakA',reactions:{french:'doubt',cantonese:'thinking'},audio_url:'/audio/sichuan.wav'},
  {speaker:'cantonese', target:'sichuan', text:'辣到嘴都肿咯，还怎么约会？来饮早茶，靓汤煲足四个钟。',emotion:'disdain',gesture:'point',reactions:{sichuan:'angry',french:'smug'},audio_url:'/audio/cantonese.wav'},
  {speaker:'french', target:'cantonese', text:'你们太吵了。烛光，红酒，七道菜，这才叫浪漫。',emotion:'smug',gesture:'speakB',reactions:{cantonese:'embarrassed',sichuan:'shocked'},audio_url:'/audio/french.wav'},
];
export function followup(text, focus) {
  const id=actorId(focus) ?? (/辣|热闹|实惠/.test(text)?IDS[0]:/约会|安静|浪漫/.test(text)?IDS[2]:IDS[1]);
  const lines = {
    [IDS[0]]:'想要实惠又热闹？我们可以调整辣度，大份招牌菜一起分享。你更在意价格，还是味道够不够劲？',
    [IDS[1]]:'想吃清淡一点，我们有清蒸鱼和老火汤。先说好：清淡也可以有滋味，选你吃着舒服的。',
    [IDS[2]]:'如果更在意安静和仪式感，我会留一个靠窗的位置。预算和时间，我们也可以先说清楚。',
  };
  return {type:'utterance',speaker:id,text:lines[id],emotion:'warm',gesture:'speakA',estimatedDurationMs:5500};
}
