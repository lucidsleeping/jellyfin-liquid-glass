# Jellyfin Liquid Glass — layout, rules, history

Living notes for this theme. Update when OSD placement or the WebGL lens changes.

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

┌─ bottom-left ──┐   ┌─ scrubber pill (lifted) ──────────────┐   ┌─ bottom-right ─┐
│ mute + volume  │   │ start │━━━━━━●━━━━━━│ end │ Ends at   │   │ ♪ · CC · ⚙     │
└────────────────┘   └───────────────────────────────────────┘   └────────────────┘
```

### Exact placements

| Cluster | Position | CSS anchor |
|--------|----------|------------|
| Transport (rewind / play / forward) | **Middle of the screen** | `position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%)` on `.videoOsdBottom .buttons > div:first-child` |
| Volume pill | Bottom-left | `bottom: var(--osd-edge); left: var(--osd-left-edge)` |
| Audio / subs / settings | Bottom-right | `bottom: var(--osd-edge); right: …` |
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
   Jellyfin injects branding CustomCss into a `<style>` node. JS cannot run from CSS. The WebGL lens must be a real `<script src="ui/osd-lens-glass.js?v=…">` in `index.html`.

6. **Deploy path**  
   - Theme CSS → `branding.xml` `<CustomCss>` (and Jellyfin often needs a **container restart** to serve the new branding).  
   - Lens JS → `/usr/share/jellyfin/web/ui/osd-lens-glass.js` + persist under `/config/liquid-glass/` via `./tools/install-into-docker.sh`.  
   - Always cache-bust: `?v=refraction-<hash>`.

7. **Hidden player page clones**  
   Jellyfin keeps a `.mainAnimatedPage.hide` copy of the player. Lens code must only attach to **visible** transport buttons (skip pages with `.hide`).

8. **Lens look**  
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
| `style.css` | Theme + OSD layout (source of truth for CustomCss) |
| `tools/osd-lens-glass.js` | WebGL transport lens |
| `tools/install-into-docker.sh` | Writes branding + installs lens + cache-bust |
| `tools/99-liquid-glass-lens.sh` | Cont-init persist hook |
| `info.md` | This document |

---

## Quick verify (player)

With OSD visible:

1. Transport cluster center ≈ `innerWidth/2`, `innerHeight/2` (± a few px).  
2. Host `getComputedStyle(…).position === "fixed"`.  
3. Scrubber bottom edge is well below the transport cluster (no overlap).  
4. Volume and settings share the same bottom baseline (`--osd-edge`).  
5. Console: `[osd-lens-glass] loaded (refraction-v…)`.
