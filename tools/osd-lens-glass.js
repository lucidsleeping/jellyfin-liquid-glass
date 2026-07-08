/**
 * Liquid-glass lens for Jellyfin OSD transport buttons.
 * Full-circle live video refraction — no borders, no empty rings.
 *
 * MUST be loaded as a real <script> (e.g. /web/ui/osd-lens-glass.js).
 */
(function () {
  'use strict';

  if (window.__osdLensGlassLoaded) {
    return;
  }
  window.__osdLensGlassLoaded = true;

  var TRANSPORT_SELECTORS =
    '.btnRewind, .btnFastForward, .btnPlayPause, .btnPause, .btnPlay';

  /**
   * Full-disc liquid glass. Strong fish-eye + rim warp so refracted
   * video is obvious; alpha clip avoids any halo/border ring.
   */
  var FRAGMENT_SHADER = [
    'precision mediump float;',
    'uniform vec3 iResolution;',
    'uniform vec4 iMouse;',
    'uniform sampler2D iChannel0;',
    'uniform vec4 iVideoRect;',
    'uniform vec2 uCanvasOrigin;',
    '',
    'vec2 mapUV(vec2 canvasUV) {',
    '  vec2 screen = uCanvasOrigin + canvasUV * iResolution.xy;',
    '  vec2 css = (screen - iVideoRect.xy) / iVideoRect.zw;',
    '  return vec2(css.x, 1.0 - css.y);',
    '}',
    '',
    'vec4 sampleVideo(vec2 canvasUV) {',
    '  vec2 tuv = clamp(mapUV(canvasUV), vec2(0.0), vec2(1.0));',
    '  return texture2D(iChannel0, tuv);',
    '}',
    '',
    'void main() {',
    '  vec2 uv = vec2(gl_FragCoord.x / iResolution.x, 1.0 - gl_FragCoord.y / iResolution.y);',
    '  vec2 p = (uv - 0.5) * 2.0;',
    '  float aspect = iResolution.x / max(iResolution.y, 1.0);',
    '  p.x *= aspect;',
    '  float r = length(p);',
    '',
    '  /* Hard cut — no soft alpha rim (that reads as a white border) */',
    '  if (r > 0.99) {',
    '    gl_FragColor = vec4(0.0);',
    '    return;',
    '  }',
    '',
    '  vec2 dir = r > 1e-4 ? p / r : vec2(0.0);',
    '  float edge = clamp(r, 0.0, 1.0);',
    '',
    '  /* Obvious fish-eye: center heavily magnifies the frame behind */',
    '  float zoom = mix(0.22, 0.82, pow(edge, 0.4));',
    '  vec2 lensUV = 0.5 + (uv - 0.5) * zoom;',
    '',
    '  /* Radial bezel bend */',
    '  lensUV += dir * (0.4 * edge * edge) * vec2(1.0 / aspect, 1.0) * 0.7;',
    '',
    '  if (length(iMouse.xy) > 1.0) {',
    '    vec2 m = iMouse.xy / iResolution.xy;',
    '    vec2 d = uv - m;',
    '    float md = length(d * vec2(aspect, 1.0));',
    '    lensUV += d * exp(-md * md * 8.0) * 0.12;',
    '  }',
    '',
    '  /* Mild blur + chromatic split only near rim */',
    '  vec2 chroma = dir * (0.018 * edge * edge) * vec2(1.0 / aspect, 1.0);',
    '  vec4 col = vec4(0.0);',
    '  float wsum = 0.0;',
    '  for (int ix = -2; ix <= 2; ix++) {',
    '    for (int iy = -2; iy <= 2; iy++) {',
    '      float fx = float(ix);',
    '      float fy = float(iy);',
    '      float w = exp(-(fx * fx + fy * fy) * 0.32);',
    '      vec2 off = vec2(fx, fy) * 1.2 / iResolution.xy;',
    '      vec4 sR = sampleVideo(lensUV + off + chroma);',
    '      vec4 sG = sampleVideo(lensUV + off);',
    '      vec4 sB = sampleVideo(lensUV + off - chroma);',
    '      col += vec4(sR.r, sG.g, sB.b, sG.a) * w;',
    '      wsum += w;',
    '    }',
    '  }',
    '  col /= max(wsum, 1.0);',
    '',
    '  /* Dark glass lift — NEVER brighten the rim (that looked like borders) */',
    '  float shade = mix(1.08, 0.92, pow(edge, 1.6));',
    '  col.rgb *= shade;',
    '',
    '  /* Localized specular blob only */',
    '  float spec = pow(max(0.0, 1.0 - length(p - vec2(-0.30, -0.38))), 16.0) * 0.16;',
    '  col.rgb += spec;',
    '  col.a = 1.0;',
    '  gl_FragColor = col;',
    '}'
  ].join('\n');

  var VERTEX_SHADER = [
    'attribute vec2 position;',
    'void main() { gl_Position = vec4(position, 0.0, 1.0); }'
  ].join('\n');

  var lenses = [];
  var rafId = 0;
  var observer = null;
  var pollId = 0;

  function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[osd-lens-glass] Shader error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function findVideo() {
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
    return document.querySelector('#videoOsdPage video, .videoPlayerContainer video, video');
  }

  /**
   * CSS box of the painted video frame (object-fit: contain letterboxing
   * stripped). texImage2D uploads the intrinsic frame, so UVs must map to
   * this content box — not the full <video> element rect.
   */
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
      /* Pillarbox — bars on left/right */
      contentH = rect.height;
      contentW = contentH * videoAspect;
      left = rect.left + (rect.width - contentW) / 2;
      top = rect.top;
    } else {
      /* Letterbox — bars on top/bottom */
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

  function getTransportButtons() {
    var roots = [
      document.querySelector('.videoOsdBottom .buttons > div:first-child'),
      document.querySelector('.videoOsdBottom .buttons'),
      document.querySelector('.videoOsdBottom')
    ];
    var found = [];
    var seen = new Set();
    roots.forEach(function (root) {
      if (!root) {
        return;
      }
      Array.prototype.forEach.call(root.querySelectorAll(TRANSPORT_SELECTORS), function (btn) {
        if (seen.has(btn)) {
          return;
        }
        seen.add(btn);
        if (isVisible(btn)) {
          found.push(btn);
        }
      });
    });
    return found;
  }

  function isOsdVisible() {
    var osd = document.querySelector('.videoOsdBottom');
    if (!osd) {
      return false;
    }
    if (osd.classList.contains('hide') || osd.classList.contains('videoOsdBottom-hidden')) {
      return false;
    }
    return isVisible(osd) || getTransportButtons().length > 0;
  }

  function LensButton(button) {
    var self = this;
    this.button = button;
    this.mouse = [0, 0];
    this.dpr = 1;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'osd-lens-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    button.classList.add('osd-lens-btn');

    var existing = button.querySelector('.osd-lens-canvas');
    if (existing) {
      this.canvas = existing;
    } else {
      button.insertBefore(this.canvas, button.firstChild);
    }

    this.gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    });

    if (!this.gl) {
      button.classList.add('osd-lens-fallback');
      return;
    }

    var gl = this.gl;
    var vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    var fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) {
      button.classList.add('osd-lens-fallback');
      return;
    }

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('[osd-lens-glass] Program error:', gl.getProgramInfoLog(this.program));
      button.classList.add('osd-lens-fallback');
      return;
    }

    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    var position = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = {
      resolution: gl.getUniformLocation(this.program, 'iResolution'),
      mouse: gl.getUniformLocation(this.program, 'iMouse'),
      texture: gl.getUniformLocation(this.program, 'iChannel0'),
      videoRect: gl.getUniformLocation(this.program, 'iVideoRect'),
      canvasOrigin: gl.getUniformLocation(this.program, 'uCanvasOrigin')
    };

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    button.addEventListener('mousemove', function (e) {
      var rect = self.button.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      self.mouse = [
        (e.clientX - rect.left) * self.dpr,
        (e.clientY - rect.top) * self.dpr
      ];
    });
    button.addEventListener('mouseleave', function () {
      self.mouse = [0, 0];
    });

    this.setCanvasSize();
  }

  LensButton.prototype.setCanvasSize = function () {
    if (!this.gl) {
      return;
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = this.button.getBoundingClientRect();
    var cssW = Math.max(1, rect.width);
    var cssH = Math.max(1, rect.height);
    var needW = Math.max(1, Math.round(cssW * this.dpr));
    var needH = Math.max(1, Math.round(cssH * this.dpr));
    if (this.canvas.width !== needW || this.canvas.height !== needH) {
      this.canvas.width = needW;
      this.canvas.height = needH;
    }
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  LensButton.prototype.setupTexture = function (video) {
    if (!this.gl || !video || video.readyState < 2) {
      return false;
    }
    var gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      this.button.classList.remove('osd-lens-fallback');
      return true;
    } catch (err) {
      console.warn('[osd-lens-glass] video texture failed (CORS?):', err);
      this.button.classList.add('osd-lens-fallback');
      this.button.classList.remove('osd-lens-ready');
      return false;
    }
  };

  LensButton.prototype.render = function (video) {
    if (!this.gl || !this.program || !this.setupTexture(video)) {
      return;
    }

    this.setCanvasSize();

    var gl = this.gl;
    var dpr = this.dpr;
    var rect = this.button.getBoundingClientRect();
    var videoRect = getVideoContentRect(video);

    gl.useProgram(this.program);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform3f(this.uniforms.resolution, this.canvas.width, this.canvas.height, 1.0);
    gl.uniform4f(this.uniforms.mouse, this.mouse[0], this.mouse[1], 0, 0);
    gl.uniform4f(
      this.uniforms.videoRect,
      videoRect.left * dpr,
      videoRect.top * dpr,
      Math.max(1, videoRect.width * dpr),
      Math.max(1, videoRect.height * dpr)
    );
    gl.uniform2f(this.uniforms.canvasOrigin, rect.left * dpr, rect.top * dpr);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.texture, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.button.classList.add('osd-lens-ready');
  };

  LensButton.prototype.destroy = function () {
    if (this.gl) {
      var ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) {
        ext.loseContext();
      }
    }
    if (this.canvas && this.canvas.parentNode === this.button) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.button.classList.remove('osd-lens-btn', 'osd-lens-fallback', 'osd-lens-ready');
  };

  function teardown() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lenses.forEach(function (l) {
      l.destroy();
    });
    lenses = [];
  }

  function syncButtons() {
    if (!document.querySelector('.videoOsdBottom')) {
      teardown();
      return;
    }

    var buttons = getTransportButtons();
    if (!buttons.length) {
      /* Don't teardown on brief hide — keep canvases until page leaves video. */
      if (!document.querySelector('#videoOsdPage, .videoPlayerContainer, video')) {
        teardown();
      }
      return;
    }

    var known = new Set(
      lenses.map(function (l) {
        return l.button;
      })
    );

    buttons.forEach(function (btn) {
      if (!known.has(btn)) {
        lenses.push(new LensButton(btn));
      }
    });

    lenses = lenses.filter(function (lens) {
      if (buttons.indexOf(lens.button) === -1) {
        lens.destroy();
        return false;
      }
      return true;
    });

    if (!rafId) {
      render();
    }
  }

  function render() {
    var video = findVideo();
    var visible = isOsdVisible();

    if (!visible || !lenses.length || !video) {
      rafId = 0;
      if (lenses.length) {
        setTimeout(function () {
          if (!rafId && isOsdVisible()) {
            render();
          }
        }, 200);
      }
      return;
    }

    lenses.forEach(function (lens) {
      lens.render(video);
    });

    rafId = requestAnimationFrame(render);
  }

  function init() {
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

  document.addEventListener('viewshow', function () {
    setTimeout(init, 80);
  });
  document.addEventListener(
    'click',
    function () {
      setTimeout(init, 80);
    },
    true
  );
  document.addEventListener(
    'pointermove',
    function () {
      if (document.querySelector('.videoOsdBottom') && !lenses.length) {
        init();
      }
    },
    true
  );
  window.addEventListener('resize', function () {
    lenses.forEach(function (l) {
      l.setCanvasSize();
    });
  });

  if (!pollId) {
    pollId = setInterval(function () {
      if (document.querySelector('.videoOsdBottom')) {
        init();
      }
      if (lenses.length && isOsdVisible() && !rafId) {
        render();
      }
    }, 500);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 200);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 200);
    });
  }

  console.info('[osd-lens-glass] loaded (refraction-v13)');
})();
