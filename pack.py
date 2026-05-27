# -*- coding: utf-8 -*-
"""skmagic-dealer 압축 (메일 전송용).
제외: *.gif, recon/, __pycache__/, *.bak*, *.json.bak*, *.beforeSPA, *.청록백업
"""
import os, zipfile, pathlib, time, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = pathlib.Path(r"C:\Users\777\Desktop\skmagic-dealer")
OUT = pathlib.Path(r"C:\Users\777\Desktop\skmagic-dealer.zip")

EXCLUDE_EXT = {".gif"}
EXCLUDE_DIRS = {"recon", "__pycache__", ".claude"}
EXCLUDE_SUFFIX_FRAGS = [".bak", ".beforeSPA", ".청록백업"]

def should_skip(rel_parts, fname):
    if any(d in rel_parts for d in EXCLUDE_DIRS): return True
    ext = pathlib.Path(fname).suffix.lower()
    if ext in EXCLUDE_EXT: return True
    for frag in EXCLUDE_SUFFIX_FRAGS:
        if frag in fname: return True
    return False

t0 = time.time()
total_files = 0
total_bytes = 0
with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zf:
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        rel_dir = pathlib.Path(dirpath).relative_to(ROOT)
        rel_parts = rel_dir.parts
        for fn in filenames:
            if should_skip(rel_parts, fn):
                continue
            abs_p = pathlib.Path(dirpath) / fn
            arc = pathlib.Path("skmagic-dealer") / rel_dir / fn
            try:
                zf.write(abs_p, arc.as_posix())
                total_files += 1
                total_bytes += abs_p.stat().st_size
                if total_files % 200 == 0:
                    print(f"  {total_files} files, {total_bytes/1024/1024:.0f}MB raw...", flush=True)
            except Exception as e:
                print(f"  skip {abs_p}: {e}", flush=True)

elapsed = time.time() - t0
out_size = OUT.stat().st_size
print(f"\n[done] {total_files} files | raw {total_bytes/1024/1024:.0f}MB | zip {out_size/1024/1024:.0f}MB | {elapsed:.0f}s")
print(f"  -> {OUT}")
