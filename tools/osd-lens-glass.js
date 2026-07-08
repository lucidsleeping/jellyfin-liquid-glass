/**
 * Liquid-glass lens for Jellyfin OSD transport buttons.
 * Mirrors the reference WebGL setup (position attrib, iMouse, iChannel0)
 * and samples the live <video> instead of a static image.
 */
(function () {
  'use strict';

  var TRANSPORT_SELECTORS =
    '.btnRewind, .btnFastForward, .btnPlayPause, .btnPause, .btnPlay';

  var FRAGMENT_SHADER = [
    'precision mediump float;',
    '',
    'uniform vec3 iResolution;',
    'uniform float iTime;',
    'uniform vec4 iMouse;',
    'uniform sampler2D iChannel0;',
    'uniform vec4 iVideoRect;',
    'uniform vec2 uCanvasOrigin;',
    '',
    'vec2 mapUV(vec2 canvasUV) {',
    '  vec2 screen = uCanvasOrigin + canvasUV * iResolution.xy;',
    '  return (screen - iVideoRect.xy) / iVideoRect.zw;',
    '}',
    '',
    'void mainImage(out vec4 fragColor, in vec2 fragCoord) {',
    '  const float NUM_ZERO = 0.0;',
    '  const float NUM_ONE = 1.0;',
    '  const float NUM_HALF = 0.5;',
    '  const float NUM_TWO = 2.0;',
    '  const float POWER_EXPONENT = 6.0;',
    '  const float MASK_MULTIPLIER_1 = 10000.0;',
    '  const float MASK_MULTIPLIER_2 = 9500.0;',
    '  const float MASK_MULTIPLIER_3 = 11000.0;',
    '  const float LENS_MULTIPLIER = 5000.0;',
    '  const float MASK_STRENGTH_1 = 8.0;',
    '  const float MASK_STRENGTH_2 = 16.0;',
    '  const float MASK_STRENGTH_3 = 2.0;',
    '  const float MASK_THRESHOLD_1 = 0.95;',
    '  const float MASK_THRESHOLD_2 = 0.9;',
    '  const float MASK_THRESHOLD_3 = 1.5;',
    '  const float SAMPLE_RANGE = 4.0;',
    '  const float SAMPLE_OFFSET = 0.5;',
    '  const float GRADIENT_RANGE = 0.2;',
    '  const float GRADIENT_OFFSET = 0.1;',
    '  const float GRADIENT_EXTREME = -1000.0;',
    '  const float LIGHTING_INTENSITY = 0.3;',
    '',
    '  vec2 uv = fragCoord / iResolution.xy;',
    '  vec2 mouse = iMouse.xy;',
    '  if (length(mouse) < NUM_ONE) {',
    '    mouse = iResolution.xy / NUM_TWO;',
    '  }',
    '  vec2 m2 = (uv - mouse / iResolution.xy);',
    '',
    '  float roundedBox = pow(abs(m2.x * iResolution.x / iResolution.y), POWER_EXPONENT) + pow(abs(m2.y), POWER_EXPONENT);',
    '  float rb1 = clamp((NUM_ONE - roundedBox * MASK_MULTIPLIER_1) * MASK_STRENGTH_1, NUM_ZERO, NUM_ONE);',
    '  float rb2 = clamp((MASK_THRESHOLD_1 - roundedBox * MASK_MULTIPLIER_2) * MASK_STRENGTH_2, NUM_ZERO, NUM_ONE) -',
    '    clamp(pow(MASK_THRESHOLD_2 - roundedBox * MASK_MULTIPLIER_2, NUM_ONE) * MASK_STRENGTH_2, NUM_ZERO, NUM_ONE);',
    '  float rb3 = clamp((MASK_THRESHOLD_3 - roundedBox * MASK_MULTIPLIER_3) * MASK_STRENGTH_3, NUM_ZERO, NUM_ONE) -',
    '    clamp(pow(NUM_ONE - roundedBox * MASK_MULTIPLIER_3, NUM_ONE) * MASK_STRENGTH_3, NUM_ZERO, NUM_ONE);',
    '',
    '  fragColor = vec4(NUM_ZERO);',
    '  float transition = smoothstep(NUM_ZERO, NUM_ONE, rb1 + rb2);',
    '',
    '  if (transition > NUM_ZERO) {',
    '    vec2 lens = ((uv - NUM_HALF) * NUM_ONE * (NUM_ONE - roundedBox * LENS_MULTIPLIER) + NUM_HALF);',
    '    float total = NUM_ZERO;',
    '    for (float x = -SAMPLE_RANGE; x <= SAMPLE_RANGE; x++) {',
    '      for (float y = -SAMPLE_RANGE; y <= SAMPLE_RANGE; y++) {',
    '        vec2 offset = vec2(x, y) * SAMPLE_OFFSET / iResolution.xy;',
    '        fragColor += texture2D(iChannel0, mapUV(offset + lens));',
    '        total += NUM_ONE;',
    '      }',
    '    }',
    '    fragColor /= total;',
    '',
    '    float gradient = clamp((clamp(m2.y, NUM_ZERO, GRADIENT_RANGE) + GRADIENT_OFFSET) / NUM_TWO, NUM_ZERO, NUM_ONE) +',
    '      clamp((clamp(-m2.y, GRADIENT_EXTREME, GRADIENT_RANGE) * rb3 + GRADIENT_OFFSET) / NUM_TWO, NUM_ZERO, NUM_ONE);',
    '    vec4 lighting = clamp(fragColor + vec4(rb1) * gradient + vec4(rb2) * LIGHTING_INTENSITY, NUM_ZERO, NUM_ONE);',
    '',
    '    fragColor = mix(texture2D(iChannel0, mapUV(uv)), lighting, transition);',
    '  } else {',
    '    fragColor = texture2D(iChannel0, mapUV(uv));',
    '  }',
    '}',
    '',
    'void main() {',
    '  mainImage(gl_FragColor, gl_FragCoord.xy);',
    '}'
  ].join('\n');

  var VERTEX_SHADER = [
    'attribute vec2 position;',
    'void main() {',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var lenses = [];
  var rafId = 0;
  var startTime = performance.now();
  var observer = null;

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
      var v = player.querySelector('video');
      if (v) {
        return v;
      }
    }
    return document.querySelector('video');
  }

  function getTransportButtons() {
    var row = document.querySelector('.videoOsdBottom .buttons > div:first-child');
    if (!row) {
      return [];
    }
    return Array.prototype.filter.call(
      row.querySelectorAll(TRANSPORT_SELECTORS),
      function (btn) {
        return btn.offsetParent !== null && getComputedStyle(btn).display !== 'none';
      }
    );
  }

  function LensButton(button) {
    var self = this;
    this.button = button;
    this.mouse = [0, 0];
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'osd-lens-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    button.classList.add('osd-lens-btn');

    if (button.querySelector('.osd-lens-canvas')) {
      this.canvas = button.querySelector('.osd-lens-canvas');
    } else {
      button.insertBefore(this.canvas, button.firstChild);
    }

    this.gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false
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
      time: gl.getUniformLocation(this.program, 'iTime'),
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

    this.canvas.addEventListener('mousemove', function (e) {
      var rect = self.canvas.getBoundingClientRect();
      var scaleX = self.canvas.width / rect.width;
      var scaleY = self.canvas.height / rect.height;
      self.mouse = [
        (e.clientX - rect.left) * scaleX,
        self.canvas.height - (e.clientY - rect.top) * scaleY
      ];
    });

    this.canvas.addEventListener('mouseleave', function () {
      self.mouse = [0, 0];
    });

    this.setCanvasSize();
  }

  LensButton.prototype.setCanvasSize = function () {
    if (!this.gl) {
      return;
    }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = this.button.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
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
      return true;
    } catch (err) {
      this.button.classList.add('osd-lens-fallback');
      return false;
    }
  };

  LensButton.prototype.render = function (video, currentTime) {
    if (!this.gl || !this.program || !this.setupTexture(video)) {
      return;
    }

    this.setCanvasSize();

    var gl = this.gl;
    var rect = this.button.getBoundingClientRect();
    var videoRect = video.getBoundingClientRect();

    gl.useProgram(this.program);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform3f(this.uniforms.resolution, this.canvas.width, this.canvas.height, 1.0);
    gl.uniform1f(this.uniforms.time, currentTime);
    gl.uniform4f(this.uniforms.mouse, this.mouse[0], this.mouse[1], 0, 0);
    gl.uniform4f(
      this.uniforms.videoRect,
      videoRect.left,
      videoRect.top,
      videoRect.width,
      videoRect.height
    );
    gl.uniform2f(this.uniforms.canvasOrigin, rect.left, rect.top);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.texture, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
    this.button.classList.remove('osd-lens-btn', 'osd-lens-fallback');
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
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function syncButtons() {
    var buttons = getTransportButtons();
    if (!buttons.length) {
      teardown();
      return;
    }

    var known = new Set(lenses.map(function (l) {
      return l.button;
    }));

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
    var osd = document.querySelector('.videoOsdBottom');
    var video = findVideo();

    if (!osd || osd.classList.contains('hide') || !lenses.length || !video) {
      rafId = 0;
      return;
    }

    var currentTime = (performance.now() - startTime) / 1000;
    lenses.forEach(function (lens) {
      lens.render(video, currentTime);
    });

    rafId = requestAnimationFrame(render);
  }

  function init() {
    if (!document.querySelector('.videoOsdBottom')) {
      return;
    }
    syncButtons();
    if (!observer) {
      observer = new MutationObserver(syncButtons);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  document.addEventListener('viewshow', function () {
    setTimeout(init, 80);
  });

  window.addEventListener('resize', function () {
    lenses.forEach(function (l) {
      l.setCanvasSize();
    });
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 200);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 200);
    });
  }
})();
