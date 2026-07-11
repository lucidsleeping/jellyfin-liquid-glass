/**
 * Liquid-glass lens for Jellyfin OSD transport buttons.
 *
 * One shared WebGL layer covers the transport row:
 *  - single video texture upload per display frame (no triple-upload lag)
 *  - requestAnimationFrame at screen refresh (smooth, not video-FPS choppy)
 *  - high dome refraction + chromatic aberration (inspired by
 *    https://liquid-glass.ybouane.com — implemented here, not that lib)
 *
 * MUST be loaded as a real <script> (e.g. /web/ui/osd-lens-glass.js).
 *
 * Safe with Custom CSS off / lens opted out:
 *  - Activates only when :root --liquid-glass-theme is set by theme CSS.
 *  - Client opt-out: localStorage jellyfin-liquid-glass-lens=off,
 *    URL ?nolens=1, or liquidGlassLens.disable() — stock OSD left alone.
 */
(function () {
  'use strict';

  if (typeof window.__osdLensGlassDispose === 'function') {
    try {
      window.__osdLensGlassDispose();
    } catch (err) {
      /* ignore */
    }
  } else if (window.__osdLensGlassLoaded) {
    return;
  }
  window.__osdLensGlassLoaded = true;

  var TRANSPORT_SELECTORS =
    '.btnRewind, .btnFastForward, .btnPlayPause, .btnPause, .btnPlay';
  var STORAGE_KEY = 'jellyfin-liquid-glass-lens';
  var THEME_VAR = '--liquid-glass-theme';
  var idleLogged = false;

  function userOptedOut() {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'off') {
        return true;
      }
    } catch (err) {
      /* private mode / blocked storage */
    }
    try {
      var q = String(location.search || '') + String(location.hash || '');
      if (/(?:^|[?&#])nolens=1(?:&|$)/.test(q)) {
        return true;
      }
    } catch (err) {
      /* ignore */
    }
    return false;
  }

  function themeCssPresent() {
    try {
      var value = getComputedStyle(document.documentElement)
        .getPropertyValue(THEME_VAR)
        .trim();
      return value === 'on' || value === '1';
    } catch (err) {
      return false;
    }
  }

  function lensAllowed() {
    return !userOptedOut() && themeCssPresent();
  }

  function noteIdle(reason) {
    if (idleLogged) {
      return;
    }
    idleLogged = true;
    console.info('[osd-lens-glass] idle (' + reason + ') — stock OSD untouched');
  }

  /**
   * Disc drawn inside a larger layer canvas.
   * uDisc = (centerX, centerY, radius, unused) in layer pixel space,
   * origin top-left matching CSS getBoundingClientRect mapping.
   */
  /*
   * Edge-glass look (clear center, light bends at the rim) — subtle:
   *   REFRACTION / CHROMA kept modest so the rim whispers, not screams.
   * Center of each disc samples the video almost 1:1 (no rainbow, no warp).
   */
  var FRAGMENT_SHADER = [
    'precision highp float;',
    'uniform vec3 iResolution;',
    'uniform sampler2D iChannel0;',
    'uniform vec4 iVideoRect;',
    'uniform vec2 uLayerOrigin;',
    'uniform vec4 uDisc;',
    '',
    'const float REFRACTION = 1.15;',
    'const float CHROMA = 0.09;',
    'const float CHROMA_SAT = 0.48;',
    'const float EDGE_HL = 0.0;',
    'const float FRESNEL = 0.0;',
    '',
    'vec2 mapVideoUV(vec2 screenCss) {',
    '  vec2 css = (screenCss - iVideoRect.xy) / iVideoRect.zw;',
    '  return vec2(css.x, 1.0 - css.y);',
    '}',
    '',
    'vec4 sampleVideo(vec2 screenCss) {',
    '  vec2 tuv = clamp(mapVideoUV(screenCss), vec2(0.0), vec2(1.0));',
    '  return texture2D(iChannel0, tuv);',
    '}',
    '',
    '/* Clear flat center; soft bend only in the outer ring. */',
    'vec2 refractOffset(vec2 delta, float edge, float radius, vec2 dir) {',
    '  vec2 refracted = delta;',
    '  float rim = smoothstep(0.58, 0.94, edge);',
    '  rim = rim * rim;',
    '  refracted += dir * (0.16 * REFRACTION * rim * radius);',
    '  float ring = smoothstep(0.78, 0.92, edge) * (1.0 - smoothstep(0.92, 0.998, edge));',
    '  refracted += dir * (0.06 * REFRACTION * ring * radius);',
    '  return refracted;',
    '}',
    '',
    'void main() {',
    '  vec2 layerPx = vec2(gl_FragCoord.x, iResolution.y - gl_FragCoord.y);',
    '  vec2 center = uDisc.xy;',
    '  float radius = max(uDisc.z, 1.0);',
    '  vec2 delta = layerPx - center;',
    '  float r = length(delta) / radius;',
    '',
    '  float alpha = 1.0 - smoothstep(0.968, 1.0, r);',
    '  if (alpha < 0.004) {',
    '    gl_FragColor = vec4(0.0);',
    '    return;',
    '  }',
    '',
    '  vec2 dir = r > 1e-5 ? delta / (r * radius) : vec2(0.0);',
    '  float edge = clamp(r, 0.0, 1.0);',
    '  vec2 bent = refractOffset(delta, edge, radius, dir);',
    '',
    '  float dpr = iResolution.z;',
    '  float chromaMask = smoothstep(0.62, 0.95, edge);',
    '  chromaMask *= chromaMask;',
    '  float chromaAmt = CHROMA * REFRACTION * chromaMask;',
    '  vec2 split = dir * (chromaAmt * radius);',
    '',
    '  vec2 baseCss = uLayerOrigin + (center + bent) / dpr;',
    '  vec2 splitCss = split / dpr;',
    '  vec3 base = sampleVideo(baseCss).rgb;',
    '  float red = sampleVideo(baseCss + splitCss).r;',
    '  float green = base.g;',
    '  float blue = sampleVideo(baseCss - splitCss).b;',
    '  vec3 chroma = vec3(red, green, blue);',
    '  /* Keep the split, but mute how colorful the fringe is. */',
    '  vec3 col = mix(base, chroma, CHROMA_SAT);',
    '',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);',
    '}'
  ].join('\n');

  var VERTEX_SHADER = [
    'attribute vec2 position;',
    'void main() { gl_Position = vec4(position, 0.0, 1.0); }'
  ].join('\n');

  var buttons = [];
  var layer = null;
  var gl = null;
  var program = null;
  var texture = null;
  var buffer = null;
  var uniforms = null;
  var texW = 0;
  var texH = 0;
  var rafId = 0;
  var observer = null;
  var pollId = 0;
  var lastVideo = null;
  var ready = false;

  function createShader(glCtx, type, source) {
    var shader = glCtx.createShader(type);
    glCtx.shaderSource(shader, source);
    glCtx.compileShader(shader);
    if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
      console.error('[osd-lens-glass] Shader error:', glCtx.getShaderInfoLog(shader));
      glCtx.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function findVideo() {
    var pages = document.querySelectorAll('#videoOsdPage, .videoPlayerContainer, .mainAnimatedPage');
    var i;
    for (i = 0; i < pages.length; i++) {
      if (!isVisiblePage(pages[i])) {
        continue;
      }
      var nested = pages[i].querySelector('video');
      if (nested) {
        return nested;
      }
    }
    var player = document.querySelector('.htmlvideoplayer');
    if (player) {
      if (player.tagName === 'VIDEO') {
        return player;
      }
      var v = player.querySelector('video');
      if (v) {
        return v;
      }
    }
    return document.querySelector('video');
  }

  function isVisiblePage(el) {
    if (!el) {
      return false;
    }
    if (el.classList && el.classList.contains('hide')) {
      return false;
    }
    var style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    return true;
  }

  function getVisibleOsd() {
    var nodes = document.querySelectorAll('.videoOsdBottom');
    var i;
    for (i = 0; i < nodes.length; i++) {
      var osd = nodes[i];
      var page = osd.closest('.mainAnimatedPage, .page');
      if (page && page.classList.contains('hide')) {
        continue;
      }
      if (osd.classList.contains('hide') || osd.classList.contains('videoOsdBottom-hidden')) {
        continue;
      }
      if (isVisible(osd) || getTransportButtonsIn(osd).length) {
        return osd;
      }
    }
    return null;
  }

  function getTransportButtonsIn(root) {
    if (!root) {
      return [];
    }
    var found = [];
    var seen = new Set();
    Array.prototype.forEach.call(root.querySelectorAll(TRANSPORT_SELECTORS), function (btn) {
      if (seen.has(btn)) {
        return;
      }
      seen.add(btn);
      /* Skip buttons that live under a hidden animated page clone. */
      var page = btn.closest('.mainAnimatedPage, .page');
      if (page && page.classList.contains('hide')) {
        return;
      }
      if (isVisible(btn)) {
        found.push(btn);
      }
    });
    return found;
  }

  function getTransportButtons() {
    var osd = null;
    var nodes = document.querySelectorAll('.videoOsdBottom');
    var all = [];
    var i;
    for (i = 0; i < nodes.length; i++) {
      all = all.concat(getTransportButtonsIn(nodes[i]));
    }
    /* De-dupe while preferring currently visible geometry. */
    var seen = new Set();
    return all.filter(function (btn) {
      if (seen.has(btn)) {
        return false;
      }
      seen.add(btn);
      return true;
    });
  }

  function getTransportHost() {
    var visible = getTransportButtons();
    if (visible.length) {
      return visible[0].parentElement;
    }
    var osd = getVisibleOsd();
    if (!osd) {
      return null;
    }
    return (
      osd.querySelector('.buttons > div:first-child') ||
      osd.querySelector('.buttons') ||
      osd
    );
  }

  function getVideoContentRect(video) {
    var rect = video.getBoundingClientRect();
    var vw = video.videoWidth || 0;
    var vh = video.videoHeight || 0;
    if (!vw || !vh || !rect.width || !rect.height) {
      return {
        left: rect.left,
        top: rect.top,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height)
      };
    }

    var videoAspect = vw / vh;
    var elemAspect = rect.width / rect.height;
    var contentW;
    var contentH;
    var left;
    var top;

    if (elemAspect > videoAspect) {
      contentH = rect.height;
      contentW = contentH * videoAspect;
      left = rect.left + (rect.width - contentW) / 2;
      top = rect.top;
    } else {
      contentW = rect.width;
      contentH = contentW / videoAspect;
      left = rect.left;
      top = rect.top + (rect.height - contentH) / 2;
    }

    return {
      left: left,
      top: top,
      width: Math.max(1, contentW),
      height: Math.max(1, contentH)
    };
  }

  function isVisible(el) {
    if (!el) {
      return false;
    }
    var style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function isOsdVisible() {
    if (getTransportButtons().length > 0) {
      return true;
    }
    return !!getVisibleOsd();
  }

  function destroyLayer() {
    if (gl) {
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) {
        ext.loseContext();
      }
    }
    if (layer && layer.parentNode) {
      layer.parentNode.removeChild(layer);
    }
    layer = null;
    gl = null;
    program = null;
    texture = null;
    buffer = null;
    uniforms = null;
    texW = 0;
    texH = 0;
    ready = false;
  }

  function ensureLayer(host) {
    if (layer && layer.parentNode === host && gl && program) {
      return true;
    }
    destroyLayer();

    layer = document.createElement('canvas');
    layer.className = 'osd-lens-layer';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);

    var attrs = {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      /* Keep buffer so we can verify frame sync; single shared canvas is cheap. */
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      desynchronized: true
    };
    gl = layer.getContext('webgl', attrs) || layer.getContext('experimental-webgl', attrs);
    if (!gl) {
      destroyLayer();
      return false;
    }

    var vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    var fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) {
      destroyLayer();
      return false;
    }

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[osd-lens-glass] Program error:', gl.getProgramInfoLog(program));
      destroyLayer();
      return false;
    }

    gl.useProgram(program);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    var position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    uniforms = {
      resolution: gl.getUniformLocation(program, 'iResolution'),
      texture: gl.getUniformLocation(program, 'iChannel0'),
      videoRect: gl.getUniformLocation(program, 'iVideoRect'),
      layerOrigin: gl.getUniformLocation(program, 'uLayerOrigin'),
      disc: gl.getUniformLocation(program, 'uDisc')
    };

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    return true;
  }

  function syncLayerSize(host) {
    if (!layer || !gl) {
      return null;
    }
    var hostRect = host.getBoundingClientRect();
    /* Cover host plus a little padding so large play button never clips. */
    var pad = 8;
    var cssW = Math.max(1, hostRect.width + pad * 2);
    var cssH = Math.max(1, hostRect.height + pad * 2);
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var needW = Math.max(1, Math.round(cssW * dpr));
    var needH = Math.max(1, Math.round(cssH * dpr));

    if (layer.width !== needW || layer.height !== needH) {
      layer.width = needW;
      layer.height = needH;
      /* Texture survives canvas resize in WebGL — mark for re-upload. */
      texW = 0;
      texH = 0;
    }

    layer.style.left = -pad + 'px';
    layer.style.top = -pad + 'px';
    layer.style.width = cssW + 'px';
    layer.style.height = cssH + 'px';

    return {
      hostRect: hostRect,
      pad: pad,
      dpr: dpr,
      originLeft: hostRect.left - pad,
      originTop: hostRect.top - pad,
      cssW: cssW,
      cssH: cssH
    };
  }

  function uploadVideo(video) {
    if (!gl || !texture || !video || video.readyState < 2) {
      return false;
    }
    var vw = video.videoWidth || 0;
    var vh = video.videoHeight || 0;
    if (!vw || !vh) {
      return false;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      if (texW === vw && texH === vh) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        texW = vw;
        texH = vh;
      }
      return true;
    } catch (err) {
      console.warn('[osd-lens-glass] video texture failed (CORS?):', err);
      ready = false;
      texW = 0;
      texH = 0;
      return false;
    }
  }

  function markButtons(state) {
    buttons.forEach(function (btn) {
      btn.classList.add('osd-lens-btn');
      /* Remove any legacy per-button canvases from older builds. */
      var old = btn.querySelector('.osd-lens-canvas');
      if (old) {
        old.parentNode.removeChild(old);
      }
      if (state === 'ready') {
        btn.classList.add('osd-lens-ready');
        btn.classList.remove('osd-lens-fallback');
      } else if (state === 'fallback') {
        btn.classList.add('osd-lens-fallback');
        btn.classList.remove('osd-lens-ready');
      } else {
        btn.classList.remove('osd-lens-ready', 'osd-lens-fallback', 'osd-lens-btn');
      }
    });
  }

  function paint() {
    if (!lensAllowed()) {
      if (buttons.length || layer) {
        teardown();
      }
      return;
    }

    var host = getTransportHost();
    var video = findVideo();
    lastVideo = video;

    if (!host || !video || !buttons.length || !isOsdVisible()) {
      if (layer) {
        layer.classList.remove('osd-lens-layer-on');
        layer.style.opacity = '0';
      }
      return;
    }

    if (!ensureLayer(host)) {
      markButtons('fallback');
      return;
    }

    var layout = syncLayerSize(host);
    if (!layout) {
      return;
    }

    if (!uploadVideo(video)) {
      markButtons('fallback');
      layer.classList.remove('osd-lens-layer-on');
      layer.style.opacity = '0';
      return;
    }

    var videoRect = getVideoContentRect(video);
    var dpr = layout.dpr;

    gl.useProgram(program);
    gl.viewport(0, 0, layer.width, layer.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform3f(uniforms.resolution, layer.width, layer.height, dpr);
    gl.uniform2f(uniforms.layerOrigin, layout.originLeft, layout.originTop);
    gl.uniform4f(
      uniforms.videoRect,
      videoRect.left,
      videoRect.top,
      Math.max(1, videoRect.width),
      Math.max(1, videoRect.height)
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.texture, 0);

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var br = btn.getBoundingClientRect();
      if (br.width < 2 || br.height < 2) {
        continue;
      }
      var cx = (br.left + br.width / 2 - layout.originLeft) * dpr;
      var cy = (br.top + br.height / 2 - layout.originTop) * dpr;
      var radius = (Math.min(br.width, br.height) / 2) * dpr;
      gl.uniform4f(uniforms.disc, cx, cy, radius, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    layer.classList.add('osd-lens-layer-on');
    layer.style.opacity = '1';
    markButtons('ready');
    ready = true;
  }

  function frame() {
    rafId = 0;
    paint();
    if (buttons.length && (isOsdVisible() || document.querySelector('video'))) {
      rafId = requestAnimationFrame(frame);
    }
  }

  function startLoop() {
    if (!rafId) {
      rafId = requestAnimationFrame(frame);
    }
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function stopPoll() {
    if (pollId) {
      clearInterval(pollId);
      pollId = 0;
    }
  }

  function startPoll() {
    if (pollId) {
      return;
    }
    pollId = setInterval(function () {
      if (!lensAllowed()) {
        /* Strip lens DOM/classes but keep this poll so enable() / CSS
         * coming back can wake without a full reload. */
        stopLoop();
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        markButtons('off');
        buttons = [];
        destroyLayer();
        noteIdle(userOptedOut() ? 'client opted out of lens' : 'theme CSS not active');
        return;
      }
      idleLogged = false;
      var onPlayer =
        !!document.querySelector('.videoOsdBottom') ||
        !!document.querySelector('#videoOsdPage, .videoPlayerContainer, video');
      if (!onPlayer) {
        stopLoop();
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        markButtons('off');
        buttons = [];
        destroyLayer();
        return;
      }
      init();
    }, 500);
  }

  function teardown() {
    stopLoop();
    stopPoll();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    markButtons('off');
    buttons = [];
    destroyLayer();
  }

  function syncButtons() {
    if (!lensAllowed()) {
      if (buttons.length || layer) {
        teardown();
      }
      noteIdle(userOptedOut() ? 'client opted out of lens' : 'theme CSS not active');
      return;
    }
    idleLogged = false;

    if (!document.querySelector('.videoOsdBottom')) {
      teardown();
      return;
    }

    var found = getTransportButtons();
    if (!found.length) {
      if (!document.querySelector('#videoOsdPage, .videoPlayerContainer, video')) {
        teardown();
      }
      return;
    }

    startPoll();

    var same =
      found.length === buttons.length &&
      found.every(function (btn, i) {
        return btn === buttons[i];
      });

    if (!same) {
      markButtons('off');
      buttons = found;
      buttons.forEach(function (btn) {
        btn.classList.add('osd-lens-btn');
        var old = btn.querySelector('.osd-lens-canvas');
        if (old) {
          old.parentNode.removeChild(old);
        }
      });
    }

    startLoop();
  }

  function init() {
    if (!lensAllowed()) {
      if (buttons.length || layer) {
        teardown();
      }
      noteIdle(userOptedOut() ? 'client opted out of lens' : 'theme CSS not active');
      /* Keep a light poll so re-enabling CSS / clearing opt-out can wake us. */
      startPoll();
      return;
    }
    if (!document.querySelector('.videoOsdBottom') && !document.querySelector('video')) {
      return;
    }
    syncButtons();
    if (!observer) {
      observer = new MutationObserver(function () {
        syncButtons();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
  }

  function onViewShow() {
    setTimeout(init, 80);
  }

  function onClick() {
    setTimeout(init, 80);
  }

  function onPointerMove() {
    if (document.querySelector('.videoOsdBottom') && !buttons.length) {
      init();
    }
  }

  function onResize() {
    texW = 0;
    texH = 0;
  }

  function onPageHide() {
    teardown();
  }

  function dispose() {
    teardown();
    document.removeEventListener('viewshow', onViewShow);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onPageHide);
    window.__osdLensGlassLoaded = false;
    window.__osdLensGlassDispose = null;
    try {
      delete window.liquidGlassLens;
    } catch (err) {
      window.liquidGlassLens = undefined;
    }
  }

  window.liquidGlassLens = {
    disable: function () {
      try {
        localStorage.setItem(STORAGE_KEY, 'off');
      } catch (err) {
        /* ignore */
      }
      idleLogged = false;
      teardown();
      startPoll();
      noteIdle('client opted out of lens');
      return true;
    },
    enable: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        /* ignore */
      }
      idleLogged = false;
      init();
      return lensAllowed();
    },
    isAllowed: lensAllowed,
    isOptedOut: userOptedOut,
    themeActive: themeCssPresent
  };

  document.addEventListener('viewshow', onViewShow);
  document.addEventListener('click', onClick, true);
  document.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('pagehide', onPageHide);
  window.__osdLensGlassDispose = dispose;

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 200);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 200);
    });
  }

  console.info('[osd-lens-glass] loaded (refraction-v18-aligned)');
})();
