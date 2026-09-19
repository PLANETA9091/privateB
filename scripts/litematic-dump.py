#!/usr/bin/env python3
"""Dump the block palette counts of a .litematic schematic.

Usage: litematic-dump.py <file.litematic> [--json out.json]

Layout note: a litematic region stores a packed long array ("BlockStates") using the
1.16+ Minecraft packing (LSB-first, entries may cross long boundaries) plus a palette.
The NBT tree gives us the palette and the region volume; the packed longs are decoded
against it to count how many blocks of each type the schematic contains.
"""
import gzip
import json
import math
import struct
import sys
from collections import Counter


def read_bytes(path):
    try:
        with open(path, 'rb') as handle:
            return handle.read()
    except OSError as exc:
        raise SystemExit(f'cannot read {path}: {exc}') from exc


def decompress(path):
    raw = read_bytes(path)
    if raw[:2] == b'\x1f\x8b':
        return gzip.decompress(raw)
    return raw


class Nbt:
    """Minimal big-endian NBT reader, enough for litematic files."""

    def __init__(self, data):
        self.d = data
        self.i = 0

    def _u8(self):
        value = self.d[self.i]
        self.i += 1
        return value

    def _raw(self, size):
        value = self.d[self.i:self.i + size]
        self.i += size
        return value

    def payload(self, tag):
        if tag == 1:
            value = self._u8()
            return value - 256 if value > 127 else value
        if tag == 2:
            return struct.unpack('>h', self._raw(2))[0]
        if tag == 3:
            return struct.unpack('>i', self._raw(4))[0]
        if tag == 4:
            return struct.unpack('>q', self._raw(8))[0]
        if tag == 5:
            return struct.unpack('>f', self._raw(4))[0]
        if tag == 6:
            return struct.unpack('>d', self._raw(8))[0]
        if tag == 7:
            size = struct.unpack('>i', self._raw(4))[0]
            return list(self._raw(size))
        if tag == 8:
            size = struct.unpack('>H', self._raw(2))[0]
            return self._raw(size).decode('utf-8', 'replace')
        if tag == 9:
            item_tag = self._u8()
            size = struct.unpack('>i', self._raw(4))[0]
            return [self.payload(item_tag) for _ in range(size)]
        if tag == 10:
            return self._compound()
        if tag == 11:
            size = struct.unpack('>i', self._raw(4))[0]
            return [struct.unpack('>i', self._raw(4))[0] for _ in range(size)]
        if tag == 12:
            size = struct.unpack('>i', self._raw(4))[0]
            return [struct.unpack('>q', self._raw(8))[0] for _ in range(size)]
        raise ValueError(f'unknown tag type {tag}')

    def _compound(self):
        out = {}
        while True:
            tag = self._u8()
            if tag == 0:
                return out
            size = struct.unpack('>H', self._raw(2))[0]
            name = self._raw(size).decode('utf-8', 'replace')
            out[name] = self.payload(tag)

    def root(self):
        tag = self._u8()
        size = struct.unpack('>H', self._raw(2))[0]
        self.i += size
        return self.payload(tag)


def decode(root):
    """Count blocks per palette entry across all regions."""
    metadata = root.get('Metadata', {})
    volume = metadata.get('TotalVolume')
    total = Counter()
    for region in root.get('Regions', {}).values():
        palette = region['BlockStatePalette']
        longs = [word & ((1 << 64) - 1) for word in region['BlockStates']]
        bits = max(2, math.ceil(math.log2(len(palette))))
        mask = (1 << bits) - 1
        count = volume if volume is not None else len(longs) * 64 // bits
        for index in range(count):
            bit = index * bits
            word = bit >> 6
            offset = bit & 63
            if offset + bits <= 64:
                value = (longs[word] >> offset) & mask
            else:
                value = ((longs[word] >> offset) | (longs[word + 1] << (64 - offset))) & mask
            name = palette[value]['Name'].replace('minecraft:', '')
            total[name] += 1
    return total, metadata


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    root = Nbt(decompress(path)).root()
    counts, metadata = decode(root)
    counts.pop('air', None)
    result = {
        'file': path,
        'size': metadata.get('EnclosingSize'),
        'totalBlocks': sum(counts.values()),
        'blocks': dict(sorted(counts.items(), key=lambda item: -item[1])),
    }
    if '--json' in sys.argv:
        out_path = sys.argv[sys.argv.index('--json') + 1]
        try:
            with open(out_path, 'w') as handle:
                json.dump(result, handle, indent=2, ensure_ascii=False)
        except OSError as exc:
            raise SystemExit(f'cannot write {out_path}: {exc}') from exc
    print(f"distinct: {len(counts)}  total non-air: {result['totalBlocks']}")
    for name, qty in list(result['blocks'].items())[:15]:
        print(f'{qty:8d}  {name}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
