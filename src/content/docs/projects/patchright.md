---
title: patchright — 给 Playwright 打 patch 让浏览器自动化在生产环境真正用得上
description: 不是新 driver、不是 stealth 插件，是直接 fork Playwright 源码 ts-morph AST 改写——拔掉 Runtime.enable / 加 isolated world / route fallback 注入 init script
sidebar:
  order: 47
  label: Kaliiiiiiiiii-Vinyzu/patchright
---

> Kaliiiiiiiiii-Vinyzu/patchright，driver commit `5032dbfd82f475ff705c5a70a15bdd9c26db6fb9`（2026-05-28 读，main 分支 HEAD）；
> Python 包 commit `392e8a369cf8cfefcf2158c6392401f6a3b65fa5`（patchright-python @ 2026-05-28）。Apache-2.0。
>
> patchright 解决的是浏览器自动化最尴尬的现实：
> **Playwright 默认配置在 2026 年的反爬环境下基本是「自带身份证去翻墙」**——
> Cloudflare / Datadome / Akamai / Kasada 任何一家都能在一个页面加载内识破。
>
> 不是 Playwright 不努力——它是给「QA 测试自家产品」设计的，
> 自家产品根本不需要绕反 bot。
> 把同一套 driver 拿去做爬虫 / 监控 / 价格抓取 / 多账号操作，全部塌房。
>
> patchright 的工程哲学是：**与其在用户层写 init script 假装 navigator.webdriver，
> 不如直接 fork Playwright 源码、用 ts-morph 在 AST 层把可被检测的 CDP 调用全部删掉**。
> 第一类竞品（playwright-stealth / undetected-chromedriver）做用户层补丁——
> 反 bot 的检测路径会绕过用户层。patchright 做 driver 层补丁，反 bot 没得绕。
>
> Season 11 第二篇 · v1.1 项目类型分支 B（工具库）。
> 心脏物 = 一组 ts-morph patch 函数 + 一个 Python AST 重写脚本，
> 共同把 vanilla Playwright 重塑成 undetected 版本。

## 一句话定位

**patchright = Playwright 的 fork patcher**。
不发布独立 driver——它发布一组 `ts-morph` 写的 AST 改写函数（`driver_patches/`），
clone 一份 Playwright 源码、跑 patcher、重新打包。
Python 版还多一层：`patch_python_package.py` 用 Python AST 重写 `playwright-python` 包，
让 `from patchright.async_api import async_playwright` 完全 drop-in 替换 Playwright。

## 为什么需要它（Why）

反 bot 系统的检测分三层（粗到细）：

```
Layer A · 启动参数指纹
   - 命令行 --enable-automation / --remote-debugging-port
   - User-Agent 是不是默认 Headless Chrome
   - 进程列表里有没有 chromedriver / playwright 进程

Layer B · CDP 协议指纹
   - 浏览器收到 Runtime.enable / Console.enable 后行为变化
   - Page.addScriptToEvaluateOnNewDocument 注册的 script 可被反 bot 探测到 id
   - Runtime.executionContextCreated 暴露 utility world 名字（如 "__playwright_utility_world__"）

Layer C · JS 运行时指纹
   - navigator.webdriver === true
   - window.chrome 缺失或不完整
   - navigator.plugins.length 异常
   - WebGL renderer 字符串里有 "SwiftShader"
   - Permission API 返回 "denied" 但 Notification.permission === "default"（矛盾态）
```

[Brotector](https://kaliiiiiiiiii.github.io/brotector/) 这种纯 JS 检测能覆盖 Layer C；
[Cloudflare](https://www.cloudflare.com/) / [Datadome](https://datadome.co/) 三层都查。

**playwright-stealth / puppeteer-extra-stealth 只能补 Layer C**——
在用户层 `addInitScript` 改 `navigator.webdriver`，但 Layer B 的 CDP 调用早就漏出来了。
反 bot 服务发现「Runtime.enable 触发了一次」，下面任何 stealth 都没用。

**patchright 的判断分水岭**：

1. **不要在用户层补 stealth**——往下走，到 Playwright server 进程改 CDP 调用本身
2. **不要 fork 一份 Playwright 维护**——用 ts-morph AST 改写源码，每次新版 Playwright 出来重跑 patcher 即可
3. **Chromium only**——Firefox / WebKit 的 driver 接口不同，patch 不动；放弃多浏览器换 stealth
4. **Console API 直接禁用**——保住隐蔽性比保住 `console.log` 重要
5. **init script 不走 CDP，走 route fallback**——这是 Python 层的关键创新

作者在 [README](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/5032dbfd82f475ff705c5a70a15bdd9c26db6fb9/README.md#L100-L114) 的原话：

> *"This is the biggest Patch Patchright uses. To avoid detection by this leak,
> patchright avoids using Runtime.enable by executing Javascript in (isolated) ExecutionContexts."*

这一句决定了整个项目的架构走向——从「stealth 插件」彻底改成了「driver fork」。

## 核心信息表（Layer 0）

| 字段 | 值 |
|---|---|
| 仓库（driver） | [Kaliiiiiiiiii-Vinyzu/patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) |
| 仓库（Python wrapper） | [Kaliiiiiiiiii-Vinyzu/patchright-python](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python) |
| star / fork（driver） | ~3.3k / ~168（2026-05 读） |
| star / fork（Python） | ~1.4k / ~102 |
| 最近活跃 | driver `5032dbfd`（2026-05-28），Python `392e8a36`（2026-05-28），周更跟随 Playwright 上游版本 |
| 读时 commit | driver `5032dbfd82f475ff705c5a70a15bdd9c26db6fb9` / python `392e8a369cf8cfefcf2158c6392401f6a3b65fa5` |
| 最新 release | v1.60.0（2026-05-21，pin 到 Playwright 1.60） |
| 主语言 | TypeScript 98.1%（driver patches）+ Python 96.6%（python wrapper） |
| 维护方 | 个人项目—— [@Vinyzu](https://github.com/Vinyzu/) (active) + [@Kaliiiiiiiiii](https://github.com/kaliiiiiiiiii/) (co)，赞助商 SwiftProxy / RapidProxy |
| 主要贡献者 | Vinyzu / Kaliiiiiiiiii / 少量社区 PR |
| License | Apache-2.0（biggest concern：作者 README 写「educational purposes only」自我免责） |
| 类似项目 | playwright-stealth（同样 stealth 但只补 JS 层）/ undetected-chromedriver（Selenium fork，老牌）/ rebrowser-patches（同思路 patcher，作者互相鸣谢）/ camoufox（Firefox fork） |
| 部署形态 | `pip install patchright` + `patchright install chromium`，或 `npm i patchright`；不需要独立 server，直接替换 import |

> bus factor 警示：**driver 维护就 2 个人**。一旦 Playwright 上游做大改（如 v2 重写 CDP 层），
> patcher 可能要等数周修复。生产环境用必须 pin 死 patchright 版本，不要 floating。

## 项目类型自标 · v1.1 分支 B 工具库

- **类型**：工具库——小 surface API（drop-in import 替换 Playwright），单一职责（让 Chromium 自动化反检测），
  核心 4014 行 TypeScript（driver patches）+ 781 行 Python（wrapper patcher）
- **心脏物**：3 个 patch 文件
  - `driver_patches/chromiumSwitchesPatch.ts`（42 行）—— Chromium 启动参数手术
  - `driver_patches/framesPatch.ts`（1068 行）—— Runtime.enable 替换为 isolated world
  - `patch_python_package.py`（781 行）—— Python 包 AST 重写 + route fallback 注入
- **不是这些类型**：
  - 不是大型应用（用户产品）—— 它是一组改写脚本
  - 不是编译器/运行时—— 没有 input → transformed output 的 pipeline
  - 不是框架/SDK—— 没有暴露 plugin 扩展点，作者明确说"drop-in replacement"

## Figure 1 · patchright vs Playwright detection paths

![Figure 1: patchright vs Playwright — Detection Paths](/projects/patchright/01-architecture.webp)

整张图分四个 Phase 比较两个 driver：

1. **Phase 1（Chromium 启动）**：左侧 vanilla 留下 5 个可疑 switch，右侧 patchright `chromiumSwitchesPatch.ts` 全部删除并加上 `--disable-blink-features=AutomationControlled`
2. **Phase 2（CDP Runtime channel）**：左侧 `Runtime.enable` 一次性暴露 cdc_*** 全局变量、console.debug 侧信道；右侧用 `Page.createIsolatedWorld` + `grantUniveralAccess: true` 把 evaluate 全部隔离到 utility world
3. **Phase 3（init script 投递）**：左侧 `Page.addScriptToEvaluateOnNewDocument` + `Runtime.addBinding` 都被反 bot 探测到；右侧 `install_inject_route` 用 `route('**/*')` 拦截 document 请求，在 HTML 响应里直接注入 script
4. **Phase 4（检测结果）**：bot.sannysoft.com 的 4 项关键检测，左侧 4 红，右侧 4 绿

caption 关键节点：左红色块代表"被检测的调用路径"，右绿色块代表"patchright 的替代实现"，
连接二者的隐含箭头是「ts-morph AST 改写」——不是运行时拦截，是源码层换掉。

## 仓库地形（Layer 2）

driver patcher 仓库（patchright/）：

```
patchright/
├── driver_patches/                           ← ★ 核心：30 个 patch 函数
│   ├── index.ts                              ← 一个 export *，把所有 patch 汇总
│   ├── chromiumSwitchesPatch.ts        42行  ← ★ 启动参数（Phase 1）
│   ├── chromiumPatch.ts                      ← Chromium class 通用改动
│   ├── crPagePatch.ts                  483行 ← ★ CDP page session 主体（Phase 2 一半）
│   ├── crNetworkManagerPatch.ts        524行 ← 网络拦截 + initScript 注入
│   ├── crBrowserPatch.ts                     ← Browser class
│   ├── crServiceWorkerPatch.ts               ← service worker 通道
│   ├── framesPatch.ts                  1068行← ★★ Frame 主类，isolated world 实现
│   ├── frameSelectorsPatch.ts          319行 ← selector 引擎适配 isolated world
│   ├── frameDispatcherPatch.ts               ← server-side dispatcher
│   ├── pagePatch.ts                    169行 ← Page class
│   ├── pageBindingPatch.ts                   ← binding 注入路径替换
│   ├── pageDispatcherPatch.ts                ← page dispatcher
│   ├── networkDispatchersPatch.ts            ← network dispatcher
│   ├── browserContextPatch.ts                ← BrowserContext + add_init_script hook
│   ├── browserContextDispatcherPatch.ts      ← server-side BC dispatcher
│   ├── javascriptPatch.ts              67行  ← ★ JSHandle.evaluateExpression 加 isolatedContext 参数
│   ├── jsHandleDispatcherPatch.ts            ← JSHandle dispatcher
│   ├── XPathSelectorEnginePatch.ts           ← XPath 在 closed shadow root 的支持
│   ├── recorderPatch.ts                      ← codegen recorder
│   ├── screenshotterPatch.ts                 ← screenshot 不踩 Runtime.enable
│   ├── snapshotterPatch.ts                   ← snapshot 同上
│   ├── snapshotterInjectedPatch.ts           ← snapshot 注入脚本
│   ├── tracingPatch.ts                       ← trace viewer
│   ├── clockPatch.ts                         ← clock helper
│   ├── crCoveragePatch.ts                    ← coverage
│   ├── crDevToolsPatch.ts                    ← devtools
│   ├── launchAppPatch.ts                     ← launchApp
│   ├── cliAliasPatch.ts                      ← CLI alias 改名
│   ├── utilityScriptSerializersPatch.ts 305行← utility 脚本序列化
│   └── utils.ts                              ← assertDefined 等小工具
├── patchright-nodejs/                        ← submodule，client patches（drop-in 包）
├── patchright_driver_patch.ts          165行 ← ★ 主入口，按顺序调所有 patch 函数
├── patchright.patch                  ~457KB  ← 落到磁盘的最终 diff（CI 输出，方便 review）
└── utils/                                    ← release / extract / impact 检查脚本
```

Python wrapper 仓库（patchright-python/）：

```
patchright-python/
├── patch_python_package.py             781行 ← ★ Python AST 重写主脚本
├── pyproject.toml                            ← package = patchright（不是 playwright）
├── utils/                                    ← release helper
└── README.md                                 ← drop-in 用法示例
```

**心脏文件 3 选**（v1.1 工具库 2-3 个心脏）：

| 文件 | 行数 | 角色 |
|---|---|---|
| `driver_patches/chromiumSwitchesPatch.ts` | 42 | Phase 1 启动参数手术，最易读、最直接 |
| `driver_patches/framesPatch.ts` | 1068 | Phase 2 isolated world 实现，patchright 最重的一个 patch |
| `patch_python_package.py` | 781 | Phase 3 init script 投递改道，Python 层独有 |

## Layer 3 · 心脏代码精读

### Layer 3.1 · chromiumSwitchesPatch — 启动参数手术

源文件：`driver_patches/chromiumSwitchesPatch.ts`，patch driver 的第一个动作。
[GitHub permalink → driver_patches/chromiumSwitchesPatch.ts#L1-L42](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/5032dbfd82f475ff705c5a70a15bdd9c26db6fb9/driver_patches/chromiumSwitchesPatch.ts#L1-L42)：

```typescript
import { type Project, SyntaxKind } from "ts-morph";

// -----------------------------------
// server/chromium/chromiumSwitches.ts
// -----------------------------------
export function patchChromiumSwitches(project: Project) {
	const chromiumSwitchesSourceFile = project.addSourceFileAtPath(
		"packages/playwright-core/src/server/chromium/chromiumSwitches.ts");

	const chromiumSwitchesArrow = chromiumSwitchesSourceFile
		.getVariableDeclarationOrThrow("chromiumSwitches")
		.getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction);

	const chromiumSwitchesArray = chromiumSwitchesArrow
		.getBody()
		.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);

	// Patchright defined switches to disable
	const switchesToDisable = [
		"assistantMode ? '' : '--enable-automation'",
		"'--disable-popup-blocking'",
		"'--disable-component-update'",
		"'--disable-default-apps'",
		"'--disable-extensions'",
		"'--disable-client-side-phishing-detection'",
		"'--disable-component-extensions-with-background-pages'",
		"'--allow-pre-commit-input'",
		"'--disable-ipc-flooding-protection'",
		"'--metrics-recording-only'",
		"'--unsafely-disable-devtools-self-xss-warnings'",
		"'--disable-back-forward-cache'",
		"'--disable-features=ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyComponentUpdater,AvoidUnnecessaryBeforeUnloadCheckSync,Translate,HttpsUpgrades,PaintHolding,ThirdPartyStoragePartitioning,LensOverlay,PlzDedicatedWorker'"
	];
	chromiumSwitchesArray
		.getElements()
		.filter((element) => switchesToDisable.includes(element.getText()))
		.forEach((element) => { chromiumSwitchesArray.removeElement(element); });

	chromiumSwitchesArray.addElement(`'--disable-blink-features=AutomationControlled'`);
}
```

**旁注 1（为什么用 ts-morph 而不是 string replace）**：作者要从 Playwright 一个普通的
`chromiumSwitches.ts` 数组里精准删 13 个字符串字面量。如果用 sed/regex，每次 Playwright
源代码格式微调（多个空格、引号样式）都会断。ts-morph 把 TypeScript AST 当成 React 树一样
操作，`getElements()` 是稳定的——这等于"声明式 patcher"，比"过程式 diff"鲁棒得多。

**旁注 2（每个被删 switch 的反 bot 含义）**：
- `--enable-automation` → 直接让 `navigator.webdriver === true`，Brotector 一查必中
- `--disable-popup-blocking` → 反 bot 探测「弹窗被允许」可识别为自动化
- `--disable-component-update` → 反 bot 通过 update channel 流量识别 stealth driver
- `--disable-default-apps` / `--disable-extensions` → 真人 Chrome 默认有 apps 和扩展，全空 = 自动化
- `--disable-features=...PaintHolding,...` → 真人 Chrome 默认开 paint holding，关掉异常

**旁注 3（唯一新增的 switch）**：`--disable-blink-features=AutomationControlled` 是反向操作——
Chromium 内部用这个 blink feature 写 `navigator.webdriver = true`，
关掉这个 feature = 把 webdriver 标记从根上拔掉。这一行抵得上用户层 stealth 写的 30 行 init script。

**旁注 4（为什么不在 launch 时传 args）**：用户当然可以
`launch(args=['--disable-blink-features=AutomationControlled'])` 自己加，
但 Playwright 的 chromiumSwitches 数组已经 hardcode 了 `--enable-automation`——
用户传 args 是「追加」不是「覆盖」，删不掉。**只有 patcher 能删**。

**旁注 5（注释里那行 assistantMode）**：原 Playwright 代码里 `--enable-automation` 是条件加的：
`assistantMode ? '' : '--enable-automation'`——也就是只有非 assistantMode 时加。
patcher 直接连这个三元表达式整体删除，意味着即使 `assistantMode === true` 也不留这个开关。
**这种 AST 级匹配靠 string `getText()` 比较实现**，对源码格式高度敏感。

**怀疑 1**：`chromiumSwitchesArray.getElements()` 返回的 element 数组顺序是源代码顺序还是
ts-morph 内部 stable order？如果 Playwright 上游某次重排数组顺序，filter 还能匹配上吗？
追到 `getText()` 实现，发现是 trim 后的 raw text 比较——空格敏感，所以 patcher
其实**对 Playwright 源码 formatting 高度脆弱**。这就是为什么仓库 README 反复强调
"pin 到具体 Playwright 版本"。

---

### Layer 3.2 · framesPatch — Runtime.enable → isolated world

源文件：`driver_patches/framesPatch.ts`，1068 行——patchright 最重的一个 patch。
[GitHub permalink → framesPatch.ts#L176-L242](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/5032dbfd82f475ff705c5a70a15bdd9c26db6fb9/driver_patches/framesPatch.ts#L176-L242)：

```typescript
// -- _context Method --
const contextMethod = frameClass.getMethodOrThrow("context");
contextMethod.rename("_context");
contextMethod.setIsAsync(true);
contextMethod.setBodyText(`
	if (this._isDetached())
		throw new Error('Frame was detached');

	let client;
	try {
		client = this._page.delegate._sessionForFrame(this)._client;
	} catch (e) {
		client = this._page.delegate._mainFrameSession._client;
	}

	var iframeExecutionContextId = await this._getFrameMainFrameContextId(client);
	const isMainFrame = this === this._page.mainFrame();
	const session = this._page.delegate._sessionForFrame(this);

	const registerContext = (executionContextId: number, worldName: string) => {
		const crContext = new CRExecutionContext(client, { id: executionContextId }, this._id);
		const frameContext = new FrameExecutionContext(crContext, this, worldName);
		session._onExecutionContextCreated({
			id: executionContextId,
			origin: worldName,
			name: worldName,
			auxData: { isDefault: isMainFrame, type: 'isolated', frameId: this._id },
		});
		return frameContext;
	};

	if (world === "main") {
		// Iframe Only
		if (!isMainFrame && iframeExecutionContextId && this._iframeWorld === undefined) {
			this._iframeWorld = registerContext(iframeExecutionContextId, world);
		} else if (this._mainWorld === undefined) {
			const globalThis = await client._sendMayFail('Runtime.evaluate', {
				expression: "globalThis",
				serializationOptions: { serialization: "idOnly" },
			});
			if (!globalThis) {
				if (this._isDetached()) throw new Error('Frame was detached');
				return;
			}
			const executionContextId = parseInt(globalThis.result.objectId.split('.')[1], 10);
			this._mainWorld = registerContext(executionContextId, world);
		}
	}

	if (world !== "main" && this._isolatedWorld === undefined) {
		const result = await client._sendMayFail('Page.createIsolatedWorld', {
			frameId: this._id, grantUniveralAccess: true, worldName: world,
		});
		// (...truncated: error handling + register utility world...)
		this._isolatedWorld = registerContext(result.executionContextId, "utility");
	}

	if (world !== "main") return this._isolatedWorld;
	if (!isMainFrame && this._iframeWorld) return this._iframeWorld;
	return this._mainWorld;
`);
```

**旁注 1（核心替换：不发 Runtime.enable，发 Page.createIsolatedWorld）**：
vanilla Playwright 启动一个 page session 时会主动 `Runtime.enable`——这一句会让 Chromium
向所有 worker / page / iframe 广播 `Runtime.executionContextCreated`，
事件里包含 `auxData.type` 和 `name`——其中 `name` 字段会暴露 utility world 的名字。
反 bot 服务直接监听这个事件就能识破自动化。
patchright 不发 `Runtime.enable`，改成对每个 frame **按需** `Page.createIsolatedWorld`
创建独立 world，反 bot 看不见全局事件。

**旁注 2（为什么要三个 world：mainWorld / iframeWorld / isolatedWorld）**：
- `_mainWorld` —— 页面真实的 JS world，用户脚本和 init script 跑在这里
- `_iframeWorld` —— iframe 的 main world（iframe 不是 page，不能直接 globalThis 拿）
- `_isolatedWorld` —— patchright 创建的 utility world，selector engine / 内部 evaluate 都在这跑

三 world 隔离的代价是：每次 `evaluate` 要决定跑哪个 world——所以
[`javascriptPatch.ts#L18-L41`](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/5032dbfd82f475ff705c5a70a15bdd9c26db6fb9/driver_patches/javascriptPatch.ts#L18-L41)
给 `JSHandle.evaluateExpression` 加了 `isolatedContext?: boolean` 参数。

**旁注 3（grantUniveralAccess 这个 typo 是 CDP 协议本身）**：
`Page.createIsolatedWorld` 的参数是 `grantUniveralAccess`（少了一个 s，不是 Universal）。
这是 Chrome DevTools Protocol 在 v1.0 定义时的 typo，被永久保留。
patchright 用了原始拼写——抄 CDP 时不能"纠正"它。
含义：让 isolated world 可以访问 main world 的 DOM（默认隔离）。
没这个 grant，selector engine 在 utility world 拿不到 elements。

**旁注 4（为什么 iframe 要单独 getFrameMainFrameContextId）**：
[`framesPatch.ts#L156-L174`](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/5032dbfd82f475ff705c5a70a15bdd9c26db6fb9/driver_patches/framesPatch.ts#L156-L174)
里 patchright 自己写了一个 `_getFrameMainFrameContextId`：先 `DOM.getFrameOwner` 拿到
iframe 的 owner node，再 `DOM.describeNode` 拿 contentDocument，最后 `DOM.resolveNode`
拿到 backendNodeId 对应的 objectId。从 objectId 里 split('.')[1] 提取 contextId——
这是不发 Runtime.enable 拿 iframe context 的唯一办法。
这段代码用了 `_sendMayFail`（patchright 自己加的方法）静默 fail，避免 race condition。

**旁注 5（patchright 给 Frame 加了三个 property）**：
[`framesPatch.ts#L35-L39`](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/5032dbfd82f475ff705c5a70a15bdd9c26db6fb9/driver_patches/framesPatch.ts#L35-L39)
显式 declare `_isolatedWorld / _mainWorld / _iframeWorld: dom.FrameExecutionContext`。
这些 property 是 lazy-init 的——`_context` 方法第一次访问时才 create + register。
意味着：**一个 frame 直到第一次需要 evaluate 才会有 utility world**——
如果用户 `page.goto` 后立刻 `page.close()`，反 bot 可能根本看不到 utility world 创建。

**旁注 6（rename context → _context 的暗含含义）**：原方法叫 `context`，
patchright `contextMethod.rename("_context")`——加下划线意味着
"内部方法，不再是公开 API"。但因为 ts-morph rename 是 AST 级，
所有调用方（dom.ts 里 `frame.context()` 之类）会被同步改成 `frame._context()`。
**这种全文替换是 patcher 的优势**——人手 fork 一定漏掉某个 caller。

**怀疑 2**：`Page.createIsolatedWorld` 创建的 world，反 bot 能不能通过
`Object.getOwnPropertyNames(window)` 比对真人 Chrome 的 window 属性表来探测？
理论上 isolated world 完全隔离，但 patchright 的 selector engine 注入的全局
（如 `__playwright_selectors`）会不会泄漏？追代码到 `frameSelectorsPatch.ts`，
发现 `queryArrayInMainWorld` 实际跑在 isolated world——名字误导。
但 brotector 当前测不出来——这是 patchright 现在能"通过"的原因之一，
**不代表反 bot 永远查不出**。

**怀疑 3**：第 63 行那个 retry 循环——
`if ("JSHandles can be evaluated only in the context they were created!" !== e.message ...) throw e;`
对 error message 做字符串匹配。Playwright 上游一旦改 error message（哪怕加个标点），
patchright 这个 retry 就静默失效。**这种字符串耦合是 patcher 路线的硬伤**。

---

### Layer 3.3 · install_inject_route — init script 改走 route fallback

源文件：`patchright-python/patch_python_package.py`。这是 Python 层独有的创新——
不动 driver，改 Python 客户端 AST，把 `add_init_script` 的实现路径整个换掉。
[GitHub permalink → patch_python_package.py#L456-L486](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python/blob/392e8a369cf8cfefcf2158c6392401f6a3b65fa5/patch_python_package.py#L456-L486)：

```python
node.body.append(
    ast.Assign(
        targets=[ast.Name(id='route_injecting', ctx=ast.Store())],
        value=ast.Constant(value=False))
)

node.body.append(
    ast.parse("""\
async def install_inject_route(self) -> None:
    from patchright._impl._impl_to_api_mapping import ImplToApiMapping
    mapping = ImplToApiMapping()

    async def route_handler(route: Route) -> None:
            try:
                if route.request.resource_type == "document" and route.request.url.startswith("http"):
                    await route.fallback(patchrightInitScript=True)
                else:
                    await route.fallback()
            except:
                await route.fallback()

    if not self.route_injecting:
        if self._connection._is_sync:
            self._routes.insert(
                0,
                RouteHandler(
                    self._options.get("baseURL"),
                    "**/*",
                    mapping.wrap_handler(route_handler),
                    False,
                    None,
                ),
            )
            await self._update_interception_patterns()
        else:
            await self.route("**/*", mapping.wrap_handler(route_handler))
        self.route_injecting = True""").body[0])

patch_file("playwright-python/playwright/_impl/_browser_context.py", browser_context_tree)
```

而触发 `install_inject_route` 的入口是这两行：

```python
if isinstance(class_node, ast.AsyncFunctionDef) and class_node.name == "add_init_script":
    class_node.body.insert(0, ast.parse("await self.install_inject_route()"))
elif isinstance(class_node, ast.AsyncFunctionDef) and class_node.name == "expose_binding":
    class_node.body.insert(0, ast.parse("await self.install_inject_route()"))
```

**旁注 1（核心替换：CDP addScriptToEvaluateOnNewDocument → HTTP route 注入）**：
vanilla Playwright 的 `add_init_script` 走 CDP 协议
`Page.addScriptToEvaluateOnNewDocument`，注册一个 script id，每次新 document 创建时自动跑。
反 bot 通过 `Runtime.executionContextCreated` 事件能看到这个 script——
patchright Phase 2 已经禁用 Runtime.enable，但 script id 仍可能通过其他 CDP 命令枚举。
patchright Python 层把 init script 的投递**完全离开 CDP 通道**：
拦 HTTP 响应，在 HTML 里直接 `<script>...</script>` 注入。
反 bot 看到的就是「页面 HTML 自带的脚本」——和真人浏览器无任何差别。

**旁注 2（为什么用 route('**/*') 而不是只拦 document）**：
patchright 注册 `**/*` 通配 route，但只对 `resource_type == "document"`
且 url 以 http 开头的请求做 init script 注入。
其他请求（图片、CSS、API）走 `route.fallback()` 透明转发。
**为什么必须拦截全部？因为 Playwright route API 是「先 match 先生效」**——
只有占住整个 `**/*` 才能保证 patchright 自己的 route 永远比用户后注册的 route 先跑。

**旁注 3（route_injecting flag 的并发保护）**：
`if not self.route_injecting` —— 这是单例锁。
用户可能多次调 `add_init_script`（每次想加一段不同的 stealth 脚本），
但 patchright 的 route handler 只需注册一次。
没这个 flag，每次 `add_init_script` 都会 push 一个新 route，
导致响应被多次重写、互相覆盖，最终行为不可预测。

**旁注 4（sync vs async 两条路径）**：
`self._connection._is_sync` 分支——sync API 不能 await `self.route(...)`，
所以走更底层的 `self._routes.insert(0, RouteHandler(...))` + `_update_interception_patterns()`。
这是直接操作 Playwright 内部数据结构，绕过 sync API 的限制。
**这种"底层访问"是 fork 路线的特权**——纯 stealth 插件没法 reach 这种 internals。

**旁注 5（patchrightInitScript=True 的隐式契约）**：
`route.fallback(patchrightInitScript=True)` —— 这个 kwarg 在 vanilla Playwright 不存在。
patcher 在 `_network.py` 也加了对应 hook：当 `patchrightInitScript=True` 时，
fallback 把响应 body 拦下，在 `<head>` 后插入用户的 init script，再放行。
**这是 driver 层和 client 层的契约**——driver 收到这个 flag 知道要做 HTML 重写。
普通用户调 `route.fallback()` 不传这个 flag，行为和 vanilla 一致。

**旁注 6（add_init_script 和 expose_binding 都被 hook）**：
两个 method 都被 inject `install_inject_route()`——expose_binding 也走 route 是因为
binding 也需要 init script 形式注入到页面（暴露成 `window.foo` 这种全局函数）。
不 hook expose_binding 的话，binding 仍然走 CDP，被反 bot 看到。

**怀疑 4**：route fallback 注入 init script 有个隐藏副作用——
HTML 响应被 patchright 重写（插入 script），如果原 HTML 有 SRI（subresource integrity）
或 CSP `script-src 'self'` 严格策略，patchright 注入的 inline script 会被浏览器拒绝执行。
README 里只说"Init Script Shenanigans"会有 bug，没具体讲 CSP——
追代码到 `_network.py` 的 patch hunk，发现 patchright **没有任何 CSP 处理**，
意味着对 strict-CSP 站点（如 GitHub / Twitter）init script 可能整段不生效。

## Layer 4 · Hands-on（含改一处实验）

30 分钟跑通命令清单：

```bash
# 1. 装 patchright（Python）
pip install patchright
patchright install chromium     # 或 chrome（推荐）

# 2. 写个最小检测脚本
cat > test_stealth.py <<'EOF'
import asyncio
from patchright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        # 关键：用 launch_persistent_context + channel="chrome" + no_viewport
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir="./udata",
            channel="chrome",        # 不是 chromium
            headless=False,           # 必须有头，headless 反而被检测
            no_viewport=True,         # 不强制 viewport
        )
        page = await ctx.new_page()
        await page.goto("https://bot.sannysoft.com/")
        await page.screenshot(path="patchright-result.png", full_page=True)
        # 截 webdriver 检测的具体几行
        webdriver = await page.evaluate("navigator.webdriver")
        print(f"navigator.webdriver = {webdriver}")  # 期待 undefined / false
        await ctx.close()

asyncio.run(main())
EOF

python test_stealth.py
# 看 patchright-result.png:
#   - WebDriver(New)         passed
#   - Chrome (New)           passed
#   - Permissions (New)      passed
#   - WebDriver Advanced     passed

# 3. 对照 vanilla Playwright
pip install playwright
playwright install chromium
# 改 import 行：from playwright.async_api import async_playwright
# 跑同一脚本，截图里大概率：
#   - WebDriver(New)         FAILED
#   - WebDriver Advanced     FAILED
```

**改一处实验**：**注释掉 `--disable-blink-features=AutomationControlled` 重试**

操作：

```bash
# clone driver patcher 仓库
GIT_SSL_NO_VERIFY=true git clone --depth 1 \
  https://github.com/Kaliiiiiiiiii-Vinyzu/patchright.git
cd patchright

# 编辑 driver_patches/chromiumSwitchesPatch.ts
# 把第 41 行注释掉：
#   // chromiumSwitchesArray.addElement(`'--disable-blink-features=AutomationControlled'`);

# 跑 patcher（需要 ts-morph + Playwright 源码 clone）
# 或直接装 patchright 后改 site-packages 里的 chromium_switches.py 等价位置
```

预期对比：

| 测试项 | 完整 patchright | 注释掉这一行 | vanilla Playwright |
|---|---|---|---|
| navigator.webdriver | undefined ✅ | **true ❌** | true ❌ |
| WebDriver(New) | passed ✅ | **FAILED ❌** | FAILED ❌ |
| Chrome (New) | passed ✅ | passed ✅（Chrome channel 自带 chrome obj） | FAILED ❌ |
| Permissions (New) | passed ✅ | passed ✅ | FAILED ❌ |

**这一行实验的意义**：让你身体感知到——
patchright 不是「整套魔法」，是几十个独立的小手术，
每一个都对应一个具体检测向量。
拿掉 `--disable-blink-features=AutomationControlled`，
其他 patch 全在，但 webdriver 检测立刻失守。
反过来：**多数反 bot 系统不是检测一个东西，是 30+ 个并查**——
patchright 的每个小 patch 都是为关闭 1 个检测向量而存在。

## Layer 5 · 横向对比

| 维度 | patchright | playwright-stealth | undetected-chromedriver | Selenium-stealth |
|---|---|---|---|---|
| 项目类型 | Playwright fork patcher | Playwright stealth 插件 | Selenium ChromeDriver fork | Selenium stealth 插件 |
| 补丁层 | **driver 源码 AST 改写** | 用户层 init script | binary patch + 用户层 | 用户层 init script |
| 改 Runtime.enable | ✅ 完全不发 | ❌ 无能为力 | ❌ Selenium 走 WebDriver 协议，不存在 | ❌ |
| 改 navigator.webdriver | ✅ 启动参数层 | ✅ JS 层（事后） | ✅ binary patch | ✅ JS 层（事后） |
| 改 init script 投递 | ✅ HTTP route 注入 | ❌ 仍走 addScriptToEvaluateOnNewDocument | ⚠ 部分 | ❌ |
| 跨浏览器 | Chromium only | Chromium + Firefox | Chromium only | Chromium + Firefox |
| Brotector / CreepJS | ✅ pass | ⚠ 部分 fail | ⚠ 部分 fail | ❌ fail |
| Cloudflare / Datadome | ✅ pass | ❌ fail | ⚠ 部分 pass | ❌ fail |
| 上游跟随成本 | 高（每次 Playwright 改要重跑 patcher） | 低（用户层叠加） | 高（fork） | 低 |
| 维护活跃度（2026-05） | active 周更 | active 但慢 | active | 半年未更新 |
| 学习曲线 | 完全等于 Playwright | Playwright + stealth API | Selenium + 反爬常识 | Selenium + 反爬常识 |
| License | Apache-2.0 | Apache-2.0 | MIT | MIT |
| 适合场景 | **生产爬虫 / 多账号 / 反爬严厉站点** | 测试 + 轻度反爬 | 老牌反爬基线 | 兼容旧 Selenium 项目 |

**选型建议**：

- **新项目 + 反爬严厉**（Cloudflare/Datadome 后端）→ patchright，没有第二选项
- **新项目 + 反爬轻度**（只是 navigator.webdriver 检测）→ playwright-stealth 够用，少一层 fork 维护成本
- **老项目用 Selenium** → undetected-chromedriver，迁到 patchright 改动量太大
- **多浏览器测试需求**（Firefox/WebKit）→ patchright 不支持，用 vanilla Playwright + stealth 插件凑合
- **需要审计反爬细节**（合规、教学）→ 读 patchright 源码，30 个 patch 文件就是反爬向量地图

**哲学差异（不只是功能差异）**：
- patchright = "**底层 fork**"——"反 bot 是 driver 的问题，不是用户的问题"
- playwright-stealth = "**插件叠加**"——"用户用 Playwright，stealth 是可选 enhancement"
- undetected-chromedriver = "**特化产品**"——"专门给爬虫用的 driver，从头不是给测试设计"
- Selenium-stealth = "**最小侵入**"——"Selenium 不动，只在用户层 monkey patch"

四种哲学没有绝对优劣——选哪种取决于"你愿意为反 bot 多承担多少 driver 维护成本"。

## Layer 6 · 与你当前工作的连接

### 今天就能用的部分

- **任何已有 Playwright 爬虫脚本，改 1 行 import**：
  `from playwright.async_api import async_playwright` → `from patchright.async_api import async_playwright`，
  其他代码 0 修改，立刻获得反 bot 能力
- **launch_persistent_context + channel="chrome" + no_viewport=True 三件套**：
  这是 README 推荐的 best practice，不只 patchright，所有反 bot 自动化都该这么配
- **route('**/*') + fallback 模式作为通用注入手段**：
  即使不用 patchright，这个模式（route 拦 document → fallback 加料 → 透明转发）
  可以用在自己代码里做 inline JS 注入、A/B test 注入、CSP 改写
- **ts-morph AST 改写而不是 sed 字符串替换**：
  下次写"patch 别人 TypeScript 包"的脚本时，记住这个工具——
  比字符串 regex 鲁棒一个数量级

### 下个月能用的部分

- **fork patcher 模式**：不是只反 bot——任何"上游升级我都要 follow，但有几处永远要 monkey patch"
  的场景都可以借鉴。比如自己 fork 一个公司内部库的 patcher，每次官方升级跑一遍 patcher
  即可保留自定义改动
- **多 world isolation 设计**：写浏览器扩展、电子邮件客户端的 inline rendering 时，
  "main world / iframe world / utility world" 这套隔离模型可以套用——
  把 user-content 和 helper-script 放不同 V8 context
- **driver 层 vs 用户层 stealth 的边界判断**：以后看 stealth 类项目，
  先问"它在哪一层"——用户层只能补 Layer C，driver 层才能补 Layer B，
  Layer A 必须改启动参数。这套分层是反爬通用模型

### 不要用的部分

- **Console API 完全不可用**：patchright 直接禁用 `Console.enable`，
  `console.log` / `console.error` 在 patched browser 里**不会触发任何回调**——
  你的 `page.on("console", ...)` 收不到东西。需要日志要换成 JS 注入 logger
- **Firefox / WebKit**：patchright 明确只 patch Chromium，
  双 README 强调"firefox/webkit not supported"。多浏览器测试别想
- **trace viewer 可能不全**：`Runtime.enable` 不发 → trace viewer 里
  "console messages" 段会是空的——调试体验降级
- **CSP 严格站点**：route 注入 init script 在 CSP `script-src 'self'` 站点会失败，
  这种站点（GitHub 之流）反爬本身也不强——不冲突，但要知道边界
- **headless 反而会被检测**：patchright README 警告必须 `headless=False`，
  和直觉相反。原因是反 bot 会查 `--headless` flag 和 GPU/audio context 差异
- **License 风险**：作者 README 写"educational purposes only"——
  虽然 Apache-2.0 license 本身允许商用，但维护者口径上免责，
  公司用要让法务过一遍
- **Cookie / session 管理仍是用户责任**：patchright 只反指纹，不反 IP / 不管 proxy / 不管 captcha solver
- **bus factor 2 个人**：生产环境必须 pin patchright 版本，不要用 `>=1.60`

## Layer 7 · 自检 + 延伸

**自检问题**（追到行号级别）：

1. patchright 的 `Page.createIsolatedWorld` 调用时传 `grantUniveralAccess: true`，
   这个 typo（少一个 s）是 patchright 错的还是 CDP 协议本身？
   → 答：CDP 协议本身的 typo，永久保留。在
   [`framesPatch.ts#L226-L228`](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/5032dbfd82f475ff705c5a70a15bdd9c26db6fb9/driver_patches/framesPatch.ts#L226-L228) 看到原始用法。

2. 如果反 bot 在页面里跑 `Object.getOwnPropertyNames(window).join(',')` 取 hash，
   patchright 的 isolated world 会不会"漏"一个属性进 main world？
   追到 selector engine 注入，发现 patchright 的 `__playwright_selectors` 等
   全局确实跑在 isolated world——但 `frameSelectorsPatch.ts` 的命名 `queryArrayInMainWorld`
   误导，**实际不在 main world**。需要再读一遍才能确认是否完全干净。

3. `install_inject_route` 用 `route('**/*')` + fallback 模式，
   和用户自己注册的 `route('https://api.example.com/*', handler)` 谁先匹配？
   → Playwright route 是 LIFO 顺序，patchright `_routes.insert(0, ...)` 把自己插到队首，
   但用户后调 `page.route()` 会 push 到队尾。
   这意味着用户 route 先 match——**patchright route 只在用户 route fall through 后兜底**。
   见 [`patch_python_package.py#L473-L483`](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python/blob/392e8a369cf8cfefcf2158c6392401f6a3b65fa5/patch_python_package.py#L473-L483)。

4. patchright Phase 2 替换掉 `Runtime.enable`，那 Playwright 原本依赖
   `Runtime.executionContextCreated` 事件做的"context cleanup"逻辑去哪了？
   → 在 [`framesPatch.ts#L675-L685`](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/5032dbfd82f475ff705c5a70a15bdd9c26db6fb9/driver_patches/framesPatch.ts#L675-L685)
   patchright 给 Frame 加了 detached 时显式清理三个 world 的逻辑，
   不再依赖 CDP 事件——主动 destroy。

5. 为什么 patchright 的 `_sendMayFail` 而不是 `_send`？反 bot 能否通过 timing
   差异（patch 后调 less CDP commands → response 更快）识别？
   → `_sendMayFail` 是 patchright 自己加的方法，吞掉 CDP 错误避免 race。
   timing-based detection 在 README "Init Script Shenanigans" 段被点名，
   作者评估"目前没有反 bot 这么测，未来可能"。**这是 patchright 已知薄弱点。**

**延伸阅读顺序**：

| 顺序 | 文件 | 回答什么 |
|---|---|---|
| 1 | `driver_patches/crPagePatch.ts`（483 行） | 启动 page session 时哪些 CDP 命令被删了 |
| 2 | `driver_patches/crNetworkManagerPatch.ts`（524 行） | route fallback 在 driver 层如何把 init script 写进 HTML |
| 3 | `driver_patches/javascriptPatch.ts`（67 行） | `isolatedContext` 参数如何在 evaluate 链路传下去 |
| 4 | `patchright-nodejs/network.ts` | client 层（Node）和 Python 层处理 init script 投递的差异 |
| 5 | `utils/extract_patched_symbols.ts` | patchright 自己怎么 audit 自己——找 patch 影响面 |
| 6 | [CDP-Patches](https://github.com/Kaliiiiiiiiii-Vinyzu/CDP-Patches/) | 同作者的姊妹项目——补 patchright 没补的 OS 层指纹（input event timing） |

## 限制（Constraints）

不要把 patchright 当万能反 bot 银弹，**它有明确边界**：

- **C1 · Chromium only**：Firefox / WebKit driver 接口完全不同，patcher 不动。
  作者明确说"not supported"——别提 issue
- **C2 · 维护者就 2 个人**：driver patcher 的 commit 节奏跟 Playwright 上游，
  Playwright 一旦做大重构（如 v2 重写 CDP layer），patchright 可能数周不可用。
  生产环境 pin 死版本
- **C3 · Console API 完全失效**：禁 `Console.enable` 是大招，但代价是 `page.on('console')`
  不工作。调试要靠 JS 注入 logger 或 trace viewer
- **C4 · headless=True 反而被检测**：必须 `headless=False`——一些 CI 环境
  没有显示器，要配 Xvfb 虚拟显示器，部署成本上升
- **C5 · CSP 严格站点 init script 失效**：route 注入 inline `<script>`
  在 `script-src 'self'` 站点会被浏览器拒绝。**README 没明说，是怀疑 4 推断出的**
- **C6 · 没有 IP / proxy / captcha solver**：patchright 只反指纹层。
  IP 频率限制、人机验证、reCAPTCHA 全部要另外配
- **C7 · "educational purposes only" 法律免责**：作者 README 反复强调"educational"，
  虽然 Apache-2.0 商用合法，但合规风险用户自担。公司用必经法务

## 附录 · 宣传 vs 现实

| README 宣称 | 代码现实 |
|---|---|
| "drop-in replacement for Playwright" | 90% 是 drop-in，但 `console.log` / 部分 trace viewer 功能丢失，不是 100% drop-in |
| "passes Cloudflare / Kasada / Akamai / Datadome" | passes 是「截至作者测试时」——反 bot 是猫鼠游戏，下周某家可能就更新规则 |
| "Closed Shadow Roots are supported" | 实现在 `XPathSelectorEnginePatch.ts` + `frameSelectorsPatch.ts`，但 README 没说"嵌套 closed shadow root 的边缘 case 仍可能 fail"，issue tracker 里有报 |
| "automated testing on new release" | CI 跑 Playwright 原生 test suite，**不是反 bot 检测的回归测试**——所以"还能反 bot"靠人工验证 |
| "with the right setup, currently undetectable" | 必须 `channel="chrome"`（不是 chromium）+ `headless=False` + `no_viewport=True` + 不设自定义 user_agent，少一个就漏 |

## 元数据

- **升级日期**：2026-05-28
- **总行数**：~520 行 markdown
- **启用工具**：WebFetch（GitHub 仓库元数据）+ git clone（driver / python 双仓库 shallow clone）+ ts-morph 源码精读 + AST patch 追踪
- **方法论版本**：v1.1 状元篇 · 分支 B 工具库
- **读时 commits**：driver `5032dbfd82f475ff705c5a70a15bdd9c26db6fb9` / python `392e8a369cf8cfefcf2158c6392401f6a3b65fa5`
