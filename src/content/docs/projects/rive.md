---
title: Rive — 把矢量动画做成可交互组件的运行时
来源: 'https://github.com/rive-app/rive-runtime'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

Rive 是一套**让矢量动画带状态、带输入、能跨平台运行**的动画运行时；`rive-runtime` 是它最底层的 C++ runtime，GitHub 大约 7k stars。日常类比：普通动画像一段视频，按时间从第 1 秒播到第 3 秒；Rive 更像一个会反应的仪表盘，按钮按下去、鼠标移过去、血量变低时，它会自己切到对应状态。

`.riv` 文件里不只保存图形和关键帧，还可以保存 Artboard、State Machine、View Model、事件和绑定关系。运行时加载这份文件后，每帧推进状态机，计算矢量图形，再交给 Metal、Vulkan、D3D、OpenGL/WebGL 或宿主平台画出来。所以 Rive 不是单纯的“动画库”，而更像“设计师能交付的交互组件格式”：设计师在编辑器里定义视觉和状态，工程师在 Web、React、Flutter、Unity、iOS、Android 等平台里接入数据和事件。

## 为什么重要

不理解 Rive，下面这些事会很难解释：

- 为什么一个点赞按钮可以不是 GIF，而是一份可响应 hover、press、success 的 `.riv` 组件。
- 为什么 [[lottie]] 很适合时间线动效，但遇到复杂交互时常要把状态逻辑搬回业务代码。
- 为什么 Rive README 强调底层 C++ runtime：同一套文件想跨 Web、Flutter、Unity 和原生端，必须有共享的运行核心。
- 为什么新文档推荐 Data Binding：状态机输入能控制动画，但把业务数据直接绑定到 View Model 才更像组件接口。

## 核心要点

1. **State Machine 是交通灯**：动画不再只按时间线播放，而是在 idle、hover、pressed、error 这些状态之间跳转。类比：路口红绿灯会根据按钮和传感器切换，不是永远循环同一段录像。
2. **View Model 是插座**：设计师把 `health`、`title`、`themeColor` 这些属性留成插孔，工程代码只往插孔里送数据。类比：家电不用知道电厂怎么发电，只要插头规格对上。
3. **Renderer 是舞台设备**：Rive 的核心负责“这帧应该长什么样”，具体用 WebGL2、Metal、Vulkan 还是 Flutter texture 画出来，由各平台后端处理。类比：同一场戏能在小剧场和体育馆演，但灯光设备不同。

三件事合起来，就是它和普通动画播放器的区别：Rive 把“动效、交互状态、运行时渲染”打成一包，让动画从素材变成组件。

## 实践案例

### 案例 1：网页里的车辆按钮，点击触发一次 bump

官方 Web 文档用 `vehicles.riv` 演示最小交互：加载文件、启用 `bumpy` 状态机，按钮点击时触发 `bump`。

```html
<button id="button">Bump</button>
<canvas id="canvas" width="500" height="250"></canvas>
<script src="https://unpkg.com/@rive-app/webgl2@2"></script>
<script>
const r = new rive.Rive({
  src: "https://cdn.rive.app/animations/vehicles.riv",
  canvas: document.getElementById("canvas"),
  autoplay: true,
  stateMachines: "bumpy",
  autoBind: true,
  onLoad: () => r.resizeDrawingSurfaceToCanvas(),
});
button.onclick = () => {
  const input = r.stateMachineInputs("bumpy").find((i) => i.name === "bump");
  input?.fire();
};
</script>
```

逐部分解释：
- `stateMachines: "bumpy"` 告诉 runtime 不要只播时间线，而是启动名为 `bumpy` 的状态机。
- `onLoad` 里调整 canvas backing store，避免 Retina 屏幕上矢量边缘发糊。
- `stateMachineInputs(...).find(...)` 找到设计师在编辑器里定义的触发器。
- `fire()` 只发一帧事件，状态机怎么从正常车身切到颠簸动画，由 `.riv` 内部规则决定。

### 案例 2：React 健康条，把业务血量绑定给动画

官方 Data Binding Quick Start 用 health bar 展示更现代的做法：代码不直接操作某个时间线，而是改 View Model 实例里的 `health` 数值。

```tsx
import { useEffect } from "react";
import { useRive, useViewModel, useViewModelInstance } from "@rive-app/react-webgl2";

export function HealthBar({ hp }: { hp: number }) {
  const { rive, RiveComponent } = useRive({
    src: "/health-bar.riv",
    stateMachines: "State Machine 1",
    autoplay: true,
    autoBind: false,
  });
  const vm = useViewModel(rive, { useDefault: true });
  const vmi = useViewModelInstance(vm, { useDefault: true });

  useEffect(() => {
    const health = vmi?.number("health");
    if (health) health.value = Math.max(0, Math.min(100, hp));
  }, [vmi, hp]);

  return <RiveComponent className="h-16 w-full" />;
}
```

逐部分解释：
- `useRive` 挂载真正的 canvas，并拿到 runtime 实例。
- `useViewModel` 找到编辑器里设计好的数据模型，`useViewModelInstance` 创建或拿到默认实例。
- `vmi.number("health").value = hp` 是业务代码和动画之间的接口；低血量变红、闪烁、触发 game over 都可以留在 Rive 文件里。
- 这比把每个颜色、宽度和 warning 状态写进 React 更清楚：React 管数据，Rive 管视觉反馈。

### 案例 3：Flutter 列表里放多个 Rive 卡片，共享一张纹理

Flutter 文档给出 `RivePanel` / shared texture 的思路：页面里有很多 Rive widget 时，可以让它们画到同一块纹理上，减少纹理数量和 WebGL context 压力。

```dart
class RatingList extends StatefulWidget {
  const RatingList({super.key});
  @override
  State<RatingList> createState() => _RatingListState();
}

class _RatingListState extends State<RatingList> {
  late final fileLoader = FileLoader.fromAsset(
    "assets/rating.riv",
    riveFactory: Factory.rive,
  );

  @override
  Widget build(BuildContext context) {
    return RivePanel(
      child: ListView.builder(
        itemCount: 10,
        itemBuilder: (_, i) => RiveWidgetBuilder(
          fileLoader: fileLoader,
          builder: (_, state) => switch (state) {
            RiveLoaded() => RiveWidget(
              controller: state.controller,
              useSharedTexture: true,
              fit: Fit.contain,
            ),
            RiveFailed() => const Text("Rive failed"),
            _ => const CircularProgressIndicator(),
          },
        ),
      ),
    );
  }
}
```

逐部分解释：
- `FileLoader.fromAsset` 让多个卡片复用同一份 `.riv` 资源加载逻辑。
- `RivePanel` 在父层创建共享纹理，子 `RiveWidget` 通过 `useSharedTexture: true` 画进去。
- `RiveLoaded / RiveFailed` 把加载态显式写出来，避免页面静默空白。
- 这类案例适合评分、勋章、进度卡片、会员等级这些“同构动画组件很多”的移动端页面。

## 踩过的坑

1. **只给 `animations` 不给 `stateMachines`**：文档已把 timeline-only 播放标成旧方向，原因是交互动画应该从状态机进入。
2. **忘记清理 runtime 实例**：Web 高层 API 也会创建 C++ 侧对象，原因是 artboard、animation、state machine 实例不清理会占内存。
3. **把旧 Inputs 当新项目默认方案**：Inputs 文档已提示新项目用 Data Binding，原因是 View Model 更适合表达组件级数据接口。
4. **以为所有 runtime 功能同时到齐**：官方反复指向 Feature Support，原因是 Text、Layout、Audio、Renderer 等能力在不同平台有最低版本要求。

## 适用 vs 不适用场景

**适用**：
- 需要 hover、press、loading、success、error 等多状态 UI 动效，想让设计师在文件里维护状态转移。
- 游戏或工具里的血条、开关、仪表盘、成就卡片、互动吉祥物，需要业务数据驱动视觉变化。
- 同一套动画要跑到 Web、React Native、Flutter、Unity、iOS、Android 或自研 C++ 渲染层。
- 团队愿意建立“编辑器导出 `.riv` + 工程接 View Model”的设计工程协作流程。

**不适用**：
- 只是一段线性开屏动画或图标循环，[[lottie]]、CSS 或视频更轻。
- 需要完整游戏引擎的物理、地图、碰撞、资源管理，Rive 只解决交互动画，不替代 [[phaser]] 或 Unity。
- 设计师不愿维护状态机，工程师也不愿约定属性名，Rive 的协作收益会被流程成本吃掉。
- 复杂 3D 场景、粒子海和后处理，应该看 [[threejs]]、[[pixi]] 或原生图形引擎。

## 历史小故事（可跳过）

- **Flash 时代**：Rive 团队常把自己放在“现代 Flash”语境里理解：设计、动画和交互逻辑不要被硬拆开。
- **Flare 到 Rive**：早期产品曾以 Flare 形态出现在 Flutter 动效生态里，后来品牌和平台逐步转向 Rive。
- **Runtime 开源化**：底层 C++ runtime 让 `.riv` 文件不只服务 Web，而是能被 Apple、Android、Flutter、Unity、Unreal、Web 等 wrapper 复用。
- **Data Binding 之后**：Rive 从“状态机输入驱动动画”继续往“View Model 驱动组件”走，接口更接近 UI 组件。
- **2026 年前后**：Flutter 0.14 系列迁到 C++ runtime + FFI，说明共享 runtime 正在变成跨端一致性的核心。

## 学到什么

- Rive 的关键不是“矢量动画更漂亮”，而是动画文件里能保存可运行的状态逻辑。
- State Machine 解决“用户做了什么”，Data Binding 解决“业务数据是什么”，Renderer 解决“这一帧怎么画”。
- 跨平台 runtime 的价值在维护一致性：同一份 `.riv` 文件越多端复用，底层 C++ 核心越重要。
- 选 Rive 等于选一种协作方式：设计师交付带接口的动画组件，工程师负责数据、生命周期和平台限制。

## 延伸阅读

- 官方仓库：[rive-app/rive-runtime](https://github.com/rive-app/rive-runtime) —— 最底层 C++ runtime 和 GPU renderer 后端。
- Runtime 总览：[Getting Started with the Rive Runtimes](https://rive.app/docs/runtimes/getting-started) —— 看官方支持哪些平台和版本策略。
- Web 入门：[Getting Started Web JS](https://rive.app/docs/runtimes/web/web-js) —— 看 `.riv`、canvas、state machine 和 cleanup 的最小闭环。
- Data Binding：[Web Data Binding](https://rive.app/docs/runtimes/web/data-binding) —— 理解 View Model、实例、属性读写和观察。
- Flutter runtime：[Flutter docs](https://rive.app/docs/runtimes/flutter/flutter) —— 看 `RiveWidgetBuilder`、`RivePanel`、shared texture 和资源释放。
- [[lottie]] —— 对照“线性动画播放器”和“交互状态机动画”的边界。

## 关联

- [[lottie]] —— 同样是设计工具导出运行时文件，但 Lottie 更偏时间线，Rive 更偏状态机和数据绑定。
- [[pixi]] —— 都在浏览器图形层工作；Pixi 是通用 2D 渲染引擎，Rive 是交互动画文件和 runtime。
- [[spine-runtimes]] —— 同样强调跨平台 runtime，不过 Spine 偏 2D 骨骼角色，Rive 偏 UI/组件动效。
- [[dragonbones]] —— 老牌 2D 骨骼动画运行时，可对照资产格式、插槽和跨宿主适配。
- [[flutter]] —— Rive 在 Flutter 里常作为原生动效组件出现，shared texture 能体现 runtime 工程成本。
- [[react]] —— React 管状态和数据，Rive 管动画状态机，二者通过 hooks 和 View Model 对接。
- [[spectorjs]] —— 调试 WebGL/WebGPU 帧时可帮助观察 Rive WebGL2 后端是否过度绘制。

## 反向链接
<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
