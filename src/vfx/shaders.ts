// 特效用的自訂著色器：全部用程式畫，不需要貼圖。
// 顏色以線性空間傳進來，最後用 colorspace_fragment 轉回畫面色彩空間（和一般材質一致）。
// 場景是明亮的粉彩色：主要用一般混合＋白色核心表現「發光」，加亮混合只用在火花與閃光。
import * as THREE from 'three'

const OUT = /* glsl */ `#include <colorspace_fragment>`

function base(blending: THREE.Blending, extra: Partial<THREE.ShaderMaterialParameters>) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending,
    fog: false,
    toneMapped: false,
    ...extra,
  })
}

/** 粒子：面向鏡頭的圓形光點；iVel.w > 0 時沿速度方向拉長成光痕 */
export function particleMaterial(blending: THREE.Blending, core: number) {
  return base(blending, {
    uniforms: { uCore: { value: core } },
    vertexShader: /* glsl */ `
      attribute vec3 iPos;
      attribute vec3 iColor;
      attribute vec2 iSA;
      attribute vec4 iVel;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vUv = uv;
        vColor = iColor;
        vAlpha = iSA.y;
        vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
        vec2 q = position.xy * iSA.x;
        if (iVel.w > 0.0) {
          vec2 d = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xy;
          float l = length(d);
          if (l > 1e-4) {
            d /= l;
            vec2 n = vec2(-d.y, d.x);
            q = n * position.x * iSA.x * 0.5 + d * position.y * iSA.x * (1.0 + iVel.w);
          }
        }
        mv.xy += q;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uCore;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        if (d > 1.0) discard;
        float a = 1.0 - d;
        a *= a;
        float core = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(mix(vColor, vec3(1.0), core * uCore), min(1.0, a * 1.6) * vAlpha);
        ${OUT}
      }`,
  })
}

/** 刀光：弧形帶狀，uProgress 0→1 由一端掃到另一端，外緣最亮 */
export function slashMaterial() {
  return base(THREE.NormalBlending, {
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color() },
      uColor2: { value: new THREE.Color() },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uColor2;
      uniform float uProgress;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float head = uProgress * 1.45;
        float tail = head - 0.6;
        float u = vUv.x;
        if (u > head || u < tail) discard;
        float along = (u - tail) / (head - tail);
        // 內側幾乎透明、往外緣變濃，最外緣一條白色刃線
        float edge = vUv.y;
        float body = pow(edge, 2.2) * 0.95;
        float rim = smoothstep(0.76, 0.94, vUv.y) * (1.0 - smoothstep(0.95, 1.0, vUv.y));
        float a = along * along * body + rim * along;
        float fade = 1.0 - smoothstep(0.65, 1.0, uProgress);
        vec3 c = mix(uColor2, uColor, smoothstep(0.3, 0.9, edge));
        c = mix(c, vec3(1.0), rim * along * 0.8);
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uOpacity * fade);
        ${OUT}
      }`,
  })
}

/** 飛行拖尾：uv.x = 1 在頭、0 在尾；寬度方向中間最亮 */
export function trailMaterial() {
  return base(THREE.NormalBlending, {
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color() },
      uColor2: { value: new THREE.Color() },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uColor2;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float h = vUv.x;
        float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float core = smoothstep(0.45, 1.0, across);
        vec3 c = mix(uColor2, uColor, h);
        c = mix(c, vec3(1.0), core * h * 0.75);
        gl_FragColor = vec4(c, h * h * smoothstep(0.0, 0.5, across) * uOpacity);
        ${OUT}
      }`,
  })
}

/** 魔法陣：同心圓、旋轉的符文刻度、六芒星，全部在片段著色器裡用極座標畫 */
export function circleMaterial() {
  return base(THREE.NormalBlending, {
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: {
      uColor: { value: new THREE.Color() },
      uColor2: { value: new THREE.Color() },
      uTime: { value: 0 },
      uAlpha: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uColor2;
      uniform float uTime;
      uniform float uAlpha;
      varying vec2 vUv;
      const float TAU = 6.2831853;
      float ring(float d, float r, float w) { return smoothstep(w, 0.0, abs(d - r)); }
      float poly(float d, float a, float n, float r, float w) {
        float seg = TAU / n;
        return ring(d * cos(mod(a, seg) - seg * 0.5), r, w);
      }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        if (d > 1.0) discard;
        float ang = atan(p.y, p.x);
        float a1 = ang + uTime * 0.9;
        float a2 = ang - uTime * 0.5;
        float v = ring(d, 0.97, 0.022) + ring(d, 0.85, 0.014) + ring(d, 0.5, 0.016) * 0.9 + ring(d, 0.2, 0.012) * 0.7;
        // 外圈符文：一格一格的刻度，中間留缺口
        float band = step(0.875, d) * step(d, 0.945);
        float tick = step(0.45, fract(a1 * 36.0 / TAU)) * step(0.22, fract(a1 * 6.0 / TAU));
        v += band * tick * 0.85;
        // 六芒星（兩個三角形）與內圈小六角
        float inner = step(d, 0.86);
        v += (poly(d, a2, 3.0, 0.425, 0.012) + poly(d, a2 + TAU * 0.5, 3.0, 0.425, 0.012)) * inner;
        v += poly(d, a1, 6.0, 0.18, 0.01) * 0.8;
        float glow = (1.0 - d) * 0.22;
        vec3 c = mix(uColor2, uColor, clamp(v, 0.0, 1.0));
        c = mix(c, vec3(1.0), clamp(v - 0.7, 0.0, 1.0) * 0.6);
        gl_FragColor = vec4(c, clamp(v + glow, 0.0, 1.0) * uAlpha);
        ${OUT}
      }`,
  })
}

/** 衝擊波：地面上向外擴散的圓環，uProgress 是目前半徑（0～1） */
export function ringMaterial() {
  return base(THREE.NormalBlending, {
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    uniforms: {
      uColor: { value: new THREE.Color() },
      uProgress: { value: 0 },
      uWidth: { value: 0.12 },
      uAlpha: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uProgress;
      uniform float uWidth;
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        float d = length(vUv * 2.0 - 1.0);
        if (d > 1.0) discard;
        float k = abs(d - uProgress);
        float a = smoothstep(uWidth, 0.0, k) + smoothstep(uProgress, 0.0, d) * 0.12;
        vec3 c = mix(uColor, vec3(1.0), smoothstep(uWidth * 0.45, 0.0, k) * 0.7);
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uAlpha);
        ${OUT}
      }`,
  })
}

/** 光柱：開口圓柱，邊緣（視角斜切處）較亮，往上淡出，表面有往上捲動的條紋 */
export function pillarMaterial() {
  return base(THREE.NormalBlending, {
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color() },
      uColor2: { value: new THREE.Color() },
      uTime: { value: 0 },
      uAlpha: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vRim;
      void main() {
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uColor2;
      uniform float uTime;
      uniform float uAlpha;
      varying vec2 vUv;
      varying float vRim;
      void main() {
        float up = pow(1.0 - vUv.y, 1.4);
        float stripe = smoothstep(0.55, 1.0, fract(vUv.y * 5.0 - uTime * 1.8)) * 0.35;
        float a = up * (0.22 + vRim * 0.75 + stripe);
        vec3 c = mix(uColor, uColor2, vUv.y);
        c = mix(c, vec3(1.0), vRim * 0.45 * up);
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uAlpha);
        ${OUT}
      }`,
  })
}

/** 光暈：單張面向鏡頭的圓形（火球外圍的光） */
export function haloMaterial(blending: THREE.Blending = THREE.NormalBlending) {
  return base(blending, {
    uniforms: {
      uColor: { value: new THREE.Color() },
      uSize: { value: 1 },
      uAlpha: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        float d = length(vUv * 2.0 - 1.0);
        if (d > 1.0) discard;
        float a = pow(1.0 - d, 1.3);
        vec3 c = mix(uColor, vec3(1.0), smoothstep(0.4, 0.0, d) * 0.7);
        gl_FragColor = vec4(c, a * uAlpha);
        ${OUT}
      }`,
  })
}
