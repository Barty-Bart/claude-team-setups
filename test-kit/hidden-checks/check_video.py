#!/usr/bin/env python3
"""Hidden checks for the motion-graphics job, plus contact sheets and frames for the judges. Usage: check_video.py <build_dir> <out_dir>"""
import sys, os, re, json, subprocess, tempfile, shutil
import numpy as np
from PIL import Image, ImageDraw
from common import add, guard, finish
build, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
shots = os.path.join(out, "shots"); os.makedirs(shots, exist_ok=True)
mp4 = os.path.join(build, "out", "explainer.mp4")
add("V1", "out/explainer.mp4 exists", os.path.isfile(mp4) and os.path.getsize(mp4) > 50_000, os.path.getsize(mp4) if os.path.isfile(mp4) else "missing")
dur = 0
if os.path.isfile(mp4):
    pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", mp4], capture_output=True, text=True).stdout or "{}")
    vs = [s for s in pr.get("streams", []) if s.get("codec_type") == "video"]; v = vs[0] if vs else {}
    dur = float(pr.get("format", {}).get("duration") or v.get("duration") or 0)
    fr = v.get("avg_frame_rate", "0/1").split("/"); fps = float(fr[0]) / float(fr[1] or 1) if float(fr[1] or 1) else 0
    add("V2", "H.264 video in an MP4 container", v.get("codec_name") == "h264" and "mp4" in pr.get("format", {}).get("format_name", ""), (v.get("codec_name"), pr.get("format", {}).get("format_name")))
    add("V3", "1920x1080", (v.get("width"), v.get("height")) == (1920, 1080), (v.get("width"), v.get("height")))
    add("V4", "30 frames per second", abs(fps - 30) < 0.05, round(fps, 3))
    add("V5", "32 to 40 seconds long", 31.9 <= dur <= 40.1, round(dur, 2))
    add("V6", "yuv420p pixel format", v.get("pix_fmt") == "yuv420p", v.get("pix_fmt"))
    tmp = tempfile.mkdtemp(prefix="vid-")
    try:
        # 5 samples per second, small and grey, for motion and blank checks
        subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-vf", "fps=5,scale=320:180,format=gray", f"{tmp}/g%05d.png"], timeout=600)
        g = [np.asarray(Image.open(f"{tmp}/{f}"), dtype=np.float32) for f in sorted(os.listdir(tmp)) if f.startswith("g")]
        std = [float(x.std()) for x in g]; diff = [float(np.abs(g[i + 1] - g[i]).mean()) for i in range(len(g) - 1)]
        add("V7", "frames are not blank (95% of samples have real content)", bool(g) and sum(s > 6 for s in std) >= 0.95 * len(std), f"min std {min(std):.1f}" if std else "no frames")
        add("V8", "first and last frames are not blank", bool(g) and std[0] > 6 and std[-1] > 6, (round(std[0], 1), round(std[-1], 1)) if std else "")
        moving = [d > 0.12 for d in diff]; run = best = 0
        for m in moving:
            run = 0 if m else run + 1; best = max(best, run)
        add("V9", "nothing sits completely still for more than 3 seconds", bool(diff) and best / 5 <= 3.0, f"longest still stretch {best / 5:.1f}s")
        add("V10", "something is moving in at least 70% of the video", bool(diff) and sum(moving) >= 0.7 * len(moving), f"{100 * sum(moving) / max(1, len(moving)):.0f}% moving")
        idx = [int(len(g) * f) for f in (0.07, 0.25, 0.5, 0.78, 0.95)] if g else []
        pairs = [(a, b) for i, a in enumerate(idx) for b in idx[i + 1:]]
        dist = sum(float(np.abs(g[a] - g[b]).mean()) > 5 for a, b in pairs)
        add("V11", "five sample points across the video look clearly different from each other (distinct scenes)", bool(g) and dist >= 9, f"{dist}/10 pairs differ")
        # evidence for the judges
        def frame(t, w, h):
            p = f"{tmp}/f.png"; subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", mp4, "-frames:v", "1", "-vf", f"scale={w}:{h}", p], timeout=60)
            im = Image.open(p).convert("RGB"); d = ImageDraw.Draw(im); d.rectangle([0, 0, 74, 16], fill=(0, 0, 0)); d.text((4, 2), f"{t:5.1f}s", fill=(255, 255, 255)); return im
        def sheet(times, w, h, cols, name):
            rows = (len(times) + cols - 1) // cols; S = Image.new("RGB", (cols * w, rows * h), (20, 20, 20))
            for i, t in enumerate(times): S.paste(frame(t, w, h), ((i % cols) * w, (i // cols) * h))
            S.save(os.path.join(shots, name), quality=88)
        secs = [min(dur - 0.05, s + 0.5) for s in range(int(dur))]; half = (len(secs) + 1) // 2
        sheet(secs[:half], 480, 270, 4, "contact-sheet-1-first-half.jpg"); sheet(secs[half:], 480, 270, 4, "contact-sheet-2-second-half.jpg")
        for i in range(10): frame(dur * (i + 0.5) / 10, 1280, 720).save(os.path.join(shots, f"frame-{i + 1:02d}.jpg"), quality=90)
        for k, f in enumerate((0.12, 0.3, 0.5, 0.72, 0.9)):
            t0 = dur * f; sheet([t0 + j * 0.1 for j in range(6)], 640, 360, 3, f"motion-strip-{k + 1}-six-frames-0.1s-apart.jpg")
    except Exception as e:
        add("V7", "frames could be read", False, repr(e)[:200])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
def source():
    n = 0
    for dp, dns, fns in os.walk(build):
        dns[:] = [d for d in dns if d not in ("node_modules", "out", ".claude", ".git", "frames", "tmp")]
        n += sum(1 for f in fns if f.endswith((".js", ".mjs", ".ts", ".tsx", ".jsx", ".html", ".py", ".css", ".svg")) and os.path.getsize(os.path.join(dp, f)) > 800)
    return n >= 1, f"{n} source files"
guard("V12", "the source that makes the video is in the folder", source)
def readme():
    t = open(os.path.join(build, "README.md")).read(); return bool(re.search(r"(npm|npx|node|python3?|bash|sh|make)\s+\S+", t)), t[:80]
guard("V13", "README gives a render command", readme)
finish(out, {"duration": round(dur, 2)})
