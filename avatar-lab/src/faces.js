import * as T from 'three';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {atlasSvg,EXPRESSION_TILES,EFFECTS,EFFECT_LABELS,FACE_LAYOUT} from './face-art.js';
import {SHAPES} from './story.js';
const atlases=new Map();
export function loadFaceAtlas(id){
 if(!atlases.has(id))atlases.set(id,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const texture=new T.Texture(img);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;resolve(texture);};img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(atlasSvg(id));}));
 return atlases.get(id);
}
function tileTexture(atlas,index){const t=atlas.clone();t.repeat.set(1/6,1/6);setTile(t,index);t.needsUpdate=true;return t;}
function setTile(t,i){t.offset.set(i%6/6,1-(Math.floor(i/6)+1)/6);}

// Remove only the baked-in facial artwork in UV space. The original geometry,
// normals, nose, cheeks and jaw remain intact; there is no covering face plane.
function cleanFaceTexture(mesh,p){
 const original=mesh.material.map;if(!original)return null;
 const image=original.image,c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,c.width,c.height),data=pixels.data,source=new Uint8ClampedArray(data),pos=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,indices=mesh.geometry.index;
 const getPixel=(u,v)=>Math.max(0,Math.min(c.height-1,Math.floor(v*c.height)))*c.width*4+Math.max(0,Math.min(c.width-1,Math.floor(u*c.width)))*4;
 const samples=[];
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
  if(Math.abs(x)>.065&&Math.abs(x)<.125&&y>p.mouth+.005&&y<p.eye-.028&&z>p.front-.14){const k=getPixel(uv.getX(i),uv.getY(i));if(source[k]>source[k+1]*1.04&&source[k+1]>source[k+2]*1.04&&source[k]>130)samples.push([source[k],source[k+1],source[k+2]]);}
 }
 const skin=[0,1,2].map(channel=>samples.length?samples.map(v=>v[channel]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]:[242,201,165][channel]);
 const cy=(p.brow+p.mouth)/2,ry=(p.brow-p.mouth)/2+.043,rx=p.width*.43;
 const mask=(x,y,z)=>{
  if(z<p.front-.17)return 0;
  const r=Math.hypot(x/rx,(y-cy)/ry);return (1-T.MathUtils.smoothstep(r,.78,1))*T.MathUtils.smoothstep(z,p.front-.17,p.front-.11);
 };
 const count=indices?.count??pos.count;
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(n=>indices?indices.getX(i+n):i+n),vs=ids.map(j=>[pos.getX(j),pos.getY(j),pos.getZ(j)]);
  if(vs.every(v=>v[1]<p.mouth-.06)||vs.every(v=>v[1]>p.brow+.06)||vs.every(v=>v[2]<p.front-.17)||vs.every(v=>Math.abs(v[0])>rx))continue;
  const ts=ids.map(j=>[uv.getX(j)*c.width,uv.getY(j)*c.height]);
  const minX=Math.max(0,Math.floor(Math.min(...ts.map(v=>v[0])))),maxX=Math.min(c.width-1,Math.ceil(Math.max(...ts.map(v=>v[0])))),minY=Math.max(0,Math.floor(Math.min(...ts.map(v=>v[1])))),maxY=Math.min(c.height-1,Math.ceil(Math.max(...ts.map(v=>v[1]))));
  const [a,b,d]=ts,den=(b[1]-d[1])*(a[0]-d[0])+(d[0]-b[0])*(a[1]-d[1]);if(Math.abs(den)<1e-8)continue;
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const u=((b[1]-d[1])*(x+.5-d[0])+(d[0]-b[0])*(y+.5-d[1]))/den,v=((d[1]-a[1])*(x+.5-d[0])+(a[0]-d[0])*(y+.5-d[1]))/den,w=1-u-v;if(Math.min(u,v,w)<-.015)continue;
   const xyz=[0,1,2].map(k=>vs[0][k]*u+vs[1][k]*v+vs[2][k]*w),alpha=mask(...xyz);if(!alpha)continue;
   const k=(y*c.width+x)*4;for(let ch=0;ch<3;ch++)data[k+ch]=Math.round(source[k+ch]*(1-alpha)+skin[ch]*alpha);
  }
 }
 ctx.putImageData(pixels,0,0);const texture=new T.CanvasTexture(c);texture.flipY=original.flipY;texture.colorSpace=original.colorSpace;texture.wrapS=original.wrapS;texture.wrapT=original.wrapT;texture.anisotropy=4;mesh.material.map=texture;mesh.material.needsUpdate=true;
 return {mesh,original,clean:texture};
}
export class Face {
 constructor(actor,atlas){
  this.actor=actor;this.expression='neutral';this.shape='X';this.manual=null;this.textures=[];this.maps=[];
  const head=actor.boneMap.head,object=actor.model;object.updateMatrixWorld(true);
  const profile={sichuan_owner:{mouth:1.31,eye:1.39,brow:1.44,width:.34,height:.28},cantonese_owner:{mouth:1.36,eye:1.45,brow:1.51,width:.37,height:.31},french_chef:{mouth:1.40,eye:1.47,brow:1.53,width:.32,height:.30}}[actor.config.id];
  profile.y=profile.eye-(128-109)/256*profile.height;profile.front=-Infinity;
  const meshes=[];object.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m);});
  for(const m of meshes){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))<.09&&Math.abs(p.getY(i)-profile.eye)<.09)profile.front=Math.max(profile.front,p.getZ(i));}
  if(!Number.isFinite(profile.front))profile.front=.2;
  this.group=new T.Group();this.group.name='ConformingFace';head.add(this.group);
  const center=object.localToWorld(new T.Vector3(0,profile.y,profile.front-.08)),orientation=new T.Euler().setFromQuaternion(object.getWorldQuaternion(new T.Quaternion())),size=new T.Vector3(profile.width,profile.height,.24);
  const pieces=[];let minDepth=Infinity,maxDepth=-Infinity;
  for(const m of meshes){
   const cleaned=cleanFaceTexture(m,profile);if(cleaned)this.maps.push(cleaned);
   const proxy=new T.Mesh(m.geometry);proxy.matrixWorld.copy(m.matrixWorld);
   const decal=new DecalGeometry(proxy,center,orientation,size);
   // Offset along each surface normal by 0.6mm, then bind to the same head bone.
   const positions=decal.attributes.position,normals=decal.attributes.normal;
   for(let i=0;i<positions.count;i++){minDepth=Math.min(minDepth,positions.getZ(i));maxDepth=Math.max(maxDepth,positions.getZ(i));positions.setXYZ(i,positions.getX(i)+normals.getX(i)*.0006,positions.getY(i)+normals.getY(i)*.0006,positions.getZ(i)+normals.getZ(i)*.0006);}
   decal.applyMatrix4(head.matrixWorld.clone().invert());pieces.push(decal);
  }
  const geometry=mergeGeometries(pieces);if(!geometry)throw Error('无法投射五官到头部曲面');
  this.surfaceVertices=geometry.attributes.position.count;this.surfaceDepthMeters=maxDepth-minDepth;
  this.layers=['brows','eyes','mouth'].map((key,i)=>{const t=tileTexture(atlas,FACE_LAYOUT[key]),material=new T.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1-i,polygonOffsetUnits:-1});const m=new T.Mesh(geometry,material);m.name='Face_'+key;m.renderOrder=4+i;this.group.add(m);this.textures.push(t);return m;});
  this.effect=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:false}));this.effect.position.copy(head.worldToLocal(object.localToWorld(new T.Vector3(profile.width*.6,profile.brow+.1,profile.front))));this.effectBase=this.effect.position.clone();this.effect.scale.setScalar(.14);this.effect.renderOrder=9;this.group.add(this.effect);this.effect.visible=false;
 }
 setEnabled(enabled){this.group.visible=enabled;for(const item of this.maps){item.mesh.material.map=enabled?item.clean:item.original;item.mesh.material.needsUpdate=true;}}
 setExpression(name){this.expression=EXPRESSION_TILES[name]?name:'neutral';this.setEffect(EFFECTS[this.expression]);}
 setEffect(name){
  if(this.effectName===name)return;this.effectName=name;this.effect.visible=!!name;if(!name)return;
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.font='bold 96px "Segoe UI Symbol",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=name==='heart'?'#C8402F':name==='cloud'?'#798598':'#E0A83B';ctx.strokeStyle='#F6EFE4';ctx.lineWidth=9;ctx.strokeText(EFFECT_LABELS[name],64,69);ctx.fillText(EFFECT_LABELS[name],64,69);this.effect.material.map?.dispose();this.effect.material.map=new T.CanvasTexture(c);this.effect.material.map.colorSpace=T.SRGBColorSpace;this.effect.material.needsUpdate=true;
 }
 update(shape,blink,time){
  const [b,e,m]=EXPRESSION_TILES[this.expression];this.shape=this.manual??shape;setTile(this.textures[0],b);setTile(this.textures[1],6+(blink?9:e));setTile(this.textures[2],this.shape!==null?24+Math.max(0,SHAPES.indexOf(this.shape)):16+m);
  if(this.effect.visible){this.effect.position.copy(this.effectBase);this.effect.position.y+=Math.sin(time*3)*.012;this.effect.material.rotation=Math.sin(time*2)*.08;}
 }
}
