"""Blender headless source inspection. Does not edit or replace the source GLB.

blender -b --python scripts/inspect_actor.py -- source/actor.glb reports/actor
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector, Matrix


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('source')
    p.add_argument('output')
    p.add_argument('--yaw', type=float, default=0.0)
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:])


def import_normalized(source, yaw=0):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise RuntimeError('No mesh in source')
    for ob in meshes:
        matrix = ob.matrix_world.copy()
        ob.parent = None
        ob.matrix_world = matrix
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    pts = [v.co.copy() for ob in meshes for v in ob.data.vertices]
    lo = Vector(tuple(min(v[i] for v in pts) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in pts) for i in range(3)))
    bounds_before = [list(lo), list(hi)]
    scale = 1.7 / (hi.z - lo.z)
    center = Vector(((lo.x + hi.x)/2, (lo.y + hi.y)/2, lo.z))
    rot = Matrix.Rotation(math.radians(yaw), 4, 'Z')
    for ob in meshes:
        for v in ob.data.vertices:
            v.co = rot @ ((v.co - center) * scale)
        ob.data.update()
    for ob in list(bpy.context.scene.objects):
        if ob not in meshes:
            bpy.data.objects.remove(ob, do_unlink=True)
    bpy.context.view_layer.update()
    return meshes, {'originalBoundsBlender': bounds_before,
                    'normalizationScale': scale, 'yawDegrees': yaw}


def aim(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()


def setup_render(output, size=768):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world.color = (0.30, 0.30, 0.30)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (0.55, 0.55, 0.55, 1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value = 0.65
    scene.view_settings.view_transform = 'AgX'
    for pos, energy, scale in [((3, -4, 5), 550, 5), ((-3, -2, 3), 300, 4), ((1, 3, 4), 450, 3)]:
        bpy.ops.object.light_add(type='AREA', location=pos)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = 'DISK'
        light.data.size = scale
        aim(light, (0, 0, .9))
    bpy.ops.object.camera_add(location=(0, -4.5, .88))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 1.9
    aim(camera, (0, 0, .88))
    scene.camera = camera
    return camera


def render_view(camera, location, target, filename, scale=1.9):
    camera.location = location
    aim(camera, target)
    camera.data.ortho_scale = scale
    bpy.context.scene.render.filepath = str(filename)
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    meshes, report = import_normalized(Path(args.source).resolve(), args.yaw)
    pts = [v.co.copy() for ob in meshes for v in ob.data.vertices]
    report['meshes'] = [{'name':o.name, 'vertices':len(o.data.vertices),
                         'polygons':len(o.data.polygons),
                         'materials':[m.name for m in o.data.materials if m]}
                        for o in meshes]
    report['normalizedBoundsBlender'] = [[min(v[i] for v in pts) for i in range(3)],
                                        [max(v[i] for v in pts) for i in range(3)]]
    report['heightSlices'] = []
    for z in [.1, .25, .45, .65, .75, .85, .95, 1.05, 1.15, 1.25, 1.35, 1.45, 1.55]:
        slab = [v for v in pts if abs(v.z-z)<.025]
        if slab:
            report['heightSlices'].append({'z':z,
                'xRange':[min(v.x for v in slab), max(v.x for v in slab)],
                'yRange':[min(v.y for v in slab), max(v.y for v in slab)]})
    (output/'source-inspection.json').write_text(json.dumps(report, indent=2))
    camera = setup_render(output)
    render_view(camera, (0,-4.5,.88),(0,0,.88), output/'source-front.png')
    render_view(camera, (4.5,0,.88),(0,0,.88), output/'source-side.png')
    render_view(camera, (0,4.5,.88),(0,0,.88), output/'source-back.png')
    render_view(camera, (0,-4.5,1.38),(0,0,1.38), output/'source-face.png', .65)
    print('INSPECTION_COMPLETE', json.dumps(report))


if __name__ == '__main__':
    main()
