#!/usr/bin/env python3
"""Find mob spawners (dungeons) in a saved Minecraft world, straight from the region files.

No op commands involved: region/*.mca files store each chunk as zlib-compressed NBT, and a
dungeon's spawner is a block entity with id "minecraft:mob_spawner", so its coordinates are
ground truth for verifying a dungeon-position predictor.

Usage: find-dungeons.py <world-dir> [--json out.json]
"""
import glob
import importlib.util
import json
import os
import struct
import sys
import zlib

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location('ldump', os.path.join(SCRIPT_DIR, 'litematic-dump.py'))
if _SPEC is None or _SPEC.loader is None:
    raise SystemExit('cannot load the NBT reader from litematic-dump.py')
ld = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(ld)


def read_chunk(raw):
    """Region chunk payload: 4-byte length + 1-byte compression + data."""
    if len(raw) < 5:
        return None
    length = struct.unpack('>I', raw[:4])[0]
    compression = raw[4]
    payload = raw[5:4 + length]
    if compression == 2:
        return zlib.decompress(payload)
    if compression == 1:
        return zlib.decompress(payload)
    return None


def spawner_entity(node):
    """What the spawner spawns: cave spiders mean a mineshaft, not a dungeon."""
    data = node.get('SpawnData')
    if isinstance(data, dict):
        entity = data.get('entity')
        if isinstance(entity, dict) and isinstance(entity.get('id'), str):
            return entity['id']
    potentials = node.get('SpawnPotentials')
    if isinstance(potentials, list):
        for entry in potentials:
            if isinstance(entry, dict):
                entity = entry.get('data', {}).get('entity') if isinstance(entry.get('data'), dict) else None
                if isinstance(entity, dict) and isinstance(entity.get('id'), str):
                    return entity['id']
    return None


def walk_block_entities(node, out):
    if isinstance(node, dict):
        ident = node.get('id')
        if isinstance(ident, str) and ident.endswith('mob_spawner') and 'x' in node and 'y' in node and 'z' in node:
            out.append({'x': node['x'], 'y': node['y'], 'z': node['z'], 'mob': spawner_entity(node)})
        if 'block_entities' in node:
            walk_block_entities(node['block_entities'], out)
        for key, value in node.items():
            if key in ('block_entities',):
                continue
            if isinstance(value, (dict, list)):
                walk_block_entities(value, out)
    elif isinstance(node, list):
        for item in node:
            walk_block_entities(item, out)


def region_dirs(world_dir):
    """Modern (1.21.9+/26.x) worlds keep chunks under dimensions/<dim>/region;
    older layouts use <world>/region directly."""
    candidates = [os.path.join(world_dir, 'region')]
    dimensions = os.path.join(world_dir, 'dimensions')
    if os.path.isdir(dimensions):
        try:
            namespaces = sorted(os.listdir(dimensions))
        except OSError as exc:
            print(f'cannot list {dimensions}: {exc}', file=sys.stderr)
            namespaces = []
        for namespace in namespaces:
            ns_path = os.path.join(dimensions, namespace)
            if not os.path.isdir(ns_path):
                continue
            try:
                dims = sorted(os.listdir(ns_path))
            except OSError as exc:
                print(f'cannot list {ns_path}: {exc}', file=sys.stderr)
                continue
            for dim in dims:
                candidates.append(os.path.join(ns_path, dim, 'region'))
    return [path for path in candidates if os.path.isdir(path)]


def scan_world(world_dir):
    found = []
    for directory in region_dirs(world_dir):
        found.extend(scan_region_dir(directory))
    return found


def scan_region_dir(directory):
    found = []
    for region_path in sorted(glob.glob(os.path.join(directory, '*.mca'))):
        name = os.path.basename(region_path)[2:-4]
        try:
            region_x, region_z = (int(part) for part in name.split('.'))
        except ValueError:
            continue
        try:
            with open(region_path, 'rb') as handle:
                header = handle.read(4096)
                if len(header) < 4096:
                    continue
                for index in range(1024):
                    entry = header[index * 4:index * 4 + 4]
                    offset = (entry[0] << 16) | (entry[1] << 8) | entry[2]
                    sectors = entry[3]
                    if offset == 0 or sectors == 0:
                        continue
                    local_x = index % 32
                    local_z = index // 32
                    handle.seek(offset * 4096)
                    raw = handle.read(sectors * 4096)
                    try:
                        data = read_chunk(raw)
                    except zlib.error:
                        continue
                    if not data:
                        continue
                    try:
                        root = ld.Nbt(data).root()
                    except (IndexError, ValueError, struct.error):
                        continue
                    positions = []
                    walk_block_entities(root, positions)
                    chunk_x = region_x * 32 + local_x
                    chunk_z = region_z * 32 + local_z
                    for entry in positions:
                        x = entry['x']
                        y = entry['y']
                        z = entry['z']
                        # block entity coords inside the chunk NBT are absolute in 1.18+
                        if -16 <= x < 32 and -16 <= z < 32:
                            found.append({'x': chunk_x * 16 + x, 'y': y, 'z': chunk_z * 16 + z, 'mob': entry['mob']})
                        else:
                            found.append(entry)
        except OSError as exc:
            print(f'cannot read {region_path}: {exc}', file=sys.stderr)
    return found


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    world_dir = sys.argv[1]
    spawners = scan_world(world_dir)
    spawners.sort(key=lambda p: (p['x'], p['z'], p['y']))
    dungeons = [s for s in spawners if (s['mob'] or '').split(':')[-1] not in ('cave_spider',)]
    if '--json' in sys.argv:
        out_path = sys.argv[sys.argv.index('--json') + 1]
        try:
            with open(out_path, 'w') as handle:
                json.dump(dungeons, handle, indent=2)
        except OSError as exc:
            raise SystemExit(f'cannot write {out_path}: {exc}') from exc
    print(f'mob spawners found: {len(spawners)} | dungeon spawners (not mineshaft): {len(dungeons)}')
    for entry in dungeons[:20]:
        print(f"  ({entry['x']}, {entry['y']}, {entry['z']}) chunk {entry['x'] >> 4},{entry['z'] >> 4} mob={entry['mob']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
