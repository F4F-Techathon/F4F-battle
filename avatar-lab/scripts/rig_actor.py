"""Reproducible Blender rig + in-place action exporter for the three Rodin actors.
Run Blender --factory-startup -b --python scripts/rig_actor.py -- ACTOR_ID.
Landmarks are fitted to these reference poses, not a universal auto-rigger.
Facial keys are approximate surface deformations; there is no mouth interior.
"""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector, Quaternion
sys.path.insert(0, str(Path(__file__).parent))
from inspect_actor import import_normalized, setup_render, render_view

ROOT=Path(__file__).resolve().parents[1]
ACTOR=sys.argv[sys.argv.index('--')+1]
OUT=ROOT/'reports'/ACTOR
OUT.mkdir(parents=True,exist_ok=True)
meshes,info=import_normalized(ROOT/'source'/f'{ACTOR}.glb')
# Feet origin, 1.7m including hat. These proportions are tuned after source inspection.
profiles={
 'sichuan_owner':dict(hip=.66,knee=.35,ankle=.08,shoulder=1.10,elbow=.89,wrist=.72,neck=1.19,head=1.25,face=1.31,eyes=1.39,brow=1.44,legx=.13,kneex=.18,anklex=.23,armx=.17,elbowx=.29,wristx=.37),
 'cantonese_owner':dict(hip=.70,knee=.36,ankle=.09,shoulder=1.16,elbow=.96,wrist=.78,neck=1.25,head=1.29,face=1.36,eyes=1.45,brow=1.51,legx=.15,kneex=.20,anklex=.23,armx=.24,elbowx=.36,wristx=.46),
 'french_chef':dict(hip=.70,knee=.36,ankle=.08,shoulder=1.18,elbow=.95,wrist=.78,neck=1.27,head=1.32,face=1.40,eyes=1.47,brow=1.53,legx=.14,kneex=.19,anklex=.23,armx=.21,elbowx=.31,wristx=.39)
}
p=profiles[ACTOR]
armdata=bpy.data.armatures.new('RestaurantHumanoid')
arm=bpy.data.objects.new('RestaurantRig',armdata);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
 b=armdata.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=armdata.edit_bones[parent]
 return b
h=p['hip'];s=p['shoulder'];n=p['neck']
bone('root',(0,0,0),(0,0,.12))
bone('hips',(0,0,h),(0,0,h+.12),'root')
bone('spine',(0,0,h+.12),(0,0,s-.09),'hips')
bone('chest',(0,0,s-.09),(0,0,n-.04),'spine')
bone('neck',(0,0,n-.04),(0,0,p['head']),'chest')
bone('head',(0,0,p['head']),(0,0,1.63),'neck')
for side,sg in [('L',1),('R',-1)]:
 sh=(sg*p['armx'],0,s);el=(sg*p['elbowx'],-.015,p['elbow']);wr=(sg*p['wristx'],-.025,p['wrist'])
 bone('clavicle.'+side,(0,0,s),sh,'chest')
 bone('upper_arm.'+side,sh,el,'clavicle.'+side)
 bone('forearm.'+side,el,wr,'upper_arm.'+side)
 bone('hand.'+side,wr,(sg*(p['wristx']+.015),-.035,p['wrist']-.10),'forearm.'+side)
 hip=(sg*p['legx'],0,h);kn=(sg*p['kneex'],0,p['knee']);an=(sg*p['anklex'],0,p['ankle'])
 bone('thigh.'+side,hip,kn,'hips');bone('shin.'+side,kn,an,'thigh.'+side)
 bone('foot.'+side,an,(an[0],-.10,.04),'shin.'+side)
 bone('toe.'+side,(an[0],-.10,.04),(an[0],-.17,.04),'foot.'+side)
bpy.ops.object.mode_set(mode='OBJECT')
# Deterministic anatomical weighting: restrict candidate chains to avoid arm/torso bleed.
segments={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in armdata.bones}
def distance(v,a,b):
 ab=b-a;t=max(0,min(1,(v-a).dot(ab)/ab.length_squared));return (v-a-t*ab).length
for ob in meshes:
 groups={name:ob.vertex_groups.new(name=name) for name in segments}
 for v in ob.data.vertices:
  x,y,z=v.co;side='L' if x>0 else 'R';ax=abs(x)
  if z>n: names=['head','neck'] if z<n+.08 else ['head']
  elif ax>p['armx']*.9+max(0,s-z)*.28 and z>p['wrist']-.30:
   names=['upper_arm.'+side,'forearm.'+side,'hand.'+side,'clavicle.'+side]
  elif z<h-.04:
   # A front apron stays with the pelvis, while trouser legs are separated by x.
   if z>h-.15 and y<(-.03 if ACTOR=='french_chef' else -.10) and ax<p['legx']+.12:names=['hips']
   else:names=[a+'.'+side for a in ['thigh','shin','foot','toe']]
  else:names=['hips','spine','chest','neck']
  ds=sorted([(distance(v.co,*segments[name]),name) for name in names])[:2]
  ws=[math.exp(-d*d/.006) for d,name in ds];total=sum(ws)
  if total<1e-18:ws=[1]+[0]*(len(ds)-1);total=1
  for (_,name),w in zip(ds,ws):
   if w/total>.001:groups[name].add([v.index],w/total,'REPLACE')
 # Blender heat diffusion follows connected surfaces at fingers and shoulder seams.
 # Keep geometric weights above only as a fallback if heat diffusion cannot solve.
 fallback=[[(ob.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in ob.data.vertices]
 ob.vertex_groups.clear()
 for o in bpy.context.selected_objects:o.select_set(False)
 ob.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=arm
 armdata.bones['root'].use_deform=False
 try:
  bpy.ops.object.parent_set(type='ARMATURE_AUTO')
  if any(not v.groups for v in ob.data.vertices):raise RuntimeError('unweighted vertices')
  weighting='Blender bone heat diffusion'
 except Exception as exc:
  print('HEAT_FALLBACK',str(exc));ob.vertex_groups.clear()
  groups={name:ob.vertex_groups.new(name=name) for name in segments}
  for i,weights in enumerate(fallback):
   for name,w in weights:groups[name].add([i],w,'REPLACE')
  ob.parent=arm
  if not any(m.type=='ARMATURE' for m in ob.modifiers):
   mod=ob.modifiers.new('Weighted humanoid','ARMATURE');mod.object=arm
  weighting='Anatomical region fallback'
 # French chef: the thumb crosses the diagonal arm/torso classifier boundary.
 # Bind the complete palm/fingers as one hand, blending only across the wrist.
 # Apply after heat/fallback so regeneration cannot reintroduce torso/leg weights.
 if ACTOR=='french_chef':
  for v in ob.data.vertices:
   x,y,z=v.co
   if abs(x)>.28 and .50<z<.86:
    side='L' if x>0 else 'R'
    t=max(0,min(1,(z-.76)/.10));forearm=t*t*(3-2*t)
    for group in ob.vertex_groups:group.remove([v.index])
    ob.vertex_groups['hand.'+side].add([v.index],1-forearm,'REPLACE')
    ob.vertex_groups['forearm.'+side].add([v.index],forearm,'REPLACE')
  weighting+='; complete-hand override with smooth wrist blend'
 ob.shape_key_add(name='Basis',from_mix=False)
 # Keys are intentionally limited to the front facial surface. No hidden viseme claim.
 for key in ['MouthOpen','Smile','Frown','BrowUp','BrowDown','BlinkLeft','BlinkRight']:
  sk=ob.shape_key_add(name=key,from_mix=False);sk.value=0
  for i,v in enumerate(ob.data.vertices):
   x,y,z=v.co
   front=max(0,min(1,(-y-.07)/.08))
   def g(cx,cz,sx,sz):return math.exp(-((x-cx)/sx)**2-((z-cz)/sz)**2)*front
   if key=='MouthOpen':sk.data[i].co.z-=.033*g(0,p['face']-.018,.070,.045)
   elif key=='Smile':sk.data[i].co.z+=.018*(g(.055,p['face'],.035,.026)+g(-.055,p['face'],.035,.026))
   elif key=='Frown':sk.data[i].co.z-=.012*(g(.055,p['face'],.035,.026)+g(-.055,p['face'],.035,.026))
   elif key=='BrowUp':sk.data[i].co.z+=.015*g(0,p['brow'],.14,.022)
   elif key=='BrowDown':sk.data[i].co.z-=.012*g(0,p['brow'],.14,.022)
   else:
    cx=.075 if key=='BlinkLeft' else -.075
    sk.data[i].co.z+=(p['eyes']-z)*.82*g(cx,p['eyes'],.048,.04)
 for poly in ob.data.polygons:poly.use_smooth=True

clips={'idle':3.0,'run':.8,'arrive':.9,'wave':2.0,'present':2.4,'point':1.6,'nod':1.3,'disagree':1.6,'recoil':1.2,'celebrate':2.2,'signature':2.6}
fps=30;bpy.context.scene.render.fps=fps
def pose(name,phase):
 def r(b,x=0,y=0,z=0):arm.pose.bones[b].rotation_euler=(math.radians(x),math.radians(y),math.radians(z))
 def loc(b,x=0,y=0,z=0):arm.pose.bones[b].location=(x,y,z)
 def wy(b,angle):
  rest=arm.pose.bones[b].bone.matrix_local.to_quaternion()
  q=rest.inverted() @ Quaternion((0,1,0),math.radians(angle)) @ rest
  arm.pose.bones[b].rotation_euler=q.to_euler()
 t=phase;sn=math.sin(2*math.pi*t);env=math.sin(math.pi*t)**2
 # Relax A-pose arms slightly, with breathing through spine.
 r('upper_arm.L',z=-8);r('upper_arm.R',z=8)
 r('spine',x=1.3*sn);r('head',z=1.2*sn)
 if name=='idle':r('chest',x=-1.5*sn)
 elif name=='run':
  r('thigh.L',x=26*sn);r('thigh.R',x=-26*sn);r('shin.L',x=-max(0,-sn)*38);r('shin.R',x=-max(0,sn)*38)
  r('upper_arm.L',x=-30*sn,z=-8);r('upper_arm.R',x=30*sn,z=8);r('forearm.L',x=-35);r('forearm.R',x=-35)
  loc('hips',z=.015*(1-math.cos(4*math.pi*t)));r('chest',x=6)
 elif name=='arrive':r('hips',x=8*env);r('thigh.L',x=12*env);r('shin.L',x=-18*env);r('thigh.R',x=12*env);r('shin.R',x=-18*env)
 elif name=='wave':wy('upper_arm.R',65*env);wy('forearm.R',55*env);wy('hand.R',14*math.sin(t*8*math.pi)*env)
 elif name=='present':r('upper_arm.L',x=-20*env,z=20*env);r('forearm.L',x=-45*env);r('upper_arm.R',x=-18*env,z=-20*env);r('forearm.R',x=-40*env);r('head',x=-4*env)
 elif name=='point':r('upper_arm.L',x=-50*env,z=15*env);r('forearm.L',x=-15*env);r('head',z=-9*env)
 elif name=='nod':r('head',x=12*math.sin(4*math.pi*t)*env)
 elif name=='disagree':r('head',y=14*math.sin(4*math.pi*t)*env);r('forearm.R',x=-40*env);r('hand.R',z=15*sn*env)
 elif name=='recoil':r('chest',x=-15*env);r('head',x=-8*env);r('upper_arm.L',x=-35*env);r('upper_arm.R',x=-35*env)
 elif name=='celebrate':wy('upper_arm.L',-75*env);wy('upper_arm.R',75*env);wy('forearm.L',-25*env);wy('forearm.R',25*env);loc('hips',z=.04*env)
 elif name=='signature':
  if ACTOR=='sichuan_owner':r('forearm.L',x=-75*env);r('forearm.R',x=-45*env);r('chest',y=10*sn*env)
  elif ACTOR=='cantonese_owner':r('chest',x=14*env);r('forearm.L',x=-50*env);r('forearm.R',x=-50*env)
  else:r('chest',x=12*env);r('upper_arm.R',x=-30*env,z=-35*env);r('forearm.L',x=-60*env)

arm.animation_data_create()
for name,duration in clips.items():
 action=bpy.data.actions.new(name);arm.animation_data.action=action
 frames=round(duration*fps)
 for f in range(0,frames+1,3):
  for b in arm.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
  pose(name,f/frames)
  for b in arm.pose.bones:
   b.keyframe_insert('rotation_euler',frame=f);b.keyframe_insert('location',frame=f)
 track=arm.animation_data.nla_tracks.new();track.name=name
 strip=track.strips.new(name,0,action);strip.name=name;track.mute=True
arm.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(0)
for o in bpy.context.scene.objects:o.select_set(False)
arm.select_set(True)
for ob in meshes:ob.select_set(True)
bpy.context.view_layer.objects.active=arm
blend=ROOT/'source'/f'{ACTOR}-rigged.blend';glb=ROOT/'public/models'/f'{ACTOR}.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_anim_slide_to_zero=True,export_skins=True,export_morph=True,export_yup=True)
report={'actorId':ACTOR,'height':1.7,'joints':len(armdata.bones),'clips':clips,'landmarks':p,'morphTargets':['MouthOpen','Smile','Frown','BrowUp','BrowDown','BlinkLeft','BlinkRight'],'facialQuality':'Approximate surface deformation. No mouth cavity, teeth, phoneme-specific blendshapes or eye rig.','weighting':weighting+'; review required for extreme poses.','vertices':sum(len(o.data.vertices) for o in meshes),'triangles':sum(len(poly.vertices)-2 for o in meshes for poly in o.data.polygons),'glbBytes':glb.stat().st_size}
(OUT/'rig-report.json').write_text(json.dumps(report,indent=2))
cam=setup_render(OUT,768)
for clip,frame in [('idle',0),('wave',30),('run',6)]:
 arm.animation_data.action=bpy.data.actions[clip];bpy.context.scene.frame_set(frame)
 render_view(cam,(0,-4.5,.88),(0,0,.88),OUT/f'{clip}.png')
print('RIG_COMPLETE',json.dumps(report))
