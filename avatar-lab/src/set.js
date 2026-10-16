import * as T from 'three';
export function solid(geometry,color,position,parent){const m=new T.Mesh(geometry,new T.MeshToonMaterial({color}));m.position.set(...position);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
export function label(text,color='#1F2A44',background='#F6EFE4'){
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.font='bold 46px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65,490);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
export const mapPosition=([x,y])=>new T.Vector3((x-.5)*6.4,.065,-3+y*5.8);
export function createSet(scene,cast){
 const map=new T.Group(),stage=new T.Group();scene.add(map,stage);stage.visible=false;
 solid(new T.PlaneGeometry(100,100),0xf6efe4,[0,-.16,0],scene).rotation.x=-Math.PI/2;
 solid(new T.BoxGeometry(8,.15,6.1),0xe2dfcc,[0,-.08,-.6],map);
 for(const z of [-2.2,-.25,1.4])solid(new T.BoxGeometry(7.6,.012,.43),0xf6efe4,[0,.006,z],map);
 for(const x of [-1.35,1.35])solid(new T.BoxGeometry(.38,.014,5.7),0xf6efe4,[x,.008,-.6],map);
 const pins=[];
 function shop(id,name,pos,color){
  const group=new T.Group();group.position.copy(mapPosition(pos));map.add(group);
  solid(new T.BoxGeometry(.72,.47,.55),0xfaf5e9,[0,.235,-.25],group);
  const roof=solid(new T.ConeGeometry(.6,.27,4),color,[0,.6,-.25],group);roof.rotation.y=Math.PI/4;
  const sign=new T.Mesh(new T.PlaneGeometry(.7,.175),new T.MeshBasicMaterial({map:label(name)}));sign.position.set(0,.4,.035);group.add(sign);
  solid(new T.BoxGeometry(.15,.23,.025),0xb2c7bd,[0,.12,.04],group);
  const pin=new T.Group();pin.position.set(0,.95,-.25);group.add(pin);
  const disc=solid(new T.SphereGeometry(.12,16,12),color,[0,0,0],pin);const stem=solid(new T.ConeGeometry(.07,.17,12),color,[0,-.15,0],pin);stem.rotation.z=Math.PI;
  const p={id,group,pin,disc,stem,roof,origin:pin.position.clone(),selected:true};pins.push(p);return p;
 }
 cast.forEach((c,i)=>shop(c.id,['川味小馆','粤来茶楼','BONJOUR'][i],c.pos,c.color));
 [['小面馆',[.14,.08]],['咖喱屋',[.86,.08]],['小食堂',[.5,.83]]].forEach(([name,pos],i)=>shop('extra-'+i,name,pos,0xbab6a8));
 for(const [x,z]of[[-3.3,1.5],[3.3,1.5],[-3.3,-2.9],[3.3,-2.9]]){
  solid(new T.CylinderGeometry(.035,.05,.45,7),0xb49a74,[x,.2,z],map);solid(new T.IcosahedronGeometry(.3,1),0xa8bc8e,[x,.58,z],map);
 }
 const meeting=solid(new T.CylinderGeometry(.9,.9,.015,48),0xe0a83b,[0,.025,1.15],map);meeting.material.transparent=true;meeting.material.opacity=.22;
 solid(new T.CylinderGeometry(2.9,3,.22,80),0xd9cfc1,[0,-.045,0],stage);
 solid(new T.CylinderGeometry(2.75,2.8,.08,80),0xf6efe4,[0,.035,0],stage);
 solid(new T.BoxGeometry(6.7,3.25,.16),0xe5d8c5,[0,1.55,-1.15],stage);
 for(const x of [-3.15,3.15])solid(new T.BoxGeometry(.43,3.4,.3),0x2b3a67,[x,1.58,-.97],stage);
 const title=new T.Mesh(new T.PlaneGeometry(2.8,.7),new T.MeshBasicMaterial({map:label('今晚吃谁？')}));title.position.set(0,2.35,-1.055);stage.add(title);
 const plates=[];
 cast.forEach(c=>{
  const d=solid(new T.CylinderGeometry(.56,.56,.012,48),c.color,[c.slot[0],.085,c.slot[2]],stage);d.material.transparent=true;d.material.opacity=.18;
  const plate=new T.Mesh(new T.PlaneGeometry(.94,.2),new T.MeshBasicMaterial({map:label(c.restaurant)}));plate.position.set(c.slot[0],.14,.66);stage.add(plate);plates.push(plate);
  const light=new T.SpotLight(0xffedcd,6,8,.36,.72,1.5);light.position.set(c.slot[0],4,1.6);light.target.position.set(...c.slot);stage.add(light,light.target);
 });
 const environment={status:'placeholder',triangles:0,bytes:null,ground:.085};
 return {map,stage,pins,plates,environment,
  async loadStreet(loader){
   environment.status='loading';
   try{
    const gltf=await loader.loadAsync('/environments/restaurant-street-high.glb');const root=gltf.scene;
    root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),scale=9.5/Math.max(size.x,size.z);
    root.scale.setScalar(scale);root.position.set(-center.x*scale,-box.min.y*scale-.03,-center.z*scale-.7);root.name='Hyper3D_RestaurantStreet';
    root.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;environment.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(m[key])m[key].anisotropy=4;}});
    const keep=new Set(pins.map(p=>p.group));for(const child of map.children)if(!keep.has(child))child.visible=false;
    for(const p of pins)for(const child of p.group.children)if(child!==p.pin)child.visible=false;
    map.add(root);root.updateMatrixWorld(true);
    const ray=new T.Raycaster(new T.Vector3(0,10,.6),new T.Vector3(0,-1,0));const hits=ray.intersectObject(root,true);environment.ground=(hits[0]?.point.y??.065)+.02;environment.root=root;environment.status='ready';
    for(const p of pins){p.pin.position.y=.8+environment.ground;p.origin.copy(p.pin.position);}
    return environment;
   }catch(error){environment.status='failed';environment.error=error.message;return environment;}
  },
  groundAt(x,z){if(!environment.root)return environment.ground;const ray=new T.Raycaster(new T.Vector3(x,8,z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(environment.root,true).find(h=>h.point.y>=environment.ground-.12&&h.point.y<=environment.ground+.4);return hit?hit.point.y+.02:environment.ground;},
  select(restaurants){for(const p of pins){const r=restaurants.find(r=>r.id===p.id);p.selected=!!r;if(r){p.group.position.copy(mapPosition(r.pos));p.roof.material.color.set(cast.find(c=>c.id===r.id).color);}else{p.disc.material.color.set(0xaaa89e);p.stem.material.color.set(0xaaa89e);p.roof.material.color.set(0xc7c5ba);}}},
  reset(){for(const p of pins){p.pin.position.copy(p.origin);p.pin.scale.setScalar(1);p.selected=true;const c=cast.find(c=>c.id===p.id);p.disc.material.color.set(c?.color??0xbab6a8);p.stem.material.color.copy(p.disc.material.color);p.roof.material.color.copy(p.disc.material.color);}},
  update(t,filterProgress){if(filterProgress!==null)for(const p of pins){p.pin.position.y=p.origin.y+(p.selected?Math.sin(Math.min(1,filterProgress)*Math.PI)*.35:-Math.min(1,filterProgress)*.8);p.pin.scale.setScalar(p.selected?1:1-Math.min(1,filterProgress)*.7);}},
 };
}
export function createProp(id){
 const g=new T.Group();g.name=id;
 if(id==='ladle'){
  solid(new T.CylinderGeometry(.012,.018,.36,10),0x8a4b2a,[0,.08,0],g);
  const bowl=solid(new T.SphereGeometry(.067,20,12,0,Math.PI*2,0,Math.PI/2),0x829498,[0,.28,0],g);bowl.rotation.x=Math.PI;bowl.scale.y=.48;
 }else if(id==='teapot'){
  const body=solid(new T.SphereGeometry(.085,20,14),0x8a4b2a,[0,.04,0],g);body.scale.y=.8;
  solid(new T.CylinderGeometry(.057,.07,.018,16),0x6f3825,[0,.11,0],g);solid(new T.SphereGeometry(.018,10,8),0x6f3825,[0,.13,0],g);
  const curve=new T.CatmullRomCurve3([new T.Vector3(.06,.04,0),new T.Vector3(.1,.07,0),new T.Vector3(.15,.12,0)]);
  solid(new T.TubeGeometry(curve,10,.016,8),0x8a4b2a,[0,0,0],g);
  const handle=solid(new T.TorusGeometry(.059,.011,8,20),0x8a4b2a,[-.075,.055,0],g);handle.scale.x=.7;
 }else{
  solid(new T.CylinderGeometry(.015,.018,.15,10),0x7a1f3d,[0,-.04,0],g);
  for(let i=0;i<4;i++){const loop=solid(new T.TorusGeometry(.052,.0035,6,28),0x9eafb5,[0,.08,0],g);loop.scale.y=1.6;loop.rotation.y=i*Math.PI/4;}
 }
 return g;
}
