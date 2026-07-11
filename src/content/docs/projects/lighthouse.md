---
title: Lighthouse — Google 出品的网页质量审计工具
来源: 'https://github.com/GoogleChrome/lighthouse'
日期: 2026-05-29
分类: 前端工具
难度: 初级
---

## 是什么

Lighthouse 是 Google 开源的**网页质量自动体检工具**。日常类比：像汽车 4S 店那种"全车检测仪"——你把车开进去，机器自己跑一圈，吐一份报告，告诉你哪里出问题、给个 0-100 评分。

你跑一行命令：

```bash
lighthouse https://example.com --view
```

浏览器自动弹出一份 HTML 报告，告诉你这个页面在**性能 / 可访问性 / 最佳实践 / SEO / PWA** 五个维度各得多少分，每条不及格的项还附带具体改进建议。

它就是 Chrome DevTools 里那个"Lighthouse"标签页的本体，也可以脱离浏览器在 CI 里跑。

## 为什么重要

不会用它，下面这些事都解决不了：

- 老板说"网站太慢"，但你不知道是图片大、JS 卡、还是服务器慢——一份 Lighthouse 报告就能定位
- 上线前要保证 Core Web Vitals（LCP / INP / CLS）合格；Lighthouse 实验室用 TBT 当 INP 的代理指标，没工具量化就是凭感觉
- 多人改 PR 不知道有没有把性能改坏，CI 里跑 Lighthouse 可以**自动卡阈值**，掉分就 fail
- 可访问性规则有几百条，靠人肉 review 不现实，Lighthouse 直接列出哪些 alt 缺、哪些对比度不够

## 核心要点

Lighthouse 的工作模式可以拆成 **三步**：

1. **真跑一次页面**：启动一个 headless Chrome，访问你给的 URL，全程录像（基于 DevTools 协议 trace），不是静态扫描。类比：质检不是看车的设计图，是真把车开起来测一圈。

2. **量化指标**：从 trace 里算出几十个数字——LCP（最大内容多久画出来）、TBT（主线程被长任务堵住多久，实验室里当 INP 的代理）、CLS（页面元素跳了多少次）等。每条按经验阈值映射成 0-100 分。注意：**Core Web Vitals 是 LCP / INP / CLS**；TBT 本身不是 CWV。

3. **加权汇总**：性能类别不是简单平均，而是按指标对体感的影响**加权**——实验室分里 TBT 约 30%、LCP 约 25% 等。这就是为什么改一处不一定提分多。

跑完产出 `report.html`（人看）和 `report.json`（机器看），CI 通常拿 JSON 解析。

## 实践案例

### 案例 1：本机一键审计 + 看报告

```bash
npm install -g lighthouse
lighthouse https://example.com --view
```

**逐部分解释**：

- `npm install -g lighthouse` 全局装 CLI（也可以 `npx lighthouse` 不装）
- `https://example.com` 要审计的 URL
- `--view` 跑完自动浏览器打开 HTML 报告

第一次跑会自动调用本机的 Chrome 启动 headless 模式。**全程在本地，不会把数据传到任何服务器**。

### 案例 2：CI 里只测 performance + JSON 输出

```bash
lighthouse https://staging.example.com \
  --only-categories=performance \
  --output=json \
  --output-path=./lh-report.json \
  --chrome-flags="--headless --no-sandbox"
```

**逐部分解释**：

- `--only-categories=performance` 只跑性能这一类，省一半时间
- `--output=json` 输出 JSON 格式（方便脚本读分数）
- `--chrome-flags="--no-sandbox"` Docker / CI 环境必带，不然 Chrome 启不起来

之后用 `jq '.categories.performance.score' lh-report.json` 读出分数，低于 0.8 就让 CI 失败。

### 案例 3：Node 模块编程式调用

```javascript
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
const result = await lighthouse('https://example.com', {
  port: chrome.port,
  output: 'json',
  onlyCategories: ['performance'],
});
console.log('LCP:', result.lhr.audits['largest-contentful-paint'].displayValue);
await chrome.kill();
```

**逐部分解释**：

- `chrome-launcher` 帮你拉起一个 Chrome 实例，返回它的调试端口
- `lighthouse(url, opts)` 跑审计，结果在 `result.lhr`（lighthouse result）
- `result.lhr.audits` 里是每个具体审计项，可以挑想要的字段单独打印

适合做自定义看板：跑一批 URL，把分数写进数据库。

## 踩过的坑

1. **每次跑分都不一样**：Lighthouse 模拟移动设备 + 4G 限速，机器负载、网络抖动都会让分波动 ±5。要稳定结论必须跑 5-10 次取中位数。

2. **本地分高、生产分低**：默认开"4 倍 CPU 降速"模拟中端手机，但你机器太快有时降速不充分。CI 上不同 runner 跑出的分也常差 10+ 分。

3. **--no-sandbox 不加 Chrome 就崩**：Docker / Linux CI 里直接跑会报 `Failed to launch chrome`，必须加 `--chrome-flags="--no-sandbox"`，否则容器内 Chrome 启不起来。

4. **不能直接审计登录后页面**：`lighthouse https://app.com/dashboard` 会被重定向到登录页。要么走 DevTools 面板（带着已有 cookie），要么先用 Puppeteer 登录再注入 Lighthouse。

## 适用 vs 不适用场景

**适用**：

- 单页 / 着陆页性能体检——一行命令出报告
- CI 里卡性能阈值——掉分就 fail
- 可访问性 / SEO 自动化检查——比人肉 review 全
- 跨多个 URL 的批量审计——脚本调 Node 模块

**不适用**：

- 监控真实用户性能（RUM）——Lighthouse 是实验室数据，要看真用户得用 [[web-vitals]]
- 后端 / API 性能——它只测前端
- 需要复杂登录流的页面——单纯 CLI 跑不动，要配合 Puppeteer
- 持续在线监控——它是离线一次性跑，要做 24/7 监控用 Sentry / Datadog 这类专门工具

## 历史小故事（可跳过）

- **2016 年 Google I/O**：Paul Irish 等 Chrome 团队发布 Lighthouse 第一版，最早只关注 PWA（渐进式 Web 应用）合规检查
- **2017 年**：集成进 Chrome DevTools 内置面板（之前是独立扩展），扩展到性能 + 可访问性 + SEO 多维度
- **2020 年**：Core Web Vitals 概念出来后，LCP / FID / CLS 成为性能评分核心，Lighthouse 同步对齐
- **2024 年**：First Input Delay（FID）退役，被 Interaction to Next Paint（INP）取代

社区项目：3w+ stars，Google 长期维护，是事实标准。

## 学到什么

1. **性能不能凭感觉**——把"慢"量化成 LCP / TBT / CLS 这些可对比的数字，才能改进
2. **实验室数据 vs 真实数据**：Lighthouse 是实验室（受控环境单次模拟），[[web-vitals]] 是真实（采集真用户）。两者互补，不能互替
3. **加权打分背后是研究**：每个指标的权重是 Google 用大量真实数据回归出来的，不是拍脑袋
4. **headless 浏览器是把利器**——Lighthouse、[[playwright]]、Puppeteer 全靠它，CI 里跑前端测试都绕不开

## 延伸阅读

- 视频教程：[Web.dev — Lighthouse 入门](https://www.youtube.com/watch?v=5fLW5Q5ODiE)（10 分钟把面板每一项讲一遍）
- 官方文档：[Chrome Developers — Lighthouse Overview](https://developer.chrome.com/docs/lighthouse/overview)（指标与原理）
- Core Web Vitals 详解：[web.dev/vitals](https://web.dev/vitals/)（LCP / INP / CLS 阈值与背景）
- [[web-vitals]] —— 同样是 Google 出品，但用于真实用户监控
- [[playwright]] —— 端到端测试常和 Lighthouse 一起在 CI 里跑

## 关联

- [[web-vitals]] —— 真实用户性能数据采集，Lighthouse 的"线上生产环境"对应物
- [[playwright]] —— 浏览器自动化，可以驱动登录后再注入 Lighthouse 做认证页审计
- [[vite]] —— 现代前端构建工具，关注的指标和 Lighthouse 报告项高度重合
- [[next-js]] —— 内置许多 Lighthouse 高分实践（图片优化 / 代码分割 / 字体优化）
- [[webpack]] —— 老牌打包工具，Lighthouse 报告里"未使用代码"问题大多在它的配置层解决
- [[astro]] —— "0 JS by default" 的静态优先框架，天生 Lighthouse 高分
- [[biome]] —— 代码层面工具链；和 Lighthouse 一上一下，覆盖不同质量维度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[next-js]] —— Next.js — React 全栈框架
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[teku]] —— Teku — 用 Java 写的以太坊共识层客户端
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
- [[webpack]] —— webpack 模块打包

