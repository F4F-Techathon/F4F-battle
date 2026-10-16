import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),report=[];
for(const id of ['sichuan_owner','cantonese_owner','french_chef']){
 const data=fs.readFileSync(path.join(root,'public/models',id+'.glb'));assert.equal(data.toString('ascii',0,4),'glTF');assert.equal(data.readUInt32LE(4),2);
 const n=data.readUInt32LE(12),g=JSON.parse(data.toString('utf8',20,20+n)),bin=data.subarray(28+n);
 const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};const types={5120:['getInt8',1],5121:['getUint8',1],5122:['getInt16',2],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
 function accessor(index){
  const a=g.accessors[index], [fn,size]=types[a.componentType],count=comps[a.type],v=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  const out=Array.from({length:a.count},()=>Array(count).fill(0));
  if(a.bufferView!==undefined){const b=g.bufferViews[a.bufferView];for(let i=0;i<a.count;i++)for(let j=0;j<count;j++)out[i][j]=v[fn]((b.byteOffset||0)+(a.byteOffset||0)+i*(b.byteStride||size*count)+j*size,true);}
  if(a.sparse){const sp=a.sparse,ib=g.bufferViews[sp.indices.bufferView],vb=g.bufferViews[sp.values.bufferView],[ifun,isize]=types[sp.indices.componentType];for(let i=0;i<sp.count;i++){const idx=v[ifun]((ib.byteOffset||0)+(sp.indices.byteOffset||0)+i*isize,true);for(let j=0;j<count;j++)out[idx][j]=v[fn]((vb.byteOffset||0)+(sp.values.byteOffset||0)+(i*count+j)*size,true);}}
  return out;
 }
 assert.equal(g.skins.length,1);const skin=g.skins[0];assert.ok(skin.joints.length>=20);
 assert.deepEqual(g.animations.map(a=>a.name).sort(),['arrive','celebrate','disagree','idle','nod','point','present','recoil','run','signature','wave'].sort());
 for(const a of g.animations)for(const s of a.samplers){const times=accessor(s.input).flat();assert.ok(times.every(Number.isFinite));assert.ok(times.at(-1)>0);assert.ok(times.every((t,i)=>!i||t>=times[i-1]));assert.ok(accessor(s.output).flat().every(Number.isFinite));}
 let maxMorph=0,triangles=0,vertices=0,maxWeightError=0;
 for(const m of g.meshes){assert.equal(m.extras.targetNames.length,7);assert.ok(m.weights.every(w=>w===0));for(const p of m.primitives){vertices+=g.accessors[p.attributes.POSITION].count;triangles+=g.accessors[p.indices].count/3;assert.ok(p.attributes.JOINTS_0!==undefined);for(const row of accessor(p.attributes.JOINTS_0))assert.ok(row.every(v=>v<skin.joints.length));for(const row of accessor(p.attributes.WEIGHTS_0)){const err=Math.abs(row.reduce((a,b)=>a+b,0)-1);maxWeightError=Math.max(maxWeightError,err);assert.ok(err<.001,'Weights must sum to one');}for(const t of p.targets){for(const row of accessor(t.POSITION)){const d=Math.hypot(...row);maxMorph=Math.max(maxMorph,d);assert.ok(d<.06,'Unexpected morph stretching');}}}}
 report.push({id,bytes:data.length,triangles,vertices,skinJoints:skin.joints.length,clipCount:g.animations.length,morphCount:7,maxMorphDisplacementMeters:maxMorph,maxWeightSumError:maxWeightError});
}
fs.writeFileSync(path.join(root,'reports/asset-validation.json'),JSON.stringify({status:'passed',checks:['GLB 2.0','skin weights normalized','joint indices in range','11 clips with finite time/value tracks','7 zero-default morphs','morph displacement below 6 cm'],actors:report},null,2));console.log(JSON.stringify(report,null,2));
