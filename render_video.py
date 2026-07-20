#!/usr/bin/env python3
"""
POS Pitch – Slideshow zu MP4
Startet automatisch einen lokalen Server, rendert jeden Slide und
baut daraus ein Video mit Überblenden.

Voraussetzungen:
  pip install playwright
  python -m playwright install chromium

  ffmpeg muss im PATH sein ODER als ffmpeg.exe im selben Ordner liegen.
  Download: https://www.gyan.dev/ffmpeg/builds/
            → ffmpeg-release-essentials.zip → bin/ffmpeg.exe
"""

import subprocess, sys, time, shutil, threading, os
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

# ═══════════════════════════════════════════════
#  KONFIGURATION
# ═══════════════════════════════════════════════
SLIDE_DURATION = 18      # Sekunden pro Slide (wie in der Präsentation)
TRANSITION     = 1.4     # Überblende in Sekunden
FPS            = 30
WIDTH          = 1920
HEIGHT         = 1080
OUTPUT         = "pos_pitch.mp4"
PORT           = 8099    # eigener Port (kein Konflikt mit laufendem Server)
# ═══════════════════════════════════════════════

BASE_DIR = Path(__file__).parent


# ── Hilfsfunktionen ────────────────────────────

def find_ffmpeg():
    """Sucht ffmpeg im PATH oder im Skript-Ordner."""
    local = BASE_DIR / "ffmpeg.exe"
    if local.exists():
        return str(local)
    found = shutil.which("ffmpeg")
    if found:
        return found
    print("❌  ffmpeg nicht gefunden.")
    print("    Windows: https://www.gyan.dev/ffmpeg/builds/")
    print("    → ffmpeg-release-essentials.zip entpacken")
    print("    → ffmpeg.exe in diesen Ordner legen:")
    print(f"      {BASE_DIR}")
    sys.exit(1)


def ensure_playwright():
    try:
        import playwright  # noqa
    except ImportError:
        print("📦  Installiere playwright ...")
        subprocess.run([sys.executable, "-m", "pip", "install", "playwright"], check=True)
    print("📦  Stelle sicher, dass Chromium vorhanden ist ...")
    subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        capture_output=True
    )


def start_server():
    """Startet einen SimpleHTTPServer im Eltern-Ordner von POS_Pitch."""
    serve_dir = str(BASE_DIR.parent)

    class SilentHandler(SimpleHTTPRequestHandler):
        def __init__(self, *a, directory=serve_dir, **kw):
            super().__init__(*a, directory=directory, **kw)
        def log_message(self, *_):
            pass

    server = HTTPServer(("localhost", PORT), SilentHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


# ── Slide-Capture ───────────────────────────────

def capture_slides(url: str) -> list[str]:
    from playwright.sync_api import sync_playwright

    tmp = BASE_DIR / "_frames_tmp"
    tmp.mkdir(exist_ok=True)
    paths: list[str] = []

    print(f"🌐  Lade Präsentation ({url}) ...")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=["--force-device-scale-factor=1", "--disable-gpu"]
        )
        ctx = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1,
        )
        page = ctx.new_page()
        page.goto(url)
        page.wait_for_load_state("networkidle")
        time.sleep(4)  # Fonts, Bilder und Animationen abwarten

        # Slideshow einfrieren, Dots + Progressbar ausblenden
        page.evaluate("""
            paused = true;
            document.querySelectorAll('.slide').forEach(s => {
                s.style.transition = 'none';
                s.style.opacity    = '0';
                s.classList.remove('active');
            });
            document.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
            const pb = document.getElementById('progressBar');
            if (pb) pb.style.display = 'none';
            const dt = document.getElementById('dots');
            if (dt) dt.style.display = 'none';
        """)

        count = page.evaluate("slides.length")
        print(f"📊  {count} Slides gefunden\n")

        for i in range(count):
            # Slide sichtbar schalten (ohne Transition)
            page.evaluate(f"""
                slides[{i}].style.opacity = '1';
                slides[{i}].classList.add('active');
            """)
            time.sleep(0.8)  # Render abwarten

            out = tmp / f"slide_{i:02d}.png"
            page.screenshot(path=str(out), full_page=False)
            paths.append(str(out))
            print(f"  ✓  Slide {i + 1}/{count}")

            # Slide wieder ausblenden
            page.evaluate(f"""
                slides[{i}].style.opacity = '0';
                slides[{i}].classList.remove('active');
            """)

        browser.close()

    return paths


# ── Video-Zusammenbau ───────────────────────────

def build_video(paths: list[str], ffmpeg: str):
    n      = len(paths)
    D, T   = SLIDE_DURATION, TRANSITION
    output = str(BASE_DIR / OUTPUT)

    # Jeden Screenshot als Loop-Quelle einbinden
    inputs: list[str] = []
    for p in paths:
        inputs += ["-loop", "1", "-t", str(round(D + T + 1, 2)), "-i", p]

    # xfade-Filter-Kette aufbauen
    if n == 1:
        filt = "[0:v]copy[vout]"
    else:
        parts: list[str] = []
        for i in range(n - 1):
            a       = "[0:v]"      if i == 0    else f"[v{i:02d}]"
            b       = f"[{i + 1}:v]"
            out_tag = "[vout]"     if i == n-2  else f"[v{i+1:02d}]"
            offset  = round((i + 1) * (D - T), 3)
            parts.append(
                f"{a}{b}xfade=transition=fade:duration={T}:offset={offset}{out_tag}"
            )
        filt = ";".join(parts)

    total_sec = round(n * D - (n - 1) * T)

    print(f"\n🎬  Erstelle Video ...")
    print(f"    Auflösung : {WIDTH} × {HEIGHT} px @ {FPS} fps")
    print(f"    Slides    : {n}")
    print(f"    Dauer     : ~{total_sec} Sekunden ({total_sec // 60}:{total_sec % 60:02d} min)")
    print(f"    Ausgabe   : {OUTPUT}\n")

    cmd = [
        ffmpeg, "-y",
        *inputs,
        "-filter_complex", filt,
        "-map", "[vout]",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        output,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("❌  ffmpeg-Fehler:\n")
        print(result.stderr[-3000:])
        shutil.rmtree(BASE_DIR / "_frames_tmp", ignore_errors=True)
        sys.exit(1)

    shutil.rmtree(BASE_DIR / "_frames_tmp", ignore_errors=True)

    size_mb = Path(output).stat().st_size / 1024 / 1024
    print(f"\n✅  Fertig!  →  {OUTPUT}  ({size_mb:.1f} MB)")


# ── Einstiegspunkt ──────────────────────────────

if __name__ == "__main__":
    ffmpeg_path = find_ffmpeg()
    ensure_playwright()

    server = start_server()
    url    = f"http://localhost:{PORT}/POS_Pitch/"
    time.sleep(1)

    try:
        slides = capture_slides(url)
        build_video(slides, ffmpeg_path)
    finally:
        server.shutdown()
