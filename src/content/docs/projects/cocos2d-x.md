---
title: Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
来源: 'https://github.com/cocos2d/cocos2d-x'
日期: 2026-06-01
分类: 图形引擎
难度: 初级
---

## 是什么

Cocos2d-x 是一个开源、跨平台的 **C++ 2D / 3D 游戏框架**：你写一份 C++（或 Lua / JavaScript 脚本），它替你把同一份逻辑跑到 iOS、Android、macOS、Windows、Linux 上。日常类比：像麦当劳的中央厨房——一份菜谱配好，每家门店（平台）按本地灶具（OpenGL ES / Metal）照做就行。

最小例子：

```cpp
auto sprite = Sprite::create("hero.png");
sprite->setPosition(100, 100);
sprite->runAction(MoveTo::create(2.0f, Vec2(400, 100)));
this->addChild(sprite);
```

四行：加载图片当精灵，放到 (100,100)，2 秒内滑到 (400,100)，挂到当前场景。引擎每帧自己算中间位置、自己调用 GL 绘制。**Sprite / Action / Scene 这三个名字**，是过去十年中国手游一半工程师的入门第一课。

## 为什么重要

不理解 Cocos2d-x 这一类场景图引擎，下面这些事都没法解释：

- 为什么《刀塔传奇》《我叫 MT》《捕鱼达人》这一波 2013-2017 国产手游有相似的"手感"——它们大多跑在 Cocos2d-x 上
- 为什么手游公司当年都把游戏逻辑写 Lua 而不是 C++——为了**热更新绕过 App Store 审核**
- 为什么 [[pixi]] / [[konva]] / [[fabric-js]] 这些 2D 库的 API 看起来眼熟（Stage / Layer / Sprite / Action）——同一套场景图心智模型从 cocos2d-iphone 一路传过来
- 为什么一个 MIT 协议的 C++ 框架值得记 1.9 万 star、7.1k fork——商用免费 + 中国生态，是当年小团队唯一能打的选项

## 核心要点

Cocos2d-x 的设计可以拆成 **三层**：

1. **场景图（Scene Graph）**：游戏世界是一棵树。`Director`（导演）管主循环，每帧 visit 这棵树；树根叫 `Scene`，下面挂 `Layer`、`Sprite`、`Label`。父节点变换（移动、旋转、缩放）自动级联到子节点。这棵树就是"渲染什么 / 怎么排"的真相，跟 DOM 树一个味儿。

2. **Action 系统**：动画不是 setInterval 自己改坐标，而是给节点挂一个 Action。`MoveTo / RotateBy / FadeOut / Sequence / Spawn / Repeat`——基本动作积木拼起来就是一段过场动画。和 [[gsap]] / [[anime]] 的 timeline 思想一脉相承，只不过 Cocos 用 C++ 对象表达。

3. **跨平台抽象 + 脚本绑定**：底层渲染抽象 OpenGL ES 2.0（移动）/ OpenGL 2.1（桌面）/ Metal（Apple）。上层通过 SpiderMonkey / V8 / LuaJIT 把 C++ 类暴露给脚本——Lua 写关卡和 AI，C++ 跑热点路径。这就是手游"热更新"的物理基础。

## 实践案例

### 案例 1：Sprite + Action 拼一段角色出场

最小可运行片段：

```cpp
auto hero = Sprite::create("hero.png");
hero->setPosition(-50, 200);

auto walk   = MoveTo::create(2.0f, Vec2(400, 200));
auto fade   = FadeOut::create(0.5f);
auto seq    = Sequence::create(walk, fade, nullptr);

hero->runAction(seq);
this->addChild(hero);
```

读起来：英雄从左侧屏外（-50, 200）2 秒走到 (400, 200)，再 0.5 秒淡出。`Sequence::create(...)` 是 **关键 API**——把动作串起来跑。换成 `Spawn::create` 就是同时跑（边走边淡）。这就是为什么 Action 比手写 update 函数好用：组合性。

### 案例 2：接 Box2D 物理做一个砸方块

游戏世界其实有**两份独立坐标**：渲染坐标（场景图）和物理坐标（b2World）。每帧要做的是：

1. 让 b2World 走一步：`world->Step(dt, 6, 2)`
2. 把每个 b2Body 的新位置同步到对应的 Sprite

```cpp
void GameLayer::update(float dt) {
    world->Step(dt, 6, 2);
    for (b2Body* b = world->GetBodyList(); b; b = b->GetNext()) {
        auto sprite = (Sprite*)b->GetUserData();
        if (sprite) {
            auto pos = b->GetPosition();
            sprite->setPosition(pos.x * PTM_RATIO, pos.y * PTM_RATIO);
        }
    }
}
```

`PTM_RATIO`（pixel-to-meter，常见取 32）是**踩坑高发地**：物理用米、渲染用像素，没换算就是物体一帧飞出屏幕。

### 案例 3：Lua 脚本 + 热更新

C++ 编译进 ipa 后改不了，但 Lua 文件可以从 CDN 拉。手游公司当年的做法：

```lua
-- ai.lua（运行时从 CDN 下载）
local function enemyTick(enemy, dt)
    if enemy:hp() < 30 then
        enemy:flee()
    else
        enemy:attack(player)
    end
end
return enemyTick
```

C++ 一侧只暴露 `enemy:hp()` / `enemy:flee()` 这些方法。改个数值平衡（HP 阈值从 30 改 50）只推 Lua 文件，不重新提包审 7 天。**这就是"热更新"在 2014-2017 中国手游圈是核心竞争力的原因**——也是后来 App Store 收紧、Cocos Creator 用 TS + JSC 接力的起点。

## 踩过的坑

1. **autorelease 内存模型**：所有 `create()` 出来的对象默认进 autorelease pool，不被加到 parent 节点就在下一帧死。新人写 `auto s = Sprite::create("a.png"); doSomething(s);` 但忘了 `addChild`，下一帧野指针。规则：**create 完要么 addChild 要么 retain**。

2. **跨平台资源大小写**：iOS / macOS HFS+ 默认大小写不敏感，Android / Linux 严格区分。本地 Mac 调通的 `Image.PNG`，Android 真机一片黑。规则：**所有资源名小写 + 没空格**，CI 加大小写检查。

3. **Lua / JS 绑定生命周期**：脚本层引用一个 C++ Sprite，C++ 一侧 ref-count 释放掉后脚本再访问 = 野指针。需要用 `ScriptHandlerMgr` 或 jsb 的 root 机制把对象 root 住。这个坑当年坑哭很多 Lua 团队。

4. **2.x → 3.x 等于重写**：移除 `CC` 前缀（`CCSprite` 改 `Sprite`）、智能指针重构、Action 接口改、平台脚本改。社区项目升级常常等于重写，所以很多老游戏一直停在 2.2.6。**新项目官方建议直接用 Cocos Creator，而不是 Cocos2d-x 4.x**。

## 适用 vs 不适用场景

**适用**：
- 学习场景图 / Action / 跨平台渲染抽象的**教学范本**——代码量适中、概念干净
- 维护已有 Cocos2d-x 老项目（中国手游圈 2013-2017 大量遗产）
- 极度看重包体 / 启动速度的 2D 项目（C++ 包体比 Unity 小一截）

**不适用**：
- 新立项 2D / 3D 项目 → 选 [[godot]] / Unity / Cocos Creator（带编辑器、文档新）
- 纯 Web 2D 渲染 → 选 [[pixi]] / [[konva]] / [[fabric-js]]，无需打包
- SVG / UI 动画 → 选 [[lottie]] / [[gsap]] / [[anime]]
- 不接受 C++ 工具链复杂度的小团队 → JS 系或 Godot 更友好

## 历史小故事（可跳过）

- **2008 年**：阿根廷开发者 Ricardo Quesada 做 cocos2d-iphone（Objective-C），随 iPhone SDK 火起来。
- **2010 年**：厦门触控科技（Chukong）的张小东带队，把 cocos2d-iphone 移植到 C++，命名 Cocos2d-x。目标是让 iOS 上跑通的游戏直接落 Android。
- **2013-2017**：手游黄金期，Cocos2d-x 是中国 2D 手游主流引擎之一，催生大批爆款。社区贡献者多到 PR 排队。
- **2016+**：官方推出 Cocos Creator——带可视化编辑器、3D 支持、TypeScript 脚本，定位"下一代"。Cocos2d-x 进入维护模式。
- **现在**：项目仍接受 issue / 小修，但官方明确建议新项目用 Cocos Creator，不要从 Cocos2d-x 起步。

## 学到什么

1. **场景图 + Action**：是 2D 引擎的通用心智模型，[[pixi]] / [[konva]] / [[fabric-js]] 都能找到这个影子
2. **跨平台不是免费的**：渲染要抽象 GL / Metal、资源路径要规范、内存模型要约定，每一层都有坑
3. **脚本绑定 = 热更新基础设施**：把热点路径放 C++、业务逻辑放脚本，是 2010s 中国手游的统一答案
4. **MIT 协议 + 中文社区**：当年小团队选它不只是技术原因，而是文档中文 + 商用免费 + 论坛能找到老乡

## 延伸阅读

- 官方 GitHub：[cocos2d/cocos2d-x](https://github.com/cocos2d/cocos2d-x)（4.x 已是维护模式）
- 后继者：[Cocos Creator](https://www.cocos.com/creator)（编辑器 + TS + 3D，新项目首选）
- Box2D 物理：[Box2D 官方手册](https://box2d.org/documentation/)（PTM_RATIO 这一坑详见 chapter 1）
- 国产手游史回顾：触控、巨人、心动当年的财报里都能找到 Cocos2d-x 的影子

## 关联

- [[pixi]] —— Web 2D 场景图渲染器，思想最近的"网页版 Cocos"
- [[konva]] —— Canvas 2D 场景图库，更轻、面向编辑器
- [[fabric-js]] —— Canvas 对象模型，偏图形编辑器场景
- [[lottie]] —— After Effects 动画导出方案，和 Action 系统互补
- [[gsap]] —— JS 业界基准动画库，timeline 思想同源
- [[anime]] —— 轻量 JS 动画库，stagger / easing 概念跨语言通用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
