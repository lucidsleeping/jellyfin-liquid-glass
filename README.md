# Jellyfin Liquid Glass

Three full-app themes for [Jellyfin](https://jellyfin.org). Paste **one** CSS file into Custom CSS. Do not paste more than one file.

| Theme | CSS file | Lens script | Sentinel |
|-------|----------|-------------|----------|
| **Liquid** (default) | [`style.css`](./style.css) | `tools/osd-lens-glass.js` | `--liquid-glass-theme: on` |
| **Cyberpunk liquid** | [`style-cyberpunk-liquid.css`](./style-cyberpunk-liquid.css) | `tools/osd-lens-cyberpunk.js` | `--cyberpunk-liquid-theme: on` |
| **Cyberpunk** | [`style-cyberpunk.css`](./style-cyberpunk.css) | none | `--cyberpunk-theme: on` |

**Liquid** uses translucent surfaces, live refraction, and Apple system blue (`#0a84ff`) on the home screen, libraries, detail pages, settings, menus, and the video player.

**Cyberpunk liquid** keeps that floating OSD and glass. The stage is void (`#090c12` / `#10131a`). The accent is neon lime (`#b8ff2e`), with sparse cyan and magenta. Text uses Switzer and JetBrains Mono. On a fine-pointer desktop, the transport lens is spectral WebGL (lime, cyan, and magenta rim, plus fresnel). Phone and tablet do not run that WebGL lens.

**Cyberpunk** matches the dark index on [jyothin.com](https://jyothin.com). The stage is void black (`#000` / `#090c12`). Type is Switzer, with JetBrains Mono tracked uppercase labels. Rules and progress use the idle-spectrum peach (`#f7b685`). There is no glass frost, no SVG displacement, and no WebGL lens.

The cinematic **home spotlight** is from **[Abyss](https://github.com/AumGupta/abyss-jellyfin)** (installed alongside this theme). The rest of the UI is this repo’s CSS. Liquid and cyberpunk liquid also load a matching WebGL transport lens. Cyberpunk does not.

<p align="center">
  <img src="docs/screenshots/01-home.png" alt="Home with Abyss spotlight" width="900" />
</p>

<p align="center"><em>Home — Abyss Spotlight banner over Liquid Glass chrome</em></p>

---

## Screenshots

### Home

Abyss **Spotlight** hero (Continue Watching / Next Up) with Liquid Glass header pills and rows underneath.

![Home](docs/screenshots/01-home.png)

### Player

Centered transport with WebGL edge-refraction lenses; volume bottom-left; scrubber lifted; CC / settings / fullscreen bottom-right.

![Player](docs/screenshots/02-player.png)

---

## Inspirations & credits

| Source | What we took | What we did not |
|--------|----------------|-----------------|
| **[Abyss](https://github.com/AumGupta/abyss-jellyfin)** by AumGupta | **Home Spotlight** — cinematic banner (backdrop, logo/title, rating/runtime/score pills, resume, carousel). Also the reason this CSS fights Abyss’s player prism / center-cluster halos (`#videoOsdPage` rings) so Liquid Glass transport can take over. | We do **not** ship Abyss’s full `abyss.css` as this theme. Spotlight is a separate install (`spotlight.html` / inject scripts in Jellyfin `web/ui`). |
| **Apple Liquid Glass / Vision Pro / Apple TV** | Translucent floating controls, near-clear glass, SF-first typography, Apple system blue (`#0a84ff`), poster cards, sidebar selection, iOS-style sliders. | Not an official Apple skin; no proprietary assets. |
| **[kube.io liquid glass (Maxime Bourgeois)](https://kube.io/blog/liquid-glass-css-svg/)** | Physics-based **SVG `feDisplacementMap`** for CSS glass: squircle profile → Snell–Descartes refraction → baked displacement map (`tools/generate-liquid-glass.py`). | We bake the map offline; we don’t run their playground live. |
| **[ybouane LiquidGlass](https://liquid-glass.ybouane.com)** | Player transport **look**: clear disc center, bend + **chromatic aberration** on the rim. | Implemented in our own WebGL shader (`tools/osd-lens-glass.js`). We do **not** embed that library. |

### How Abyss Spotlight fits

1. Abyss’s spotlight scripts inject an iframe (`web/ui/spotlight.html`) on the home view.
2. It reads Continue Watching / Next Up (and falls back to library items) and paints the hero.
3. This theme styles everything *around* it (header, drawer, rows, cards) with `--osd-pill-*` / global glass tokens so the page still feels like one product.
4. On the **player**, Abyss’s decorative rings are explicitly overridden so they don’t fight the WebGL lenses.

If you only want Liquid Glass CSS without Spotlight, skip the Abyss spotlight install — home will use Jellyfin’s normal sections.

---

## Features

- **One design language per theme** — header, drawer, dialogs, action sheets, settings, forms, cards, and player share one glass recipe and one accent.
- **Abyss Spotlight home** (optional companion) — cinematic resume banner.
- **Live player glass** — CSS displacement on pills (desktop). **WebGL lenses** on rewind / play-pause / forward. Liquid uses a clear rim with chroma. Cyberpunk liquid uses a spectral rim on desktop only.
- **Low FX on phone and tablet** — `(pointer: coarse)` or `max-width: 60em` turns off SVG displacement (`--fx-disp`) and skips WebGL. `prefers-reduced-motion: reduce` does the same. CSS frost discs stay. Blur is capped. Grain and scan overlays turn off.
- **Graceful degrade** — disable Custom CSS in the client and stock buttons and menus return. Each lens runs only when its sentinel is present. Liquid sentinel: `--liquid-glass-theme: on`. Cyberpunk liquid sentinel: `--cyberpunk-liquid-theme: on`. `style-cyberpunk-liquid.css` does not set `--liquid-glass-theme`.
- **Responsive** — desktop, tablet, and mobile breakpoints for the OSD and the library UI. Transport stays center-fixed. Cast uses `right: var(--osd-right-edge)`.

---

## Installation

Paste one theme. Install the lens that matches that CSS. The installer injects one lens script, not both. `THEME=cyberpunk` injects no lens.

### 1. Theme CSS (required)

**Dashboard → General → Custom CSS** (server-wide), or paste into `branding.xml` `<CustomCss>`.

| Theme | Paste this file |
|-------|-----------------|
| Liquid | all of [`style.css`](./style.css) |
| Cyberpunk liquid | all of [`style-cyberpunk-liquid.css`](./style-cyberpunk-liquid.css) |
| Cyberpunk | all of [`style-cyberpunk.css`](./style-cyberpunk.css) |

Save, then hard-refresh (`Ctrl+Shift+R`). Jellyfin often needs a **container restart** after branding changes.

### 2. WebGL transport lens (recommended)

Custom CSS is text inside a `<style>` tag. It cannot load scripts. Install the matching lens as a real file.

Liquid (default). This writes `style.css`, copies `osd-lens-glass.js`, and links `?v=refraction-<hash>`:

```bash
./tools/install-into-docker.sh
# same as: THEME=liquid ./tools/install-into-docker.sh
```

Cyberpunk liquid. This writes `style-cyberpunk-liquid.css`, copies `osd-lens-cyberpunk.js`, and links `?v=spectral-<hash>`:

```bash
THEME=cyberpunk-liquid ./tools/install-into-docker.sh
```

`THEME` accepts `liquid`, `cyberpunk-liquid`, or `cyberpunk`. The script removes the other lens tag from `index.html`. `THEME=cyberpunk` removes both lens tags and does not add one. It also installs a `custom-cont-init.d` persist hook. The hook reads `/config/liquid-glass/theme.txt` and links only that lens after an image update. For `cyberpunk` the hook strips lens tags and does not add one.

Cyberpunk (no lens):

```bash
THEME=cyberpunk ./tools/install-into-docker.sh
```

**Manual (liquid):** copy `osd-lens-glass.js` into Jellyfin web `ui/` and add before `</body>`:

```html
<script src="ui/osd-lens-glass.js?v=refraction-1" defer></script>
```

**Manual (cyberpunk liquid):** copy `osd-lens-cyberpunk.js` instead. Do not add both script tags.

```html
<script src="ui/osd-lens-cyberpunk.js?v=spectral-1" defer></script>
```

### 3. Abyss Spotlight (optional, for the home hero)

Follow [Abyss setup](https://github.com/AumGupta/abyss-jellyfin/blob/main/SETUP.md) for the spotlight scripts (`spotlight.html`, `spotlight.css`, inject + home chunk patch), **or** use their installer. Keep Jellyfin’s display theme on **Dark**.

This repo assumes Spotlight is already on the server (as in the screenshots). Liquid Glass CSS is written to coexist with it.

---

## Requirements

- Jellyfin **10.9+** (web client)
- Browser with **`backdrop-filter`** (Chrome, Edge, Safari, Firefox 103+)
- WebGL for transport lenses (falls back to CSS frost if texture upload fails)

---

## Customization

Liquid tokens live at the top of `style.css`:

```css
:root {
  --liquid-glass-theme: on;   /* sentinel for osd-lens-glass.js — do not remove if you use that lens */
  --accent-blue: #0a84ff;
  --blur: blur(22px) saturate(170%) brightness(102%);
  /* Player */
  --osd-transport-size: 5.6em;
  --osd-transport-large: 7.6em;
}
```

Cyberpunk liquid tokens live at the top of `style-cyberpunk-liquid.css`. Keep `--cyberpunk-liquid-theme: on`. Do not add `--liquid-glass-theme` to that file.

```css
:root {
  --cyberpunk-liquid-theme: on; /* sentinel for osd-lens-cyberpunk.js */
  --sys-lime: #b8ff2e;
}
```

Liquid lens look (edit `tools/osd-lens-glass.js`, then re-run the install script with `THEME=liquid`):

| Constant | Role |
|----------|------|
| `REFRACTION` | Rim bend strength |
| `CHROMA` | RGB split amount |
| `CHROMA_SAT` | How much fringe replaces the base |
| `CHROMA_GREEN_SAT` | Green-only desaturation in the fringe (`1` = full green) |

Cyberpunk liquid lens look is in `tools/osd-lens-cyberpunk.js`. Re-run with `THEME=cyberpunk-liquid` after edits. Console prefix: `[osd-lens-cyberpunk]`.

Cyberpunk tokens live at the top of `style-cyberpunk.css`. Keep `--cyberpunk-theme: on`. Do not add `--liquid-glass-theme` or `--cyberpunk-liquid-theme` to that file. There is no lens script for this theme.

```css
:root {
  --cyberpunk-theme: on;
  --cp-stage: #090c12;
  --cp-ink: #f3f0ff;
  --cp-accent: #f7b685;
}
```

---

## Client opt-out

| Goal | How |
|------|-----|
| Stock Jellyfin UI | Settings → Display → **Disable server-provided custom CSS** |
| Keep liquid CSS, skip WebGL | Console: `liquidGlassLens.disable()` / `.enable()`, or `localStorage.jellyfin-liquid-glass-lens = 'off'`, or `?nolens=1` |
| Keep cyberpunk liquid CSS, skip WebGL | Console: `cyberpunkLiquidLens.disable()` / `.enable()`, or `localStorage.jellyfin-cyberpunk-liquid-lens = 'off'`, or `?nolens=1` |
| Cyberpunk (no WebGL) | The theme has no lens. Disable Custom CSS to return to stock Jellyfin |

On phone and tablet the lens script exits before it creates a WebGL context. You do not need the opt-out key for that path.

---

## Repo layout

| Path | Role |
|------|------|
| `style.css` | Liquid theme + OSD layout |
| `style-cyberpunk-liquid.css` | Cyberpunk liquid theme + same OSD layout |
| `style-cyberpunk.css` | Pure cyberpunk theme (jyothin.com index). No lens |
| `tools/osd-lens-glass.js` | Liquid WebGL transport lens |
| `tools/osd-lens-cyberpunk.js` | Cyberpunk liquid WebGL transport lens (desktop only) |
| `tools/install-into-docker.sh` | `THEME=liquid`, `THEME=cyberpunk-liquid`, or `THEME=cyberpunk` |
| `tools/99-liquid-glass-lens.sh` | Cont-init persist hook (one lens, or none for `cyberpunk`) |
| `tools/generate-liquid-glass.py` | Bake CSS displacement map (kube.io math) |
| `tools/capture-readme-shots.py` | Headless Chromium gallery capture |
| `info.md` | OSD hard rules and history |
| `docs/screenshots/` | README images |

---

## Capturing updated screenshots

With Jellyfin up and Chromium available:

```bash
chromium --headless=new --remote-debugging-port=9333 \
  --user-data-dir=/tmp/jf-shot --no-sandbox \
  --autoplay-policy=no-user-gesture-required about:blank &

export JF_TOKEN='…' JF_USER='…' JF_SERVER='…' JF_URL='http://localhost:8096'
python3 tools/capture-readme-shots.py
```

---

## License

MIT — use and modify freely.

**Third-party:** Abyss Spotlight remains under its own license/project; kube.io article and ybouane demo are inspiration only.
