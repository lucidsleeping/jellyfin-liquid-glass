/**
 * Sample the current item's backdrop / poster and retint the theme
 * accent (--sys-blue, --accent-blue, Play pill, tag links) so it
 * follows the artwork instead of a fixed Apple blue.
 *
 * Loaded as a real <script> next to the player lens. Does not touch
 * osd-lens-glass.js.
 *
 * Speed: apply a session cache on hashchange (same paint as the
 * detail page), and prefetch a 64px Backdrop from the item id in
 * the URL so the first visit does not wait for the SPA backdrop.
 */
(function () {
  'use strict';

  var ROOT = document.documentElement;
  var ATTR = 'data-lg-poster-accent';
  var STORE = 'lg-poster-accent-cache';
  var lastUrl = '';
  var lastPage = '';
  var scheduled = false;
  var cache = {};

  try {
    cache = JSON.parse(sessionStorage.getItem(STORE) || '{}') || {};
  } catch (err) {
    cache = {};
  }

  function themeOn() {
    return getComputedStyle(ROOT).getPropertyValue('--liquid-glass-theme').trim() === 'on';
  }

  function isDetailsHash() {
    return /#\/details\b/i.test(location.hash || '');
  }

  function itemIdFromHash() {
    var m = String(location.hash || '').match(/[?&]id=([a-f0-9]+)/i);
    return m ? m[1] : '';
  }

  function detailPage() {
    return document.querySelector('.itemDetailPage:not(.hide)');
  }

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    var d = max - min;
    if (d > 0.0001) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r:
          h = ((g - b) / d) % 6;
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0;
    var g = 0;
    var b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function hex(r, g, b) {
    return (
      '#' +
      [r, g, b]
        .map(function (n) {
          return clamp(n, 0, 255).toString(16).padStart(2, '0');
        })
        .join('')
    );
  }

  function scorePixel(r, g, b) {
    var hsl = rgbToHsl(r, g, b);
    if (hsl.l < 0.12 || hsl.l > 0.88) return 0;
    if (hsl.s < 0.18) return 0;
    var skin = hsl.h >= 12 && hsl.h <= 48 && hsl.s < 0.55 && hsl.l > 0.28 && hsl.l < 0.78;
    var chroma = hsl.s * (1 - Math.abs(hsl.l - 0.52));
    return skin ? chroma * 0.25 : chroma;
  }

  function pickFromImage(img) {
    var canvas = document.createElement('canvas');
    var size = 48;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    try {
      ctx.drawImage(img, 0, 0, size, size);
    } catch (err) {
      return null;
    }
    var data;
    try {
      data = ctx.getImageData(0, 0, size, size).data;
    } catch (err) {
      return null;
    }

    var best = 0;
    var br = 10;
    var bg = 132;
    var bb = 255;
    var i;
    for (i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 180) continue;
      var sc = scorePixel(data[i], data[i + 1], data[i + 2]);
      if (sc > best) {
        best = sc;
        br = data[i];
        bg = data[i + 1];
        bb = data[i + 2];
      }
    }
    if (best < 0.04) return null;

    var hsl = rgbToHsl(br, bg, bb);
    hsl.s = clamp(hsl.s * 1.18, 0.42, 0.78);
    hsl.l = clamp(hsl.l, 0.48, 0.64);
    var rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    var press = hslToRgb(hsl.h, clamp(hsl.s * 0.92, 0.35, 0.75), clamp(hsl.l + 0.08, 0.52, 0.72));
    return {
      hex: hex(rgb.r, rgb.g, rgb.b),
      press: hex(press.r, press.g, press.b),
      ghost: 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.16)',
      glow: 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.34)'
    };
  }

  function cssUrl(value) {
    if (!value || value === 'none') return '';
    var m = value.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    return m ? m[1] : '';
  }

  function backdropUrl(page) {
    var nodes = [];
    if (page) {
      nodes.push(
        page.querySelector('.itemBackdrop'),
        page.querySelector('.detailPageWrapperContainer'),
        page.querySelector('.cardImageContainer'),
        page.querySelector('img.cardImage')
      );
    }
    nodes.push(
      document.querySelector('.backdropContainer .backdropImage'),
      document.querySelector('.backgroundContainer.withBackdrop'),
      document.querySelector('.backdropImage')
    );
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el) continue;
      if (el.tagName === 'IMG' && el.src && !el.src.endsWith('.svg')) {
        return el.currentSrc || el.src;
      }
      var img = el.querySelector && el.querySelector('img');
      if (img && img.src && !img.src.endsWith('.svg')) {
        return img.currentSrc || img.src;
      }
      var bg = cssUrl(getComputedStyle(el).backgroundImage);
      if (bg && !/^data:image\/svg/i.test(bg)) return bg;
    }
    return '';
  }

  function prefetchUrl(id) {
    if (!id) return '';
    return '/Items/' + id + '/Images/Backdrop?maxWidth=64&quality=40&format=Jpg';
  }

  function apply(palette) {
    ROOT.style.setProperty('--sys-blue', palette.hex);
    ROOT.style.setProperty('--sys-blue-pressed', palette.press);
    ROOT.style.setProperty('--accent-blue', palette.hex);
    ROOT.style.setProperty('--accent-blue-ghost', palette.ghost);
    ROOT.style.setProperty('--accent-blue-glow', palette.glow);
    ROOT.setAttribute(ATTR, palette.hex);
  }

  function persist(id, palette) {
    if (!id || !palette) return;
    cache[id] = palette;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(cache));
    } catch (err) {
      /* quota / private mode */
    }
  }

  function applyCached(id) {
    if (!id || !cache[id]) return false;
    apply(cache[id]);
    lastPage = location.hash;
    return true;
  }

  function clear() {
    if (!ROOT.hasAttribute(ATTR)) return;
    ROOT.style.removeProperty('--sys-blue');
    ROOT.style.removeProperty('--sys-blue-pressed');
    ROOT.style.removeProperty('--accent-blue');
    ROOT.style.removeProperty('--accent-blue-ghost');
    ROOT.style.removeProperty('--accent-blue-glow');
    ROOT.removeAttribute(ATTR);
    lastUrl = '';
    lastPage = '';
  }

  function loadImage(url, done) {
    if (!url) {
      done(null);
      return;
    }
    /* Jellyfin image URLs are same-origin but omit ACAO. Setting
     * `crossOrigin = 'anonymous'` taints the canvas so getImageData
     * throws and the accent never applies. Fetch as a blob instead. */
    var abs;
    try {
      abs = new URL(url, location.href).href;
    } catch (err) {
      done(null);
      return;
    }
    fetch(abs, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('img ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var img = new Image();
        var obj = URL.createObjectURL(blob);
        img.onload = function () {
          URL.revokeObjectURL(obj);
          done(img);
        };
        img.onerror = function () {
          URL.revokeObjectURL(obj);
          done(null);
        };
        img.src = obj;
      })
      .catch(function () {
        done(null);
      });
  }

  function sampleFromDom(page) {
    var seen = [];
    var push = function (el) {
      if (el && seen.indexOf(el) < 0) seen.push(el);
    };
    if (page) {
      page.querySelectorAll('img').forEach(push);
    }
    document.querySelectorAll('.backdropImage, .itemBackdrop img, img.cardImage').forEach(push);
    var i;
    for (i = 0; i < seen.length; i++) {
      var img = seen[i];
      if (!img.complete || img.naturalWidth < 8) continue;
      if (!img.src || img.src.endsWith('.svg')) continue;
      var palette = pickFromImage(img);
      if (palette) return palette;
    }
    return null;
  }

  function finish(id, url, img) {
    if (!img || !isDetailsHash()) return;
    if (id && itemIdFromHash() !== id) return;
    var palette = pickFromImage(img);
    if (!palette) return;
    lastUrl = url || lastUrl;
    lastPage = location.hash;
    persist(id, palette);
    apply(palette);
  }

  function run() {
    scheduled = false;
    if (!themeOn()) {
      clear();
      return;
    }
    if (!isDetailsHash()) {
      clear();
      return;
    }

    var id = itemIdFromHash();
    if (applyCached(id) && lastUrl) return;

    var page = detailPage();
    var fromDom = page && sampleFromDom(page);
    if (fromDom) {
      lastUrl = 'dom';
      lastPage = location.hash;
      persist(id, fromDom);
      apply(fromDom);
      return;
    }

    var url = (page && backdropUrl(page)) || prefetchUrl(id);
    if (!url) return;
    if (url === lastUrl && page && ROOT.hasAttribute(ATTR)) return;

    loadImage(url, function (img) {
      if (img) {
        finish(id, url, img);
        return;
      }
      if (!id) return;
      loadImage('/Items/' + id + '/Images/Primary?maxWidth=64&quality=40&format=Jpg', function (img2) {
        finish(id, url, img2);
      });
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  function onRoute() {
    if (!themeOn()) {
      clear();
      return;
    }
    if (!isDetailsHash()) {
      clear();
      schedule();
      return;
    }
    var id = itemIdFromHash();
    applyCached(id);
    if (!cache[id]) {
      loadImage(prefetchUrl(id), function (img) {
        finish(id, prefetchUrl(id), img);
      });
    }
    schedule();
  }

  window.addEventListener('hashchange', onRoute);
  window.addEventListener('popstate', onRoute);

  var obs = new MutationObserver(schedule);
  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  onRoute();
})();
