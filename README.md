# Jellyfin Liquid Glass Theme

A full-app CSS theme for [Jellyfin](https://jellyfin.org) modeled on Apple's Vision Pro / iOS liquid-glass language: translucent surfaces with live refraction, an Apple-blue accent, and Apple system typography — applied uniformly to the video player **and** the rest of the UI (settings, dialogs, menus, library cards, forms, etc.).

## Features

- **One design language, everywhere** — header, drawer, dialogs, action sheets, context menus, settings panels, forms, library cards, lists, tabs and the video player all share the same translucent glass recipe and Apple-blue accent.
- **Live refracting video player** — every control is its own floating glass circle: header buttons top-left; AirPlay + Cast top-right; oversize rewind / play-pause / forward in the center; audio + subtitles + settings bottom-right; volume bottom-left; full-width scrubber pill with elapsed `1:09` · `[========]` · `-24:25` · *Ends at 10:42 PM* inline. Uses an inline SVG `<feDisplacementMap>` so the video pixels behind each button literally warp like glass refraction.
- **Apple-blue accent system** — primary buttons, scrubber fill, slider thumbs (iOS-style pills, not dots), checkbox/radio fills, focus rings, tab indicators and progress bars are all `#0a84ff` (Apple system blue, dark-mode variant).
- **iOS-style form controls** — checkboxes, radios, text inputs and selects rebuilt as glass surfaces with Apple-blue active/checked states and a soft blue glow focus ring.
- **Apple system typography** — `-apple-system` / `SF Pro` first, Inter as fallback; tabular numerics for time-like text; tightened display tracking on headings.
- **Refined cards** — the chunky 8px drop-shadow card aesthetic is replaced with the same translucent glass + soft lift used elsewhere.
- **Fully responsive** — desktop ↔ tablet ↔ mobile breakpoints for both the player and the global UI.

## Installation

1. Open **Dashboard → General → Custom CSS** (server-wide),  
   **or** **User → Settings → Display → Custom CSS** (per user).
2. Copy the entire contents of [`jellyfin-liquid-glass.css`](./jellyfin-liquid-glass.css).
3. Paste into the Custom CSS field and **Save**.
4. Hard-refresh Jellyfin (`Ctrl+Shift+R` / `Cmd+Shift+R`).

## Requirements

- Jellyfin **10.9+**
- A browser with **`backdrop-filter`** support (Chrome, Edge, Safari, Firefox 103+)
- Modern CSS features: `:has()`, `animation-timeline` (parallax on supported browsers)

## Customization

Two token blocks at the top of `style.css` drive the whole theme:

```css
:root {
  /* ── Global UI tokens ─────────────────────────────── */
  --bg-color: rgb(14, 14, 16);             /* page background */
  --w-color: rgba(20, 20, 24, 0.42);       /* glass panel fill */
  --blur: blur(22px) saturate(170%) brightness(102%);
  --accent-blue: #0a84ff;                  /* the one accent  */
  --hover-bg: rgba(255, 255, 255, 0.06);
  --card-gap: 1vw;

  /* ── Player-only tokens (further down) ────────────── */
  --osd-pill-bg: rgba(255, 255, 255, 0.04);
  --osd-pill-blur: url(/* SVG displacement filter */) blur(16px) saturate(170%) brightness(105%);
  --osd-accent-blue: #0a84ff;
  --osd-transport-size: 5.6em;             /* rewind / forward */
  --osd-transport-large: 7.6em;            /* play / pause     */
}
```

Change `--accent-blue` to recolor every primary action, focus ring, tab indicator, progress bar and slider thumb in one shot. Change `--blur` to make the whole UI more or less frosted. Player sizing is independent of global sizing, so the OSD scales without affecting library cards.

## License

MIT — use and modify freely.
