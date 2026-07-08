/**
 * Optional Jellyfin detail-page media markers.
 *
 * Parses hidden track-select labels and renders compact chips
 * (4K · 1080p · HDR · 5.1 · Atmos · HEVC …) in `.detailMediaMarkers`.
 *
 * Install via Dashboard → Plugins → JavaScript Injector (or Mod Manager),
 * then paste this file's contents. CSS in style.css styles the row and
 * hides the raw track chips when markers are present.
 */
(function () {
  'use strict';

  var MARKER_ORDER = [
    '4K', '2160P', 'UHD', 'DOLBY VISION', 'HDR10+', 'HDR10', 'HDR', 'SDR',
    '1080P', '1440P', '720P', '480P',
    'HEVC', 'H.265', 'AV1', 'H.264', 'VP9', 'MPEG-4',
    '7.1', '6.1', '5.1', '2.0', 'STEREO',
    'ATMOS', 'TRUEHD', 'DTS-X', 'DTS-HD MA', 'DTS-HD', 'DTS',
    'DD+', 'DDP', 'EAC3', 'AAC', 'FLAC', 'OPUS'
  ];

  var RULES = [
    { key: 'DOLBY VISION', re: /\bdolby\s*vision\b/i },
    { key: 'HDR10+', re: /\bhdr10\+\b/i },
    { key: 'HDR10', re: /\bhdr10\b/i },
    { key: 'HDR', re: /\bhdr\b/i },
    { key: 'SDR', re: /\bsdr\b/i },
    { key: '2160P', re: /\b2160p?\b/i },
    { key: '4K', re: /\b4k\b/i },
    { key: 'UHD', re: /\buhd\b/i },
    { key: '1440P', re: /\b1440p?\b/i },
    { key: '1080P', re: /\b1080p?\b/i },
    { key: '720P', re: /\b720p?\b/i },
    { key: '480P', re: /\b480p?\b/i },
    { key: 'HEVC', re: /\bhevc\b/i },
    { key: 'H.265', re: /\bh\.?265\b/i },
    { key: 'AV1', re: /\bav1\b/i },
    { key: 'H.264', re: /\bh\.?264\b/i },
    { key: 'VP9', re: /\bvp9\b/i },
    { key: 'MPEG-4', re: /\bmpeg-?4\b/i },
    { key: '7.1', re: /\b7\.1\b/i },
    { key: '6.1', re: /\b6\.1\b/i },
    { key: '5.1', re: /\b5\.1\b/i },
    { key: '2.0', re: /\b2\.0\b/i },
    { key: 'STEREO', re: /\bstereo\b/i },
    { key: 'ATMOS', re: /\batmos\b/i },
    { key: 'TRUEHD', re: /\btruehd\b/i },
    { key: 'DTS-X', re: /\bdts-?x\b/i },
    { key: 'DTS-HD MA', re: /\bdts-?hd\s*ma\b/i },
    { key: 'DTS-HD', re: /\bdts-?hd\b/i },
    { key: 'DTS', re: /\bdts\b/i },
    { key: 'DDP', re: /\bddp\b/i },
    { key: 'DD+', re: /\bdd\+|e-?ac-?3\b/i },
    { key: 'EAC3', re: /\beac3\b/i },
    { key: 'AAC', re: /\baac\b/i },
    { key: 'FLAC', re: /\bflac\b/i },
    { key: 'OPUS', re: /\bopus\b/i }
  ];

  var scheduled = false;

  function collectTrackText(page) {
    var chunks = [];
    page.querySelectorAll('.trackSelections select').forEach(function (sel) {
      var opt = sel.options[sel.selectedIndex];
      if (opt && opt.textContent) {
        chunks.push(opt.textContent);
      }
    });
    return chunks.join(' ');
  }

  function resolutionFromDimensions(text) {
    var found = {};
    var m = text.match(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/i);
    if (!m) {
      return found;
    }
    var w = parseInt(m[1], 10);
    var h = parseInt(m[2], 10);
    if (w >= 3800 || h >= 2000) {
      found['4K'] = true;
    } else if (w >= 2500 || h >= 1400) {
      found['1440P'] = true;
    } else if (w >= 1800 || h >= 1000) {
      found['1080P'] = true;
    } else if (w >= 1200 || h >= 700) {
      found['720P'] = true;
    } else if (w >= 700 || h >= 400) {
      found['480P'] = true;
    }
    return found;
  }

  function extractMarkers(text) {
    var found = resolutionFromDimensions(text);
    RULES.forEach(function (rule) {
      if (rule.re.test(text)) {
        found[rule.key] = true;
      }
    });
    if (found['HDR10+'] || found['HDR10']) {
      delete found['HDR'];
    }
    if (found['DTS-HD MA'] || found['DTS-HD']) {
      delete found['DTS'];
    }
    if (found['4K']) {
      delete found['2160P'];
      delete found['UHD'];
    }
    if (found['DDP']) {
      delete found['DD+'];
    }
    if (found['5.1'] || found['7.1'] || found['6.1'] || found['2.0']) {
      delete found['STEREO'];
    }
    return MARKER_ORDER.filter(function (key) {
      return found[key];
    });
  }

  function displayLabel(key) {
    if (key === 'DDP') {
      return 'DD+';
    }
    if (key === '2160P') {
      return '2160p';
    }
    if (/^\d{3,4}P$/.test(key)) {
      return key.toLowerCase();
    }
    if (key === 'ATMOS') {
      return 'Atmos';
    }
    if (key === 'TRUEHD') {
      return 'TrueHD';
    }
    if (key === 'DOLBY VISION') {
      return 'Dolby Vision';
    }
    if (key === 'STEREO') {
      return 'Stereo';
    }
    return key;
  }

  function renderMarkers(page, markers) {
    var row = page.querySelector('.detailMediaMarkers');
    if (!markers.length) {
      if (row) {
        row.remove();
      }
      return;
    }
    if (!row) {
      row = document.createElement('div');
      row.className = 'itemMiscInfo itemMiscInfo-secondary detailMediaMarkers';
      var anchor = page.querySelector('.itemMiscInfo-primary');
      if (anchor) {
        anchor.insertAdjacentElement('afterend', row);
      } else {
        var ribbon = page.querySelector('.infoWrapper');
        (ribbon || page.querySelector('.detailRibbon') || page).appendChild(row);
      }
    }
    row.innerHTML = markers.map(function (m) {
      return '<div class="mediaInfoItem mediaInfoText mediainfo">' + displayLabel(m) + '</div>';
    }).join('');
    row.classList.remove('hide');
  }

  function updateDetailMarkers() {
    var page = document.querySelector('#itemDetailPage');
    if (!page || page.classList.contains('hide')) {
      return;
    }
    renderMarkers(page, extractMarkers(collectTrackText(page)));
  }

  function scheduleUpdate() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      updateDetailMarkers();
    });
  }

  document.addEventListener('viewshow', function () {
    setTimeout(scheduleUpdate, 60);
  });

  document.addEventListener('pageshow', scheduleUpdate);

  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var t = mutations[i].target;
      if (t.closest && (t.closest('.trackSelections') || t.closest('#itemDetailPage'))) {
        scheduleUpdate();
        return;
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  scheduleUpdate();
})();
