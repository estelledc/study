---
title: DragonBones — 国产开源 2D 骨骼动画运行时
来源: 'https://github.com/DragonBones/DragonBonesCPP'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

DragonBones 是一套**把 2D 角色拆成骨头、插槽、贴图和动画数据，再在游戏里实时播放**的开源骨骼动画方案；这个 C++ 仓库是它的运行时之一，GitHub 大约 1k stars。

日常类比：传统逐帧动画像翻一本厚厚的小人书，每一页都画完整角色；DragonBones 像给纸片人装关节，胳膊、腿、武器、表情分开动，程序每帧算出姿势再把贴图拼回去。

它最容易和 [[spine-runtimes]] 对照理解：Spine 是商业编辑器加公开运行时，DragonBones 曾是 Egret 体系里更偏国产开源的对位选择。官方 README 指向 DragonBones Pro 制作动画，运行时支持 Cocos2d-x、SFML，仓库里还新增了 Android Compose/JNI 示例。

真正要记住的是：DragonBones 不是“画图工具”，而是“动画资产格式 + 多平台 runtime”。动画师导出 `_ske.json/.dbbin`、`_tex.json`、纹理图片；工程侧加载这些文件、构建 armature、播放动画、换皮肤或换插槽。

## 为什么重要

不理解 DragonBones，下面这些事会很难解释：

- 为什么 2D 角色可以不导出几百张 PNG，也能做 idle、walk、attack、jump 这些动作。
- 为什么“骨骼动画 runtime”和“游戏引擎”不是一回事：DragonBones 算姿势，Cocos2d-x / SFML / OpenGL ES 负责真正画出来。
- 为什么网格变形、骨骼权重、IK、插槽替换这些词，解决的是“少画图、多复用”的生产问题。
- 为什么同一个角色资产想跑到 C++、Android Compose、旧 Flash/JS 生态或其他引擎时，需要不同宿主的适配层。

## 核心要点

1. **骨架是木偶线**：armature 记录骨头层级和动画曲线。类比：木偶师拉的是线，不是每一帧重画木偶；运行时每帧算骨头变换，再带动图片走。

2. **插槽是衣架**：slot 决定某块贴图挂在哪根骨头上，也决定武器、Logo、表情可以被替换。类比：同一个衣架能挂外套、雨衣或盔甲，身体动作不用重做。

3. **工厂是后台仓库**：`CCFactory` / `SFMLFactory` 先加载骨骼数据和纹理集，再按名字构建显示对象。类比：仓库先入库剧本和服装，舞台上需要角色时才把演员、衣服和动作装配出来。

这三件事合起来就是 DragonBones 的价值：美术能用骨骼、网格和皮肤复用动作，程序能在不同宿主里用统一数据播放，而不是为每个平台重新做一套动画。

## 实践案例

### 案例 1：Cocos2d-x 里播放一个机甲 idle

官方 `HelloDragonBones.h` 展示了最小闭环：加载数据、构建 armature、播放动画、加到场景。

```cpp
const auto factory = dragonBones::CCFactory::getFactory();
factory->loadDragonBonesData("mecha_1002_101d_show/mecha_1002_101d_show_ske.dbbin");
factory->loadTextureAtlasData("mecha_1002_101d_show/mecha_1002_101d_show_tex.json");

const auto display = factory->buildArmatureDisplay(
  "mecha_1002_101d",
  "mecha_1002_101d_show"
);
display->getAnimation()->play("idle");
display->setPosition(0.0f, -200.0f);
addChild(display);
```

逐部分解释：

- `loadDragonBonesData` 读骨骼、插槽、动画曲线，`.dbbin` 是二进制数据，旁边注释里也有 JSON 版本。
- `loadTextureAtlasData` 读图集描述，让 runtime 知道每块小图在大图里的位置。
- `buildArmatureDisplay` 按 armature 名字实例化角色，第二个参数指定数据集。
- `play("idle")` 只负责动画状态，`addChild(display)` 才把它交给 Cocos2d-x 场景图显示。

### 案例 2：Cocos2d-x 换皮肤和换武器

官方 `ReplaceSkin.h` 和 `ReplaceSlotDisplay.h` 展示了 DragonBones 很常见的游戏用法：身体动作不变，点击时替换衣服或武器。

```cpp
_factory = dragonBones::CCFactory::getFactory();
_factory->loadDragonBonesData("you_xin/body/body_ske.json");
_factory->loadTextureAtlasData("you_xin/body/body_tex.json");

_armatureDisplay = _factory->buildArmatureDisplay("body");
_armatureDisplay->getAnimation()->play("idle", 0);

const auto partData = _factory->getArmatureData(partArmatureName);
_factory->replaceSkin(_armatureDisplay->getArmature(), partData->defaultSkin);
```

换武器时，示例还会直接替换某个 slot 的显示内容：

```cpp
_factory->replaceSlotDisplay(
  "weapon_1004_show",
  "weapon",
  "weapon_r",
  displayName,
  _armatureDisplay->getArmature()->getSlot("weapon_hand_r")
);
```

逐部分解释：

- `body_ske.json` 是基础身体骨架，衣服部件则按套装逐个加载。
- `replaceSkin(...)` 把一套皮肤合到当前 armature 上，所以走路、待机等动作可以继续复用。
- `replaceSlotDisplay(...)` 更细，只替换右手武器槽，不需要重建整个角色。
- 这类能力适合 RPG 换装、武器系统、活动皮肤和 UI 吉祥物变体。

### 案例 3：Android Compose 里把角色当成一个组件

仓库的 `AndroidCompose` README 给出新一些的接法：底层仍用 C++ 和 OpenGL ES，业务层用 Compose 传模型和控制器。

```kotlin
@Composable
fun MyAnimationScreen() {
    val controller = rememberDragonBonesController()
    val model = remember {
        DragonBonesModel(
            skeletonPath = "dragonbones/models/hero/hero_ske.json",
            textureJsonPath = "dragonbones/models/hero/hero_tex.json",
            textureImagePath = "dragonbones/models/hero/hero_tex.png"
        )
    }

    DragonBonesViewCompose(model = model, controller = controller)
    controller.fadeInAnimation(name = "walk", layer = 0, loop = 0, fadeInTime = 0.3f)
}
```

逐部分解释：

- `DragonBonesModel` 把三类资源路径收在一起，路径相对 Android `assets`。
- `DragonBonesViewCompose` 是 UI 入口，让动画像普通 Compose 组件一样被放进页面。
- `fadeInAnimation` 控制动作切换和混合时间，`loop = 0` 表示无限循环。
- README 特别提醒切换模型前调用 `clearAnimationQueue()`，否则旧动作命令可能落到新模型上。

## 踩过的坑

1. **只加载骨骼不加载图集**：角色会有动作数据却没有贴图位置；原因是 `_ske.json/.dbbin` 和 `_tex.json/.png` 是一组资产。

2. **把 runtime 当编辑器用**：C++ 仓库不会帮你绑骨头、画网格；原因是制作阶段在 DragonBones Pro / 编辑器，运行时只负责播放和控制。

3. **升级时旧文件残留**：Cocos2d-x README 提醒升级覆盖源码后检查旧目录和编译路径；原因是同名类或头文件残留会造成重定义。

4. **切模型不清动画队列**：Android Compose README 明确要求先清队列；原因是响应式命令可能在模型替换后才执行。

## 适用 vs 不适用场景

**适用**：

- 2D 游戏角色、怪物、武器、换装、活动皮肤，需要一套骨架复用多套外观。
- Cocos2d-x / C++ 项目里已经有 DragonBones 资产，要继续维护旧项目或做轻量集成。
- Android Compose 页面想放高性能 2D 角色动效，又不想把整套游戏引擎搬进去。
- 想学习骨骼动画 runtime：骨头、slot、skin、texture atlas、animation state、cache frame rate。

**不适用**：

- 新项目需要最大社区、商业支持和现代编辑器体验，优先评估 [[spine-runtimes]]、Unity 或 Godot。
- 只是网页图标动效、加载动画、运营插画，[[lottie]] 或 CSS/SVG 更轻。
- 追求逐帧手绘质感的像素动画，骨骼插值可能让动作显得“橡皮化”。
- 完全不想碰 C++、资产导出、图集路径和宿主引擎适配的团队。

## 历史小故事（可跳过）

- **2012 年左右**：DragonBones 以开源 2D 骨骼动画方案出现，早期和 Flash Pro、AS3、JS、CreateJS 生态关系很深。
- **Egret 时代**：它在中文游戏开发圈常被看作 Spine 的国产对位，优势是免费开源和多运行时适配。
- **2016-2018 年**：C++ README 的版权区间写到 2012-2018，主推 DragonBones Pro 制作动画，再由 runtime 播放。
- **后来**：官方站点把“网格和自由变形、IK、骨骼权重、蒙皮动画、多平台运行库”作为核心卖点继续展示。
- **2025 年**：C++ 仓库仍有提交，新增 Android Compose 方向，说明老资产格式还有维护和迁移价值。

## 学到什么

- DragonBones 的第一直觉不是“国产 Spine 克隆”，而是“2D 动画资产怎样跨宿主运行”的工程样本。
- 骨骼动画省的是美术重复劳动和包体体积，但代价是资产格式、版本和 runtime 接入更复杂。
- `factory -> armature -> animation -> slot/skin` 是读示例代码的主线，先抓这条线再看具体 API。
- 老项目技术选型不能只看 stars；DragonBones 的价值常在“已有资产能不能继续跑、能不能迁移到新宿主”。

## 延伸阅读

- 官方仓库：[DragonBonesCPP](https://github.com/DragonBones/DragonBonesCPP) —— C++ common library、Cocos2d-x、SFML 和 Android Compose 入口。
- Cocos2d-x 适配：[Cocos2DX_3.x README](https://github.com/DragonBones/DragonBonesCPP/tree/master/Cocos2DX_3.x) —— 看如何加载源码、跑 demos、处理头文件路径。
- SFML 适配：[SFML README](https://github.com/DragonBones/DragonBonesCPP/tree/master/SFML) —— 看最小窗口循环里如何 `factory.update(deltaTime)`。
- Android 适配：[AndroidCompose README](https://github.com/DragonBones/DragonBonesCPP/tree/master/AndroidCompose) —— 看 Compose 控制器、模型切换和动画队列。
- 官方展示站：[DragonBones / Loongbones](http://dragonbones.github.io) —— 看网格变形、IK、蒙皮和多平台运行库的功能说明。
- [[spine-runtimes]] —— 最直接的对照组：同样是设计工具导出数据，运行时接入多平台。

## 关联

- [[spine-runtimes]] —— DragonBones 的国产开源对位，适合比较编辑器、许可、runtime 覆盖和版本锁定。
- [[cocos2d-x]] —— 官方 C++ 示例主要接在 Cocos2d-x 场景图上，能看清 Sprite/Node 宿主关系。
- [[sfml]] —— SFML 示例展示“窗口循环 + factory.update + draw display”的轻量宿主方式。
- [[lottie]] —— 都是“设计工具导出数据、运行时播放”，但 Lottie 偏 UI 矢量动效，DragonBones 偏游戏角色骨骼。
- [[pixi]] —— 浏览器 2D 渲染底座，理解 texture atlas 和显示对象后更容易看 DragonBones 的 slot。
- [[godot]] —— 完整编辑器引擎路线，对照 DragonBones 这种只负责动画运行时的边界。
- [[assimp]] —— 都处在资产管线里：Assimp 解决 3D 模型导入，DragonBones 解决 2D 骨骼动画播放。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[rive]] —— Rive — 把矢量动画做成可交互组件的运行时
