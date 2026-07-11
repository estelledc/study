---
title: AR.js — 浏览器里跑 Web AR 标记追踪
来源: 'https://github.com/AR-js-org/AR.js'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

AR.js 是一个把**增强现实体验放进普通网页**里的开源库。日常类比：你把透明贴纸贴在手机摄像头画面上，贴纸不会乱飘，而是跟着某张图、某个黑白标记，或某个真实地理位置站住。

它解决的不是“怎么建 3D 模型”，而是“浏览器看到现实世界后，怎么知道内容该贴在哪里”。AR.js 把摄像头画面交给追踪器分析，再让 A-Frame 或 Three.js 把 3D 内容画在正确位置。

最小例子可以很短：打开网页、允许摄像头、扫 Hiro 标记，一只盒子就能浮在纸上。

```html
<script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
<script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js"></script>
<a-scene embedded arjs>
  <a-marker preset="hiro">
    <a-box color="tomato" position="0 0.5 0"></a-box>
  </a-marker>
  <a-entity camera></a-entity>
</a-scene>
```

读法：`a-scene` 是舞台，`a-marker` 是锚点，`a-box` 是要贴上去的内容，`camera` 代表用户手机的摄像头视角。

## 为什么重要

不理解 AR.js，下面这些事都很难解释：

- 为什么一个二维码海报能直接变成 AR 入口，不需要用户先安装 App。
- 为什么 marker tracking 很稳，但必须印一个规则标记；image tracking 更自然，但更吃手机算力。
- 为什么 location AR 看起来“贴在街角”，但北向、GPS 精度和 HTTPS 权限会决定体验好坏。
- 为什么 Web AR 的工程重点经常不是 3D，而是摄像头权限、资源加载、CORS 和移动端性能。

## 核心要点

1. **锚点先行**：AR.js 先回答“内容挂在哪里”。类比：挂画前先找墙上的钉子；marker、图片特征、经纬度就是三种钉子。

2. **渲染交给熟人**：AR.js 自己不做完整游戏引擎，它把追踪结果交给 A-Frame 或 Three.js。类比：导航软件告诉你方向，真正开车的人还是司机。

3. **网页约束是真成本**：手机浏览器要 HTTPS、用户授权摄像头和定位，还要 WebGL/WebRTC 可用。类比：店铺开在商场里，客流大，但必须遵守商场的门禁和消防规则。

AR.js 的价值在于把“识别现实世界”和“浏览器 3D 展示”接起来，让一个静态站点也能做轻量 AR。

## 实践案例

### 案例 1：展会卡片扫标记，弹出 3D 产品

真实场景：线下展会、课程卡片、说明书封面印一个 Hiro 或自定义 pattern marker。用户扫纸卡，网页把产品模型放在卡片上方。

```html
<script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
<script src="https://raw.githack.com/AR-js-org/AR.js/3.4.8/aframe/build/aframe-ar.js"></script>
<body style="margin:0; overflow:hidden">
  <a-scene embedded arjs="sourceType: webcam; debugUIEnabled: false;">
    <a-marker preset="hiro" smooth="true" smooth-count="5">
      <a-entity gltf-model="/models/product.glb" scale="0.2 0.2 0.2"></a-entity>
    </a-marker>
    <a-entity camera></a-entity>
  </a-scene>
</body>
```

逐部分解释：

- `aframe-ar.js` 是 marker/location 版本，不要和 NFT 版本同时引入。
- `preset="hiro"` 让你先用官方 Hiro 图测试，稳定后再换自定义 `.patt`。
- `smooth` 会让模型少抖一点，但数值越大，跟随真实纸卡的反应越慢。
- 本地预览不要直接双击 HTML，至少用 `python3 -m http.server 8080` 起一个静态服务。

### 案例 2：校园导览按经纬度显示路标

真实场景：用户站在校园、园区或景区里，手机对准某个方向，路标文字总是面向用户，并根据 GPS 坐标出现在真实位置附近。

```html
<script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
<script src="https://unpkg.com/aframe-look-at-component@1.0.0/dist/aframe-look-at-component.min.js"></script>
<script src="https://raw.githack.com/AR-js-org/AR.js/3.4.7/three.js/build/ar-threex-location-only.js"></script>
<script src="https://raw.githack.com/AR-js-org/AR.js/3.4.7/aframe/build/aframe-ar.js"></script>
<a-scene vr-mode-ui="enabled:false" arjs="sourceType:webcam; videoTexture:true; debugUIEnabled:false">
  <a-camera gps-new-camera="gpsMinDistance:5"></a-camera>
  <a-text value="图书馆 80m" look-at="[gps-new-camera]"
    gps-new-entity-place="latitude: 39.984; longitude: 116.318"
    scale="30 30 30"></a-text>
</a-scene>
```

逐部分解释：

- `gps-new-camera` 读取用户位置和手机朝向，是 location AR 的眼睛。
- `gps-new-entity-place` 把文字绑到经纬度，用户移动后距离会重新计算。
- `look-at` 不是 AR.js 的核心能力，而是 A-Frame 组件，用来让文字始终朝向摄像头。
- 官方文档建议 location 需求优先关注 LocAR.js；如果继续用主仓库，3.4.7 是文档里明确推荐的稳定版本。

### 案例 3：海报识别后播放模型或跳转链接

真实场景：博物馆海报、书页插图、活动传单本身就能当识别目标，不想额外印黑白 marker。AR.js 的 NFT image tracking 会先为图片生成特征文件。

```bash
git clone https://github.com/Carnaux/NFT-Marker-Creator.git
cd NFT-Marker-Creator
npm install
node app.js -i ../assets/poster.jpg
```

然后把生成的 `poster.fset`、`poster.fset3`、`poster.iset` 放到静态资源目录，再写网页：

```html
<script src="https://cdn.jsdelivr.net/npm/aframe@1.6.0/dist/aframe-master.min.js"></script>
<script src="https://raw.githack.com/AR-js-org/AR.js/3.4.8/aframe/build/aframe-ar-nft.js"></script>
<a-scene embedded vr-mode-ui="enabled:false" renderer="logarithmicDepthBuffer:true"
  arjs="trackingMethod: best; sourceType: webcam; debugUIEnabled: false;">
  <a-nft type="nft" url="/nft/poster/poster" smooth="true" smoothCount="10">
    <a-entity gltf-model="/models/dinosaur.glb" scale="4 4 4"></a-entity>
  </a-nft>
  <a-entity camera></a-entity>
</a-scene>
```

逐部分解释：

- `url` 填的是三份 descriptor 的共同前缀，不要写 `.fset` 扩展名。
- 图片 DPI 和纹理细节会影响识别稳定性；低清、重复纹理、反光图片都容易失败。
- NFT 加载比较慢，实际页面应加 `.arjs-loader`，等 `arjs-nft-loaded` 后再隐藏。
- 如果模型、descriptor 和页面不在同一域，浏览器 CORS 会先拦住资源，追踪器根本拿不到输入。

## 踩过的坑

1. **直接打开本地 HTML**：摄像头、模型和 descriptor 经常因为协议或路径失败；用本地 server 或 HTTPS 部署。
2. **同时引入两个 AR.js build**：marker build 和 NFT build 是互斥思路，混用会制造难排查的组件冲突。
3. **把 GPS 当厘米级定位**：手机 GPS 和指南针会漂，location AR 更适合户外大尺度提示，不适合精确贴门牌。
4. **只优化 3D 模型，不看识别输入**：marker 边框、图片 DPI、光照和反光会直接决定追踪是否稳定。

## 适用 vs 不适用场景

**适用**：

- 扫纸质卡片、海报、说明书后展示轻量 3D 内容。
- 景区、校园、城市导览这类“知道经纬度就能放内容”的户外体验。
- 教学原型、营销活动页、低门槛 Web AR demo。
- 团队已有 Web 技术栈，想复用 HTML、CSS、JavaScript 和静态托管。

**不适用**：

- 需要平面检测、遮挡理解、手势骨骼、多人空间同步的复杂 AR。
- 需要 App 级长时稳定追踪、离线资产管理和深度相机能力的产品。
- 需要室内厘米级定位的导航；普通手机 GPS 在室内通常不够用。
- 对加载速度极敏感、又必须使用大模型和高精贴图的页面。

## 历史小故事（可跳过）

- **2017 年前后**：Jerome Etienne 推出早期 AR.js，把 ARToolKit 思路带到 WebGL 和 WebRTC 浏览器环境。
- **早期亮点**：项目用“手机浏览器也能到 60fps”证明 Web AR 不只是玩具。
- **2.x 阶段**：location based AR 加入，AR.js 不再只盯 marker，也能把内容放到经纬度附近。
- **3.x 阶段**：仓库迁到 AR-js-org，结构拆成 A-Frame/Three.js 与 marker/NFT/location 不同 build。
- **近年变化**：官方文档提醒 location 方向会更多转向 LocAR.js，而主仓库继续保留 marker 与 image tracking 价值。

## 学到什么

- Web AR 的关键不是“网页里有 3D”，而是“3D 内容被现实世界的某个锚点约束住”。
- AR.js 把门槛压低到 HTML 片段级别，但真实产品仍要处理权限、资源、跨域和移动端性能。
- Marker、image tracking、location AR 是三种不同定位方式，稳定性、自然度和算力成本各不相同。
- 选库时要先问体验目标：扫纸卡、扫自然图片、看街区路标，对应的 build 和坑都不一样。

## 延伸阅读

- [AR.js 官方文档](https://ar-js-org.github.io/AR.js-Docs/) —— 从 Web AR 概念、build 选择到已知限制的入口。
- [Marker Based 文档](https://ar-js-org.github.io/AR.js-Docs/marker-based/) —— 解释 Hiro、barcode、pattern marker 与关键参数。
- [Location Based 文档](https://ar-js-org.github.io/AR.js-Docs/location-based/) —— 解释 `gps-new-camera`、经纬度投影和抖动控制。
- [Image Tracking 文档](https://ar-js-org.github.io/AR.js-Docs/image-tracking/) —— 解释 NFT descriptor、图片选择和 `a-nft`。
- [UI and Custom Events](https://ar-js-org.github.io/AR.js-Docs/ui-events/) —— 学 `markerFound`、`markerLost`、`arjs-nft-loaded` 怎么接业务动作。
- [AR.js issue #234](https://github.com/AR-js-org/AR.js/issues/234) —— 了解 npm、ES module、React/Vue 集成时遇到的现实问题。

## 关联

- [[aframe]] —— AR.js 的低门槛写法依赖 A-Frame，让 3D 场景能写成 HTML。
- [[threejs]] —— AR.js 底层追踪结果最终常交给 Three.js 的相机、矩阵和物体来渲染。
- [[gltf-transform]] —— AR 页面里的 glTF 模型要压小、去冗余，移动端才容易稳。
- [[spectorjs]] —— WebGL 画面异常时，可以用它看 draw call、纹理和 shader 状态。
- [[webrtc-rs]] —— AR.js 在浏览器侧用 WebRTC/getUserMedia 拿摄像头流，和实时媒体协议是近亲。
- [[maplibre-gl]] —— location AR 和地图都在处理经纬度到屏幕/世界坐标的转换。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
