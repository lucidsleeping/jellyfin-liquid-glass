# Jellyfin Dark Glass Theme

A custom CSS theme for [Jellyfin](https://jellyfin.org) with frosted glass navigation, gradient borders, and a consistent black-and-white palette.

## Features

- **Frosted glass UI** — blur on header, sidebar, action sheets, and now-playing bar
- **Gradient borders** — subtle white edge highlights on cards and panels
- **Split detail layout** — backdrop art on the right, metadata on the left (desktop)
- **Card lift animations** — hover and active states on library cards
- **Now playing bar** — floating glass bar with rotating album art ring
- **Liquid-glass video player** — every control is its own floating glass circle: header buttons top-left; volume + cast + PiP + fullscreen top-right; just rewind / play-pause (oversize) / forward in the center; audio + subtitles + settings bottom-right; lifted scrubber pill with elapsed / remaining / "ends at" inline; soft blue accent on transport icons; fully responsive desktop ↔ mobile

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

Edit the `:root` variables at the top of `jellyfin-liquid-glass.css`:

```css
:root {
  --bg-color: rgb(24, 24, 24);       /* page background */
  --w-color: #18181849;              /* glass panel fill */
  --blur: blur(16px) saturate(180%); /* frost strength */
  --card-gap: 1vw;                   /* grid gap between cards */
  --hover-bg: rgba(255, 255, 255, 0.08);
  --accent: rgba(255, 255, 255, 0.9); /* primary button fill */
}
```

## License

MIT — use and modify freely.
