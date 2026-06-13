---
title: CloakBrowser — 会"隐身"的 Chromium 浏览器
来源: https://github.com/CloakHQ/CloakBrowser
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# CloakBrowser — 会"隐身"的 Chromium 浏览器

## 日常类比：为什么浏览器会被"认出来"

想象你去一家高级俱乐部。老板认识每一个常客的长相、走路姿势、说话习惯。如果你穿了一身明显从便利店买来的"假西装"，再说话带着生硬的机器腔，老板一眼就能认出你是机器人，直接拦在门外。

普通自动化工具（比如直接用 Playwright 或 Puppeteer）就像这身"假西装"——浏览器看起来是 Chrome，但骨子里到处写着"我是自动化脚本"。比如：

- 告诉服务器"我是人类"（`navigator.webdriver` 变量设为 `true`）
- 鼠标点击瞬间瞬移（没有真实人类的曲线运动轨迹）
- 键盘输入一个字不打（一次性填入，不像人打字有停顿）
- 缺少显卡、字体、插件等硬件信息

CloakBrowser 的做法是：直接改 Chrome 的源代码（C++ 级别），把那些"暴露身份"的特征全部改掉。改完编译出来的浏览器，**就是一台真正的 Chrome**。它不是外挂插件，不是 JS 注入，而是从内核里就"正常"。

## 核心概念

### 1. 源码级补丁（Source-level Patches）

CloakBrowser 对 Chromium 源码做了 58 处修改，覆盖：

- Canvas 指纹、WebGL 指纹、音频指纹
- 字体列表、GPU 信息、屏幕尺寸
- WebRTC 泄漏的本地 IP
- 网络请求的时间特征
- 自动化信号（如 `navigator.webdriver`）

这些补丁是**编译到二进制文件里**的，不是运行时注入的。所以检测系统看到的，就是一个正常的 Chrome。

### 2. 零配置隐身

默认启动就隐身——每次运行自动生成一个随机"指纹种子"，然后从这个种子派生出 GPU、屏幕分辨率、硬件并发数等所有信息。每次运行都像一个全新访客。

### 3. 行为拟人（Humanize）

光伪装"长相"还不够，行为也要像人。CloakBrowser 提供 `humanize=True` 选项：

| 交互类型 | 默认 | humanize=True |
|---------|------|--------------|
| 鼠标移动 | 瞬间瞬移 | 贝塞尔曲线 + 微小偏差 |
| 点击 | 瞬间 | 有瞄准点 + 按压力度 |
| 键盘输入 | 一次性填入 | 逐字符打字 + 思考停顿 |
| 滚动 | 直接跳转 | 加速→巡航→减速 |

### 4. Playwright / Puppeteer 一键替换

API 完全兼容 Playwright，代码几乎不用改——只需替换 `import` 行。

## 代码示例

### 示例一：Python — 基础用法（3 行替换）

把原来的 Playwright 代码改成 CloakBrowser，只需要动两行：

```python
# 原来的 Playwright 写法
from playwright.sync_api import sync_playwright
pw = sync_playwright().start()
browser = pw.chromium.launch()

# 改成 CloakBrowser，只要改这两行
from cloakbrowser import launch
browser = launch()   # 自带隐身，无需额外配置

page = browser.new_page()
page.goto("https://example.com")
print(page.title())
browser.close()
```

就这么简单——`launch()` 返回的对象和 Playwright 的 `Browser` 完全一样，后续代码一行都不用改。

### 示例二：Python — 拟人行为 + 代理

针对有反爬保护的网站，加上代理和拟人行为：

```python
from cloakbrowser import launch

browser = launch(
    proxy="http://user:pass@residential-proxy:8080",  # 使用住宅 IP，非数据中心
    geoip=True,                                       # 时区/语言自动匹配代理 IP 所在地
    headless=False,                                   # 某些网站能检测 headless 模式
    humanize=True,                                    # 开启拟人行为
    human_preset="careful",                           # "谨慎"模式：更慢、更像真人
)

page = browser.new_page()
page.goto("https://protected-site.com")

# 模拟真人打字（逐字符 + 停顿 + 偶尔打错再纠正）
page.locator("#email").fill("user@example.com")

# 模拟真人鼠标点击（贝塞尔曲线移动 + 瞄准 + 按压）
page.locator("button[type=submit]").click()

browser.close()
```

### 示例三：JavaScript (Playwright) — 固定指纹种子

如果你需要反复访问同一个网站，固定指纹种子会让浏览器看起来像"老访客"：

```javascript
import { launch } from 'cloakbrowser';

const browser = await launch({
    args: ['--fingerprint=42069'],  // 固定种子 = 固定指纹 = 老访客
});

const page = await browser.newPage();
await page.goto('https://example.com');
console.log(await page.title());

await browser.close();
```

## 检测对比：CloakBrowser vs 普通 Playwright

| 检测项目 | 普通 Playwright | CloakBrowser |
|---------|---------------|-------------|
| reCAPTCHA v3 分数 | 0.1（机器人） | 0.9（人类） |
| Cloudflare Turnstile | 失败 | 通过 |
| FingerprintJS 检测 | 被检测 | 通过 |
| `navigator.webdriver` | `true` | `false` |
| 插件数量 | 0 | 5（和真实 Chrome 一样） |

## 安装

```bash
# Python
pip install cloakbrowser

# Node.js
npm install cloakbrowser playwright-core
```

首次运行会自动下载约 200MB 的隐身 Chromium 二进制文件，本地缓存，后续直接复用。也可以 Docker 一键体验：

```bash
docker run --rm cloakhq/cloakbrowser cloaktest
```

## 浏览器配置管理器

CloakBrowser 还提供了一个类似 Multilogin / AdsPower 的多账号管理器，支持创建独立的浏览器配置文件（每个配置有独特的指纹、代理和持久会话），通过 Docker 启动后用浏览器管理：

```bash
docker run -p 8080:8080 -v cloakprofiles:/data cloakhq/cloakbrowser-manager
```

打开 `http://localhost:8080` 就能创建和管理浏览器配置。

## 技术架构简图

```
你的代码（Playwright API）
        │
        ▼
CloakBrowser 封装层（Python / JS）
  → 注入隐身启动参数
  → humanize 行为补丁
        │
        ▼
自定义编译的 Chromium 二进制
  → 58 处 C++ 源码级补丁
  → Canvas / WebGL / Audio / GPU / WebRTC 等指纹全部修改
        │
        ▼
网站反爬系统看到的就是一个普通的 Chrome 浏览器
```

## 学习要点总结

1. **CloakBrowser 不是插件，不是 JS 注入**，而是改了 Chromium 源码后重新编译的二进制文件
2. **58 处 C++ 级补丁**，从底层改指纹，检测系统无法区分
3. **`humanize=True`** 让鼠标、键盘、滚动行为都像真人
4. **和 Playwright 完全兼容**，只需替换 `launch()` 一行代码
5. 支持 Python 和 JavaScript（Node.js），支持 Playwright 和 Puppeteer
6. 首次运行自动下载二进制，无需手动配置

## 进一步了解

- GitHub 仓库: https://github.com/CloakHQ/CloakBrowser
- PyPI 页面: https://pypi.org/project/cloakbrowser/
- npm 页面: https://www.npmjs.com/package/cloakbrowser
- 浏览器管理器: https://github.com/CloakHQ/CloakBrowser-Manager
