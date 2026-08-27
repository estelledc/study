---
title: A-Frame — 用 HTML 搭 Web VR 场景
来源: 'https://github.com/aframevr/aframe'
日期: 2026-07-09
分类: graphics
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/aframevr/aframe
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 77f0513107e00e4738628a2ca8e8f19a38474857
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.8.0
---

## 是什么

A-Frame 是一份用自定义元素写浏览器 3D / AR / VR 场景的框架。日常类比：`<a-scene>` 像一张舞台清单，`<a-box>` 是道具，`geometry` / `material` / `position` 是可拆零件——你先声明实体，再让运行时把它变成 three 场景图。

```html
<script src="https://aframe.io/releases/1.8.0/aframe.min.js"></script>
<a-scene>
  <a-box position="-1 0.5 -3" rotation="0 45 0" color="#4CC3D9"></a-box>
  <a-sky color="#ECECEC"></a-sky>
</a-scene>
```

固定 `1.8.0` 把 `AFRAME` 挂到 `globalThis`，并把 `THREE` 暴露出去。`package.json` 里的 `three` 依赖实际解析为 `npm:super-three@0.184.0`；入口日志写的是 supermedium/three.js，不是任意上游 three 发行版。

## 为什么重要

不按固定源码读 A-Frame，下面这些事会对不上：

- 为什么看起来像 HTML 的标签并不走 CSS 排版，而是 `THREE.Group` / `THREE.Scene`
- 为什么自定义逻辑要写成 `registerComponent`，而不是在页面末尾直接改 DOM
- 为什么“桌面能看”和“`enterVR()` 进 immersive-vr”是两条入口
- 为什么 glTF 压缩路径写在 **scene 上的 system**，不是写在每个 `gltf-model` 组件里

## 核心要点

固定版本可以拆成四层：

1. **声明式实体**：`<a-entity>` 的 `object3D` 是 `THREE.Group`（`rotation.order = 'YXZ'`）。`<a-box>` 这类 primitive 只是自动注册的标签，默认带上 `geometry.primitive = box`，再由 mesh mixin 补 material。
2. **ECS 注册表**：`registerComponent(name, definition)` 把 `init` / `update` / `tick` / `tock` / `play` / `pause` 收成原型。名字不能含大写或 `__`（`__` 留给 `name__id` 多实例）。object-based 组件用对象池，属性经 `Proxy` 读写。
3. **场景主循环**：`<a-scene>` 的 `object3D` 是 `THREE.Scene`。默认会挂 `inspector`、`keyboard-shortcuts`、`screenshot`、`xr-mode-ui`、`device-orientation-permission-ui`；camera system 先于其他 system 初始化。`render` 用 `THREE.Timer` 算 `time`/`delta`，先 `tick`，再 `renderer.render`，最后 `tock`。`ar-mode` 会暂时清掉 scene background。
4. **WebXR 入口**：有 headset / mobile 且 WebXR 可用时，`enterVR()` 调 `navigator.xr.requestSession('immersive-vr')`（`enterAR()` 走 `immersive-ar`）。桌面无 headset 只加 fullscreen。`sessiongranted` 也会触发 `enterVR()`。

## 实践示例

### 案例 1：最小场景

官方 README 的几何体示例在固定 1.8.0 仍然有效。脚本应放在 `<head>` 且早于 `<a-scene>`，否则未注册的组件会在初始化时缺失。`file:` 协议会直接报 CORS，资源加载失败。

### 案例 2：凝视点击是合成事件

```html
<script>
  AFRAME.registerComponent('color-on-click', {
    init: function () {
      this.el.addEventListener('click', () => {
        this.el.setAttribute('material', 'color', '#4CC3D9');
      });
    }
  });
</script>
<a-scene>
  <a-box class="clickable" position="0 1 -3" color="#EF2D5E" color-on-click></a-box>
  <a-camera>
    <a-entity cursor="fuse: true; fuseTimeout: 700"
              raycaster="objects: .clickable"></a-entity>
  </a-camera>
</a-scene>
```

`cursor` 依赖 `raycaster`。默认 `fuse` 只在 `utils.device.isMobile()` 为真时打开，`fuseTimeout` 默认 1500ms；上面是显式覆盖。命中后发出的是 A-Frame 合成的 `click` / `mouseenter`，不是浏览器直接点中网格。`raycaster.objects` 为空时会 `querySelectorAll('*')`，源码自己警告应写选择器。

### 案例 3：glTF 与压缩解码器

```html
<a-scene gltf-model="meshoptDecoderPath: https://unpkg.com/meshoptimizer@0.19.0/meshopt_decoder.js;">
  <a-assets timeout="5000">
    <a-asset-item id="robot" src="/models/robot.glb"></a-asset-item>
  </a-assets>
  <a-entity gltf-model="#robot" position="0 0 -4"></a-entity>
</a-scene>
```

`<a-assets>` 必须是 scene 子节点；默认 timeout 3000ms，超时仍会放行并 `emit('timeout')`。`gltf-model` **组件**用 `GLTFLoader`，把 `gltf.scene` 挂到 `setObject3D('mesh')`，并把 `animations` 拷到该 scene。Draco / Meshopt / KTX2 由同名 **system** 配置：Draco 默认 `gstatic` 1.5.7 路径，Meshopt 默认空字符串，不设路径就不会装解码器。核心仓没有 `animation-mixer`；要播骨骼动画需另找 extras，不能写成 1.8.0 内置能力。

## 踩过的坑

1. **把 A-Frame 当 CSS 排版**：坐标、旋转、尺度走 three 变换，不走文档流。
2. **组件脚本写在 scene 后面**：`registerComponent` 会警告，实体初始化时该属性还不存在。
3. **默认 fuse 当成桌面也开**：桌面默认关；要凝视点击必须显式 `fuse: true`。
4. **raycaster 不写 `objects`**：空选择器扫全场景，源码认为这是性能坑。
5. **把 `three` 当成官方 mrdoob 发行**：固定包锁的是 `super-three@0.184.0`。

## 适用 vs 不适用场景

**适用**：

- 希望用 HTML / 自定义元素快速搭 WebXR 或桌面 3D 原型
- 需要把交互写成可复用 component，而不是散落的全局脚本
- 已经接受 three 场景图，只想少写 renderer / camera / XR session 样板

**不适用**：

- 需要完全自管渲染管线、后处理和 GPU 资源生命周期
- 把 AAA 世界流式加载或复杂物理写成 A-Frame 内置合同——核心仓没有这些
- 把未运行的帧率、面数或 star 数当选型结论
- 依赖 `animation-mixer` 却不单独固定 extras 仓库

## 固定版本边界

- 本文绑定 `aframevr/aframe@77f0513107e00e4738628a2ca8e8f19a38474857`，包版本 `1.8.0`。lightweight tag 与 npm `gitHead` 一致。
- `three` 别名为 `super-three@0.184.0`；未验证该 fork 与官方 three r184 的差异清单。
- 未安装依赖、未跑 Karma、未进入 WebXR、未加载真实 glTF，状态保持 `UNVERIFIED`。

## 学到什么

1. **HTML 标签是 entity 容器，真实对象是 three 场景图**。
2. **组件注册有时序**：脚本必须早于 scene，名字必须小写。
3. **交互是 raycaster + cursor 合成的，不是 DOM 点击网格**。
4. **压缩 glTF 的解码器是 scene system，不是模型组件自己下载**。

## 应用型自测

1. 固定 1.8.0 的 `three` 依赖是官方 `three@0.184.0` 吗？
2. 桌面浏览器上 `<a-entity cursor>` 会默认开启 fuse 点击吗？
3. `gltf-model="meshoptDecoderPath: ..."` 写在实体上还是 scene 上才由固定源码读取？

检查点：

1. 不是。`package.json` 写的是 `npm:super-three@0.184.0`。
2. 不会。`fuse` 默认等于 `utils.device.isMobile()`。
3. 写在 `<a-scene>` 上。那是 `gltf-model` **system** 的 schema，组件本身只收模型 URL。

## 延伸阅读

- 文档：[A-Frame 1.8.0 Introduction](https://aframe.io/docs/1.8.0/introduction/)
- 固定源码：[aframevr/aframe](https://github.com/aframevr/aframe) —— 本文绑定提交 `77f0513107e00e4738628a2ca8e8f19a38474857`
- [[threejs]] —— 场景图与 renderer；A-Frame 固定的是 super-three 别名
- [[gltf-transform]] —— 进浏览器前的 glTF 压缩，与 Meshopt 解码路径是两条合同

## 关联

- [[threejs]] —— 实体底下的 Object3D / 渲染器
- [[gltf-transform]] —— 资产压缩，不替代运行时 decoder path
- [[cannon-es]] —— 需要物理时另接；核心仓无内置物理
- [[playcanvas]] —— 同为 Web 3D，但是编辑器 + 引擎，不是 HTML primitive
- [[phaser]] —— 2D 游戏入口，对照平面互动与空间互动
- [[blender]] —— 建模导出 glTF，A-Frame 只负责加载与交互

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ar-js]] —— AR.js — 浏览器里跑 Web AR 标记追踪
- [[freecad]] —— FreeCAD — 参数化 CAD
- [[mind-ar-js]] —— MindAR — 不装原生 SDK 的浏览器图像/人脸 AR
