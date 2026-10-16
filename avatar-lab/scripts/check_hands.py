"""Regression check: sample all clips and catch stretched hand edges."""
import bpy,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/('source/french_chef-rigged.blend1' if '--before' in sys.argv else 'source/french_chef-rigged.blend')))
ob=next(o for o in bpy.context.scene.objects if o.type=='MESH');rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
verts=ob.data.vertices
mask={v.index for v in verts if abs(v.co.x)>.28 and .50<v.co.z<.80}
edges=[]
for e in ob.data.edges:
 a,b=e.vertices
 if a in mask and b in mask:
  rest=(verts[a].co-verts[b].co).length
  if rest>.0003:edges.append((a,b,rest))
results=[]
for action in bpy.data.actions:
 if action.name not in ['idle','run','arrive','wave','present','point','nod','disagree','recoil','celebrate','signature']:continue
 rig.animation_data.action=action
 worst=1.;extension=0.
 for step in range(13):
  bpy.context.scene.frame_set(round(action.frame_range[0]+(action.frame_range[1]-action.frame_range[0])*step/12))
  dg=bpy.context.evaluated_depsgraph_get();ev=ob.evaluated_get(dg);me=ev.to_mesh()
  for a,b,rest in edges:
   length=(me.vertices[a].co-me.vertices[b].co).length
   worst=max(worst,length/rest);extension=max(extension,length-rest)
  ev.to_mesh_clear()
 results.append(dict(clip=action.name,maxEdgeStretch=worst,maxEdgeExtensionMeters=extension))
report=dict(handVertices=len(mask),handEdges=len(edges),samplesPerClip=13,passed=all(r['maxEdgeStretch']<3 and r['maxEdgeExtensionMeters']<.03 for r in results),clips=results)
name=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hand-validation.json'
(root/'reports'/name).write_text(json.dumps(report,indent=2));print(json.dumps(report))
if not report['passed']:raise RuntimeError('Hand edge stretch regression')
