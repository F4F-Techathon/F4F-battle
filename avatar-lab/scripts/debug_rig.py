import bpy
from mathutils import Vector
ob=next(o for o in bpy.context.scene.objects if o.type=='MESH');arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
print('MATRIX',ob.matrix_world,arm.matrix_world)
print('KEYS',[(k.name,k.value,min(v.co.z for v in k.data),max(v.co.z for v in k.data)) for k in ob.data.shape_keys.key_blocks])
for key in ob.data.shape_keys.key_blocks:
 ds=sorted([((v.co-key.data[i].co).length,i) for i,v in enumerate(ob.data.vertices)],reverse=True);print('KEYDELTA',key.name,ds[:2])
for b in arm.pose.bones:print('BONE',b.name,tuple(b.location),tuple(b.rotation_euler),tuple(b.scale))
bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();ev=ob.evaluated_get(dg).to_mesh();ds=sorted([((v.co-ev.vertices[i].co).length,i) for i,v in enumerate(ob.data.vertices)],reverse=True)
for d,i in ds[:10]:print('VERT',d,i,tuple(ob.data.vertices[i].co),tuple(ev.vertices[i].co),[(ob.vertex_groups[g.group].name,g.weight) for g in ob.data.vertices[i].groups])
