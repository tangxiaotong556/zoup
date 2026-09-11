import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ===== 工具函数 =====
function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// 地形起伏高度：中心保持平坦放置物体，远处缓慢自然隆起
function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const fade = smoothstep(6, 15, r);
  const n =
    Math.sin(x * 0.24) * Math.cos(z * 0.2) +
    Math.sin(x * 0.11 + 1.7) * Math.cos(z * 0.13 + 0.6) * 1.3 +
    Math.sin((x + z) * 0.33 + 2.1) * 0.35;
  return fade * (n * 0.35 + 0.65) * 1.5;
}

// ===== 基础配置 =====
const container = document.getElementById('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe3eee1);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(6, 3.4, 9.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// ===== 控制器（限制视角：不允许穿进地面，缩放有远近边界） =====
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.6;
controls.enablePan = false;
controls.target.set(0, 1.0, 0);
controls.minDistance = 4;
controls.maxDistance = 16;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = 1.5; // 不到水平线以下，镜头不会钻进地面
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

// ===== 环境雾（指数衰减，强化空气透视，远景山体自然降饱和、拉开层次） =====
scene.fog = new THREE.FogExp2(0xe3eee1, 0.021);

// ===== 天空穹顶（清透淡蓝渐变） =====
const skyGeo = new THREE.SphereGeometry(90, 24, 12);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x9cc4e4) },
    horizonColor: { value: new THREE.Color(0xe3eee1) },
    bottomColor: { value: new THREE.Color(0xd9e6d4) },
  },
  vertexShader: `
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    varying vec3 vWorldPos;
    uniform vec3 topColor;
    uniform vec3 horizonColor;
    uniform vec3 bottomColor;
    void main() {
      float h = normalize(vWorldPos).y;
      vec3 col;
      if (h > 0.0) {
        col = mix(horizonColor, topColor, pow(min(h * 1.7, 1.0), 0.75));
      } else {
        col = mix(horizonColor, bottomColor, min(-h * 3.0, 1.0));
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

// ===== 光照系统（柔和白天日光 + 天光漫反射，去灰蒙蒙平涂感） =====
const hemiLight = new THREE.HemisphereLight(0xcfe3f0, 0x8fa878, 0.85);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.0);
keyLight.position.set(7, 14, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 40;
keyLight.shadow.camera.left = -11;
keyLight.shadow.camera.right = 11;
keyLight.shadow.camera.top = 11;
keyLight.shadow.camera.bottom = -11;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xbcd8e8, 0.45);
rimLight.position.set(-6, 5, -7);
scene.add(rimLight);

// ===== 起伏地形（顶点色做草地深浅斑块，边缘靠雾自然虚化） =====
const terrainGeo = new THREE.PlaneGeometry(160, 160, 96, 96);
terrainGeo.rotateX(-Math.PI / 2);
const tPos = terrainGeo.attributes.position;
const tColors = new Float32Array(tPos.count * 3);
const cDeep = new THREE.Color(0x5c7f4e);
const cMid = new THREE.Color(0x74975c);
const cLight = new THREE.Color(0x8db06a);
const tmpC = new THREE.Color();
for (let i = 0; i < tPos.count; i++) {
  const x = tPos.getX(i);
  const z = tPos.getZ(i);
  const h = groundHeight(x, z);
  tPos.setY(i, -0.5 + h);
  const n1 = Math.sin(x * 0.42 + 1.3) * Math.cos(z * 0.38 + 0.7);
  const n2 = Math.sin(x * 0.16 - 0.5) * Math.cos(z * 0.19 + 1.9);
  const n3 = Math.sin((x - z) * 0.27 + 3.1);
  const t = n1 * 0.45 + n2 * 0.35 + n3 * 0.2;
  if (t < 0) tmpC.lerpColors(cDeep, cMid, t + 1);
  else tmpC.lerpColors(cMid, cLight, t);
  tmpC.multiplyScalar(1 - smoothstep(0.6, 1.5, h) * 0.12);
  tColors[i * 3] = tmpC.r;
  tColors[i * 3 + 1] = tmpC.g;
  tColors[i * 3 + 2] = tmpC.b;
}
terrainGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1.0,
  metalness: 0.0,
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.receiveShadow = true;
scene.add(terrain);

// ===== 微风时间 uniform（草、树共用） =====
const windTime = { value: 0 };

// ===== 实例化草地（两层 + 风摇曳顶点动画 + 深浅颜色变化） =====
function makeBladeGeometry(width) {
  const geo = new THREE.PlaneGeometry(width, 1, 1, 3);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - y * 0.85)); // 顶部收窄成叶尖
  }
  geo.computeVertexNormals();
  return geo;
}

const grassMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.95,
  metalness: 0.0,
  side: THREE.DoubleSide,
});
grassMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = windTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float wPhase = instanceMatrix[3][0] * 0.9 + instanceMatrix[3][2] * 1.1;
        float wGust = sin(uTime * 1.4 + wPhase) * 0.6 + sin(uTime * 2.6 + wPhase * 1.7) * 0.4;
        float wBend = position.y * position.y;
        transformed.x += wGust * wBend * 0.22;
        transformed.z += cos(uTime * 1.1 + wPhase) * wBend * 0.10;
      #endif
      `
    );
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function makeGrassLayer(count, minR, maxR, hMin, hMax, width, colors) {
  const mesh = new THREE.InstancedMesh(makeBladeGeometry(width), grassMat, count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = hMin + Math.random() * (hMax - hMin);
    _e.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25);
    _q.setFromEuler(_e);
    _p.set(x, -0.5 + groundHeight(x, z), z);
    _s.set(0.85 + Math.random() * 0.4, h, 1);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    _c.setHex(colors[(Math.random() * colors.length) | 0]);
    _c.offsetHSL(0, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.08);
    mesh.setColorAt(i, _c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// 底层密草（深绿矮草）
makeGrassLayer(1500, 1.6, 13, 0.22, 0.42, 0.075, [0x3f6b35, 0x4a7a3e, 0x456f38]);
// 上层长草（浅绿偏黄，稀疏）
makeGrassLayer(700, 1.8, 12, 0.48, 0.85, 0.09, [0x6f9a4e, 0x7fa85a, 0x8fb06a]);

// ===== 碎石（低模、哑光、半埋入土） =====
const stoneGeo = new THREE.IcosahedronGeometry(1, 0);
const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: true });
const stoneColors = [0x9a9a92, 0x8a8d86, 0xa8a49a, 0x7f837d];
const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 48);
for (let i = 0; i < 48; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 1.8 + Math.random() * 11;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.05 + Math.random() * 0.13;
  _e.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  _q.setFromEuler(_e);
  _p.set(x, -0.5 + groundHeight(x, z) + s * 0.3, z);
  _s.set(s, s * (0.6 + Math.random() * 0.3), s);
  _m.compose(_p, _q, _s);
  stones.setMatrixAt(i, _m);
  _c.setHex(stoneColors[(Math.random() * stoneColors.length) | 0]);
  stones.setColorAt(i, _c);
}
stones.instanceMatrix.needsUpdate = true;
if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
stones.castShadow = true;
stones.receiveShadow = true;
scene.add(stones);

// ===== 小野花（实例化） =====
const flowerGeo = new THREE.SphereGeometry(0.05, 6, 5);
const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 });
const flowerColors = [0xfff0f5, 0xffe9a0, 0xe6d9ff, 0xffd9b0, 0xffffff];
const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, 70);
for (let i = 0; i < 70; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 1.8 + Math.random() * 9;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.7 + Math.random() * 0.7;
  _q.identity();
  _p.set(x, -0.5 + groundHeight(x, z) + 0.04 * s, z);
  _s.setScalar(s);
  _m.compose(_p, _q, _s);
  flowers.setMatrixAt(i, _m);
  _c.setHex(flowerColors[(Math.random() * flowerColors.length) | 0]);
  flowers.setColorAt(i, _c);
}
flowers.instanceMatrix.needsUpdate = true;
if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
scene.add(flowers);

// ===== 低矮灌木丛 =====
const bushColors = [0x4a6e3d, 0x557a45, 0x3f6236];
const bushGeo = new THREE.SphereGeometry(1, 7, 5);
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + Math.random() * 0.8;
  const r = 4.5 + Math.random() * 8.5;
  const bx = Math.cos(a) * r;
  const bz = Math.sin(a) * r;
  const by = -0.5 + groundHeight(bx, bz);
  const mat = new THREE.MeshStandardMaterial({
    color: bushColors[i % bushColors.length],
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  const lumps = 2 + (Math.random() * 3 | 0);
  for (let j = 0; j < lumps; j++) {
    const sx = 0.3 + Math.random() * 0.25;
    const sy = 0.22 + Math.random() * 0.18;
    const mesh = new THREE.Mesh(bushGeo, mat);
    mesh.position.set(
      bx + (Math.random() - 0.5) * 0.6,
      by + sy * 0.55,
      bz + (Math.random() - 0.5) * 0.6
    );
    mesh.scale.set(sx, sy, 0.3 + Math.random() * 0.25);
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

// ===== 可交互对象集合 =====
const interactiveObjects = [];

// ===== 文字贴图工厂 =====
function createTextTexture(text, options = {}) {
  const {
    fontSize = 128,
    fontFamily = 'Helvetica, "Microsoft YaHei", Arial, sans-serif',
    color = '#3a3a3a',
    fontWeight = '900',
    letterSpacing = 0,
    align = 'center',
    paddingX = 30,
    paddingY = 30,
    maxWidth = 1024,
    italic = false,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontStr = `${italic ? 'italic ' : ''}${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.font = fontStr;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width + letterSpacing * (text.length - 1);
  const textHeight = fontSize * 1.15;

  canvas.width = Math.min(Math.ceil(textWidth + paddingX * 2), maxWidth);
  canvas.height = Math.ceil(textHeight + paddingY * 2);

  const ctx2 = canvas.getContext('2d');
  ctx2.font = fontStr;
  ctx2.fillStyle = color;
  ctx2.textBaseline = 'middle';
  ctx2.textAlign = align;

  let xPos;
  if (align === 'center') xPos = canvas.width / 2;
  else if (align === 'right') xPos = canvas.width - paddingX;
  else xPos = paddingX;

  if (letterSpacing > 0) {
    let cursorX = xPos - textWidth / 2;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const chWidth = ctx2.measureText(ch).width;
      ctx2.fillText(ch, cursorX + chWidth / 2, canvas.height / 2);
      cursorX += chWidth + letterSpacing;
    }
  } else {
    ctx2.fillText(text, xPos, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

// ===== 3D 文字平面（低透明度装饰层，不遮挡主体） =====
function createTextPlane(text, position, options = {}) {
  const {
    fontSize = 128,
    color = '#3a3a3a',
    opacity = 1,
    transparent = true,
    side = THREE.DoubleSide,
    rotation = { x: 0, y: 0, z: 0 },
    scale = 1,
    interactive = false,
    tag = null,
    emissiveIntensity = 0.05,
    italic = false,
    letterSpacing = 0,
  } = options;

  const texture = createTextTexture(text, { fontSize, color, italic, letterSpacing });
  const aspect = texture.image.width / texture.image.height;
  const height = 1.2;
  const width = height * aspect;

  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent,
    opacity,
    side,
    roughness: 0.6,
    metalness: 0.0,
    emissive: new THREE.Color(color),
    emissiveIntensity,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(position.x, position.y, position.z);
  mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  mesh.scale.setScalar(scale);
  mesh.userData = { type: 'text', text, tag, interactive, baseScale: scale };

  scene.add(mesh);
  return mesh;
}

// ===== 树 =====
const treeGroup = new THREE.Group();
treeGroup.position.set(-5.0, -0.5, -1.8);
treeGroup.scale.set(2.1, 2.1, 2.1);

const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.5, 10);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95, metalness: 0 });
const trunk = new THREE.Mesh(trunkGeo, trunkMat);
trunk.position.y = 1.25;
trunk.castShadow = true;
trunk.receiveShadow = true;
treeGroup.add(trunk);

const branchMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.95, metalness: 0 });
const branch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.8, 7), branchMat);
branch1.position.set(0.3, 2.0, 0.1);
branch1.rotation.z = -0.6;
branch1.castShadow = true;
treeGroup.add(branch1);

const branch2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 7), branchMat);
branch2.position.set(-0.25, 2.2, -0.1);
branch2.rotation.z = 0.7;
branch2.castShadow = true;
treeGroup.add(branch2);

const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 0.95, metalness: 0, flatShading: true });
const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x4a7a2a, roughness: 0.95, metalness: 0, flatShading: true });
const leafMat3 = new THREE.MeshStandardMaterial({ color: 0x6a9a4a, roughness: 0.95, metalness: 0, flatShading: true });

// 树叶微风：顶点着色器摆动，位置越高幅度越大，性能开销极低
[leafMat, leafMat2, leafMat3].forEach(mat => {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 lWp = modelMatrix * vec4(position, 1.0);
        float lPhase = lWp.x * 0.6 + lWp.z * 0.5;
        float lHeight = smoothstep(1.5, 4.5, lWp.y);
        transformed.x += (sin(uTime * 1.1 + lPhase) * 0.6 + sin(uTime * 1.9 + lPhase * 1.3) * 0.4) * 0.05 * lHeight;
        transformed.z += cos(uTime * 0.9 + lPhase) * 0.03 * lHeight;
        `
      );
  };
});

const foliageConfigs = [
  { pos: [0, 2.8, 0], r: 0.9, mat: leafMat },
  { pos: [0.5, 2.6, 0.2], r: 0.7, mat: leafMat2 },
  { pos: [-0.4, 2.7, -0.2], r: 0.65, mat: leafMat3 },
  { pos: [0.1, 3.3, -0.1], r: 0.6, mat: leafMat },
  { pos: [-0.2, 3.0, 0.3], r: 0.55, mat: leafMat2 },
  { pos: [0.3, 3.1, -0.25], r: 0.5, mat: leafMat3 },
];

foliageConfigs.forEach(cfg => {
  const geo = new THREE.SphereGeometry(cfg.r, 8, 6);
  const mesh = new THREE.Mesh(geo, cfg.mat);
  mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  treeGroup.add(mesh);
});

scene.add(treeGroup);

// ===== 树下坐着的人（放大 + 更真实形体：胶囊四肢、肘膝关节、短袖小臂、五官细节） =====
const personGroup = new THREE.Group();
personGroup.position.set(-4.35, -0.45, -1.40); // 背部轻靠树干
personGroup.rotation.y = 1.0; // 面向自行车方向
personGroup.scale.setScalar(1.5);

const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0b890, roughness: 0.75, metalness: 0 });
const shirtMat = new THREE.MeshStandardMaterial({ color: 0x4a6a9a, roughness: 0.85, metalness: 0 });
const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.9, metalness: 0 });
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.85, metalness: 0 });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.95, metalness: 0 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.4, metalness: 0 });

// 两点之间生成胶囊肢体（自动定向，关节处自然衔接）
const _upAxis = new THREE.Vector3(0, 1, 0);
function createLimb(fromArr, toArr, radius, mat, seg = 8) {
  const a = new THREE.Vector3(fromArr[0], fromArr[1], fromArr[2]);
  const b = new THREE.Vector3(toArr[0], toArr[1], toArr[2]);
  const dir = new THREE.Vector3().subVectors(b, a);
  const dist = dir.length();
  const len = Math.max(dist - radius * 2, 0.02);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 4, seg), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_upAxis, dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

// 臀部（坐在地上）
const hip = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.16, 4, 10), pantsMat);
hip.rotation.z = Math.PI / 2;
hip.position.set(0, 0.115, 0);
hip.castShadow = true;
personGroup.add(hip);

// 躯干（微微后仰靠树）
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.30, 4, 10), shirtMat);
torso.position.set(0, 0.40, -0.045);
torso.rotation.x = -0.16;
torso.castShadow = true;
personGroup.add(torso);

// 脖子
const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.10, 8), skinMat);
neck.position.set(0, 0.70, -0.06);
neck.castShadow = true;
personGroup.add(neck);

// 头部（球体 + 五官）
const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skinMat);
head.position.set(0, 0.855, -0.05);
head.castShadow = true;
head.userData._baseY = head.position.y;
personGroup.add(head);

// 头发（顶部帽状 + 后脑勺体量）
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
hair.position.set(0, 0.868, -0.058);
personGroup.add(hair);
const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), hairMat);
hairBack.position.set(0, 0.835, -0.115);
personGroup.add(hairBack);

// 耳朵 / 眼睛 / 鼻子
[-1, 1].forEach(s => {
  const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), skinMat);
  ear.position.set(s * 0.135, 0.85, -0.05);
  personGroup.add(ear);
});
[-1, 1].forEach(s => {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), eyeMat);
  eye.position.set(s * 0.05, 0.872, 0.093);
  personGroup.add(eye);
});
const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 5), skinMat);
nose.position.set(0, 0.842, 0.102);
personGroup.add(nose);

// 左腿（伸直向前）
const lHip = [-0.10, 0.14, 0.03];
const lKnee = [-0.10, 0.12, 0.46];
const lAnkle = [-0.10, 0.10, 0.84];
personGroup.add(createLimb(lHip, lKnee, 0.068, pantsMat));
personGroup.add(createLimb(lKnee, lAnkle, 0.055, pantsMat));
const lShoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.10, 4, 8), shoeMat);
lShoe.rotation.x = Math.PI / 2;
lShoe.scale.set(1.15, 1, 0.7);
lShoe.position.set(-0.10, 0.045, 0.95);
lShoe.castShadow = true;
personGroup.add(lShoe);

// 右腿（弯曲，膝盖朝上）
const rHip = [0.11, 0.14, 0.04];
const rKnee = [0.14, 0.50, 0.24];
const rAnkle = [0.17, 0.09, 0.04];
personGroup.add(createLimb(rHip, rKnee, 0.068, pantsMat));
personGroup.add(createLimb(rKnee, rAnkle, 0.055, pantsMat));
const rShoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.10, 4, 8), shoeMat);
rShoe.rotation.x = Math.PI / 2;
rShoe.scale.set(1.15, 1, 0.7);
rShoe.position.set(0.18, 0.045, 0.10);
rShoe.castShadow = true;
personGroup.add(rShoe);

// 右手臂（短袖上衣 + 皮肤小臂，手搭膝盖）
const rSh = [0.15, 0.60, -0.04];
const rEl = [0.21, 0.36, 0.10];
const rHd = [0.15, 0.50, 0.26];
personGroup.add(createLimb(rSh, rEl, 0.048, shirtMat));
personGroup.add(createLimb(rEl, rHd, 0.042, skinMat));
const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skinMat);
rHand.scale.set(1, 0.85, 1.15);
rHand.position.set(rHd[0], rHd[1], rHd[2]);
rHand.castShadow = true;
personGroup.add(rHand);

// 左手臂（自然搭到右膝）
const lSh = [-0.15, 0.60, -0.04];
const lEl = [-0.18, 0.34, 0.12];
const lHd = [0.02, 0.48, 0.28];
personGroup.add(createLimb(lSh, lEl, 0.048, shirtMat));
personGroup.add(createLimb(lEl, lHd, 0.042, skinMat));
const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skinMat);
lHand.scale.set(1, 0.85, 1.15);
lHand.position.set(lHd[0], lHd[1], lHd[2]);
lHand.castShadow = true;
personGroup.add(lHand);

scene.add(personGroup);

// ===== 自行车模型（柔和哑光材质，车轮贴合地面） =====
const bikeGroup = new THREE.Group();
const sf = 0.018;
bikeGroup.scale.setScalar(sf);
const WHEEL_R = 59 * sf; // 轮胎外径（单位 × 缩放）
const BIKE_BASE_Y = -0.5 + WHEEL_R; // 让轮子正好触地

const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.6, metalness: 0.12 });
const darkRubberMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95, metalness: 0 });
const satinMetalMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b4, metalness: 0.6, roughness: 0.35 });
const leatherMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.85, metalness: 0 });
const accentMat = new THREE.MeshStandardMaterial({ color: 0xc8854a, roughness: 0.6, metalness: 0.1 });

function createWheel() {
  const wheelGroup = new THREE.Group();

  const tireGeo = new THREE.TorusGeometry(50, 9, 12, 40);
  const tire = new THREE.Mesh(tireGeo, darkRubberMat);
  tire.castShadow = true;
  wheelGroup.add(tire);

  const rimGeo = new THREE.CylinderGeometry(41, 41, 5, 24);
  const rim = new THREE.Mesh(rimGeo, satinMetalMat);
  rim.rotation.z = Math.PI / 2;
  rim.castShadow = true;
  wheelGroup.add(rim);

  const hubGeo = new THREE.CylinderGeometry(6, 6, 14, 12);
  const hub = new THREE.Mesh(hubGeo, satinMetalMat);
  hub.rotation.z = Math.PI / 2;
  wheelGroup.add(hub);

  const spokeGeo = new THREE.CylinderGeometry(0.6, 0.6, 76, 4);
  for (let i = 0; i < 10; i++) {
    const spoke = new THREE.Mesh(spokeGeo, satinMetalMat);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.x = (Math.PI / 5) * i;
    wheelGroup.add(spoke);
  }

  return wheelGroup;
}

const frontWheel = createWheel();
frontWheel.position.set(78, 0, 0);
bikeGroup.add(frontWheel);

const backWheel = createWheel();
backWheel.position.set(-78, 0, 0);
bikeGroup.add(backWheel);

// 车架主管
const downTubeGeo = new THREE.CylinderGeometry(5, 4.5, 135, 10);
const downTube = new THREE.Mesh(downTubeGeo, frameMat);
downTube.position.set(10, 28, 0);
downTube.rotation.z = -0.58;
downTube.castShadow = true;
bikeGroup.add(downTube);

const topTubeGeo = new THREE.CylinderGeometry(5, 4.5, 115, 10);
const topTube = new THREE.Mesh(topTubeGeo, frameMat);
topTube.position.set(-5, 55, 0);
topTube.rotation.z = Math.PI / 2 + 0.02;
topTube.castShadow = true;
bikeGroup.add(topTube);

const seatTubeGeo = new THREE.CylinderGeometry(5, 4.5, 95, 10);
const seatTube = new THREE.Mesh(seatTubeGeo, frameMat);
seatTube.position.set(-32, 42, 0);
seatTube.rotation.z = 0.38;
seatTube.castShadow = true;
bikeGroup.add(seatTube);

// 前叉
const forkGeo = new THREE.CylinderGeometry(3.5, 3, 70, 7);
const forkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.65, metalness: 0.1 });

const forkRight = new THREE.Mesh(forkGeo, forkMat);
forkRight.position.set(72, 38, 6);
forkRight.rotation.z = 0.15;
forkRight.castShadow = true;
bikeGroup.add(forkRight);

const forkLeft = new THREE.Mesh(forkGeo, forkMat);
forkLeft.position.set(72, 38, -6);
forkLeft.rotation.z = 0.15;
forkLeft.castShadow = true;
bikeGroup.add(forkLeft);

// 头管
const headTubeGeo = new THREE.CylinderGeometry(6, 6, 28, 10);
const headTube = new THREE.Mesh(headTubeGeo, frameMat);
headTube.position.set(58, 58, 0);
headTube.rotation.z = 0.15;
headTube.castShadow = true;
bikeGroup.add(headTube);

// 座垫（哑光皮革）
const seatGeo = new THREE.BoxGeometry(28, 5, 12);
const seat = new THREE.Mesh(seatGeo, leatherMat);
seat.position.set(-42, 82, 0);
seat.castShadow = true;
bikeGroup.add(seat);

const seatTipGeo = new THREE.BoxGeometry(8, 4, 10);
const seatTip = new THREE.Mesh(seatTipGeo, leatherMat);
seatTip.position.set(-55, 84, 0);
seatTip.rotation.z = -0.3;
bikeGroup.add(seatTip);

// 车把
const handlebarStemGeo = new THREE.CylinderGeometry(4, 4, 20, 7);
const handlebarStem = new THREE.Mesh(handlebarStemGeo, satinMetalMat);
handlebarStem.position.set(62, 78, 0);
handlebarStem.rotation.z = 0.3;
bikeGroup.add(handlebarStem);

const handlebarGeo = new THREE.CylinderGeometry(3.5, 3.5, 70, 7);
const handlebar = new THREE.Mesh(handlebarGeo, satinMetalMat);
handlebar.position.set(60, 88, 0);
handlebar.rotation.z = Math.PI / 2;
handlebar.castShadow = true;
bikeGroup.add(handlebar);

const gripGeo = new THREE.CylinderGeometry(5, 5, 15, 7);
const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9, metalness: 0 });
const gripRight = new THREE.Mesh(gripGeo, gripMat);
gripRight.position.set(60, 88, 28);
gripRight.rotation.z = Math.PI / 2;
bikeGroup.add(gripRight);

const gripLeft = new THREE.Mesh(gripGeo, gripMat);
gripLeft.position.set(60, 88, -28);
gripLeft.rotation.z = Math.PI / 2;
bikeGroup.add(gripLeft);

// 牙盘与飞轮
const chainringGeo = new THREE.CylinderGeometry(18, 18, 3, 20);
const chainring = new THREE.Mesh(chainringGeo, satinMetalMat);
chainring.position.set(-5, 5, 6);
chainring.rotation.z = Math.PI / 2;
chainring.castShadow = true;
bikeGroup.add(chainring);

const cogGeo = new THREE.CylinderGeometry(8, 8, 3, 12);
const cog = new THREE.Mesh(cogGeo, satinMetalMat);
cog.position.set(-78, 5, 6);
cog.rotation.z = Math.PI / 2;
bikeGroup.add(cog);

// 曲柄+脚踏组
const crankGroup = new THREE.Group();
crankGroup.position.set(-5, 5, 0);

const crankArmGeo = new THREE.BoxGeometry(3, 30, 6);
const crankMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.4, roughness: 0.45 });

const crankRight = new THREE.Mesh(crankArmGeo, crankMat);
crankRight.position.set(0, 10, 10);
crankRight.rotation.z = 0.3;
crankGroup.add(crankRight);

const crankLeft = new THREE.Mesh(crankArmGeo, crankMat);
crankLeft.position.set(0, 10, -10);
crankLeft.rotation.z = Math.PI + 0.3;
crankGroup.add(crankLeft);

const pedalGeo = new THREE.BoxGeometry(12, 3, 8);
const pedalMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.1, roughness: 0.6 });

const pedalRight = new THREE.Mesh(pedalGeo, pedalMat);
pedalRight.position.set(0, -3, 14);
crankGroup.add(pedalRight);

const pedalLeft = new THREE.Mesh(pedalGeo, pedalMat);
pedalLeft.position.set(0, 23, -14);
crankGroup.add(pedalLeft);

bikeGroup.add(crankGroup);

// 链条（细管简化）
const chainTopGeo = new THREE.CylinderGeometry(1.5, 1.5, 73, 5);
const chainTop = new THREE.Mesh(chainTopGeo, darkRubberMat);
chainTop.position.set(-41, 12, 6);
chainTop.rotation.z = Math.PI / 2;
bikeGroup.add(chainTop);

const chainBottomGeo = new THREE.CylinderGeometry(1.5, 1.5, 73, 5);
const chainBottom = new THREE.Mesh(chainBottomGeo, darkRubberMat);
chainBottom.position.set(-41, -2, 6);
chainBottom.rotation.z = Math.PI / 2;
bikeGroup.add(chainBottom);

// 挡泥板
const fenderGeo = new THREE.TorusGeometry(52, 3, 7, 24, Math.PI * 0.6);
const fenderMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.6, metalness: 0.12 });

const fenderFront = new THREE.Mesh(fenderGeo, fenderMat);
fenderFront.position.set(78, 5, 0);
fenderFront.rotation.z = -Math.PI * 0.2;
fenderFront.castShadow = true;
bikeGroup.add(fenderFront);

const fenderBack = new THREE.Mesh(fenderGeo, fenderMat);
fenderBack.position.set(-78, 5, 0);
fenderBack.rotation.z = -Math.PI * 0.2;
fenderBack.castShadow = true;
bikeGroup.add(fenderBack);

// 车架装饰条
const accentGeo = new THREE.CylinderGeometry(5.2, 5.2, 10, 10);
const accent1 = new THREE.Mesh(accentGeo, accentMat);
accent1.position.set(10, 55, 0);
accent1.rotation.z = -0.58;
bikeGroup.add(accent1);

const accent2 = new THREE.Mesh(accentGeo, accentMat);
accent2.position.set(-32, 65, 0);
accent2.rotation.z = 0.38;
bikeGroup.add(accent2);

bikeGroup.position.set(0.5, BIKE_BASE_Y, 0.2);
scene.add(bikeGroup);

// ===== 低多边形白云（缓慢漂浮 + 地面柔和投影） =====
const cloudGroup = new THREE.Group();
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1.0,
  metalness: 0,
  flatShading: true,
  transparent: true,
  opacity: 0.95,
});
const cloudLumpGeo = new THREE.IcosahedronGeometry(1, 0);
const clouds = [];

function createCloud(x, y, z, scale) {
  const cloud = new THREE.Group();
  const lumps = 3 + (Math.random() * 3 | 0);
  for (let i = 0; i < lumps; i++) {
    const mesh = new THREE.Mesh(cloudLumpGeo, cloudMat);
    const r = (0.5 + Math.random() * 0.6) * scale;
    mesh.scale.set(r, r * 0.6, r * 0.85);
    mesh.position.set(
      (Math.random() - 0.5) * scale * 2.4,
      (Math.random() - 0.5) * scale * 0.35,
      (Math.random() - 0.5) * scale * 0.9
    );
    cloud.add(mesh);
  }
  cloud.position.set(x, y, z);
  cloud.userData._speed = 0.4 + Math.random() * 0.6;

  const shadowGeo = new THREE.CircleGeometry(scale * 0.9, 20);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 });
  const shadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
  shadowBlob.rotation.x = -Math.PI / 2;
  shadowBlob.position.set(x, -0.44 + groundHeight(x, z), z);
  cloud.userData._shadowBlob = shadowBlob;
  cloudGroup.add(shadowBlob);

  cloudGroup.add(cloud);
  clouds.push(cloud);
  return cloud;
}

createCloud(-10, 8, -14, 1.3);
createCloud(6, 9.5, -18, 1.6);
createCloud(14, 8, -8, 1.2);
createCloud(-16, 10, -2, 1.4);
createCloud(2, 7.5, -22, 1.1);
createCloud(-6, 11, 14, 1.5);
createCloud(12, 9, 12, 1.0);
scene.add(cloudGroup);

// ===== 低模飞鸟（少量，绕场景缓慢盘旋） =====
const birdGroup = new THREE.Group();
const birdBodyMat = new THREE.MeshStandardMaterial({ color: 0x3a444c, roughness: 0.9, metalness: 0 });
const birdWingMat = new THREE.MeshStandardMaterial({ color: 0x46525c, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
const birds = [];

function createBird(radius, height, speed, phase) {
  const bird = new THREE.Group();

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.36, 5), birdBodyMat);
  body.rotation.z = -Math.PI / 2;
  bird.add(body);

  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), birdBodyMat);
  headM.position.set(0.2, 0.03, 0);
  bird.add(headM);

  const wingGeo = new THREE.PlaneGeometry(0.3, 0.13);
  const wingLeft = new THREE.Mesh(wingGeo, birdWingMat);
  wingLeft.position.set(-0.02, 0.02, 0.09);
  wingLeft.rotation.x = Math.PI / 2;
  bird.add(wingLeft);
  bird.userData._wingLeft = wingLeft;

  const wingRight = new THREE.Mesh(wingGeo, birdWingMat);
  wingRight.position.set(-0.02, 0.02, -0.09);
  wingRight.rotation.x = Math.PI / 2;
  bird.add(wingRight);
  bird.userData._wingRight = wingRight;

  bird.userData._radius = radius;
  bird.userData._height = height;
  bird.userData._speed = speed;
  bird.userData._phase = phase;
  bird.userData._flap = 2.2 + Math.random() * 1.2;

  birdGroup.add(bird);
  birds.push(bird);
  return bird;
}

for (let i = 0; i < 3; i++) {
  createBird(
    8.5 + i * 1.2 + Math.random() * 0.8,
    6.5 + Math.random() * 1.8,
    0.09 + Math.random() * 0.035,
    i * 0.4 + Math.random() * 0.3
  );
}
scene.add(birdGroup);

// ===== 氛围粒子（蒲公英绒毛 + 细小浮尘，淡而缓慢） =====
function makeFluffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  // 伞状绒毛辐条
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 10);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function makeDotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 14);
  g.addColorStop(0, 'rgba(255,250,235,0.9)');
  g.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

function makeParticles(count, size, opacity, color, texture, bounds) {
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const bx = (Math.random() - 0.5) * bounds.x;
    const by = Math.random() * bounds.y + bounds.yMin;
    const bz = (Math.random() - 0.5) * bounds.z;
    base[i * 3] = bx;
    base[i * 3 + 1] = by;
    base[i * 3 + 2] = bz;
    positions[i * 3] = bx;
    positions[i * 3 + 1] = by;
    positions[i * 3 + 2] = bz;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: texture,
    size,
    transparent: true,
    opacity,
    color,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.userData._base = base;
  scene.add(points);
  return points;
}

const fluffParticles = makeParticles(48, 0.16, 0.3, 0xffffff, makeFluffTexture(), { x: 18, y: 4.6, yMin: 0.2, z: 18 });
const dustParticles = makeParticles(130, 0.05, 0.22, 0xfff6e0, makeDotTexture(), { x: 14, y: 3.8, yMin: 0.1, z: 14 });

function driftParticles(points, t, amp) {
  const pos = points.geometry.attributes.position;
  const base = points.userData._base;
  for (let i = 0; i < pos.count; i++) {
    pos.array[i * 3] = base[i * 3] + Math.sin(t * 0.25 + i * 1.3) * amp;
    pos.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.18 + i * 0.9) * amp * 0.7;
    pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.22 + i * 1.1) * amp;
  }
  pos.needsUpdate = true;
}

// ===== 丁达尔光束（含蓄的斜射阳光，加法混合低透明度） =====
function makeBeamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const v = ctx.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(255,250,235,0.9)');
  v.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 128, 256);
  const h = ctx.createLinearGradient(0, 0, 128, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 128, 256);
  return new THREE.CanvasTexture(canvas);
}

const beamTexture = makeBeamTexture();
const beams = [];

function createBeam(x, y, z, w, h, rotY, opacity) {
  const mat = new THREE.MeshBasicMaterial({
    map: beamTexture,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(0.16, rotY, -0.32); // 与太阳方向一致的斜射角度
  mesh.userData._baseOpacity = opacity;
  beams.push(mesh);
  scene.add(mesh);
  return mesh;
}

createBeam(-4.2, 2.6, -1.2, 3.2, 8, 0.4, 0.11);  // 树冠透光
createBeam(2.2, 2.2, 1.2, 2.2, 6.5, -0.3, 0.08); // 自行车侧
createBeam(-6.8, 3.0, -4.2, 2.6, 7, 0.55, 0.07); // 远处补一层

// ===== 远景：平缓小山轮廓 + 低模树林剪影 =====
const hillGeo = new THREE.SphereGeometry(1, 10, 7);
const hillColors = [0xa8b8a8, 0x9cae9e, 0xb2bfae, 0xa3b3a5]; // 低饱和，配合指数雾退到远景
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
  const R = 42 + Math.random() * 10;
  const mat = new THREE.MeshStandardMaterial({
    color: hillColors[i % hillColors.length],
    roughness: 1.0,
    metalness: 0,
    flatShading: true,
  });
  const hill = new THREE.Mesh(hillGeo, mat);
  hill.position.set(Math.cos(a) * R, -0.6, Math.sin(a) * R);
  hill.scale.set(10 + Math.random() * 8, 2.5 + Math.random() * 3, 8 + Math.random() * 6);
  scene.add(hill);
}

const forestConeGeo = new THREE.ConeGeometry(1, 1, 6);
const forestMats = [
  new THREE.MeshStandardMaterial({ color: 0x6f8f75, roughness: 1.0, metalness: 0, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x63836a, roughness: 1.0, metalness: 0, flatShading: true }),
];
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + Math.random() * 0.6;
  const R = 26 + Math.random() * 12;
  const cx = Math.cos(a) * R;
  const cz = Math.sin(a) * R;
  const cluster = 3 + (Math.random() * 3 | 0);
  for (let j = 0; j < cluster; j++) {
    const x = cx + (Math.random() - 0.5) * 4;
    const z = cz + (Math.random() - 0.5) * 4;
    const h = 2 + Math.random() * 1.6;
    const w = 0.7 + Math.random() * 0.6;
    const tree = new THREE.Mesh(forestConeGeo, forestMats[(i + j) % 2]);
    tree.position.set(x, -0.5 + groundHeight(x, z) + h / 2 - 0.1, z);
    tree.scale.set(w, h, w);
    scene.add(tree);
  }
}

// ===== 边角荒芜点缀（枯树干 / 破旧栅栏 / 废弃铁桶，全部在画面边缘，低面数） =====
const deadWoodMat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1.0, metalness: 0, flatShading: true });
const fenceWoodMat = new THREE.MeshStandardMaterial({ color: 0x9c8a72, roughness: 0.95, metalness: 0, flatShading: true });
const rustMat = new THREE.MeshStandardMaterial({ color: 0x96684a, roughness: 0.85, metalness: 0.15, flatShading: true });
const rustDarkMat = new THREE.MeshStandardMaterial({ color: 0x5f4534, roughness: 0.9, metalness: 0.1 });
const innerDarkMat = new THREE.MeshStandardMaterial({ color: 0x35291f, roughness: 1.0, metalness: 0 });

// 枯树干（低模锥柱 + 断枝，微微歪斜）
function createDeadTree(x, z, h, tiltZ, rotY) {
  const g = new THREE.Group();
  const trunkM = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.15, h, 6), deadWoodMat);
  trunkM.position.y = h / 2;
  trunkM.castShadow = true;
  g.add(trunkM);

  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 5), deadWoodMat);
  stub.position.set(0.12, h * 0.62, 0);
  stub.rotation.z = -0.9;
  stub.castShadow = true;
  g.add(stub);

  const stub2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.45, 5), deadWoodMat);
  stub2.position.set(-0.1, h * 0.45, 0.05);
  stub2.rotation.z = 1.0;
  g.add(stub2);

  g.position.set(x, -0.5 + groundHeight(x, z), z);
  g.rotation.set(0, rotY, tiltZ);
  scene.add(g);
  return g;
}

createDeadTree(-8.5, 2.5, 3.1, 0.06, 0.4);
createDeadTree(7.8, -4.6, 2.6, -0.05, 1.2);
createDeadTree(-7.2, -6.6, 2.2, 0.08, 2.1);

// 小段破旧木栅栏（立柱歪斜、横杆错位）
function createFence(x, z, rotY) {
  const g = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.08, 0.78, 0.08);

  const post1 = new THREE.Mesh(postGeo, fenceWoodMat);
  post1.position.set(-0.85, 0.36, 0);
  post1.rotation.z = 0.06;
  post1.castShadow = true;
  g.add(post1);

  const post2 = new THREE.Mesh(postGeo, fenceWoodMat);
  post2.position.set(0.85, 0.33, 0.05);
  post2.rotation.z = -0.1;
  post2.castShadow = true;
  g.add(post2);

  const post3 = new THREE.Mesh(postGeo, fenceWoodMat);
  post3.position.set(0.05, 0.38, -0.04);
  post3.rotation.z = 0.02;
  post3.castShadow = true;
  g.add(post3);

  const rail1 = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.09, 0.05), fenceWoodMat);
  rail1.position.set(-0.05, 0.52, 0.01);
  rail1.rotation.z = 0.035;
  rail1.castShadow = true;
  g.add(rail1);

  const rail2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.05), fenceWoodMat);
  rail2.position.set(0.12, 0.28, 0.03);
  rail2.rotation.z = -0.05;
  rail2.rotation.y = 0.04;
  rail2.castShadow = true;
  g.add(rail2);

  g.position.set(x, -0.5 + groundHeight(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}

createFence(-9.2, -2.6, 0.45);
createFence(8.6, 3.6, -0.6);

// 废弃小铁桶（可立可倒，桶口深色空洞）
function createBarrel(x, z, tipped, rotY) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.34, 9), rustMat);
  body.position.y = 0.17;
  body.castShadow = true;
  g.add(body);

  const band1 = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.012, 4, 12), rustDarkMat);
  band1.rotation.x = Math.PI / 2;
  band1.position.y = 0.24;
  g.add(band1);

  const band2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 4, 12), rustDarkMat);
  band2.rotation.x = Math.PI / 2;
  band2.position.y = 0.1;
  g.add(band2);

  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.15, 9), innerDarkMat);
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = 0.341;
  g.add(mouth);

  if (tipped) {
    g.rotation.set(0, rotY, Math.PI / 2 - 0.12);
    g.position.set(x, -0.5 + groundHeight(x, z) + 0.15, z);
  } else {
    g.rotation.y = rotY;
    g.position.set(x, -0.5 + groundHeight(x, z), z);
  }
  scene.add(g);
  return g;
}

createBarrel(-7.0, 4.9, true, 0.7);
createBarrel(6.4, 5.9, false, 2.3);
createBarrel(5.6, -7.4, true, 1.9);

// ===== COSTA DESIGN 木路牌（场景内 3D 物体，替代 2D 贴屏 UI） =====
const signGroup = new THREE.Group();
{
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x9c8a72, roughness: 0.95, metalness: 0, flatShading: true });
  const plank = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.48, 0.07), plankMat);
  plank.position.y = 0.85;
  plank.rotation.z = -0.02;
  plank.castShadow = true;
  signGroup.add(plank);

  const signPostGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.15, 6);
  const postL = new THREE.Mesh(signPostGeo, fenceWoodMat);
  postL.position.set(-0.62, 0.55, 0);
  postL.castShadow = true;
  signGroup.add(postL);

  const postR = new THREE.Mesh(signPostGeo, fenceWoodMat);
  postR.position.set(0.62, 0.58, 0.02);
  postR.castShadow = true;
  signGroup.add(postR);

  const signTex = createTextTexture('COSTA DESIGN', { fontSize: 96, color: '#4a3826', fontWeight: '900', letterSpacing: 10 });
  const textPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.4),
    new THREE.MeshStandardMaterial({
      map: signTex,
      transparent: true,
      roughness: 0.9,
      metalness: 0,
      emissive: new THREE.Color('#4a3826'),
      emissiveIntensity: 0.06,
    })
  );
  textPlane.position.set(0, 0.85, 0.045);
  textPlane.rotation.z = -0.02;
  signGroup.add(textPlane);

  signGroup.position.set(-6.6, -0.5 + groundHeight(-6.6, 4.8), 4.8);
  signGroup.rotation.y = 0.95;
  scene.add(signGroup);
}

// ===== 3D 悬浮文字（重新布局：高位背景区，避开自行车与人物，低透明度） =====
const titleFrame = createTextPlane('FRAME', { x: -1.0, y: 6.3, z: -9.0 }, {
  fontSize: 190,
  color: '#7d8f7a',
  opacity: 0.5,
  rotation: { x: 0, y: 0.08, z: -0.03 },
  scale: 0.95,
  interactive: true,
  tag: 'frame',
  emissiveIntensity: 0.05,
});

const titleWildness = createTextPlane('WILDNESS', { x: 2.3, y: 5.0, z: -10.0 }, {
  fontSize: 100,
  color: '#8a9a86',
  opacity: 0.5,
  rotation: { x: 0, y: 0.06, z: 0.02 },
  scale: 0.95,
  interactive: true,
  tag: 'wildness',
  emissiveIntensity: 0.05,
});

const tagline = createTextPlane('BEYOND THE RIPPLE', { x: 0.6, y: 7.1, z: -9.5 }, {
  fontSize: 30,
  color: '#9aa88f',
  opacity: 0.45,
  rotation: { x: 0, y: 0.08, z: 0 },
  scale: 1.1,
  interactive: false,
  emissiveIntensity: 0.04,
  letterSpacing: 4,
});

const cnTitle = createTextPlane('框内 · 荒芜', { x: -3.6, y: 1.15, z: 2.8 }, {
  fontSize: 46,
  color: '#7f8f7c',
  opacity: 0.55,
  rotation: { x: 0, y: -0.22, z: 0 },
  scale: 0.9,
  interactive: true,
  tag: 'cn-title',
  emissiveIntensity: 0.05,
});

// ===== 漂浮小方块（只留极少量点缀） =====
const decoCubes = [];
const decoColors = [0xe8d090, 0xc0d8a0];
const decoPositions = [
  { x: 4.2, y: 2.8, z: -2.6 },
  { x: -4.6, y: 3.4, z: 1.9 },
];
decoPositions.forEach((p, i) => {
  const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const mat = new THREE.MeshStandardMaterial({
    color: decoColors[i % decoColors.length],
    transparent: true,
    opacity: 0.35,
    roughness: 0.5,
    metalness: 0.1,
  });
  const cube = new THREE.Mesh(geo, mat);
  cube.position.set(p.x, p.y, p.z);
  cube.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  cube.userData._baseY = p.y;
  decoCubes.push(cube);
  scene.add(cube);
});

// ===== 注册可交互对象 =====
function registerInteractive(mesh, data) {
  mesh.userData.interactive = true;
  mesh.userData.interactiveData = data;
  mesh.userData.baseScale = mesh.scale.x;
  if (!interactiveObjects.includes(mesh)) {
    interactiveObjects.push(mesh);
  }
  return mesh;
}

registerInteractive(titleFrame, {
  title: 'FRAME',
  subtitle: '框',
  description: '在有限的框架内，寻找无限的可能。每一个边界都是另一个故事的开始。',
  tags: ['DESIGN', 'BOUNDARY', 'STRUCTURE'],
});

registerInteractive(titleWildness, {
  title: 'WILDNESS',
  subtitle: '野',
  description: '荒芜即自由。在秩序之外，野蛮生长的力量从未停歇。',
  tags: ['NATURE', 'FREEDOM', 'POWER'],
});

registerInteractive(cnTitle, {
  title: '框内 · 荒芜',
  subtitle: 'CONFINED WILDNESS',
  description: '中英结合的设计理念，框中即世界，荒野在此间。',
  tags: ['CROSS CULTURE', 'TYPOGRAPHY'],
});

registerInteractive(bikeGroup, {
  title: 'VINTAGE BICYCLE',
  subtitle: '复古自行车',
  description: '手工搭建的精细3D模型——车架、辐条、链条、挡泥板、皮革座垫，每个细节都承载着旧时光的温度。点击让车轮转起来！',
  tags: ['MODEL', 'GEOMETRY', 'RETRO'],
});

registerInteractive(treeGroup, {
  title: 'OLD TREE',
  subtitle: '老树 · 时间的守望者',
  description: '这棵老树不知在这里站了多久。粗糙的树皮上刻满了风雨的痕迹，每一道裂纹都是一段被遗忘的故事。春去秋来，它不动声色地抽芽、落叶，再抽芽、再落叶。枝桠向天空伸展，像是在触碰什么又像是在告别什么。树冠如伞，过滤着阳光，在地面上洒下斑驳碎金。风来时，叶子沙沙作响，像在低语，又像在轻笑。树根深扎泥土，沉默而坚定——它见过无数个黄昏，也会见证无数个黎明。树下的人靠着它，像靠着一整个缓慢而温柔的世界。',
  tags: ['NATURE', 'SHELTER', 'TIME', 'WISDOM', 'ROOTS'],
});

registerInteractive(personGroup, {
  title: 'THE DREAMER',
  subtitle: '树下的人 · 时间的旅人',
  description: '他就这样坐着，一只腿伸直，一只腿弯曲，双手随意搭在膝盖上。没有手机，没有目的，没有要去的地方。眼睛半闭半睁，看着远处那辆自行车发了会儿呆，又抬头数了数天上飘过的云——一朵、两朵、三朵，数到第四朵的时候忘了前面数到哪了，于是从头再来。飞鸟排着队从头顶掠过，他想：它们要去哪里呢？算了，不关我事。风拂过脸颊，带着青草和泥土的气息，他深吸一口气，感觉整个世界都慢了下来。这一刻，时间不是敌人，焦虑是别人的事。他只是一个坐在树下的、什么也不赶的人。',
  tags: ['PEACE', 'REST', 'DAYDREAM', 'SLOW LIFE', 'MINDFULNESS'],
});

registerInteractive(signGroup, {
  title: 'COSTA DESIGN',
  subtitle: '荒野路牌',
  description: '不知是谁在这片荒野边缘立了块木牌。字迹被雨水冲淡了些，但仍能认得出——像是在宣告什么，又像只是某个路过的人随手留下的记号。',
  tags: ['SIGN', 'WILDERNESS', 'TRACE'],
});

// 自行车骑行状态
let bikeRiding = false;
let bikeRideSpeed = 0;

// ===== 射线拾取 =====
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredObject = null;
let selectedObject = null;

function getInteractiveObjects() {
  const all = [];
  interactiveObjects.forEach(obj => {
    all.push(obj);
    if (obj.children) {
      obj.traverse(child => {
        if (child.isMesh) all.push(child);
      });
    }
  });
  return all;
}

function onPointerMove(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(getInteractiveObjects(), false);

  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj && !obj.userData.interactive) {
      obj = obj.parent;
    }
    if (obj && obj.userData.interactive) {
      if (hoveredObject !== obj) {
        resetHover(hoveredObject);
        hoveredObject = obj;
        applyHover(hoveredObject);
      }
      document.body.style.cursor = 'pointer';
    } else {
      if (hoveredObject) {
        resetHover(hoveredObject);
        hoveredObject = null;
      }
      document.body.style.cursor = 'default';
    }
  } else {
    if (hoveredObject) {
      resetHover(hoveredObject);
      hoveredObject = null;
    }
    document.body.style.cursor = 'default';
  }
}

function applyHover(obj) {
  if (!obj) return;
  obj.userData._hovered = true;
  if (obj.material && obj.material.emissive) {
    if (obj.userData._origEmissiveIntensity === undefined) {
      obj.userData._origEmissiveIntensity = obj.material.emissiveIntensity;
    }
    obj.material.emissiveIntensity = Math.max(obj.userData._origEmissiveIntensity, 0.4);
  }
}

function resetHover(obj) {
  if (!obj) return;
  obj.userData._hovered = false;
  if (obj.material && obj.material.emissive && obj.userData._origEmissiveIntensity !== undefined) {
    obj.material.emissiveIntensity = obj.userData._origEmissiveIntensity;
  }
}

function onClick(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(getInteractiveObjects(), false);

  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj && !obj.userData.interactive) {
      obj = obj.parent;
    }
    if (obj && obj.userData.interactive && obj.userData.interactiveData) {
      if (obj === bikeGroup) {
        bikeRiding = !bikeRiding;
        showDetailPanel({
          title: bikeRiding ? 'RIDING!' : 'STOPPED',
          subtitle: bikeRiding ? '骑行中' : '已停下',
          description: bikeRiding
            ? '车轮飞转，风在耳边呼啸——点击自行车再次停下。'
            : '静止如初——点击自行车让它跑起来。',
          tags: bikeRiding ? ['RIDING', 'WHEELS SPINNING'] : ['STOPPED', 'CLICK TO RIDE'],
        });
        selectedObject = obj;
        return;
      }
      showDetailPanel(obj.userData.interactiveData);
      selectedObject = obj;
      return;
    }
  }
  hideDetailPanel();
  selectedObject = null;
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('click', onClick);

// ===== 详情弹窗 =====
const detailPanel = document.getElementById('detailPanel');
const detailContent = document.getElementById('detailContent');
const detailClose = document.getElementById('detailClose');

function showDetailPanel(data) {
  if (!data) return;
  detailContent.innerHTML = `
    <h2>${data.title}</h2>
    <p><em style="color:#6a8a5a; letter-spacing:3px; font-size:13px;">${data.subtitle}</em></p>
    <p style="margin-top:16px; line-height:1.9;">${data.description}</p>
    <div style="margin-top:16px;">
      ${data.tags.map(t => `<span class="tag">${t}</span>`).join('')}
    </div>
  `;
  detailPanel.classList.add('active');
}

function hideDetailPanel() {
  detailPanel.classList.remove('active');
}

detailClose.addEventListener('click', hideDetailPanel);

// ===== 动画循环 =====
let animTime = 0;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  animTime += dt;
  windTime.value = animTime;

  // 人物呼吸
  torso.scale.y = 1 + Math.sin(animTime * 1.5) * 0.015;
  head.position.y = head.userData._baseY + Math.sin(animTime * 1.5) * 0.006;

  // 云朵缓慢漂浮 + 投影跟随
  clouds.forEach(cloud => {
    cloud.position.x += cloud.userData._speed * dt * 0.3;
    if (cloud.position.x > 30) cloud.position.x = -30;
    const blob = cloud.userData._shadowBlob;
    blob.position.x = cloud.position.x;
    blob.position.z = cloud.position.z;
    blob.position.y = -0.44 + groundHeight(blob.position.x, blob.position.z);
    const s = 1 + Math.sin(animTime * 0.5 + cloud.position.x) * 0.1;
    blob.scale.setScalar(s);
  });

  // 飞鸟盘旋飞行 + 扇翅
  birds.forEach(bird => {
    const a = bird.userData._phase + animTime * bird.userData._speed;
    const R = bird.userData._radius;
    bird.position.set(
      Math.cos(a) * R,
      bird.userData._height + Math.sin(animTime * 0.6 + bird.userData._phase * 3) * 0.35,
      Math.sin(a) * R
    );
    bird.rotation.y = -(a + Math.PI / 2);
    bird.rotation.z = 0.12;
    const flap = Math.sin(animTime * bird.userData._flap + bird.userData._phase) * 0.55;
    bird.userData._wingLeft.rotation.y = flap;
    bird.userData._wingRight.rotation.y = -flap;
  });

  // 氛围粒子缓慢飘动
  driftParticles(fluffParticles, animTime, 1.3);
  driftParticles(dustParticles, animTime, 0.5);

  // 丁达尔光束轻微呼吸
  beams.forEach((beam, i) => {
    beam.material.opacity = beam.userData._baseOpacity * (0.85 + 0.15 * Math.sin(animTime * 0.4 + i * 1.7));
  });

  // 漂浮小方块
  decoCubes.forEach((cube, i) => {
    cube.rotation.x += 0.004;
    cube.rotation.y += 0.006;
    cube.position.y = cube.userData._baseY + Math.sin(animTime * 0.8 + i * 0.9) * 0.12;
  });

  // 文字/物体悬停缩放
  interactiveObjects.forEach(obj => {
    if (obj.userData._hovered && obj.userData.baseScale !== undefined) {
      const s = obj.userData.baseScale * 1.08;
      obj.scale.lerp(new THREE.Vector3(s, s, s), 0.12);
    } else if (obj.userData.baseScale !== undefined) {
      const s = obj.userData.baseScale;
      obj.scale.lerp(new THREE.Vector3(s, s, s), 0.12);
    }
  });

  // 自行车骑行动画
  if (bikeRiding) {
    bikeRideSpeed = Math.min(bikeRideSpeed + dt * 0.18, 0.15);
  } else {
    bikeRideSpeed = Math.max(bikeRideSpeed - dt * 0.3, 0);
  }

  if (bikeRideSpeed > 0) {
    frontWheel.rotation.z -= bikeRideSpeed;
    backWheel.rotation.z -= bikeRideSpeed;
    crankGroup.rotation.z -= bikeRideSpeed * 0.4;
    bikeGroup.position.y = BIKE_BASE_Y + Math.sin(animTime * 8) * 0.02 * (bikeRideSpeed / 0.15);
    bikeGroup.rotation.z = Math.sin(animTime * 3) * 0.01 * (bikeRideSpeed / 0.15);
  } else {
    bikeGroup.position.y = BIKE_BASE_Y;
    bikeGroup.rotation.z = 0;
  }

  controls.update();
  renderer.render(scene, camera);
}

// ===== 窗口自适应 =====
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== 隐藏加载器 =====
setTimeout(() => {
  const loader = document.getElementById('loader');
  if (loader) loader.classList.add('hidden');
}, 600);

// ===== 操作提示：加载完成后短暂显示，数秒后自动淡出 =====
setTimeout(() => {
  const hint = document.getElementById('hint');
  if (hint) hint.classList.add('fade-out');
}, 5000);

animate();
