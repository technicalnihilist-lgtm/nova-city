#!/usr/bin/env python3
"""Bundle shell.html + world.js + gameplay.js + three.js into one self-contained HTML."""
import pathlib, sys

root = pathlib.Path(__file__).resolve().parent
shell = (root / 'src' / 'shell.html').read_text()
world = (root / 'src' / 'world.js').read_text()
gameplay = (root / 'src' / 'gameplay.js').read_text()
three = (root / 'vendor' / 'three.min.js').read_text()

out = shell.replace('/*__THREE__*/', three).replace('/*__GAME__*/', world + '\n' + gameplay)
dest = root / 'dist' / 'game.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(out)
print('wrote', dest, len(out), 'bytes')
