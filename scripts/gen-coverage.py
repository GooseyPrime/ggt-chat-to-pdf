#!/usr/bin/env python3
"""Print the UNI_COVERAGE string for extension/src/pdf/fonts.ts from DejaVuSans.ttf (needs `pip install fonttools`)."""
import sys
from fontTools.ttLib import TTFont

path = sys.argv[1] if len(sys.argv) > 1 else "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf"
cmap = TTFont(path).getBestCmap()
keep = sorted(
    cp for cp in cmap
    if cp >= 0x20 and not 0x7F <= cp < 0xA0 and (
        cp < 0x590 or 0x1E00 <= cp <= 0x2BFF or 0x2C60 <= cp <= 0x2C7F or 0xFB00 <= cp <= 0xFB06
        or 0x1D400 <= cp <= 0x1D7FF or cp == 0xFFFD
    )
)
ranges, s, p = [], None, None
for cp in keep:
    if s is None:
        s = p = cp
    elif cp == p + 1:
        p = cp
    else:
        ranges.append((s, p))
        s = p = cp
ranges.append((s, p))
print(",".join(f"{a:x}-{b:x}" if a != b else f"{a:x}" for a, b in ranges))
