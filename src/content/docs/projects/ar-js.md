---
title: AR.js — Web AR 标记追踪
来源: https://github.com/AR-js-org/AR.js
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 初级
---

## 是什么

AR.js（[AR-js-org/AR.js](https://github.com/AR-js-org/AR.js)）是一套**纯浏览器端**的 Web AR 库，在网页里用摄像头做 **标记追踪（Marker Tracking）**、**图像追踪（NFT / Image Tracking）** 和 **基于位置的 AR（Location-based AR）**。底层用 **jsartoolkit5** 做视觉跟踪，渲染层可选 **A-Frame**（声明式 HTML）或 **three.js**（命令式 API）。日常类比：想象你在桌上贴一张「魔法贴纸」（黑白 fiducial 标记），手机摄像头对准贴纸，屏幕上就在贴纸上「长」出一只恐龙或一段说明文字——AR.js 负责认出贴纸在画面里的位置和朝向，把你的 3D 内容钉在上面；用户移动手机时，虚拟物体跟着贴纸一起动，就像真的摆在桌上一样。

和需要下载 App 的 ARKit / ARCore 不同，AR.js **零安装**：一个 `.html` + CDN 脚本 + HTTPS 本地服务器，Chrome / Safari 移动端即可跑通。官方 README 强调在手机上也能保持较高帧率，适合展览传单、增强图书、扫码营销等「发链接就能试」的场景。若你要追踪**自然印刷图**（海报、包装盒）而非专用黑白标记，同生态里的 [MindAR](mind-ar-js.md) 往往更合适；AR.js 的强项是 **fiducial marker、条形码式 matrix marker、GPS 定位 AR**，且仍是 Web 上 marker / location 路线最成熟的开源方案之一。

```html
<!-- 最小 marker 骨架：Hiro 预设标记 + 红色立方体 -->
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
    <script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js"></script>
  </head>
  <body style="margin: 0; overflow: hidden;">
    <a-scene embedded arjs>
      <a-marker preset="hiro">
        <a-box position="0 0.5 0" material="color: #EF2D5E"></a-box>
      </a-marker>
      <a-entity camera></a-entity>
    </a-scene>
  </body>
</html>
```

打印 [Hiro 标记图](https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/hiro.png)，用 `npx serve .` 起本地 HTTP，手机浏览器打开页面并对准标记，即可看到立方体「贴」在纸上。

## 为什么重要

不了解 AR.js，下面这些事在 Web 侧很难低成本落地：

- **黑白标记增强现实**：教材、博物馆导览、工业维修手册——每个标记 ID 对应不同 3D 说明，无需训练神经网络
- **多标记独立追踪**：同一场景里 Hiro、Kanji、自定义 pattern、barcode 并存，各自挂不同内容（官方多标记示例）
- **GPS 户外 AR**：结合 `gps-camera` / `gps-entity-place`，在真实经纬度上放置 POI 气泡，做城市导览或 LBS 游戏
- **与 A-Frame 无缝衔接**：已有 [A-Frame](aframe.md) 经验的人，加一行 `arjs` 属性就能把 VR 场景变成 AR 场景
- **版本与依赖清晰**：AR.js 3.4.7 要求 A-Frame 1.6.0；脚本按能力拆分（仅 marker、含 NFT、仅 location），避免整包过大

## 核心概念

### 1. 三种 AR 模式（选脚本即选能力）

| 能力 | 典型脚本 | 场景属性 / API | 适用场景 |
|------|----------|----------------|----------|
| Marker 追踪 | `aframe/build/aframe-ar.js` | `<a-scene arjs>` + `<a-marker>` | 黑白 fiducial、条形码 matrix |
| Image 追踪 (NFT) | 含 NFT 的 aframe-ar 构建 | `nft` 相关组件 | 自然图像（与 MindAR 竞争） |
| Location AR | `aframe/build/aframe-ar-location.js` | `gps-camera`、`gps-entity-place` | 户外 GPS 锚点 |

入门建议：**先只引 marker 版** `aframe-ar.js`，文档与示例最多，排错路径最短。

### 2. `<a-marker>` — 虚拟内容的「锚点」

`<a-marker>` 是 A-Frame 实体：当摄像头画面里检测到对应标记时，该实体及其子节点的位姿与真实标记对齐。子实体坐标**相对标记中心**，单位米；`size` 属性定义标记物理边长（默认约 1），影响子物体缩放感。

常用属性（摘自[官方 Marker Based 文档](https://ar-js-org.github.io/AR.js-Docs/marker-based/)）：

| 属性 | 含义 |
|------|------|
| `preset="hiro"` / `kanji` | 内置图案，免生成 `.patt` |
| `type="pattern"` + `url` | 自定义 pattern 文件 |
| `type="barcode"` + `value` | 矩阵码 ID（需场景开启 barcode 检测） |
| `emitevents` | 为 `true` 时触发 `markerFound` / `markerLost` |
| `smooth` / `smoothCount` / `smoothTolerance` | 抑制抖动，代价是跟随略滞后 |

### 3. 两种相机模式：modelView vs cameraTransform

- **modelView（默认，多标记推荐）**：相机逻辑固定在原点看向 -Z，**移动的是标记实体**。多个 `<a-marker>` 可独立追踪，适合「桌上同时摆几张卡」。
- **cameraTransform（`<a-marker-camera>`）**：**移动的是相机**，标记不动。直觉上像「举着手机绕标记走」，但**无法**可靠处理多个独立标记。快速 demo 可用 `preset="hiro"` 的 marker-camera 一行搞定。

### 4. three.js 层：THREEx 三件套

不用 A-Frame 时，AR.js 暴露 `THREEx`（或 ES module 的 `ArToolkitSource` / `ArToolkitContext` / `ArMarkerControls`）：

1. **ArToolkitSource**：图像来源（webcam / video / image）
2. **ArToolkitContext**：jsartoolkit5 引擎，检测标记位姿
3. **ArMarkerControls**：把 three.js 物体绑到标记上

适合已有 Three 渲染管线、不想引入 A-Frame 的项目。

### 5. 自定义 Pattern 标记

除 Hiro / Kanji 外，可用 [AR.js Marker Training](https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html) 上传**黑框内的图案**（须保留宽黑边），生成 `.patt` 文件，再以 `type="pattern" patternUrl="..."` 引用。图案对比度要高、不宜太对称，否则识别率下降。

### 6. 运行环境约束

- **必须 HTTPS 或 localhost**：`getUserMedia` 要求安全上下文；`file://` 无法调摄像头
- **版本对齐**：A-Frame 1.6.0 ↔ AR.js 3.4.7（见官方 Docs）
- **光照与打印**：标记需平整、光线充足；反光塑封会降低跟踪稳定性

## 实践案例

### 案例 1：多标记场景 — 预设 + 自定义 pattern + 条形码

同一页面三种标记，各挂不同颜色立方体（模式为 modelView，末尾加普通 `<a-entity camera>`）：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
    <script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js"></script>
  </head>
  <body style="margin: 0; overflow: hidden;">
    <a-scene
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;">

      <!-- 自定义 pattern：需先用 Marker Training 生成 my-marker.patt -->
      <a-marker type="pattern" url="./my-marker.patt" emitevents="true" id="customMarker">
        <a-box position="0 0.5 0" material="color: red;"></a-box>
      </a-marker>

      <!-- 内置 Hiro -->
      <a-marker preset="hiro" emitevents="true" id="hiroMarker">
        <a-box position="0 0.5 0" material="color: green;"></a-box>
      </a-marker>

      <!-- 条形码 matrix，value 为码 ID -->
      <a-marker type="barcode" value="5" emitevents="true" id="barcodeMarker">
        <a-box position="0 0.5 0" material="color: blue;"></a-box>
      </a-marker>

      <a-entity camera></a-entity>
    </a-scene>

    <script>
      document.querySelector('#customMarker').addEventListener('markerFound', () => {
        console.log('自定义标记入画');
      });
      document.querySelector('#hiroMarker').addEventListener('markerLost', () => {
        console.log('Hiro 丢失');
      });
    </script>
  </body>
</html>
```

**要点**：

- `detectionMode: mono_and_matrix` 与 `matrixCodeType` 为 barcode 追踪所必需
- `emitevents="true"` 才能监听 `markerFound` / `markerLost`，用于 UI 提示或埋点
- 每个 `<a-marker>` 子树互不影响，适合「一张桌布多张卡」的教学场景

### 案例 2：glTF 模型 + 平滑追踪 + marker-camera 快速模式

在 Hiro 上叠 glTF 恐龙，并开启平滑减少抖动：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
    <script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js"></script>
  </head>
  <body style="margin: 0; overflow: hidden;">
  <!-- 方式 A：多标记 / 扩展用 modelView -->
    <a-scene embedded arjs="sourceType: webcam;">
      <a-marker
        preset="hiro"
        smooth="true"
        smoothCount="8"
        smoothTolerance="0.01"
        smoothThreshold="2">
        <a-entity
          position="0 0 0"
          scale="0.05 0.05 0.05"
          gltf-model="https://raw.githack.com/AR-js-org/AR.js/master/aframe/examples/image-tracking/nft/trex/scene.gltf"
          animation="property: rotation; to: 0 360 0; loop: true; dur: 8000; easing: linear">
        </a-entity>
      </a-marker>
      <a-entity camera></a-entity>
    </a-scene>

  <!-- 方式 B：单标记极简 demo 可改用一行 marker-camera（二选一，勿同时用）
    <a-scene embedded arjs>
      <a-marker-camera preset="hiro"></a-marker-camera>
      <a-box position="0 0.5 0" material="color: yellow;"></a-box>
    </a-scene>
  -->
  </body>
</html>
```

**要点**：

- `scale="0.05"` 因 glTF 单位往往很大，需按模型实际尺寸微调
- `smooth*` 参数在手持抖动明显时值得调；展览固定支架可关掉以降低延迟
- 跨域 glTF 若加载失败，需自建静态服务器或 CORS 代理（官方示例注释中有说明）

### 案例 3（进阶）：three.js + ES Module 最小管线

A-Frame 不满足时，可用 3.4.6+ 的 import map（摘自[官方 New Import Syntax](https://ar-js-org.github.io/AR.js/)）：

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js",
    "threex": "https://raw.githack.com/AR-js-org/AR.js/master/three.js/build/ar-threex.mjs"
  }
}
</script>
<script type="module">
import * as THREE from 'three';
import { ArToolkitSource, ArToolkitContext, ArMarkerControls } from 'threex';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
scene.add(camera);

const arSource = new ArToolkitSource({ sourceType: 'webcam' });
const arContext = new ArToolkitContext({
  detectionMode: 'mono',
  canvasWidth: 640,
  canvasHeight: 480,
});
const markerControls = new ArMarkerControls(arContext, camera, {
  type: 'pattern',
  patternUrl: 'https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/data/patt.hiro',
});

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial()
);
mesh.position.y = 0.5;
markerControls.object3d.add(mesh);
scene.add(markerControls.object3d);

arSource.init(() => {
  arSource.onResize(renderer, camera);
  arContext.init(() => {
    camera.projectionMatrix.copy(arContext.getProjectionMatrix());
    renderer.setAnimationLoop(() => {
      arContext.update(arSource.domElement);
      renderer.render(scene, camera);
    });
  });
});
</script>
```

**要点**：`ArToolkitContext.update` 每帧喂入视频帧；`getProjectionMatrix()` 把相机内参同步到 Three 相机，否则虚拟物体「飘」。

## 与 MindAR 怎么选

| 维度 | AR.js | MindAR |
|------|-------|--------|
| 锚点类型 | 黑白 fiducial、barcode、GPS | 自然图像、人脸 |
| 标记准备 | 打印 Hiro / 生成 `.patt` | 编译 `.mind` 目标图 |
| 典型场景 | 图书页码、工单标签、户外 POI | 海报扫码、试戴滤镜 |
| 底层 | jsartoolkit5 | TensorFlow.js |

两者可并存于不同页面；同一产品里「专用 AR 卡」用 AR.js，「扫商品包装」用 MindAR 往往更省心。

## 常见问题

1. **摄像头黑屏**：检查是否 HTTPS / localhost；iOS Safari 需用户授权；部分浏览器要求用户手势后才能 `play()` 视频
2. **标记检测不到**：提高环境光、标记占画面比例、避免运动模糊；确认 `patternUrl` 路径 200 可访问
3. **模型太大/太小**：调 `<a-marker size="...">` 与子实体 `scale`；glTF 用 [gltf-transform](gltf-transform.md) 预先归一化
4. **多标记时只有一个动**：误用了 `<a-marker-camera>`，改回 `<a-marker>` + `<a-entity camera>`
5. **抖动严重**：`smooth="true"` 并增大 `smoothCount`；或从物理上固定手机支架

## 学习路径

1. **跑通 Hiro demo**：打印标记 + `npx serve .` + 手机扫码
2. **读 Marker Based 文档**：弄清 pattern / barcode / preset 与事件 API
3. **做自定义品牌标记**：Marker Training → `.patt` → 贴到宣传物料
4. **按需扩展**：Location AR 教程（[AR.js Docs — Location Based](https://ar-js-org.github.io/AR.js-Docs/location-based/)）、或 three.js THREEx 接入已有场景
5. **对照 A-Frame 笔记**：组件、动画、`gltf-model` 与 [A-Frame 交互](aframe.md) 章节通用

## 延伸阅读

- 官方文档：[AR.js Documentation](https://ar-js-org.github.io/AR.js-Docs/)
- Marker 生成：[Marker Training Tool](https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html)
- 仓库示例：`aframe/examples/`、`three.js/examples/`
- 相关笔记：[A-Frame](aframe.md)、[MindAR](mind-ar-js.md)、[three.js 生态 glTF 工具](gltf-transform.md)
