# Jellyfin Liquid Glass Theme

A custom CSS theme for [Jellyfin](https://jellyfin.org) inspired by Apple's [Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass) design language from WWDC 2025.

It transforms Jellyfin's navigation into floating glass layers, adds **rainbow lensing** on interactive controls, and **revamps the video player** into a floating glass capsule over your media.

## Features

- **Liquid Glass navigation** — frosted header and sidebar with adaptive blur and depth
- **Rainbow button energize** — controls gain a rotating spectral rim on hover, mimicking Liquid Glass tint feedback
- **Revamped player** — floating top bar and bottom control capsule (Clear variant over video), rainbow seek bar, glass chapter previews
- **Music player** — floating glass now-playing bar with subtle rainbow edge
- **Accessibility** — respects `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast`

## Installation

### Option A — Paste directly (recommended)

1. Open **Dashboard → General → Custom CSS** (applies server-wide),  
   **or** **User → Settings → Display → Custom CSS** (per user).
2. Copy the entire contents of [`jellyfin-liquid-glass.css`](./jellyfin-liquid-glass.css).
3. Paste into the Custom CSS field and **Save**.
4. Hard-refresh Jellyfin (`Ctrl+Shift+R` / `Cmd+Shift+R`).

### Option B — Import from GitHub (after you publish)

```css
@import url("https://raw.githubusercontent.com/YOUR_USER/jellyfin-liquid-glass/main/jellyfin-liquid-glass.css");
```

## Requirements

- Jellyfin **10.9+** (tested against current web client class names)
- A browser with **`backdrop-filter`** support (Chrome, Edge, Safari, Firefox 103+)
- Best rainbow/glass effects in **Chromium** and **Safari**

## Design notes

This theme follows Liquid Glass principles from [Meet Liquid Glass (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/219/) and [Conor Luddy's iOS 26 reference](https://medium.com/@madebyluddy/overview-37b3685227aa):

| Principle | How it's applied |
|-----------|------------------|
| Lensing & transparency | `backdrop-filter` glass on nav and player controls |
| Navigation layer only | Glass on header, drawer, player OSD — not on poster cards |
| `.regular` vs `.glassProminent` | Secondary buttons rest quietly; play/save actions carry tint |
| Interactive energize | Rainbow rim spins on hover/press only (not at idle) |
| Clear variant on media | Player uses dimming gradient + shared glass capsule |
| Avoid glass-on-glass | Player buttons use vibrancy fills inside one glass container |
| Scroll edge fade | Content dissolves under floating nav and now-playing bar |
| Specular highlights | Top-leading light gradient on glass surfaces |
| Figma WWDC25 stack | ~2% white fill, dual inner shadows, noise texture, screen blend |
| Beta 6 transparency | Lighter scrims — backdrop art tints glass surfaces |
| Beta 6 tab legibility | Frosted tab rail + text shadow; chromatic active state |
| Beta 6 chromatic UI | Rainbow dispersion on toggles, checkboxes, and active tabs |
| Lock-screen prism | Hotspot + spectrum edge on music bar; hover rainbow on player |
| Apple TV+ player | Open layout, metadata stack, thin scrubber, pill + circle controls |

## Customization

Edit the `:root` variables at the top of `jellyfin-liquid-glass.css`:

```css
:root {
  --lg-blur: blur(28px) saturate(185%);   /* glass strength */
  --lg-radius-xl: 34px;                    /* player capsule roundness */
}
```

To tone down rainbow intensity, reduce `opacity` on `::before` hover rules in the **Rainbow glass buttons** section.

## References

- [Liquid Glass — Apple Developer](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass)
- [Meet Liquid Glass — WWDC25 Session 219](https://developer.apple.com/videos/play/wwdc2025/219/)
- [iOS 26 Liquid Glass: Comprehensive Reference — Conor Luddy](https://medium.com/@madebyluddy/overview-37b3685227aa)
- [Apple WWDC25 Glass Effect — Figma Community](https://www.figma.com/community/file/1512771057687946089/apple-wwdc25-glass-effect)
- [Liquid Glass evolves in iOS 26 Beta 6 — AppleMagazine](https://applemagazine.com/apples-liquid-glass-design-evolves-in-ios-26-beta-6-with-subtle-user-focused-tweaks/)
- [Awesome Liquid Glass](https://github.com/carolhsiaoo/awesome-liquid-glass)

## License

MIT — use and modify freely.
