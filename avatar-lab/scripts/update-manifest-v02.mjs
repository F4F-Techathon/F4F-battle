import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {IDS,EMOTIONS,SHAPES} from '../src/story.js';
const manifest=JSON.parse(fs.readFileSync('public/manifest.json','utf8'));
manifest.schemaVersion='0.2';manifest.status='p0-mock-flow-implemented';
manifest.expressionPresetsP0=Object.keys(EMOTIONS).slice(0,9);manifest.expressionPresetsP1=Object.keys(EMOTIONS).slice(9);manifest.visemes=SHAPES;
manifest.facialImplementation={...manifest.facialImplementation,activeController:'three independent decal layers projected onto original 3D head geometry',quality:'surface-conforming graphic expressions; original nose, cheeks and jaw retained',visemes:'nine distinct Rhubarb mouth drawings; current demo audio uses amplitude fallback',eyeGaze:'head-bone yaw toward speaker or target',legacyMorphTargetsUsedByDefault:false};
manifest.counting={...manifest.counting,expressionPresetsPerActor:18,visemeStatesIncludingRest:9,atlasCellsPerActor:33};
manifest.runtime={phases:[0,1,2,3,4,5],businessEvents:['filter_done','utterance','user_input','user_choice'],mock:true,faceAtlas:'public/faces/{actorId}.svg',animationClips:'public/animations/{actorId}.json',props:['public/props/ladle.glb','public/props/teapot.glb','public/props/whisk.glb'],originalCharacterGLBsUnmodified:true};
for(const a of manifest.actors){const clips=JSON.parse(fs.readFileSync(`public/animations/${a.id}.json`,'utf8'));a.runtimeClipCount=clips.clips.length;a.runtimeClips=clips.clips.map(c=>c.name);a.faceAtlasUrl=`/faces/${a.id}.svg`;}
const file='public/environments/restaurant-street-high.glb',data=fs.readFileSync(file),n=data.readUInt32LE(12),json=JSON.parse(data.toString('utf8',20,20+n)),bin=data.subarray(n+28);
const measured=JSON.parse(fs.readFileSync('reports/street-asset-validation.json','utf8'));
measured.textures=json.images.map(i=>{const v=json.bufferViews[i.bufferView],b=bin.subarray(v.byteOffset,v.byteOffset+v.byteLength);return {name:i.name,bytes:v.byteLength,width:b.readUInt32BE(16),height:b.readUInt32BE(20)};});measured.sha256=createHash('sha256').update(data).digest('hex');
fs.writeFileSync('reports/street-asset-validation.json',JSON.stringify(measured,null,2));
manifest.environment={modelUrl:'/environments/restaurant-street-high.glb',generationId:'bda700aa-4770-4091-bc4b-458db42fff99',displayUrl:'https://hyper3d.ai/workspace/rodin/bda700aa-4770-4091-bc4b-458db42fff99',measured,review:'Reference-driven architecture visually reviewed in browser; first text-only generation rejected.'};
manifest.implementationDocs='../../avatar-lab/IMPLEMENTED-v0.2.md';manifest.integrationDocs='../../avatar-lab/CONTRACT-v0.2.md';manifest.budgets.status='high-detail-desktop-build-not-compressed-target-device-acceptance-pending';
fs.writeFileSync('public/manifest.json',JSON.stringify(manifest,null,2));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));pkg.version='0.2.0';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log(JSON.stringify({actors:IDS.length,runtimeClips:manifest.actors.map(a=>a.runtimeClipCount),expressions:18,visemes:9,street:measured},null,2));
