#!/usr/bin/env python3
"""
Schaufenster-Film → MP4 (Bild für Bild, 1920×1080)

Der Film ist eine reine Funktion der Zeit. Dieses Skript startet einen
lokalen Server, ruft für jedes Einzelbild window.__film.render(t) auf,
macht einen Screenshot und schiebt ihn direkt in ffmpeg.

Aufruf:   python render_film.py            → schaufenster_film.mp4
          python render_film.py --fps 25   (schneller, etwas weniger flüssig)
          python render_film.py --von 0 --bis 30   (nur Ausschnitt, zum Testen)

Voraussetzungen: pip install playwright · python -m playwright install chromium
                 ffmpeg im PATH oder als ffmpeg.exe hier bzw. eine Ebene höher
"""
import argparse, functools, shutil, subprocess, sys, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

BASIS = Path(__file__).resolve().parent


def finde_ffmpeg():
    for p in (BASIS / 'ffmpeg.exe', BASIS.parent / 'ffmpeg.exe'):
        if p.exists():
            return str(p)
    f = shutil.which('ffmpeg')
    if f:
        return f
    sys.exit('ffmpeg nicht gefunden (PATH oder ffmpeg.exe neben dem Skript).')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--von', type=float, default=0)
    ap.add_argument('--bis', type=float, default=None)
    ap.add_argument('--out', default=str(BASIS / 'schaufenster_film.mp4'))
    ap.add_argument('--port', type=int, default=8131)
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright

    class Leise(SimpleHTTPRequestHandler):
        def log_message(self, *x):
            pass

    srv = ThreadingHTTPServer(('127.0.0.1', a.port), functools.partial(Leise, directory=str(BASIS)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1920, 'height': 1080})
        pg.goto(f'http://127.0.0.1:{a.port}/index.html?render')
        pg.evaluate('window.__film.ready')
        gesamt = pg.evaluate('window.__film.total')
        bis = min(a.bis if a.bis is not None else gesamt, gesamt)
        n = int(round((bis - a.von) * a.fps))
        print(f'Film: {gesamt:.1f} s -> rendere {a.von:.1f}-{bis:.1f} s = {n} Bilder @ {a.fps} fps')

        ff = subprocess.Popen([
            finde_ffmpeg(), '-y', '-loglevel', 'error',
            '-f', 'image2pipe', '-framerate', str(a.fps), '-c:v', 'mjpeg', '-i', '-',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', a.out,
        ], stdin=subprocess.PIPE)

        start = time.time()
        for i in range(n):
            t = a.von + i / a.fps
            pg.evaluate(f'window.__film.render({t:.5f})')
            ff.stdin.write(pg.screenshot(type='jpeg', quality=94))
            if i % (a.fps * 5) == 0:
                el = time.time() - start
                rest = el / max(i, 1) * (n - i)
                print(f'  {t:6.1f} s  ({i}/{n})  noch ca. {rest / 60:.1f} min', flush=True)
        ff.stdin.close()
        ff.wait()
        b.close()
    srv.shutdown()
    print(f'Fertig: {a.out}  ({(time.time() - start) / 60:.1f} min)')


if __name__ == '__main__':
    main()
