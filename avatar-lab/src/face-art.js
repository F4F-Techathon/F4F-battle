// Fixed 6x6 atlas: 6 brows, 10 eyes, 8 expression mouths, 9 speech mouths.
const ink='#1F2A44';
const path=(d,width=8,fill='none')=>`<path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ellipse=(x,y,rx,ry,fill=ink)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
export const FACE_LAYOUT={brows:0,eyes:6,mouth:16,viseme:24,columns:6,rows:6,tile:256};
function brows(i){
 const sets=[['M60 64 Q80 59 99 64','M157 64 Q176 59 196 64'],['M60 66 Q81 42 99 55','M157 59 Q177 61 196 65'],['M60 54 L99 69','M157 69 L196 54'],['M60 68 Q78 37 99 47','M157 47 Q177 37 196 68'],['M60 73 L99 54','M157 54 L196 73'],['M60 63 L99 58','M157 51 Q176 42 196 56']];
 return sets[i].map(d=>path(d,9)).join('');
}
function eyes(i){
 const pair=(fn)=>[80,176].map((x,n)=>fn(x,n)).join('');
 if(i===1) return pair(x=>path(`M${x-18} 114 Q${x} 88 ${x+18} 114`,8));
 if(i===2) return pair(x=>ellipse(x,109,21,13,'white')+ellipse(x,111,10,11)+path(`M${x-22} 96 L${x+22} 100`,7));
 if(i===3) return pair(x=>ellipse(x,108,22,19,'white')+ellipse(x+8,110,9,13)+path(`M${x-20} 93 L${x+20} 100`,7));
 if(i===4) return pair(x=>ellipse(x,108,23,27,'white')+ellipse(x,110,7,9));
 if(i===5) return pair((x,n)=>ellipse(x,108,23,20,'white')+ellipse(x,112,10,14)+path(n?`M${x-24} 96 L${x+23} 79`:`M${x-24} 79 L${x+23} 96`,8));
 if(i===6) return pair(x=>ellipse(x,109,21,20,'white')+ellipse(x-9,114,9,12));
 if(i===7) return pair(x=>`<polygon points="${x},82 ${x+8},100 ${x+28},101 ${x+13},115 ${x+18},135 ${x},125 ${x-18},135 ${x-13},115 ${x-28},101 ${x-8},100" fill="#E0A83B" stroke="${ink}" stroke-width="4"/>`);
 if(i===8) return pair(x=>ellipse(x,112,21,15,'white')+ellipse(x,117,9,9)+path(`M${x-22} 103 Q${x} 115 ${x+22} 103`,7));
 if(i===9) return pair(x=>path(`M${x-20} 110 Q${x} 122 ${x+20} 110`,7));
 return pair(x=>ellipse(x,107,22,27,'white')+ellipse(x,110,12,20)+ellipse(x-4,101,4,6,'white'));
}
function mouth(i){
 const shapes=[path('M106 177 Q128 185 150 177',6),path('M99 171 Q128 181 157 171 Q153 204 128 203 Q103 204 99 171',5,'#803D46'),path('M110 186 Q139 190 154 172',6),path('M106 186 Q128 178 151 186',6),ellipse(128,184,13,19,'#803D46'),path('M101 174 Q128 168 155 174 L153 193 Q128 198 103 193 Z',5,'white')+path('M104 184 L152 184',3),path('M101 178 Q128 170 155 178 Q149 194 128 191 Q107 194 101 178',5,'white'),path('M105 193 Q128 174 151 193',6)];
 return shapes[i];
}
function viseme(i){
 if(i===0)return path('M110 183 Q128 187 146 183',5);
 if(i===1)return path('M106 183 L150 183',7);
 if(i===2)return path('M105 176 Q128 172 151 176 L149 189 Q128 194 107 189 Z',5,'#803D46')+path('M109 178 L147 178',5,'white');
 if(i===3)return ellipse(128,184,22,16,'#803D46')+path('M113 175 L143 175',5,'white');
 if(i===4)return ellipse(128,184,26,28,'#803D46')+ellipse(128,202,15,7,'#E8907A');
 if(i===5)return ellipse(128,184,16,23,'#803D46');
 if(i===6)return ellipse(128,185,11,12,'#803D46')+path('M112 176 Q128 170 144 176',4);
 if(i===7)return path('M109 177 Q128 174 147 177 L146 190 Q128 192 110 190 Z',4,'#803D46')+path('M112 178 L144 178',8,'white');
 return ellipse(128,185,20,20,'#803D46')+ellipse(128,194,9,9,'#E8907A')+path('M113 173 L143 173',5,'white');
}
export function atlasSvg(id='sichuan_owner'){
 const glasses=id==='cantonese_owner'?[80,176].map(x=>`<circle cx="${x}" cy="108" r="30" fill="none" stroke="${ink}" stroke-width="4"/>`).join('')+path('M110 106 Q128 98 146 106',4):'';
 const mustache=id==='french_chef'?path('M128 155 Q112 140 100 155 Q82 164 78 148 M128 155 Q144 140 156 155 Q174 164 178 148',7):id==='cantonese_owner'?path('M110 155 Q120 148 128 156 Q136 148 146 155',6):'';
 const cells=[...Array.from({length:6},(_,i)=>brows(i)),...Array.from({length:10},(_,i)=>eyes(i)+glasses),...Array.from({length:8},(_,i)=>mouth(i)+mustache),...Array.from({length:9},(_,i)=>viseme(i)+mustache)];
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1536" viewBox="0 0 1536 1536">${cells.map((s,i)=>`<g transform="translate(${i%6*256} ${Math.floor(i/6)*256})">${s}</g>`).join('')}</svg>`;
}
export const EXPRESSION_TILES={
 neutral:[0,0,0],smile:[0,1,1],smug:[1,2,2],disdain:[2,3,3],shocked:[3,4,4],angry:[2,5,5],embarrassed:[4,6,6],overjoyed:[3,7,1],disappointed:[4,8,7],
 laugh:[3,9,1],warm:[3,0,1],mysterious:[0,2,0],provocative:[1,2,2],hurt:[4,8,7],thinking:[1,6,3],doubt:[5,2,0],agree:[0,1,0],defiant:[2,5,3],
};
export const EFFECTS={smug:'sparkle',shocked:'exclaim',angry:'steam',embarrassed:'sweat',overjoyed:'star',disappointed:'cloud',warm:'heart',hurt:'sweat',thinking:'question',defiant:'steam'};
export const EFFECT_LABELS={exclaim:'！',question:'？',sweat:'💧',steam:'♨',star:'★',heart:'♥',sparkle:'✦',cloud:'☁'};
