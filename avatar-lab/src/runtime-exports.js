import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createProp} from './set.js';
import {atlasSvg} from './face-art.js';
function base64(buffer){const bytes=new Uint8Array(buffer);let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(out);}
export async function exportRuntimeAssets(actors){
 const files=[];const exporter=new GLTFExporter();
 for(const id of ['ladle','teapot','whisk']){const prop=createProp(id);const glb=await exporter.parseAsync(prop,{binary:true,trs:true});files.push({path:'public/props/'+id+'.glb',encoding:'base64',content:base64(glb)});}
 for(const actor of actors){
  files.push({path:'public/faces/'+actor.config.id+'.svg',encoding:'utf8',content:atlasSvg(actor.config.id)});
  const clips=Object.values(actor.actions).map(a=>T.AnimationClip.toJSON(a.getClip()));
  files.push({path:'public/animations/'+actor.config.id+'.json',encoding:'utf8',content:JSON.stringify({actorId:actor.config.id,format:'THREE.AnimationClip',note:'Original GLB clips plus procedural performance clips; bone names follow GLTFLoader sanitization.',clips},null,2)});
 }
 return files;
}
