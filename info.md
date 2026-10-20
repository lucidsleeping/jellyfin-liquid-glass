# Jellyfin Liquid Glass — layout, rules, history

Living notes for the themes in this repo. Update when OSD placement or a WebGL lens changes.

Player composition below is canonical for **liquid**, **cyberpunk liquid**, and **cyberpunk**. Do not fork the five-cluster map per theme. Cyberpunk uses the same anchors with HUD squares instead of glass pills, and it loads no WebGL lens.

---

## Themes

Paste one Custom CSS file. Do not paste more than one.

| Theme | CSS | Sentinel on `:root` | Lens | Console prefix |
|-------|-----|---------------------|------|----------------|
| Liquid (default) | `style.css` | `--liquid-glass-theme: on` | `tools/osd-lens-glass.js` | `[osd-lens-glass]` |
| Cyberpunk liquid | `style-cyberpunk-liquid.css` | `--cyberpunk-liquid-theme: on` | `tools/osd-lens-cyberpunk.js` | `[osd-lens-cyberpunk]` |
| Cyberpunk | `style-cyberpunk.css` | `--cyberpunk-theme: on` | none | none |

`style.css` sets `--liquid-glass-theme` and does not set `--cyberpunk-liquid-theme` or `--cyberpunk-theme`.

`style-cyberpunk-liquid.css` sets `--cyberpunk-liquid-theme: on` and does **not** set `--liquid-glass-theme`. The stock lens does not start on the hybrid file. The hybrid lens does not start on stock CSS.

`style-cyberpunk.css` sets `--cyberpunk-theme: on` only. It does not set `--liquid-glass-theme` or `--cyberpunk-liquid-theme`. It does not load a lens.

Installer values:

- `THEME=liquid` (default) writes `style.css` and links only `osd-lens-glass.js?v=refraction-<hash>`.
- `THEME=cyberpunk-liquid` writes `style-cyberpunk-liquid.css` and links only `osd-lens-cyberpunk.js?v=spectral-<hash>`.
- `THEME=cyberpunk` writes `style-cyberpunk.css` and removes both lens script tags. The persist hook does the same after an image update.

### Low FX (both themes)

Low FX applies when any of these match: `(pointer: coarse)`, `(max-width: 60em)`, `prefers-reduced-motion: reduce`.

CSS sets `--fx-disp` empty inside `@media (pointer: coarse), (max-width: 60em), (prefers-reduced-motion: reduce)`. SVG displacement turns off. Blur is capped (about 8–12px). Grain and scan overlays turn off. A single soft shadow remains.

Both lens scripts return before they create a WebGL context on that same low-FX set: coarse pointer, max-width 60em, or reduced motion. CSS frost discs remain.

Spectral WebGL (lime / cyan / magenta rim and fresnel) runs only on the hybrid theme, and only on the high-FX desktop path.

### Responsive verify

On a phone or tablet viewport (coarse pointer, or width ≤ 60em):

1. Transport host `getComputedStyle(…).position === "fixed"` at screen center.
2. Cast uses `right: var(--osd-right-edge)`. It does not use `left: calc(100vw - …)`.
3. Header, volume, and settings controls stay visible. Touch targets are at least 44px.
4. No WebGL context. Liquid logs use `[osd-lens-glass]`. Hybrid logs use `[osd-lens-cyberpunk]`.

On a fine-pointer desktop wider than 60em, `--fx-disp` stays on and the matching lens may start.

---

## Player OSD map (canonical)

Five independent floating pieces. Nothing shares one big chrome bar except the scrubber pill itself.

```
┌─ top-left ──────────────┐                    ┌─ top-right ─┐
│ back · home · menu      │                    │ cast        │
└─────────────────────────┘                    └─────────────┘

                    ┌─ CENTER (viewport 50%/50%) ─┐
                    │   ⟲ rewind                  │
                    │   ▶︎ / ❚❚ play-pause (largest)│
                    │   ⟳ forward                 │
                    └─────────────────────────────┘

┌─ bottom-left ──┐   ┌─ scrubber pill (lifted) ──────────────┐   ┌─ bottom-right ──────────┐
│ mute + volume  │   │ start │━━━━━━●━━━━━━│ end │ Ends at   │   │ ♪ · CC · ⚙ · fullscreen │
└────────────────┘   └───────────────────────────────────────┘   └─────────────────────────┘
```

### Exact placements

| Cluster | Position | CSS anchor |
|--------|----------|------------|
| Transport (rewind / play / forward) | **Middle of the screen** | `position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%)` on `.videoOsdBottom .buttons > div:first-child` |
| Volume pill | Bottom-left | `bottom: var(--osd-edge); left: var(--osd-left-edge)` |
| Audio / subs / settings / fullscreen | Bottom-right | `bottom: var(--osd-edge); right: …` (fullscreen furthest right) |
| Scrubber (`.osdControls`) | Above the bottom row | `bottom: var(--osd-scrub-lift)` where `--osd-scrub-lift: calc(var(--osd-edge) + var(--osd-btn-size) + 0.85em)` |
| Cast | Top-right | `top: var(--osd-top-edge); right: var(--osd-right-edge)` |
| Back / home / menu | Top-left header | OSD header cluster |

Play/pause uses `--osd-transport-large`; rewind/forward use `--osd-transport-size`.

---

## Hard rules (do not break)

1. **Transport stays in the middle**  
   Always `top: 50%` + `left: 50%` + `translate(-50%, -50%)`. Not bottom-anchored.

2. **Transport host must stay `position: fixed !important`**  
   Never set `.buttons > div:first-child { position: relative }`.  
   A relative host becomes a flex child of the scrubber (because `.buttons { display: contents }`) and the three big buttons sit *inside* the progress pill. That was the “placement is very off” bug.

3. **Lens layer is absolute inside the fixed host**  
   `.osd-lens-layer` uses `position: absolute` under the fixed transport host. Absolute-in-fixed is fine; forcing the host to relative is not.

4. **Scrubber glass lives on `::before`, not on `.osdControls`**  
   Putting `backdrop-filter` / `transform` / `filter` on `.osdControls` itself creates a containing block and pulls `position: fixed` descendants back into the pill.

5. **Custom CSS is text-only**  
   Jellyfin injects branding CustomCss into a `<style>` node. JS cannot run from CSS. The WebGL lens must be a real script in `index.html`: `ui/osd-lens-glass.js?v=…` **or** `ui/osd-lens-cyberpunk.js?v=…`. Link only the script that matches the CSS.

6. **Graceful degrade (CSS off / skip JS)**  
   - Stock CSS sets `--liquid-glass-theme: on`. Hybrid CSS sets `--cyberpunk-liquid-theme: on` and does not set `--liquid-glass-theme`. Each lens runs only when its sentinel is present. Disabling Custom CSS leaves stock buttons and menus alone.  
   - Liquid opt-out: `localStorage.jellyfin-liquid-glass-lens = 'off'`, URL `?nolens=1`, or console `liquidGlassLens.disable()` / `.enable()`.  
   - Hybrid opt-out: `localStorage.jellyfin-cyberpunk-liquid-lens = 'off'`, URL `?nolens=1`, or console `cyberpunkLiquidLens.disable()` / `.enable()`.

7. **Deploy path**  
   - Theme CSS → `branding.xml` `<CustomCss>` (one file). Jellyfin often needs a **container restart** to serve the new branding.  
   - Lens JS → `/usr/share/jellyfin/web/ui/<matching-lens>.js`, persisted under `/config/liquid-glass/` by `./tools/install-into-docker.sh`. `THEME=cyberpunk` copies no lens.  
   - `THEME=liquid` (default) deploys `style.css` + `osd-lens-glass.js`. `THEME=cyberpunk-liquid` deploys `style-cyberpunk-liquid.css` + `osd-lens-cyberpunk.js`. `THEME=cyberpunk` deploys `style-cyberpunk.css` and injects no lens. The installer and the persist hook inject one lens script, or none.  
   - Cache-bust query: `?v=refraction-<hash>` (liquid) or `?v=spectral-<hash>` (cyberpunk liquid). Cyberpunk has no script query.

8. **Hidden player page clones**  
   Jellyfin keeps a `.mainAnimatedPage.hide` copy of the player. Lens code must only attach to **visible** transport buttons (skip pages with `.hide`).

9. **Lens look**  
   Edge-clear glass discs: center samples video nearly 1:1 (no warp / no rainbow). **Refraction + chromatic aberration** live in the outer rim only (inspired by [ybouane LiquidGlass](https://liquid-glass.ybouane.com)). Soft fresnel rim light — no frost blur, no center specular. Shared WebGL layer, one video upload per display frame, `requestAnimationFrame`.

---

## History (what went wrong / what we learned)

| Issue | Cause | Fix |
|------|--------|-----|
| Buttons flash transparent→opaque on home card hover | Jellyfin fades `.cardOverlayButton-hover` from `opacity: 0` with transparent bg | Show overlay with `visibility`; keep button opacity at 1; use `--osd-pill-*` glass |
| Card overlay buttons on title text | Forced `position: relative` on all overlay children | Restore absolute FAB / action-row geometry |
| Detail Genres/Studio / Tags indent | Stale branding or flex/`display: contents` fights | Fixed label column / hanging indent on tags; always sync branding |
| Detail codec row left of title | `.detailPagePrimaryContent { padding-left: 0 }` while title had 5% | Same 5% padding on primary content |
| Lens lag / choppy | Per-button WebGL + heavy blur + RVFC-only clock | One shared `.osd-lens-layer`, cheap shader, RAF at display refresh |
| Lens attached to invisible buttons | `querySelector` hit hidden page clone | Skip `.mainAnimatedPage.hide` |
| Transport sitting in scrubber pill | Later CSS set host `position: relative !important` for the lens | Removed that override; host stays `fixed` |
| Transport at bottom after a “fix” | Temporary bottom baseline experiment | Restored **center** placement (this doc’s canonical map) |
| Glass JS “not working” (no lens, no `__osdLensGlassLoaded`) | Unquoted multi-line comment inside the shader string array → `SyntaxError`, script never runs | Keep every FRAGMENT_SHADER entry as a single-quoted one-liner; `node --check tools/osd-lens-glass.js` before deploy |

---

## Key files

| File | Role |
|------|------|
| `style.css` | Liquid theme + OSD layout (CustomCss for `THEME=liquid`) |
| `style-cyberpunk-liquid.css` | Cyberpunk liquid theme + same OSD map |
| `style-cyberpunk.css` | Pure cyberpunk theme. Sentinel `--cyberpunk-theme: on`. No lens |
| `tools/osd-lens-glass.js` | Liquid WebGL transport lens. Console prefix `[osd-lens-glass]` |
| `tools/osd-lens-cyberpunk.js` | Hybrid WebGL transport lens. Console prefix `[osd-lens-cyberpunk]` |
| `tools/install-into-docker.sh` | `THEME=liquid`, `THEME=cyberpunk-liquid`, or `THEME=cyberpunk` |
| `tools/99-liquid-glass-lens.sh` | Cont-init persist hook (reads `theme.txt`; `cyberpunk` links no lens) |
| `info.md` | This document |

---

## Quick verify (player)

With OSD visible:

1. Transport cluster center ≈ `innerWidth/2`, `innerHeight/2` (± a few px).  
2. Host `getComputedStyle(…).position === "fixed"`.  
3. Scrubber bottom edge is well below the transport cluster (no overlap).  
4. Volume and settings share the same bottom baseline (`--osd-edge`).  
5. Desktop console: `[osd-lens-glass] loaded` or `[osd-lens-cyberpunk] loaded`, matching the installed theme.  
6. Phone or tablet: host stays `fixed`; `--fx-disp` is empty; the lens does not create WebGL. The same console prefix may log a low-FX skip.
