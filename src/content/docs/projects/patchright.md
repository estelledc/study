---
title: patchright — 给 Playwright 打 patch 让浏览器自动化在反 bot 站点继续工作
来源: 'https://github.com/Kaliiiiiiiiii-Vinyzu/patchright'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

patchright 是一组**给 Playwright 源码打 patch 的脚本**——不是新 driver，也不是 stealth 插件，是直接 fork Playwright 源码、用 ts-morph AST 改写函数，把会暴露"我是机器人"的那几行代码删掉、换掉。日常类比：

> Playwright 默认像一个**穿着工牌的访客**——前台扫一眼工牌就知道你是公司派来的。
> patchright 不教访客戴帽子遮工牌（那是 stealth 插件做的事），它直接**重新印一张没工牌的访客证**，发给同一个访客，让他从头看起来就和路人一样。

最小用法：

```python
# 改 1 行 import 就行
# from playwright.async_api import async_playwright   ← 原来
from patchright.async_api import async_playwright     # ← 现在
```

爬虫脚本其他代码 0 修改，立刻能在 Cloudflare / Datadome 这类反 bot 站点继续工作。

## 为什么重要

不理解 patchright，下面这些事都没法解释：

- 为什么按教程写的 Playwright 爬虫一上线就被 Cloudflare 5 秒挑战拦——明明本机调试都能过
- 为什么 playwright-stealth 这种"在用户层假装 navigator.webdriver = false"的方案越来越打不过反 bot
- 为什么"反 bot vs 反反 bot"是一场猫鼠游戏，patchright 这种 fork 路线和 stealth 插件路线哲学完全不同
- 为什么 driver 层的 1 个 patch 能抵 30 行用户层 init script
- 为什么生产环境用反 bot 库必须 pin 死版本，不能写 `>=1.60` 这种浮动依赖

## 核心要点

patchright 的 patch 分**三层**，对应反 bot 检测的三层：

1. **启动参数手术**：Chromium 启动时默认带 `--enable-automation` 这种参数，反 bot 一看就识破。`chromiumSwitchesPatch.ts` 把这些可疑参数（`--enable-automation` / `--disable-extensions` / `--disable-default-apps` 等十几个）全删了，再加一个 `--disable-blink-features=AutomationControlled`——这一行让 Chromium 内部根本不写 `navigator.webdriver = true`，从根上拔掉机器人标记。

2. **Runtime.enable 替换成 isolated world**：vanilla Playwright 启动 page 时会发 `Runtime.enable` CDP 命令，这一句让浏览器广播 `executionContextCreated` 事件，反 bot 监听这个事件就识破。`framesPatch.ts` 不发这个命令，改成对每个 frame 按需 `Page.createIsolatedWorld` 创建独立 world，反 bot 看不见全局事件。代价是每次 evaluate 要决定跑哪个 world——main / iframe / utility 三个 world 各自隔离。

3. **init script 投递改走 HTTP route**：vanilla Playwright 的 `add_init_script` 走 CDP 协议 `Page.addScriptToEvaluateOnNewDocument`，反 bot 能枚举这些 script id。patchright Python 层把投递路径换掉——`route('**/*')` 拦 HTTP 响应、在 HTML `<head>` 后直接 `<script>...</script>` 注入，反 bot 看到的就是页面"自带"的脚本。

三层加起来叫 **driver 层 patcher 路线**——和 playwright-stealth 的"用户层叠加"路线哲学相反。

## 实践案例

### 案例 1：改 1 行 import 让现有爬虫立刻反 bot

已有 Playwright 爬虫脚本，只动 import 行：

```python
import asyncio
from patchright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir="./udata",
            channel="chrome",       # 不是 chromium
            headless=False,         # 必须有头
            no_viewport=True,
        )
        page = await ctx.new_page()
        await page.goto("https://bot.sannysoft.com/")
        webdriver = await page.evaluate("navigator.webdriver")
        print(webdriver)            # undefined，不再是 true
        await ctx.close()

asyncio.run(main())
```

`launch_persistent_context + channel='chrome' + headless=False + no_viewport=True` 是 README 推荐的四件套——少一个都漏。`channel='chrome'` 让你用真正的 Google Chrome（不是 Chromium 开源版），自带的 chrome.* 全局对象不缺；`no_viewport=True` 不强制 viewport 大小，避免和真人浏览器分辨率分布不符。

### 案例 2：对照实验看每一层 patch 的作用

同一脚本跑 [bot.sannysoft.com](https://bot.sannysoft.com/) 截图对比：vanilla Playwright 4 项关键检测（WebDriver / Chrome / Permissions / WebDriver Advanced）全红，patchright 4 项全绿。

把 patchright 那一行 `--disable-blink-features=AutomationControlled` 注释掉重跑——其他 patch 全在，但 WebDriver 检测立刻变红。这个对比让你身体感知到：**patchright 不是一个魔法咒语，是几十个独立的小手术**，每个对应一个具体检测向量。多数反 bot 系统是 30+ 个检测项并查，patchright 的每个小 patch 都是为关闭 1 个向量存在的。

### 案例 3：拿 driver_patches/ 当反爬向量地图

仓库 `driver_patches/` 下 30 个 `*Patch.ts` 文件，每一个修一类检测：`chromiumSwitchesPatch.ts` 修启动参数，`framesPatch.ts` 修 Runtime.enable，`crNetworkManagerPatch.ts` 修 init script 注入路径，`pageBindingPatch.ts` 修 expose_binding 通道。读完这 30 个文件等于把 2026 年反 bot 检测向量过了一遍——比看任何反爬教程都直接，每个 patch 都对应一篇"反 bot 是怎么检测的"小论文。

## 踩过的坑

1. **console.log 失效**：patchright 直接禁用 `Console.enable`，`page.on('console', ...)` 收不到任何事件。调试要靠 JS 注入 logger 或 trace viewer，不能像 vanilla Playwright 那样直接看控制台。

2. **headless=True 反而被检测**：和直觉相反——必须 `headless=False`。反 bot 会查 `--headless` flag 和 GPU/audio context 差异。CI 跑要配 Xvfb 虚拟显示器，部署成本上升。

3. **只支持 Chromium**：Firefox / WebKit 的 driver 接口完全不同，patchright 不动它们。多浏览器测试场景别想，作者 README 明确说"not supported"。

4. **CSP 严格站点 init script 失效**：route 注入 inline `<script>` 在 `script-src 'self'` 站点会被浏览器拒绝。GitHub / Twitter 这种 CSP 严格的站点反爬本身也不强，不冲突，但要知道边界。

5. **维护者就 2 个人**：driver patcher 的更新节奏跟 Playwright 上游，一旦上游做大重构（如 v2 重写 CDP layer），patchright 可能数周不可用。生产环境用必须 pin 死版本，不要写 `>=1.60` 浮动依赖。

## 适用 vs 不适用场景

**适用**：
- 生产爬虫、价格监控、多账号操作——目标站点用 Cloudflare / Datadome / Akamai 这类反 bot
- 已有 Playwright 项目想低成本上反 bot——只改 import，不改业务逻辑
- 学反爬向量——读 patchright 30 个 patch 文件就能列清 2026 年的检测点
- 教学场景对照演示——给学生看"反 bot vs 反反 bot"两条路线（用户层 stealth vs driver fork）的具体实现差异

**不适用**：
- 跨浏览器测试（需要 Firefox / WebKit）→ 用 vanilla Playwright + stealth 插件凑合
- 反爬轻度、只是 navigator.webdriver 检测 → playwright-stealth 够用，少一层 fork 维护
- 老 Selenium 项目迁移成本高 → undetected-chromedriver 是更小步子的方案
- 需要 IP 代理池、captcha 识别 → patchright 只反指纹层，IP / 人机验证要另外配
- 严合规场景——作者 README 写"educational purposes only"自我免责，公司用要让法务先过一遍 Apache-2.0 license 是否覆盖你的用法

## 历史小故事（可跳过）

- **2018 前后**：playwright-stealth / undetected-chromedriver 路线兴起，思路是"在用户层 monkey patch navigator.webdriver"——给 Page 加 init script 假装自己不是机器人。够用了几年。
- **2022-2023**：Cloudflare / Datadome 升级到查 CDP 协议层（监听 Runtime.enable / executionContextCreated 事件、识别 utility world 名字），用户层 stealth 集体失守——你 init script 改 `navigator.webdriver`，反 bot 早就在你 init 之前看到 CDP 信号了。
- **2024**：作者判断"用户层永远赶不上 driver 层泄漏"，用 ts-morph 重做 fork patcher 路线——AST 改写让 patcher 跟上游 Playwright 同步成本可控（每次新版 Playwright 出来重跑 patcher 即可，不用维护一份长期 fork）。
- **2025-2026**：姊妹项目 [CDP-Patches](https://github.com/Kaliiiiiiiiii-Vinyzu/CDP-Patches/) 同期补 OS 层指纹（input event timing），和 patchright 形成 driver + OS 双层覆盖；周更跟随 Playwright 上游版本。

## 学到什么

1. **反 bot 检测分三层**：启动参数（Layer A）/ CDP 协议（Layer B）/ JS 运行时（Layer C）。stealth 插件只能补 Layer C，driver fork 才能同时补 A+B+C——这层级模型是反爬通用心智。
2. **用户层 vs driver 层**是一条根本分水岭——决定了你能修哪些泄漏、不能修哪些。看任何 stealth 类项目，先问"它在哪一层"。
3. **AST 改写比字符串替换鲁棒一个数量级**——ts-morph 操作 TypeScript AST 的方式让 patcher 在上游格式微调（多空格、引号样式）时不会断。下次写"patch 别人 TypeScript 包"的脚本记住这个工具。
4. **fork patcher 模式可迁移**——任何"上游升级我都要 follow，但有几处永远要 monkey patch"的场景都可以照搬：写一个 patcher 函数集，每次上游升级跑一遍即可。

## 延伸阅读

- 仓库 README（driver）：[Kaliiiiiiiiii-Vinyzu/patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)
- 仓库 README（Python wrapper）：[Kaliiiiiiiiii-Vinyzu/patchright-python](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python)
- 反 bot 检测库：[Brotector](https://kaliiiiiiiiii.github.io/brotector/)（看反 bot 用什么 JS API 探测自动化）
- 姊妹项目：[CDP-Patches](https://github.com/Kaliiiiiiiiii-Vinyzu/CDP-Patches/)（补 OS 层 input event 指纹）
- ts-morph 文档：[ts-morph.com](https://ts-morph.com/)（写自己的 patcher 时用）
- 同思路 patcher：[rebrowser-patches](https://github.com/rebrowser/rebrowser-patches)（作者互相鸣谢，可对照看实现差异）

## 关联

- [[playwright]] —— patchright 的 fork 对象，没它就没 patchright；改 1 行 import 切换
- [[browser-use]] —— LLM 驱动浏览器的 agent，底层也用 Playwright，遇到反 bot 站点可换 patchright 入口
- [[steel-browser]] —— 浏览器即服务，自带反 bot 能力，和 patchright 是同问题不同形态的方案
- [[nanobrowser]] —— 浏览器自动化框架，反 bot 不是它的强项，和 patchright 是互补关系
- [[playwright]] 上的 stealth 插件路线代表用户层补丁哲学，patchright 代表 driver 层 fork 哲学，对照看更清楚
- 姊妹项目 CDP-Patches 同作者出品，补 OS 层 input event timing 指纹，和 patchright 形成 driver+OS 两层覆盖
- ts-morph + AST 改写是 patchright 的工程基础，也是其他 fork patcher 项目（如 rebrowser-patches）的同款工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 用自然语言让 AI Agent 操控浏览器
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务

