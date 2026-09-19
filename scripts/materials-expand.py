#!/usr/bin/env python3
"""Expand a schematic block list into the raw resources needed to build it.

Usage: materials-expand.py data/base-blocks.json data/base-raw.json

Only the recipes that actually appear in the schematic are modelled; where a block can
come from several recipes the dominant one is used. Anything not in the recipe map is
treated as a raw resource (i.e. "mine/collect this directly").
"""
import json
import math
import sys
from collections import Counter

# block -> ingredients of one block (raw-resource level, one step rolled up)
RECIPES = {
    # concrete / concrete powder
    'black_concrete': {'sand': 4, 'gravel': 4, 'black_dye': 1},
    'gray_concrete': {'sand': 4, 'gravel': 4, 'gray_dye': 1},
    'light_gray_concrete': {'sand': 4, 'gravel': 4, 'light_gray_dye': 1},
    'gray_concrete_powder': {'sand': 4, 'gravel': 4, 'gray_dye': 1},
    # stained glass (sand + dye, smelted)
    'black_stained_glass': {'sand': 1, 'black_dye': 1},
    'light_gray_stained_glass': {'sand': 1, 'light_gray_dye': 1},
    'gray_stained_glass': {'sand': 1, 'gray_dye': 1},
    'white_stained_glass': {'sand': 1, 'white_dye': 1},
    'black_stained_glass_pane': {'black_stained_glass': 6 / 16},
    'light_gray_stained_glass_pane': {'light_gray_stained_glass': 6 / 16},
    'gray_stained_glass_pane': {'gray_stained_glass': 6 / 16},
    # deepslate family (all cut from polished deepslate, which is cut from deepslate)
    'polished_deepslate': {'deepslate': 1},
    'polished_deepslate_wall': {'polished_deepslate': 1},
    'polished_deepslate_stairs': {'polished_deepslate': 1.5},
    'polished_deepslate_slab': {'polished_deepslate': 0.5},
    'deepslate_tiles': {'polished_deepslate': 1},
    'deepslate_tile_slab': {'deepslate_tiles': 0.5},
    'deepslate_tile_stairs': {'deepslate_tiles': 1.5},
    'deepslate_tile_wall': {'deepslate_tiles': 1},
    'chiseled_deepslate': {'polished_deepslate': 2},
    'cobbled_deepslate': {'deepslate': 1},
    'cobbled_deepslate_wall': {'deepslate': 1},
    'cobbled_deepslate_stairs': {'deepslate': 1.5},
    # stone family
    'stone_bricks': {'stone': 1},
    'stone_brick_stairs': {'stone': 1.5},
    'cracked_stone_bricks': {'stone': 1},
    'stone_stairs': {'stone': 1.5},
    'stone_button': {'stone': 1},
    'stone_pressure_plate': {'stone': 2},
    'smooth_stone': {'stone': 1},
    'smooth_stone_slab': {'stone': 0.5},
    'cobblestone_stairs': {'cobblestone': 1.5},
    # polished stone variants
    'andesite_stairs': {'andesite': 1.5},
    'andesite_slab': {'andesite': 0.5},
    'andesite_wall': {'andesite': 1},
    'polished_andesite': {'andesite': 1},
    'polished_andesite_slab': {'andesite': 0.5},
    'polished_andesite_stairs': {'andesite': 1.5},
    'diorite_stairs': {'diorite': 1.5},
    'diorite_slab': {'diorite': 0.5},
    'diorite_wall': {'diorite': 1},
    'polished_tuff': {'tuff': 1},
    'polished_tuff_stairs': {'tuff': 1.5},
    'tuff_stairs': {'tuff': 1.5},
    'tuff_slab': {'tuff': 0.5},
    'tuff_wall': {'tuff': 1},
    'tuff_bricks': {'tuff': 1},
    'tuff_brick_wall': {'tuff': 1},
    'tuff_brick_stairs': {'tuff': 1.5},
    'polished_basalt': {'basalt': 1},
    'smooth_basalt': {'basalt': 1},
    'polished_blackstone': {'blackstone': 1},
    'blackstone_wall': {'blackstone': 1},
    'polished_blackstone_button': {'blackstone': 1},
    'polished_blackstone_slab': {'blackstone': 0.5},
    'polished_blackstone_wall': {'blackstone': 1},
    'polished_blackstone_pressure_plate': {'blackstone': 2},
    'coal_block': {'coal': 9},
    # iron / metal
    'iron_bars': {'iron_ingot': 6 / 16},
    'iron_chain': {'iron_ingot': 1},
    'iron_trapdoor': {'iron_ingot': 4},
    'cauldron': {'iron_ingot': 7},
    'anvil': {'iron_ingot': 31},
    'blast_furnace': {'iron_ingot': 5, 'cobblestone': 8, 'stone': 1},
    'lodestone': {'netherite_ingot': 1, 'stone': 8},
    'netherite_block': {'netherite_ingot': 9},
    'dispenser': {'cobblestone': 7, 'string': 3, 'stick': 3, 'redstone': 1},
    # misc
    'black_candle': {'string': 1, 'honeycomb': 1, 'black_dye': 1},
    'black_carpet': {'wool': 1 / 3},
    'gray_carpet': {'wool': 1 / 3},
    'light_gray_carpet': {'wool': 1 / 3},
    'gray_wool': {'wool': 1},
    'end_rod': {'blaze_rod': 1, 'popped_chorus_fruit': 1},
    'gray_shulker_box': {'shulker_shell': 2, 'planks': 8},
    'black_shulker_box': {'shulker_shell': 2, 'planks': 8},
    'light_gray_shulker_box': {'shulker_shell': 2, 'planks': 8},
}

# dye chain (all the way down to what you can actually farm/collect)
DYES = {
    'gray_dye': {'black_dye': 0.5, 'white_dye': 0.5},
    'light_gray_dye': {'white_dye': 0.5, 'black_dye': 0.25},
    'white_dye': {'bone': 1 / 3},   # 1 bone -> 3 bonemeal -> 3 white dye
    'black_dye': {'ink_sac': 1},
}

RAW_RESOURCES = {
    'deepslate', 'stone', 'cobblestone', 'andesite', 'diorite', 'tuff', 'basalt', 'blackstone',
    'sand', 'gravel', 'coal', 'iron_ingot', 'netherite_ingot', 'wool', 'string', 'honeycomb',
    'stick', 'redstone', 'blaze_rod', 'popped_chorus_fruit', 'shulker_shell', 'planks', 'bone',
    'ink_sac', 'mud', 'soul_soil', 'heavy_core',
}


def expand_one(name, amount, out, depth=0):
    if name in RAW_RESOURCES or (name not in RECIPES and name not in DYES):
        out[name] += amount
        return
    if depth > 8:
        out[name] += amount
        return
    recipe = RECIPES.get(name) or DYES[name]
    for ingredient, qty in recipe.items():
        expand_one(ingredient, amount * qty, out, depth + 1)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    try:
        with open(sys.argv[1]) as handle:
            blocks_doc = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f'cannot read {sys.argv[1]}: {exc}') from exc

    raw = Counter()
    for name, qty in blocks_doc['blocks'].items():
        expand_one(name, qty, raw)

    rounded = {name: math.ceil(qty) for name, qty in raw.items()}
    result = dict(blocks_doc)
    result['rawResources'] = dict(sorted(rounded.items(), key=lambda item: -item[1]))
    result['note'] = 'rawResources = blocks expanded through crafting/smelting down to what must be mined, farmed or traded for'

    try:
        with open(sys.argv[2], 'w') as handle:
            json.dump(result, handle, indent=2, ensure_ascii=False)
    except OSError as exc:
        raise SystemExit(f'cannot write {sys.argv[2]}: {exc}') from exc

    print(f"blocks: {len(result['blocks'])} distinct, {result['totalBlocks']} total")
    print(f"raw resources: {len(rounded)} distinct")
    for name, qty in list(result['rawResources'].items())[:14]:
        print(f'{qty:9d}  {name}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
