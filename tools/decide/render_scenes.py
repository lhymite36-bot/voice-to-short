#!/usr/bin/env python3
"""WESTGATE Decide showcase — advanced Blender 5 EEVEE (richer than What-if / aiming past reference)."""
import bpy, math, os, shutil, sys
from mathutils import Vector, Euler

OUT = "/workspace/decide/scenes"
os.makedirs(OUT, exist_ok=True)

# Higher quality than What-if (540x960/24taa/6f) — still software-renderable
RES_X, RES_Y = 648, 1152
TAA = 32
DEFAULT_FRAMES = 8

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.curves, bpy.data.fonts):
        for b in list(coll):
            try: coll.remove(b)
            except Exception: pass

def mat(name, color, rough=0.7, metal=0.0, emit=0.0, alpha=1.0, emit_color=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nodes = nt.nodes; nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Metallic' in bsdf.inputs: bsdf.inputs['Metallic'].default_value = metal
    ec = emit_color or color
    if emit > 0:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (*ec, 1)
            bsdf.inputs['Emission Strength'].default_value = emit
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = (*ec, 1)
    if alpha < 1:
        m.blend_method = 'BLEND'
        bsdf.inputs['Alpha'].default_value = alpha
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return m

def box(name, loc, scale, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name; ob.scale = scale
    ob.data.materials.append(material); return ob

def cyl(name, loc, scale, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name; ob.scale = scale
    ob.data.materials.append(material); return ob

def sphere(name, loc, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=loc)
    ob = bpy.context.active_object; ob.name = name; ob.scale = scale
    ob.data.materials.append(material); return ob

def text_obj(name, body, loc, size=0.18, material=None, rot=(math.radians(90),0,math.radians(180)), extrude=0.01):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name
    ob.data.body = body
    ob.data.size = size
    ob.data.extrude = extrude
    ob.data.align_x = 'CENTER'
    ob.data.align_y = 'CENTER'
    if material: ob.data.materials.append(material)
    # convert to mesh for reliable render
    bpy.ops.object.convert(target='MESH')
    return bpy.context.active_object

def area_light(loc, energy, size, color=(1,0.95,0.85), rot=(0,0,0)):
    bpy.ops.object.light_add(type='AREA', location=loc, rotation=rot)
    L = bpy.context.active_object
    L.data.energy = energy; L.data.size = size; L.data.color = color
    return L

def spot_light(loc, energy, color=(1,0.95,0.8), rot=(math.radians(-35),0,0), size=0.15, blend=0.35):
    bpy.ops.object.light_add(type='SPOT', location=loc, rotation=rot)
    L = bpy.context.active_object
    L.data.energy = energy; L.data.color = color
    L.data.spot_size = math.radians(42); L.data.spot_blend = blend
    if hasattr(L.data, 'shadow_soft_size'): L.data.shadow_soft_size = size
    return L

def point_light(loc, energy, color=(1,1,1)):
    bpy.ops.object.light_add(type='POINT', location=loc)
    L = bpy.context.active_object
    L.data.energy = energy; L.data.color = color
    return L

def block_person(name, loc, skin, shirt, pants, facing=0.0, pose='stand', hat=None, smile=False, glow_eyes=False):
    root = bpy.data.objects.new(name + '_root', None)
    bpy.context.collection.objects.link(root)
    mskin = mat(name+'_skin', skin, 0.85)
    mshirt = mat(name+'_shirt', shirt, 0.65)
    mpants = mat(name+'_pants', pants, 0.7)
    mhair = mat(name+'_hair', (0.12, 0.08, 0.06), 0.9)
    mshoe = mat(name+'_shoe', (0.08, 0.08, 0.1), 0.55)
    if glow_eyes:
        meye = mat(name+'_eye', (0.95, 0.95, 1.0), 0.2, emit=12.0, emit_color=(0.95,0.95,1))
    else:
        meye = mat(name+'_eye', (0.05, 0.05, 0.08), 0.35)
    if smile:
        mmouth = mat(name+'_mouth', (1,1,1), 0.3, emit=8.0, emit_color=(1,1,1))
    else:
        mmouth = mat(name+'_mouth', (0.35, 0.1, 0.12), 0.5)
    parts = []
    def P(ob):
        parts.append(ob); return ob
    if pose == 'sit':
        P(box(name+'_torso', (0, 0, 0.72), (0.4, 0.25, 0.48), mshirt))
        P(sphere(name+'_head', (0, 0.03, 1.15), (0.32, 0.32, 0.32), mskin))
        P(box(name+'_legL', (-0.1, 0.2, 0.3), (0.13, 0.38, 0.13), mpants, rot=(1.1, 0, 0)))
        P(box(name+'_legR', (0.1, 0.2, 0.3), (0.13, 0.38, 0.13), mpants, rot=(1.1, 0, 0)))
        P(box(name+'_armL', (-0.32, 0.02, 0.75), (0.1, 0.1, 0.38), mskin))
        P(box(name+'_armR', (0.32, 0.02, 0.75), (0.1, 0.1, 0.38), mskin))
        P(box(name+'_shoeL', (-0.1, 0.45, 0.09), (0.15, 0.24, 0.09), mshoe))
        P(box(name+'_shoeR', (0.1, 0.45, 0.09), (0.15, 0.24, 0.09), mshoe))
        hz = 1.18
    elif pose == 'walk':
        P(box(name+'_torso', (0, 0, 0.95), (0.4, 0.25, 0.52), mshirt))
        P(sphere(name+'_head', (0, 0.03, 1.4), (0.32, 0.32, 0.32), mskin))
        P(box(name+'_legL', (-0.1, 0.08, 0.36), (0.13, 0.15, 0.62), mpants, rot=(0.25,0,0)))
        P(box(name+'_legR', (0.1, -0.08, 0.36), (0.13, 0.15, 0.62), mpants, rot=(-0.25,0,0)))
        P(box(name+'_armL', (-0.32, -0.05, 0.92), (0.1, 0.1, 0.45), mskin, rot=(0.3,0,0)))
        P(box(name+'_armR', (0.32, 0.1, 1.05), (0.1, 0.1, 0.45), mskin, rot=(-0.9,0,0)))  # flashlight arm
        P(box(name+'_shoeL', (-0.1, 0.12, 0.05), (0.15, 0.24, 0.09), mshoe))
        P(box(name+'_shoeR', (0.1, -0.04, 0.05), (0.15, 0.24, 0.09), mshoe))
        hz = 1.42
    else:
        P(box(name+'_torso', (0, 0, 0.95), (0.4, 0.25, 0.52), mshirt))
        P(sphere(name+'_head', (0, 0.03, 1.4), (0.32, 0.32, 0.32), mskin))
        P(box(name+'_legL', (-0.1, 0, 0.36), (0.13, 0.15, 0.62), mpants))
        P(box(name+'_legR', (0.1, 0, 0.36), (0.13, 0.15, 0.62), mpants))
        P(box(name+'_armL', (-0.32, 0, 0.92), (0.1, 0.1, 0.45), mskin))
        P(box(name+'_armR', (0.32, 0, 0.92), (0.1, 0.1, 0.45), mskin))
        P(box(name+'_shoeL', (-0.1, 0.04, 0.05), (0.15, 0.24, 0.09), mshoe))
        P(box(name+'_shoeR', (0.1, 0.04, 0.05), (0.15, 0.24, 0.09), mshoe))
        hz = 1.42
    # hair / hat
    if hat == 'cap':
        mhat = mat(name+'_hat', (0.55, 0.08, 0.1), 0.55)
        P(cyl(name+'_cap', (0, 0.02, hz + 0.12), (0.36, 0.36, 0.16), mhat))
        P(box(name+'_brim', (0, 0.14, hz + 0.06), (0.34, 0.16, 0.04), mhat))
    else:
        P(box(name+'_hair', (0, -0.02, hz + 0.12), (0.3, 0.28, 0.1), mhair))
    P(sphere(name+'_eyeL', (-0.08, 0.14, hz), (0.07, 0.04, 0.08), meye))
    P(sphere(name+'_eyeR', (0.08, 0.14, hz), (0.07, 0.04, 0.08), meye))
    if smile:
        # wide crescent grin
        P(box(name+'_grin', (0, 0.15, hz - 0.1), (0.18, 0.03, 0.06), mmouth))
        mtooth = mat(name+'_tooth', (0.95,0.95,0.9), 0.3, emit=2.0)
        for tx in (-0.06, -0.02, 0.02, 0.06):
            P(box(name+f'_t{tx}', (tx, 0.16, hz - 0.08), (0.025, 0.02, 0.035), mtooth))
    else:
        P(box(name+'_mouth', (0, 0.15, hz - 0.1), (0.08, 0.02, 0.025), mmouth))
    # security badge
    if 'guard' in name or shirt[2] > 0.3:
        mbadge = mat(name+'_badge', (0.85, 0.7, 0.15), 0.3, 0.8, emit=0.5)
        P(box(name+'_badge', (0.12, 0.13, 1.05), (0.08, 0.02, 0.05), mbadge))
    for o in parts:
        o.parent = root
    root.location = Vector(loc)
    root.rotation_euler = (0, 0, facing)
    return root

def flashlight(parent_loc, aim_rot=(math.radians(-25),0,math.radians(10))):
    mbody = mat('fl_body', (0.15,0.15,0.18), 0.4, 0.6)
    mlens = mat('fl_lens', (1,0.95,0.7), 0.2, emit=10.0, emit_color=(1,0.95,0.7))
    body = cyl('flashlight', (parent_loc[0]+0.28, parent_loc[1]+0.25, parent_loc[2]+1.15), (0.06,0.06,0.28), mbody, rot=(math.radians(90),0,0))
    lens = cyl('fl_lens', (parent_loc[0]+0.28, parent_loc[1]+0.42, parent_loc[2]+1.15), (0.05,0.05,0.04), mlens, rot=(math.radians(90),0,0))
    spot_light((parent_loc[0]+0.28, parent_loc[1]+0.5, parent_loc[2]+1.15), 400, color=(1.0,0.92,0.75), rot=aim_rot)
    return body

# ---------- SETS ----------
def mall_desk_set(monitors_on=True, empty_chair_cam=False, glitch=False):
    mfloor = mat('floor', (0.18,0.18,0.2), 0.55, 0.1)
    mwall = mat('wall', (0.22,0.24,0.28), 0.75)
    mceil = mat('ceil', (0.12,0.12,0.14), 0.8)
    mdesk = mat('desk', (0.25,0.18,0.12), 0.55)
    mmetal = mat('metal', (0.45,0.45,0.48), 0.25, 0.85)
    mblack = mat('black', (0.05,0.05,0.06), 0.4)
    mled = mat('led', (0.1,0.85,0.45) if not glitch else (0.9,0.15,0.1), 0.3, emit=6.0,
               emit_color=(0.1,0.85,0.45) if not glitch else (0.95,0.12,0.08))
    mscreen = mat('screen', (0.05,0.12,0.08) if monitors_on else (0.02,0.02,0.03), 0.35,
                  emit=3.0 if monitors_on else 0.1, emit_color=(0.15,0.55,0.35) if not glitch else (0.6,0.1,0.1))
    mexit = mat('exit', (0.1,0.9,0.3), 0.3, emit=8.0, emit_color=(0.2,1.0,0.35))
    mred = mat('redled', (0.95,0.1,0.08), 0.3, emit=5.0, emit_color=(1,0.15,0.1))

    box('floor', (0,0,0), (10, 8, 0.08), mfloor)
    box('ceil', (0,0,3.2), (10, 8, 0.08), mceil)
    box('wallB', (0,-3.5,1.6), (10, 0.15, 3.2), mwall)
    box('wallL', (-4.8,0,1.6), (0.15, 8, 3.2), mwall)
    box('wallR', (4.8,0,1.6), (0.15, 8, 3.2), mwall)

    # desk + monitors
    box('desk', (0, -1.2, 0.55), (2.4, 1.0, 0.08), mdesk)
    box('desklegL', (-1.0, -1.2, 0.27), (0.08, 0.7, 0.5), mmetal)
    box('desklegR', (1.0, -1.2, 0.27), (0.08, 0.7, 0.5), mmetal)
    for i, x in enumerate([-0.7, 0.0, 0.7]):
        box(f'mon{i}', (x, -1.55, 1.15), (0.55, 0.06, 0.4), mblack)
        box(f'scr{i}', (x, -1.51, 1.15), (0.5, 0.02, 0.35), mscreen)
    # radio
    box('radio', (1.0, -0.9, 0.72), (0.28, 0.18, 0.14), mblack)
    box('radioled', (1.0, -0.8, 0.78), (0.06, 0.02, 0.04), mled)
    # LED strip clock / status
    box('statusbar', (0, -3.3, 2.6), (2.2, 0.08, 0.28), mblack)
    text_obj('status_txt', 'SEE YOU' if glitch else 'ALL CLEAR', (0, -3.25, 2.6), size=0.22, material=mled if not glitch else mred)
    # EXIT sign
    box('exit_box', (-3.8, -3.3, 2.5), (0.7, 0.08, 0.28), mblack)
    text_obj('exit_txt', 'EXIT', (-3.8, -3.25, 2.5), size=0.2, material=mexit)
    # safety card on wall
    mcard = mat('card', (0.92,0.9,0.75), 0.6)
    box('safetycard', (3.5, -3.35, 1.5), (0.55, 0.02, 0.75), mcard)
    mprint = mat('print', (0.1,0.1,0.12), 0.5)
    text_obj('safe_title', 'EVAC PLAN', (3.5, -3.3, 1.75), size=0.1, material=mprint)
    text_obj('safe_sub', 'WESTGATE B1', (3.5, -3.3, 1.55), size=0.08, material=mprint)
    # coffee + clipboard props
    mcup = mat('cup', (0.15,0.12,0.1), 0.5)
    cyl('coffee', (-0.9, -0.85, 0.72), (0.07,0.07,0.12), mcup)
    box('clipboard', (0.4, -0.85, 0.62), (0.25, 0.32, 0.01), mcard)
    # camera dome
    sphere('camdome', (0, -3.2, 2.95), (0.18,0.18,0.12), mblack)
    box('camled', (0, -3.1, 2.9), (0.04,0.02,0.04), mred)

    area_light((0, 0, 3.0), 40 if not glitch else 18, 3.0, color=(0.55,0.65,0.9))
    area_light((0, -1.0, 2.2), 25, 1.2, color=(0.7,0.75,1.0))
    point_light((1.0, -0.85, 0.9), 8, color=(0.2,1.0,0.5) if not glitch else (1,0.2,0.1))
    # monitor glow
    if monitors_on:
        area_light((0, -1.3, 1.15), 30 if not glitch else 45, 1.5, color=(0.2,0.7,0.4) if not glitch else (0.8,0.15,0.1), rot=(math.radians(90),0,0))

    if empty_chair_cam:
        # show empty chair; camera looks at desk from side
        mchair = mat('chair', (0.12,0.12,0.14), 0.6)
        box('chair', (0, -0.55, 0.35), (0.45, 0.4, 0.08), mchair)
        box('chairback', (0, -0.35, 0.7), (0.45, 0.08, 0.55), mchair)
        bpy.ops.object.camera_add(location=(2.2, 0.8, 1.55), rotation=(math.radians(72), 0, math.radians(145)))
    else:
        mchair = mat('chair', (0.12,0.12,0.14), 0.6)
        box('chair', (0, -0.55, 0.35), (0.45, 0.4, 0.08), mchair)
        box('chairback', (0, -0.35, 0.7), (0.45, 0.08, 0.55), mchair)
        bpy.ops.object.camera_add(location=(0.15, 1.6, 1.55), rotation=(math.radians(78), 0, math.radians(180)))
    cam = bpy.context.active_object
    cam.data.lens = 28; cam.data.clip_end = 120
    bpy.context.scene.camera = cam
    return cam

def mall_corridor_set(with_beam=True):
    mfloor = mat('cfloor', (0.16,0.16,0.18), 0.5, 0.15)
    mwall = mat('cwall', (0.28,0.3,0.34), 0.7)
    mceil = mat('cceil', (0.1,0.1,0.12), 0.8)
    mglass = mat('glass', (0.4,0.55,0.7), 0.15, 0.0, alpha=0.35)
    mshut = mat('shutter', (0.2,0.2,0.22), 0.45, 0.4)
    mtile = mat('tile', (0.35,0.32,0.28), 0.6)
    mneon = mat('neon', (0.2,0.7,1.0), 0.3, emit=7.0, emit_color=(0.3,0.8,1))
    mexit = mat('cexit', (0.15,1.0,0.35), 0.3, emit=9.0, emit_color=(0.2,1,0.4))
    msign = mat('signbg', (0.08,0.08,0.1), 0.5)

    box('floor', (0,0,0), (6, 22, 0.08), mfloor)
    box('ceil', (0,0,3.4), (6, 22, 0.08), mceil)
    # storefronts
    for side, x in (('L', -2.9), ('R', 2.9)):
        box(f'wall{side}', (x, 0, 1.7), (0.2, 22, 3.4), mwall)
        for i, z in enumerate(range(-8, 10, 3)):
            box(f'shut{side}{i}', (x + (0.12 if side=='L' else -0.12), z, 1.4), (0.08, 1.3, 2.2), mshut)
            box(f'sign{side}{i}', (x + (0.15 if side=='L' else -0.15), z, 2.7), (0.06, 1.0, 0.25), msign)
            if i % 2 == 0:
                text_obj(f'neon{side}{i}', ['OPEN','SALE','CAFE','TECH'][i%4], (x + (0.2 if side=='L' else -0.2), z, 2.7), size=0.14, material=mneon)
    # ceiling lights (dim)
    for y in range(-8, 10, 4):
        box(f'clight{y}', (0, y, 3.25), (1.2, 0.3, 0.06), mat(f'cl{y}', (0.9,0.85,0.7), emit=1.5))
        area_light((0, y, 3.15), 15, 1.5, color=(0.7,0.75,0.95))
    # EXIT at end
    box('exitbox', (0, 9.5, 2.8), (0.9, 0.1, 0.35), msign)
    text_obj('exitt', 'EXIT', (0, 9.55, 2.8), size=0.25, material=mexit)
    # directory kiosk
    box('kiosk', (-1.5, -2, 0.9), (0.5, 0.2, 1.6), msign)
    mdir = mat('dir', (0.85,0.88,0.9), 0.5)
    box('dirmap', (-1.5, -1.88, 1.2), (0.4, 0.02, 0.9), mdir)
    text_obj('dirtxt', 'YOU ARE HERE', (-1.5, -1.85, 1.55), size=0.07, material=mat('dirink',(0.8,0.1,0.1),emit=1))

    if with_beam:
        spot_light((0.3, -3.5, 1.4), 550, color=(1.0,0.93,0.78), rot=(math.radians(75), 0, 0))
        point_light((0.3, -2.0, 1.3), 40, color=(1.0,0.9,0.7))
    area_light((0, 5, 3.0), 20, 4.0, color=(0.4,0.5,0.7))

    bpy.ops.object.camera_add(location=(0.4, -5.5, 1.5), rotation=(math.radians(85), 0, math.radians(5)))
    cam = bpy.context.active_object
    cam.data.lens = 26; cam.data.clip_end = 120
    bpy.context.scene.camera = cam
    return cam

def foodcourt_set(smiles=False, fail=False):
    mfloor = mat('ffloor', (0.2,0.18,0.16), 0.55)
    mwall = mat('fwall', (0.25,0.22,0.2), 0.7)
    mtable = mat('table', (0.35,0.28,0.2), 0.5)
    mmetal = mat('fmetal', (0.5,0.5,0.52), 0.3, 0.7)
    mtray = mat('tray', (0.7,0.7,0.72), 0.35, 0.5)
    mcounter = mat('counter', (0.3,0.15,0.12), 0.55)
    mmenu = mat('menu', (0.08,0.08,0.1), 0.5)
    mneon = mat('fneon', (1.0,0.4,0.15), 0.3, emit=6.0, emit_color=(1,0.45,0.2))

    box('floor', (0,0,0), (12, 10, 0.08), mfloor)
    box('ceil', (0,0,3.6), (12, 10, 0.08), mat('fceil',(0.1,0.1,0.12),0.8))
    box('wallB', (0,4.5,1.8), (12, 0.2, 3.6), mwall)
    # counters / stalls
    for i, x in enumerate([-3.5, 0, 3.5]):
        box(f'counter{i}', (x, 3.5, 0.7), (2.2, 0.8, 0.9), mcounter)
        box(f'menu{i}', (x, 3.9, 2.2), (1.8, 0.08, 0.9), mmenu)
        text_obj(f'menut{i}', ['BURGER','NOODLE','PIZZA'][i], (x, 3.95, 2.4), size=0.2, material=mneon)
    # tables + chairs
    for i, (x,y) in enumerate([(-2,-1),(1.5,-0.5),(-0.5,1),(2.5,1.5)]):
        box(f'table{i}', (x,y,0.55), (0.9,0.9,0.06), mtable)
        cyl(f'tleg{i}', (x,y,0.27), (0.08,0.08,0.5), mmetal)
        box(f'tray{i}', (x+0.15, y+0.1, 0.62), (0.3,0.22,0.02), mtray)
    # moving tray accent
    box('tray_move', (0.2, -0.2, 0.62), (0.3,0.22,0.02), mtray)

    area_light((0,0,3.3), 35 if not fail else 12, 5.0, color=(0.9,0.7,0.5) if not fail else (0.5,0.15,0.1))
    if smiles or fail:
        point_light((0, 2, 1.5), 60, color=(1,0.9,0.85))
        area_light((0, 3, 2.5), 40, 2.0, color=(0.8,0.2,0.15))
    else:
        area_light((0, 2, 3.0), 20, 3.0, color=(0.6,0.65,0.8))

    bpy.ops.object.camera_add(location=(0.2, -3.8, 1.6), rotation=(math.radians(80), 0, 0))
    cam = bpy.context.active_object
    cam.data.lens = 28; cam.data.clip_end = 100
    bpy.context.scene.camera = cam
    return cam

def staff_door_set(see_you=True):
    mfloor = mat('sfloor', (0.14,0.14,0.16), 0.55)
    mwall = mat('swall', (0.2,0.22,0.26), 0.7)
    mdoor = mat('sdoor', (0.35,0.22,0.12), 0.55)
    mmetal = mat('smetal', (0.55,0.55,0.58), 0.25, 0.8)
    mled = mat('sled', (0.95,0.12,0.1) if see_you else (0.15,0.9,0.4), 0.3, emit=8.0,
               emit_color=(1,0.15,0.1) if see_you else (0.2,1,0.4))
    mkey = mat('keypad', (0.1,0.1,0.12), 0.4)
    mbtn = mat('kbtn', (0.2,0.85,0.4), 0.3, emit=3.0)
    mexit = mat('sexit', (0.15,1,0.35), 0.3, emit=9.0, emit_color=(0.2,1,0.4))
    mcard = mat('scard', (0.92,0.9,0.75), 0.55)

    box('floor', (0,0,0), (5, 6, 0.08), mfloor)
    box('ceil', (0,0,3.0), (5, 6, 0.08), mat('sceil',(0.1,0.1,0.12)))
    box('wallB', (0,2.5,1.5), (5, 0.15, 3.0), mwall)
    box('wallL', (-2.4,0,1.5), (0.15, 6, 3.0), mwall)
    box('wallR', (2.4,0,1.5), (0.15, 6, 3.0), mwall)
    # door ajar
    box('door', (0.55, 2.35, 1.2), (1.0, 0.08, 2.2), mdoor, rot=(0,0,math.radians(-35)))
    box('doorframe', (0, 2.45, 1.2), (1.3, 0.12, 2.4), mmetal)
    # LED panel
    box('ledpanel', (0, 2.4, 2.55), (1.4, 0.08, 0.28), mkey)
    text_obj('ledtxt', 'SEE YOU' if see_you else 'ALL CLEAR', (0, 2.45, 2.55), size=0.18, material=mled)
    # keypad
    box('keypad', (-0.85, 2.35, 1.2), (0.2, 0.06, 0.28), mkey)
    for i, z in enumerate([1.3, 1.2, 1.1]):
        for j, x in enumerate([-0.9, -0.85, -0.8]):
            box(f'kb{i}{j}', (x, 2.32, z), (0.035, 0.02, 0.035), mbtn)
    # safety card
    box('safecard', (1.6, 2.4, 1.5), (0.5, 0.02, 0.7), mcard)
    text_obj('safet', 'SAFETY', (1.6, 2.45, 1.7), size=0.1, material=mat('ink',(0.1,0.1,0.1)))
    text_obj('safet2', 'DO NOT ENTER', (1.6, 2.45, 1.45), size=0.08, material=mat('ink2',(0.8,0.1,0.1),emit=1))
    # EXIT alternate
    box('exitb', (-1.8, 2.4, 2.5), (0.7, 0.08, 0.28), mkey)
    text_obj('exittxt', 'EXIT', (-1.8, 2.45, 2.5), size=0.18, material=mexit)

    spot_light((0.3, -1.5, 1.5), 400, color=(1,0.92,0.75), rot=(math.radians(55),0,0))
    area_light((0, 0, 2.8), 15, 2.0, color=(0.4,0.45,0.6))
    point_light((0, 2.3, 2.55), 25, color=(1,0.15,0.1) if see_you else (0.2,1,0.4))

    bpy.ops.object.camera_add(location=(0.2, -2.2, 1.45), rotation=(math.radians(82), 0, 0))
    cam = bpy.context.active_object
    cam.data.lens = 28; cam.data.clip_end = 80
    bpy.context.scene.camera = cam
    return cam

def breakroom_set(close=False):
    mfloor = mat('bfloor', (0.12,0.12,0.14), 0.55)
    mwall = mat('bwall', (0.18,0.16,0.15), 0.7)
    mlocker = mat('locker', (0.35,0.38,0.42), 0.35, 0.55)
    mtag = mat('tag', (0.85,0.75,0.2), 0.4, 0.6, emit=0.8)
    mcard = mat('bcard', (0.92,0.9,0.75), 0.55)
    mclock = mat('clock', (0.1,0.1,0.12), 0.4)
    mred = mat('bred', (1,0.15,0.1), 0.3, emit=6.0, emit_color=(1,0.2,0.1))

    box('floor', (0,0,0), (5, 5, 0.08), mfloor)
    box('ceil', (0,0,2.8), (5, 5, 0.08), mat('bceil',(0.08,0.08,0.1)))
    box('wallB', (0,2.2,1.4), (5, 0.15, 2.8), mwall)
    box('wallL', (-2.4,0,1.4), (0.15, 5, 2.8), mwall)
    # lockers
    for i, x in enumerate([-1.5, -0.7, 0.1, 0.9]):
        box(f'locker{i}', (x, 2.0, 1.1), (0.55, 0.4, 1.8), mlocker)
        box(f'tag{i}', (x, 1.78, 1.5), (0.2, 0.02, 0.1), mtag)
    text_obj('tag0t', 'NEW', (-1.5, 1.75, 1.5), size=0.08, material=mat('tink',(0.1,0.1,0.1)))
    # safety + clock
    box('safec', (1.7, 2.05, 1.5), (0.55, 0.02, 0.75), mcard)
    text_obj('sft', 'IF YOU SEE', (1.7, 2.1, 1.7), size=0.08, material=mat('i1',(0.1,0.1,0.1)))
    text_obj('sft2', 'SOMETHING', (1.7, 2.1, 1.5), size=0.08, material=mat('i2',(0.1,0.1,0.1)))
    box('clock', (0.5, 2.05, 2.3), (0.4, 0.06, 0.4), mclock)
    box('clockled', (0.5, 2.0, 2.3), (0.08, 0.02, 0.08), mred)
    # hanging name tags
    for i, x in enumerate([-0.3, 0.3, 0.9]):
        box(f'htag{i}', (x, 1.5, 1.9), (0.18, 0.02, 0.1), mtag)

    if close:
        area_light((0, 0.5, 2.0), 8, 1.5, color=(0.5,0.15,0.1))
        point_light((0, 1.2, 1.5), 30, color=(1,0.85,0.75))
        bpy.ops.object.camera_add(location=(0, 0.2, 1.45), rotation=(math.radians(88), 0, 0))
    else:
        area_light((0, 0, 2.5), 12, 2.5, color=(0.45,0.35,0.3))
        point_light((0, 1.5, 1.6), 40, color=(1,0.9,0.8))
        bpy.ops.object.camera_add(location=(0.3, -2.0, 1.5), rotation=(math.radians(82), 0, 0))
    cam = bpy.context.active_object
    cam.data.lens = 30 if not close else 40
    cam.data.clip_end = 80
    bpy.context.scene.camera = cam
    return cam

def setup_render(path, frames=DEFAULT_FRAMES):
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE'
    # Blender 5 may use BLENDER_EEVEE_NEXT
    if hasattr(bpy.types, 'Scene') and 'BLENDER_EEVEE_NEXT' in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items.keys():
        try: s.render.engine = 'BLENDER_EEVEE_NEXT'
        except Exception: pass
    s.render.resolution_x = RES_X
    s.render.resolution_y = RES_Y
    s.render.fps = 24
    s.render.image_settings.file_format = 'PNG'
    s.render.filepath = path
    ee = s.eevee
    for attr, val in (('taa_render_samples', TAA), ('taa_samples', TAA), ('samples', TAA)):
        if hasattr(ee, attr):
            try: setattr(ee, attr, val)
            except Exception: pass
    # soft shadows / bloom if available
    for attr, val in (('use_bloom', True), ('bloom_intensity', 0.15), ('use_soft_shadows', True),
                      ('use_raytracing', True), ('use_shadows', True)):
        if hasattr(ee, attr):
            try: setattr(ee, attr, val)
            except Exception: pass
    s.frame_start = 1; s.frame_end = frames
    world = bpy.data.worlds.new('World'); s.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.008, 0.008, 0.012, 1)
    bg.inputs[1].default_value = 0.15

def animate_camera(cam, start_loc, end_loc, start_rot, end_rot, frames):
    cam.location = Vector(start_loc); cam.rotation_euler = Euler(start_rot)
    cam.keyframe_insert(data_path='location', frame=1)
    cam.keyframe_insert(data_path='rotation_euler', frame=1)
    cam.location = Vector(end_loc); cam.rotation_euler = Euler(end_rot)
    cam.keyframe_insert(data_path='location', frame=frames)
    cam.keyframe_insert(data_path='rotation_euler', frame=frames)

def render_shot(name, build_fn, frames=DEFAULT_FRAMES):
    clear(); build_fn()
    out = os.path.join(OUT, name)
    if os.path.isdir(out): shutil.rmtree(out)
    os.makedirs(out, exist_ok=True)
    setup_render(os.path.join(out, 'f'), frames=frames)
    bpy.ops.render.render(animation=True)
    print('SHOT_DONE', name, frames, flush=True)

SKIN = (0.93, 0.76, 0.6)
GUARD_SHIRT = (0.12, 0.25, 0.55)
PANTS = (0.12, 0.12, 0.16)
CREEP_SHIRT = (0.08, 0.08, 0.1)
CREEP_SKIN = (0.08, 0.08, 0.1)

# ---- SHOT BUILDERS ----
def shot_desk_monitor():
    cam = mall_desk_set(monitors_on=True)
    block_person('guard', (0, -0.7, 0), SKIN, GUARD_SHIRT, PANTS, facing=math.radians(180), pose='sit', hat='cap')
    animate_camera(cam, (0.15, 1.6, 1.55), (0.05, 1.3, 1.5),
                   (math.radians(78),0,math.radians(180)), (math.radians(80),0,math.radians(180)), DEFAULT_FRAMES)

def shot_desk_radio():
    cam = mall_desk_set(monitors_on=True)
    block_person('guard', (0, -0.7, 0), SKIN, GUARD_SHIRT, PANTS, facing=math.radians(180), pose='sit', hat='cap')
    animate_camera(cam, (1.5, 0.5, 1.4), (1.1, 0.1, 1.25),
                   (math.radians(75),0,math.radians(220)), (math.radians(78),0,math.radians(210)), DEFAULT_FRAMES)

def shot_desk_choice():
    cam = mall_desk_set(monitors_on=True)
    block_person('guard', (0, -0.7, 0), SKIN, GUARD_SHIRT, PANTS, facing=math.radians(180), pose='sit', hat='cap')
    animate_camera(cam, (0.0, 1.8, 1.7), (0.0, 1.4, 1.55),
                   (math.radians(75),0,math.radians(180)), (math.radians(78),0,math.radians(180)), DEFAULT_FRAMES)

def shot_desk_glitch():
    cam = mall_desk_set(monitors_on=True, glitch=True)
    block_person('guard', (0, -0.7, 0), SKIN, GUARD_SHIRT, PANTS, facing=math.radians(180), pose='sit', hat='cap')
    animate_camera(cam, (0.2, 1.5, 1.5), (-0.1, 1.2, 1.4),
                   (math.radians(78),0,math.radians(185)), (math.radians(82),0,math.radians(175)), DEFAULT_FRAMES)

def shot_desk_empty():
    cam = mall_desk_set(monitors_on=True, empty_chair_cam=True, glitch=True)
    # no guard — empty chair already in set
    animate_camera(cam, (2.2, 0.8, 1.55), (1.8, 0.4, 1.4),
                   (math.radians(72),0,math.radians(145)), (math.radians(75),0,math.radians(150)), DEFAULT_FRAMES)

def shot_desk_stand():
    cam = mall_desk_set(monitors_on=True, glitch=True)
    block_person('guard', (0, -0.5, 0), SKIN, GUARD_SHIRT, PANTS, facing=math.radians(180), pose='stand', hat='cap')
    animate_camera(cam, (0.3, 1.8, 1.6), (0.1, 1.3, 1.55),
                   (math.radians(78),0,math.radians(180)), (math.radians(82),0,math.radians(180)), DEFAULT_FRAMES)

def shot_corridor_walk():
    cam = mall_corridor_set(with_beam=True)
    g = block_person('guard', (0.2, -3.2, 0), SKIN, GUARD_SHIRT, PANTS, facing=0, pose='walk', hat='cap')
    flashlight((0.2, -3.2, 0))
    animate_camera(cam, (0.5, -5.8, 1.55), (0.3, -4.2, 1.45),
                   (math.radians(85),0,math.radians(5)), (math.radians(88),0,math.radians(0)), DEFAULT_FRAMES)
    # walk forward
    g.location = Vector((0.2, -3.2, 0))
    g.keyframe_insert('location', frame=1)
    g.location = Vector((0.2, -1.0, 0))
    g.keyframe_insert('location', frame=DEFAULT_FRAMES)

def shot_corridor_beam():
    cam = mall_corridor_set(with_beam=True)
    g = block_person('guard', (0.15, -2.5, 0), SKIN, GUARD_SHIRT, PANTS, facing=0, pose='walk', hat='cap')
    flashlight((0.15, -2.5, 0), aim_rot=(math.radians(-20),0,0))
    animate_camera(cam, (0.6, -5.0, 1.5), (0.2, -3.5, 1.4),
                   (math.radians(84),0,math.radians(8)), (math.radians(86),0,math.radians(2)), DEFAULT_FRAMES)
    g.location = Vector((0.15, -2.5, 0)); g.keyframe_insert('location', frame=1)
    g.location = Vector((0.15, 0.5, 0)); g.keyframe_insert('location', frame=DEFAULT_FRAMES)

def shot_foodcourt_empty():
    cam = foodcourt_set(smiles=False)
    block_person('guard', (0, -2.5, 0), SKIN, GUARD_SHIRT, PANTS, facing=0, pose='walk', hat='cap')
    flashlight((0, -2.5, 0))
    animate_camera(cam, (0.3, -4.2, 1.65), (0.1, -3.2, 1.5),
                   (math.radians(78),0,0), (math.radians(82),0,0), DEFAULT_FRAMES)

def shot_foodcourt_smile():
    cam = foodcourt_set(smiles=True)
    block_person('guard', (0, -2.2, 0), SKIN, GUARD_SHIRT, PANTS, facing=0, pose='stand', hat='cap')
    block_person('creep1', (0.3, 2.0, 0), CREEP_SKIN, CREEP_SHIRT, (0.05,0.05,0.05),
                 facing=math.radians(180), pose='stand', smile=True, glow_eyes=True)
    animate_camera(cam, (0.2, -3.5, 1.5), (0.15, -1.8, 1.55),
                   (math.radians(80),0,0), (math.radians(88),0,0), DEFAULT_FRAMES)

def shot_foodcourt_fail():
    cam = foodcourt_set(smiles=True, fail=True)
    block_person('guard', (0, -2.0, 0), SKIN, GUARD_SHIRT, PANTS, facing=0, pose='stand', hat='cap')
    for i, x in enumerate([-1.2, 0.2, 1.4]):
        block_person(f'creep{i}', (x, 1.8 - i*0.15, 0), CREEP_SKIN, CREEP_SHIRT, (0.05,0.05,0.05),
                     facing=math.radians(180), pose='stand', smile=True, glow_eyes=True)
    animate_camera(cam, (0.0, -3.8, 1.4), (0.0, -2.2, 1.6),
                   (math.radians(82),0,0), (math.radians(88),0,0), DEFAULT_FRAMES)

def shot_staff_door():
    cam = staff_door_set(see_you=True)
    block_person('guard', (0.2, -1.2, 0), SKIN, GUARD_SHIRT, PANTS, facing=0, pose='walk', hat='cap')
    flashlight((0.2, -1.2, 0), aim_rot=(math.radians(-15),0,0))
    animate_camera(cam, (0.3, -2.6, 1.5), (0.15, -1.6, 1.4),
                   (math.radians(82),0,0), (math.radians(85),0,0), DEFAULT_FRAMES)

def shot_breakroom_faces():
    cam = breakroom_set(close=False)
    block_person('guard', (0.4, -1.2, 0), SKIN, GUARD_SHIRT, PANTS, facing=0, pose='stand', hat='cap')
    for i, x in enumerate([-1.2, -0.3, 0.6]):
        block_person(f'creep{i}', (x, 1.3, 0), CREEP_SKIN, CREEP_SHIRT, (0.05,0.05,0.05),
                     facing=math.radians(180), pose='stand', smile=True, glow_eyes=True)
    animate_camera(cam, (0.4, -2.4, 1.55), (0.2, -1.4, 1.5),
                   (math.radians(80),0,0), (math.radians(85),0,0), DEFAULT_FRAMES)

def shot_breakroom_close():
    cam = breakroom_set(close=True)
    block_person('creep', (0, 1.0, 0), CREEP_SKIN, CREEP_SHIRT, (0.05,0.05,0.05),
                 facing=math.radians(180), pose='stand', smile=True, glow_eyes=True)
    animate_camera(cam, (0, 0.5, 1.5), (0, 0.15, 1.45),
                   (math.radians(88),0,0), (math.radians(90),0,0), DEFAULT_FRAMES)

def shot_cliff():
    cam = staff_door_set(see_you=True)
    block_person('guard', (0.1, -0.8, 0), SKIN, GUARD_SHIRT, PANTS, facing=0, pose='stand', hat='cap')
    animate_camera(cam, (0.4, -2.4, 1.55), (0.1, -1.5, 1.45),
                   (math.radians(80),0,math.radians(5)), (math.radians(84),0,0), DEFAULT_FRAMES)

SHOTS = [
    ('desk_monitor', shot_desk_monitor, 8),
    ('desk_radio', shot_desk_radio, 8),
    ('desk_choice', shot_desk_choice, 8),
    ('corridor_walk', shot_corridor_walk, 8),
    ('foodcourt_empty', shot_foodcourt_empty, 8),
    ('foodcourt_smile', shot_foodcourt_smile, 8),
    ('foodcourt_fail', shot_foodcourt_fail, 8),
    ('desk_monitor_glitch', shot_desk_glitch, 8),
    ('desk_monitor_empty', shot_desk_empty, 8),
    ('desk_stand', shot_desk_stand, 8),
    ('corridor_beam', shot_corridor_beam, 8),
    ('staff_door', shot_staff_door, 8),
    ('breakroom_faces', shot_breakroom_faces, 8),
    ('breakroom_close', shot_breakroom_close, 8),
    ('cliff_choice', shot_cliff, 8),
]

def main():
    only = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    for name, fn, frames in SHOTS:
        if only and name not in only: continue
        print('RENDER', name, frames, flush=True)
        render_shot(name, fn, frames=frames)
    print('ALL_SHOTS_DONE', flush=True)

if __name__ == '__main__':
    main()
