# Schaufenster-Film – Hörakustik Lindenthal

Animierter Werbefilm für den Fernseher im Schaufenster (16:9, 1920×1080, skaliert auf jede Auflösung).
Läuft komplett offline (Schrift, Logos und Bilder liegen in `assets/`), Endlosschleife, ca. 5:16 min.

## Abspielen
- **Im Browser:** `index.html` öffnen (am besten Chrome/Edge), `F` oder Doppelklick → Vollbild.
- **Als Video (USB-Stick am TV):** `python render_film.py` → `schaufenster_film.mp4` (ca. 15 min Renderzeit).

Tasten: Leertaste Pause · ← → Szene · 1–5 Kapitel · 0 Anfang · F Vollbild · H Hilfe
URL: `index.html?t=120` startet bei Sekunde 120.

## Ablauf
| Zeit | Abschnitt |
|---|---|
| 0:00 | Logo vollflächig + „Ihr Spezialist für natürliche und audiophile Anpassungen." |
| 0:15 | Logo-Sting → **01 Siegeszug der KI**: Partikel „EUHA 2026" → „KI", Oticon Reveal, Phonak Audéo EON Sphere, Signia Pure Charge&Go MaX, Finale |
| 1:11 | Logo → **02 Unsere Philosophie**: Anpassung, Schuhgrößen-Gleichnis, „Kennen Sie das?", Ansatz, herstellerunabhängig |
| 2:10 | Logo → **03 Audiophile Anpassung**: Sprache vs. Anlage, Spektrum, Dynamik, Loudness-Zitat, Gemessen/Gehört/Vor Ort |
| 3:10 | Logo → **04 trueLOUDNESS & RevoLoud**: Audiogramm vs. Lautheit, Kategorialskala, Lautheitsprofil, Ergebnis |
| 3:59 | Logo → **05 Handwerk**: Eigene Otoplastiken, Eigenschaften, Titan-Schmuck (Hörluchs), Gehörschutz, „Alles hier gefertigt" |
| 5:00 | Outro: Logo, Adresse, Telefon, Termin |

## Technik
- `index.html` Szenen (je `<section class="scene" data-dur=…>`), Texte direkt dort ändern.
- Animation per Attribut: `data-a` (fade, up, left, rise, blur, zoom, pop, wipe, track, grow, draw), `data-t` Startzeit, `data-d` Dauer, `data-o` Ausblendzeit.
- `film.js` zeitgesteuerte Engine – jedes Bild ist eine Funktion von t, dadurch spulbar und Bild für Bild renderbar.
- CD: Farben/Schrift laut Markenhandbuch v1.0, Logos aus `C:\claude\CD\01_Logo\`.
