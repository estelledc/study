---
title: Maestro — 移动端 YAML 端到端 UI 测试
来源: https://github.com/mobile-dev-inc/maestro
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

Maestro 是 [Mobile.dev](https://mobile.dev) 开源的 **移动端与 Web 端到端 UI 测试框架**。你用 **人类可读的 YAML** 描述「用户旅程」（官方称为 **Flow**），Maestro CLI 在真机或模拟器上按步骤点击、输入、断言——**同一套语法覆盖 Android、iOS，以及桌面浏览器**。

日常类比：传统移动端自动化像写 **遥控车程序**——你得学 Java/Python、配 Appium Server、写 XPath、在代码里塞 `sleep(3000)` 等动画结束。Maestro 更像 **给手机念操作清单**：「打开 App → 点登录 → 输入邮箱 → 点提交 → 检查欢迎页出现」。清单用 YAML 写，测试同学和产品经理也能读懂；引擎负责在系统无障碍层找按钮、自动重试，你不必当「遥控车工程师」。

官方仓库：https://github.com/mobile-dev-inc/maestro（Apache-2.0，约 9k+ stars）。安装后是一个 **单文件 CLI**；配套还有 **Maestro Studio**（可视化 IDE）和 **Maestro Cloud**（并行云测），但核心执行引擎完全开源。

最小 Flow 长这样：

```yaml
appId: com.example.myapp
---
- launchApp
- tapOn: "登录"
- inputText: "user@example.com"
- tapOn: "密码"
- inputText: "secret123"
- tapOn: "提交"
- assertVisible: "欢迎回来"
```

没有 import、没有类、没有 WebDriver Session——**一个 YAML 文件就是一条可运行的测试**。

## 为什么重要

移动端 E2E 处在测试金字塔顶端：慢、环境杂、维护成本高。不理解 Maestro，以下选型与落地问题很难回答：

- **「不想为测 UI 再学一门测试框架 API」**——Maestro 用声明式 YAML，语法接近自然语言；与 Playwright 的 TypeScript、Appium 的 WebDriver 相比 **上手曲线最平**
- **「黑盒能不能测 React Native / Flutter？」**——可以。Maestro 走操作系统 **无障碍树（accessibility tree）**，不依赖应用源码；官方明确支持 RN、Flutter、Jetpack Compose、SwiftUI
- **「和 Detox / Appium 怎么选？」**——Detox 专精 RN 灰盒同步；Appium 跨平台 + 多语言最广；**Maestro 用 YAML + 内置智能等待**，适合快速铺冒烟流、让非开发同学参与维护
- **「CI 里怎么跑？」**——`maestro test .maestro/` 一条命令；可接 Maestro Cloud 并行多设备，也可在 GitHub Actions / Bitrise 等用官方 Action 集成

若团队要 **快速建立移动端冒烟覆盖**、减少「只有 QA 能改脚本」的瓶颈，或已在用 Playwright 测 Web 并希望移动端也保持「可读脚本」，Maestro 是 2026 年值得优先评估的选项之一。

## 核心概念

Maestro 的心智模型可压成六块：

### 1. Flow（用户旅程）

**Flow** 是测试的基本单位，对应一段真实用户路径：登录、结账、搜索、 onboarding 等。一个 Flow 通常是一个 `.yaml` 文件，也可拆成多个文件用 `runFlow` 组合。

Flow 文件分两段，用 `---` 分隔：

| 段落 | 位置 | 内容 |
|------|------|------|
| **配置区** | `---` 之上 | `appId`（必填）、`name`、`tags`、`env` 环境变量等 |
| **命令区** | `---` 之下 | 有序命令列表：`launchApp`、`tapOn`、`assertVisible`… |

这种结构让「测哪个 App」和「怎么操作」一眼分开，便于 CI 按 `tags` 筛选用例。

### 2. 黑盒 + 无障碍层定位

Maestro **不读你的源码**，像屏幕阅读器一样通过系统 API 获取 UI 树：

- Android：Accessibility / UiAutomator
- iOS：Accessibility / XCTest 接口

因此定位主要靠 **屏幕上可见的文字**、`id`、或相对位置，而不是 XPath 链。官方推荐优先用用户能看到的 label，测试与真实可访问性一致。

### 3. 声明式命令与智能等待

每条命令表达 **意图**，不是底层手势序列。引擎会 **自动等待** 元素出现、可点击、动画稳定后再执行——类似 Playwright 的 auto-wait，无需手写 `Thread.sleep`。

常用命令族：

| 命令 | 作用 |
|------|------|
| `launchApp` | 启动应用，可选 `clearState`、`stopApp` |
| `tapOn` / `doubleTapOn` / `longPressOn` | 点击、双击、长按 |
| `inputText` | 向当前焦点输入文字 |
| `assertVisible` / `assertNotVisible` | 断言元素存在或不存在 |
| `scroll` / `swipe` | 滚动与滑动手势 |
| `takeScreenshot` / `startRecording` | 截图与录屏，便于 CI 留证 |
| `runFlow` | 调用子 Flow，复用登录等公共步骤 |

### 4. 子 Flow 与条件分支

复杂套件用 **模块化** 避免复制粘贴：

- **`runFlow: login.yaml`**：把登录抽成子 Flow，多条主流程共用
- **`runFlow` + `when`**：按条件执行（例如仅当「允许通知」弹窗出现时才点 Allow）
- **`onFlowStart` / `onFlowComplete` hooks**：流程前后清缓存、登出等生命周期

还可嵌入 **JavaScript** 片段生成随机邮箱、调 HTTP API，在沙箱中运行（无本地文件系统访问）。

### 5. Maestro 工具链分工

| 组件 | 角色 |
|------|------|
| **Maestro CLI** | 开源执行引擎；本地与 CI 的主入口 |
| **Maestro Studio** | 可视化 IDE：镜像设备、点选元素生成 YAML、即时回放 |
| **Maestro Cloud** | 托管并行执行，上传 APK/IPA + Flows，缩短大规模回归时间 |
| **Maestro MCP** | 把设备与命令暴露给 AI Agent，用于自动生成/修复 Flow |

日常开发：**Studio 或手写 YAML 迭代** → **CLI 本地验证** → **CI / Cloud 批量跑**。

### 6. Workspace 与 `config.yaml`

项目根或 `.maestro/` 目录可放 **`config.yaml`**，统一配置默认 `appId`、环境变量、Flow 目录结构。大型仓库常按功能分子目录：

```
.maestro/
  config.yaml
  flows/
    smoke/
      login.yaml
      checkout.yaml
    subflows/
      onboarding.yaml
```

`maestro test .maestro/flows/smoke` 只跑冒烟子集。

## 安装与环境

macOS / Linux 一键安装 CLI（官方脚本）：

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro --version
```

前置条件：

- **Android**：已启动的模拟器或 USB 真机，`adb devices` 可见
- **iOS**：macOS 上的 Simulator 或真机，需 Xcode 工具链
- **Web**：桌面 Chromium 会话（`url:` 替代 `appId`）

验证环境是否就绪：

```bash
maestro test --help
# 或下载官方样例
maestro download-samples
```

Windows 需按官方文档使用 WSL 或替代安装路径。

## 实践案例

### 案例 1：Android 通讯录 — 创建联系人（官方 Quickstart 简化）

适合第一次跑通「写 YAML → 看模拟器自动操作」：

```yaml
# contacts_android.yaml
appId: com.google.android.contacts
---
- launchApp:
    clearState: true
- tapOn: Allow                    # 系统权限弹窗（若出现）
- tapOn: Create contact
- tapOn: First name
- inputText: John
- tapOn: Last name
- inputText: Doe
- tapOn: Company
- inputText: Maestro
- tapOn: "+1"
- inputText: 111-111-1111
- tapOn: Save
- back
- assertVisible: John Doe
- takeScreenshot: contact_created
```

执行：

```bash
# 确保 Android 模拟器已启动
maestro test contacts_android.yaml
```

终端会逐步打印每条命令的通过/失败；失败时 Maestro 指出 **找不到哪个文本/元素**，并保留截图路径。`clearState: true` 保证每次从干净应用状态开始，避免上次测试残留数据干扰。

### 案例 2：带环境变量与子 Flow 的登录冒烟

把登录抽成子 Flow，主流程只关心业务路径：

```yaml
# .maestro/subflows/login.yaml
appId: com.example.shop
---
- launchApp:
    clearState: true
- runFlow:
    when:
      visible: "稍后"
    commands:
      - tapOn: "稍后"              # 可选的开屏广告
- tapOn: "邮箱"
- inputText: ${EMAIL}
- tapOn: "密码"
- inputText: ${PASSWORD}
- tapOn: "登录"
- assertVisible: "首页"
```

```yaml
# .maestro/flows/smoke_add_to_cart.yaml
appId: com.example.shop
name: 加购冒烟
tags:
  - smoke
env:
  EMAIL: "qa@example.com"
  PASSWORD: "test-pass-123"
---
- runFlow: ../subflows/login.yaml
- tapOn: "搜索"
- inputText: "蓝牙耳机"
- tapOn: "搜索按钮"
- tapOn: "第一个商品"
- tapOn: "加入购物车"
- assertVisible: "已加入购物车"
```

执行整个冒烟目录并传入覆盖变量：

```bash
maestro test .maestro/flows/smoke \
  -e EMAIL=ci-user@corp.com \
  -e PASSWORD="$QA_PASSWORD"
```

**要点**：

- `${EMAIL}` 来自 Flow 内 `env` 或 CLI `-e`，敏感信息走 CI Secret，不写进仓库
- `runFlow` + `when: visible` 处理 **非确定性 UI**（广告、权限），比硬编码 `sleep` 稳
- `tags: smoke` 便于以后 `maestro test --include-tags=smoke` 只跑冒烟

### 案例 3：Web 单页断言（同一引擎）

Maestro 也支持桌面浏览器 Flow，语法与移动端一致：

```yaml
url: https://example.com
---
- launchApp
- tapOn: More information...
- assertVisible: Further Reading
```

适合「移动端 App + 营销站」用同一工具链做轻量回归。

## 与同类工具对比

| 维度 | Maestro | Appium | Detox |
|------|---------|--------|-------|
| 脚本形式 | YAML 声明式 | 多语言 + WebDriver API | JavaScript + Jest |
| 应用类型 | 黑盒，多技术栈 | 黑盒/灰盒，最广 | 灰盒，**仅 RN 为主** |
| 上手成本 | 低 | 中高 | 中 |
| 同步模型 | 内置智能等待 | 需显式等待策略 | RN 桥接层空闲检测 |
| 典型场景 | 快速冒烟、跨端 YAML、非开发维护 | 企业级多语言设备农场 | RN 深度 E2E、低 flake |

三者可共存：Maestro 铺 **宽而浅的旅程覆盖**，Detox 盯 **RN 核心路径**，Appium 覆盖 **特殊原生能力或已有 Java 测试资产**。

## 常见问题

**Q：元素找不到怎么办？**

用 Maestro Studio 的 **Inspect Screen** 点选控件，查看推荐 selector；或 `maestro hierarchy` 打印当前 UI 树。优先改用语义化 `accessibilityLabel` / `testID`，比坐标点击耐维护。

**Q：Flutter / RN 要额外配置吗？**

一般 **安装调试包到设备即可** 黑盒运行。Release 包若剥离了语义信息，断言会变难——保留 accessibility 标识是测试友好构建的一部分。

**Q：能在 Expo 项目里用吗？**

可以。需 **development build 或独立 APK/IPA**（含正确 `applicationId` / `bundleId`），在 Flow 里写对应 `appId`。纯 Expo Go 场景要用 Go 的 app id，且版本受通道影响，CI 更推荐固定 dev client 构建。

**Q：和 Playwright 如何分工？**

Playwright 管 **浏览器内** Web；Maestro 管 **装进设备的 App** 与 **桌面浏览器标签**（Maestro Web 模式）。团队可把「官网 + App」拆成两套 Flow，在 CI 不同 job 并行。

## 学习路径建议

1. **安装 CLI**，用官方 `contacts` 或 `download-samples` 跑通第一条 Flow（约 15 分钟）
2. **装 Maestro Studio**，用点选生成 YAML，理解 `tapOn` / `assertVisible` 与真实控件的对应关系
3. 为自己 App 写 **`login` 子 Flow + 一条核心业务冒烟**，接入 CI 的 `maestro test`
4. 阅读官方文档：[Flows 概述](https://docs.maestro.dev/maestro-flows)、[Flow 控制与逻辑](https://docs.maestro.dev/)、[JavaScript 扩展](https://docs.maestro.dev/)
5. 规模变大后评估 **Maestro Cloud** 并行与 **MCP** 辅助生成用例

## 小结

Maestro 把移动端 E2E 从「写代码驱动 WebDriver」收成 **「写清单描述用户行为」**：YAML Flow、黑盒无障碍定位、内置等待、子 Flow 组合，加上 CLI / Studio / Cloud 的分工，让零基础团队也能在一天内跑起第一条自动化旅程。它不一定取代 Appium 的设备农场或 Detox 的 RN 灰盒深度，但在 **可读性、上手速度、跨 Android/iOS/Web 统一语法** 上优势明显——值得作为移动端质量保障的默认第一站。
