---
title: react-intl FormatJS ICU MessageFormat 标准 i18n
来源: https://github.com/formatjs/formatjs + formatjs.io 官方文档
---

# react-intl — ICU MessageFormat 标准派的旗手

## 一句话总结（≥ 12 行）

react-intl 是 Yahoo 团队 2014 年发起的 React 国际化库，2018 年起主要维护人转给 Eemeli Aro，挂在 FormatJS monorepo 下持续演进。

设计哲学三条线：

1. **ICU MessageFormat 标准**：plural / select / number / date / list 全部走 Unicode CLDR 定义的 ICU 语法，不发明自家格式
2. **Polyfill 矩阵**：在不支持 Intl API 的老浏览器、老 Node 上补 `Intl.PluralRules` / `Intl.NumberFormat` / `Intl.DateTimeFormat` / `Intl.ListFormat` 等 8+ 个 polyfill 包
3. **编译期提取**：`babel-plugin-formatjs` + `@formatjs/cli extract` 把 `<FormattedMessage>` 里的源消息抽出成 JSON，给翻译工作流喂数据

包矩阵（FormatJS monorepo）：framework 适配（react-intl / vue-intl / svelte-intl）+ 核心（@formatjs/intl / intl-messageformat / @formatjs/icu-messageformat-parser）+ 编译期工具（@formatjs/cli / babel-plugin-formatjs / eslint-plugin-formatjs）+ Polyfill（intl-listformat / intl-displaynames / intl-pluralrules / intl-numberformat / intl-datetimeformat 等 8+）。

定位 vs 竞品：与 i18next 的「自家 plural 语法 + 100+ plugin」打对台；与 vue-i18n 是同标准（都用 ICU）但跨框架；与 lingui 同走「编译期提取」路线但语法不一样。

react-intl weekly downloads 大约 ~3M，远不及 i18next 的 ~10M，但用户多是 LinkedIn / Yahoo / Microsoft / Atlassian / Redfin 这类需要严谨翻译流程的大厂。

商业生态层面：FormatJS 没有 SaaS（不像 i18next 有 locize），翻译协作要么自建、要么接 Crowdin / Lokalise / Phrase 等第三方。

![FormatJS monorepo 全景图](/projects/react-intl/01-formatjs-monorepo.webp)

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `react-intl`（FormatJS monorepo 子包） |
| 当前主版本 | v6.x（2024） |
| 首版 | 2014（Yahoo 时代）/ 重写 v3 2019 |
| License | BSD-3-Clause |
| 主仓库 | formatjs/formatjs |
| 维护 | Eemeli Aro（@eemeli）+ FormatJS contributors |
| TypeScript | 完整支持 |
| Bundle 核心 | ~25 KB min+gzip（react-intl + intl-messageformat） |
| React 版本 | React 16.8+（Hooks 支持） |
| Plural 标准 | ICU MessageFormat（Unicode CLDR） |
| Monorepo 子包数 | 30+（含 framework / core / cli / polyfill） |
| 编译期工具 | babel-plugin-formatjs / @formatjs/cli / @formatjs/ts-transformer |
| Polyfill 包数 | 8+（覆盖 Intl 全家） |
| Weekly downloads | ~3M（react-intl 单独） |
| GitHub stars | 14k+（formatjs 总仓库） |
| 商业版 | 无（与 i18next 的 locize 形成对照） |
| 文档站 | formatjs.io |
| 大厂用户 | LinkedIn / Yahoo / Microsoft / Atlassian / Redfin |
| 翻译协作 | 接 Crowdin / Lokalise / Phrase（无自家 SaaS） |

## Layer 1 — 核心抽象（≥ 30 行）

react-intl 4 个核心抽象：

```tsx
import {IntlProvider, FormattedMessage, FormattedNumber, FormattedDate, useIntl} from "react-intl";

// 1. IntlProvider —— 顶层注入 locale + messages
const messages = {
  "dashboard.welcome": "你好 {name}，今天是 {today, date, long}",
  "dashboard.unread": "{count, plural, =0 {没有未读} one {# 条未读} other {# 条未读}}"
};

function App() {
  return (
    <IntlProvider locale="zh-CN" messages={messages} defaultLocale="en">
      <Dashboard />
    </IntlProvider>
  );
}

// 2. <FormattedMessage> —— 声明式翻译组件
function Dashboard() {
  const intl = useIntl();  // 4. useIntl() —— 命令式 API
  return (
    <div>
      <h1>
        <FormattedMessage
          id="dashboard.welcome"
          values={{name: "Alice", today: new Date()}}
        />
      </h1>
      <p>
        <FormattedMessage id="dashboard.unread" values={{count: 5}} />
      </p>
      {/* 3. FormattedNumber / FormattedDate —— 类型化 formatter */}
      <FormattedNumber value={1234.56} style="currency" currency="CNY" />
      <FormattedDate value={new Date()} year="numeric" month="long" day="numeric" />
      {/* 命令式：拿到字符串再用 */}
      <input placeholder={intl.formatMessage({id: "dashboard.search"})} />
    </div>
  );
}
```

四要素逐个拆：

1. **IntlProvider**：顶层 Context Provider，注入当前 locale + messages 字典 + 自定义 formatter；切换 locale 触发整树重渲染
2. **&lt;FormattedMessage&gt;**：声明式翻译组件，`id` 是 key，`values` 是 ICU 占位符填充值；render prop 模式支持嵌入富文本（`<b>` / `<a>` 等）
3. **&lt;FormattedNumber&gt; / &lt;FormattedDate&gt; / &lt;FormattedRelativeTime&gt; / &lt;FormattedList&gt;**：类型化 formatter 组件，对应 `Intl.NumberFormat` / `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` / `Intl.ListFormat`
4. **useIntl()**：Hook，返回 `intl` 对象，拿到 `formatMessage / formatNumber / formatDate / formatRelativeTime / formatList` 等命令式 API（适合 placeholder / aria-label / 文本拼接场景）

reactive 对比：vue-i18n 切 locale 是 `locale.value = "..."` 一行，react-intl 是 `<IntlProvider locale={state}>` + state 提升，没有内建 store，要自己接 Context / Redux / Zustand 管 locale state。

## Layer 2 — 内部架构（≥ 30 行）

react-intl 不是单包，而是 FormatJS monorepo 的一个 framework 适配层。整套架构 4 层：

```
┌─────────────────────────────────────────────────┐
│  Framework 层： react-intl / vue-intl / svelte- │
└──────────────┬──────────────────────────────────┘
               │ 调用
┌──────────────▼──────────────────────────────────┐
│  核心层：@formatjs/intl                          │
│  └─ intl-messageformat（IntlMessageFormat 类）  │
│      └─ @formatjs/icu-messageformat-parser     │
│           （ICU AST 解析器）                    │
└──────────────┬──────────────────────────────────┘
               │ 调用 ECMA-402 Intl API
┌──────────────▼──────────────────────────────────┐
│  Runtime Intl：浏览器原生 Intl.* 或 Polyfill    │
│  └─ Intl.NumberFormat / DateTimeFormat /       │
│     PluralRules / RelativeTimeFormat / ...      │
└─────────────────────────────────────────────────┘
                ▲
                │ 编译期生成
┌───────────────┴─────────────────────────────────┐
│  编译期工具：babel-plugin-formatjs / ts-trans-  │
│  former / @formatjs/cli extract                │
│  └─ 把 <FormattedMessage> 提取成 JSON          │
└─────────────────────────────────────────────────┘
```

四层职责：

1. **Framework 适配层**：react-intl 只负责把核心 API 包成 React Context + Hooks + 组件；vue-intl 包成 Vue plugin + composable；逻辑全在核心层
2. **核心层**（`@formatjs/intl` + `intl-messageformat`）：拿到 message 模板 + 占位符值，调 ICU AST parser 解析，再调 `Intl.*` 输出最终字符串；缓存编译好的 AST（同一 key 不重复 parse）
3. **Runtime Intl 层**：能用浏览器原生 `Intl.*` 就用原生（更快、更准、不增加 bundle）；不能就动态 import Polyfill；这是 FormatJS Polyfill 矩阵的设计基石
4. **编译期工具**：把代码里 `<FormattedMessage id="x" defaultMessage="..." />` 提取成 JSON 字典，喂给翻译流程；可选 inline message AST（运行时跳过 parse）

工作流（runtime 路径）：

```
用户写 <FormattedMessage id="apple" values={{count: 5}} />
  ↓
react-intl 从 IntlProvider 拿 messages["apple"] = "{count, plural, ...}"
  ↓
intl-messageformat 把模板 + values 编译成 string
  ├─ icu-messageformat-parser → AST
  ├─ AST + values → 选 plural 分支
  └─ Intl.NumberFormat / Intl.PluralRules 处理
  ↓
返回最终 string，react-intl render
```

工作流（编译期路径）：

```
源码 <FormattedMessage id="apple" defaultMessage="..." />
  ↓
babel-plugin-formatjs 扫 AST
  ↓
提取出 {id: "apple", defaultMessage: "..."}
  ↓
写入 lang/en.json
  ↓
译员翻译成 lang/zh-CN.json
  ↓
build 时按 locale 打包
```

关键设计点：runtime 跟 compile-time 是双轨——runtime 让 React app 跑起来，compile-time 把翻译流程嵌入构建。

## Layer 3 — 精读 3 段（每段 ≥ 30 行）

### 段 a — ICU MessageFormat 完整支持

ICU MessageFormat 是 Unicode CLDR 定义的国际化标准，react-intl 完整支持 5 大语法：

```ts
// 1. 普通 interpolation
"hello {name}"
formatMessage({id: "hello"}, {name: "Alice"})  // → "hello Alice"

// 2. plural（Unicode plural rules：zero/one/two/few/many/other + =N 精确匹配）
"{count, plural, =0 {没有未读} one {# 条} other {# 条未读消息}}"
// 中文只有 other → 永远走 other 分支
// 英文 one + other → count=1 走 one

// 3. select（按值匹配，性别 / 类型）
"{gender, select, male {他} female {她} other {ta}} 来了"

// 4. selectordinal（序数 plural：1st / 2nd / 3rd）
"{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} place"

// 5. number / date / time（嵌入式 formatter）
"今天是 {today, date, long}"
"消费 {amount, number, ::currency/CNY}"  // ICU number skeleton
"事件在 {when, time, ::HH:mm}"

// 6. 嵌套（plural 里嵌 select、tag 富文本）
"{count, plural, =0 {你} other {你和 # 个朋友}} <b>{action}</b>"
// react-intl 的 values 可以传 (chunks) => <b>{chunks}</b>，富文本组件化
```

核心区别 vs i18next：i18next 的 plural 是自家语法（`apple_one` / `apple_other` 多个 key），react-intl 是单 key 内嵌套 ICU 模板。trade-off：

- **react-intl 的 ICU**：单 key 自包含，翻译员能看到完整上下文；但模板复杂、初学者陡峭
- **i18next 的多 key**：扁平、好懂；但跨语言对齐时容易漏 key（中文 only `other`，英文要写 `one + other`，多个 key 同步是 friction）

ICU 还有 W3C Intl.MessageFormat 提案（Stage 1+），未来浏览器原生支持 ICU 后，react-intl 的核心层可以直接用 native API，bundle 进一步缩小。

实战注意：

1. **# 字符**是 ICU 占位符当前 plural 值（不是 React 注释）
2. **嵌套**容易写错，建议用 ICU AST playground（formatjs.io 提供）先验证再上代码
3. **富文本占位符**（`<b>` / `<a>`）必须在 values 里给 render function，否则会原样输出

ICU 的核心价值：标准化让翻译员、PO、QA 都用同一套心智模型，不用学库特有语法。

实战：[github.com/formatjs/formatjs/blob/b6bb2da04d6e8a639a1ff9986271d5a53a05ff5e/packages/intl-messageformat/src/core.ts](https://github.com/formatjs/formatjs/blob/b6bb2da04d6e8a639a1ff9986271d5a53a05ff5e/packages/intl-messageformat/src/core.ts)（链接示意，hash 仅作锚点）

> 怀疑：ICU MessageFormat 标准化是好事，但「单 key 内嵌套」对翻译员的认知成本是不是被低估了？非技术背景的译员看到 `{count, plural, =0 {...} one {# ...} other {# ...}}` 是会懵的。i18next 的「多 key 扁平」对译员更友好，可能这就是 i18next 在 weekly downloads 上压制 react-intl 的真实原因之一。

### 段 b — 编译期提取（babel-plugin-formatjs / @formatjs/cli extract）

react-intl 的编译期提取是它跟纯运行时 i18n 库的最大差异：

```js
// .babelrc.json
{
  "plugins": [
    ["formatjs", {
      "idInterpolationPattern": "[sha512:contenthash:base64:6]",
      "ast": true,                       // inline AST，runtime 跳过 parse
      "removeDefaultMessage": true       // production build 删除 defaultMessage 减小 bundle
    }]
  ]
}
```

```bash
# @formatjs/cli 提取
formatjs extract \
  "src/**/*.{ts,tsx}" \
  --out-file lang/en.json \
  --id-interpolation-pattern '[sha512:contenthash:base64:6]'

# 输出 lang/en.json
{
  "abc123": {"defaultMessage": "Hello {name}", "description": "Greeting"},
  "def456": {"defaultMessage": "{count, plural, ...}", "description": "..."}
}
```

工作流 5 步：

1. 开发者写 `<FormattedMessage id="auto" defaultMessage="Hello {name}" description="..." />`（id 可省略，用 hash 自动生成）
2. CI 跑 `formatjs extract` 生成 `lang/en.json`
3. 上传到翻译平台（Crowdin / Lokalise）
4. 译员翻译，下载 `lang/zh-CN.json` / `lang/ja.json`
5. build 时 `formatjs compile` 把 JSON 编译成 AST，通过 webpack `define` 或动态 import 注入

关键设计：

1. **idInterpolationPattern**：用 hash 做 id，省去手写 id 的痛点（也省去 id 重复风险）
2. **AST inline**：production build 把 ICU AST 直接编译进 bundle，runtime 不再需要 parser，bundle 小 30-50%
3. **removeDefaultMessage**：production 删除 defaultMessage 字符串，进一步缩小 bundle
4. **TypeScript 支持**：`@formatjs/ts-transformer`（给 ts-loader / ts-jest 用）替代 babel，在 ts-only 项目里也能提取

vs lingui 的对比：lingui 用 macro（`t\`Hello ${name}\``），更接近模板字符串，但只在 Babel 生态可用；formatjs 的提取支持 TS transformer，在纯 TS 项目（不想引 Babel）也能用。

vs i18next 的对比：i18next 的 `parser` 是社区维护，覆盖率不如 formatjs 官方维护稳定；i18next 翻译流程没有标准化提取工具，团队各搞各的。

实战注意：

1. **id 策略**先选好（hash vs 手写 id），中途切会破坏所有翻译
2. **defaultMessage** 必须放在源码里（不能放外部文件），提取工具靠 AST 静态分析
3. **CI 集成**要早做，不然译员永远落后开发

实战：[github.com/formatjs/formatjs/blob/b5b3ad17a105c36ef5e9d389d18869b81698286c/packages/cli/src/extract.ts](https://github.com/formatjs/formatjs/blob/b5b3ad17a105c36ef5e9d389d18869b81698286c/packages/cli/src/extract.ts)（链接示意，hash 仅作锚点）

> 怀疑：编译期提取 + babel-plugin-formatjs 让翻译流程严谨，但 Vite + esbuild 时代 Babel 配置麻烦。esbuild 没有 babel 那种 plugin 体系，formatjs 用 `@formatjs/ts-transformer` 绕过去，但需要切换 ts-loader、不能跟 swc 共存。这是不是 FormatJS 的工程债？等到 swc / esbuild 完全统治 build chain 那天，formatjs 的编译期工具链可能要重写。

### 段 c — Polyfill 矩阵（在老浏览器补 Intl）

FormatJS 的 Polyfill 矩阵 8+ 个独立包：

| Polyfill 包 | 对应 Intl API | 浏览器原生支持 |
|---|---|---|
| `@formatjs/intl-getcanonicallocales` | `Intl.getCanonicalLocales` | Chrome 54+ / FF 48+ |
| `@formatjs/intl-locale` | `Intl.Locale` | Chrome 74+ / FF 75+ |
| `@formatjs/intl-pluralrules` | `Intl.PluralRules` | Chrome 63+ / FF 58+ |
| `@formatjs/intl-numberformat` | `Intl.NumberFormat`（增强） | Chrome 77+（旧版功能弱） |
| `@formatjs/intl-datetimeformat` | `Intl.DateTimeFormat`（增强） | Chrome 76+（同上） |
| `@formatjs/intl-relativetimeformat` | `Intl.RelativeTimeFormat` | Chrome 71+ / FF 65+ |
| `@formatjs/intl-listformat` | `Intl.ListFormat` | Chrome 72+ / FF 78+ |
| `@formatjs/intl-displaynames` | `Intl.DisplayNames` | Chrome 81+ / FF 86+ |
| `@formatjs/intl-segmenter` | `Intl.Segmenter` | Chrome 87+ / Safari 14.1+ |

加载策略：

```ts
// runtime feature detect + polyfill 动态加载
async function ensureIntlPluralRules(locale: string) {
  if (Intl.PluralRules &&
      typeof (new Intl.PluralRules(locale)).resolvedOptions === "function") {
    return;  // native 可用，跳过
  }
  // polyfill
  await import("@formatjs/intl-pluralrules/polyfill");
  await import(`@formatjs/intl-pluralrules/locale-data/${locale}`);
}
```

设计精髓：

1. **每个 polyfill 独立包**：用户按需加载，不强制全家桶
2. **locale-data 单独打包**：CLDR 数据按 locale 切片（en / zh-CN / ja），按需 import，节省 bundle
3. **feature detect first**：先看 native 能不能用，能用就跳过 polyfill（这点跟 core-js 思路一致）
4. **官方 Polyfill 服务**（FormatJS 提供）：CDN 上自动按 user-agent 返回需要的 polyfill 子集

vs 其他方案：

- **vs i18next**：i18next 自己 hand-roll 实现 plural，不依赖 Intl.PluralRules，少了 polyfill 麻烦，但实现质量不如 CLDR
- **vs vue-i18n**：vue-i18n 也走 Intl + polyfill 路线，跟 FormatJS 同标准
- **vs core-js**：core-js 也覆盖 Intl，但更通用，FormatJS 的 polyfill 实现更专（带 CLDR 数据，更准）

实战注意：

1. **locale-data 不加载** = polyfill 起不来（错误信息很难排查）
2. **bundle 体积**：全家桶 ~200 KB，但只在老浏览器加载（modern user 不加载）
3. **SSR**：Node 18+ 已经原生支持完整 Intl，不再需要 polyfill；老 Node（< 18）还得加

实战：[github.com/formatjs/formatjs/blob/121ef21822be4a7e6ba9012969e3d3256cc9c611/packages/intl-pluralrules/src/polyfill.ts](https://github.com/formatjs/formatjs/blob/121ef21822be4a7e6ba9012969e3d3256cc9c611/packages/intl-pluralrules/src/polyfill.ts)（链接示意，hash 仅作锚点）

> 怀疑：FormatJS Polyfill 矩阵在 Modern browser 时代意义递减。Chrome / FF / Safari 三大引擎全部支持完整 Intl 已经 2-3 年（按 baseline 2022 标准），polyfill 只在 IE 11 / 老安卓 webview / 老 Node 才用。Polyfill 是不是 FormatJS 的「过时核心」？维护成本（CLDR 数据每年都变）和实际收益是不是已经倒挂了？

## Layer 4 — 与 i18next / vue-i18n / lingui 对比

### vs i18next

| 维度 | react-intl（FormatJS） | i18next |
|---|---|---|
| Plural 标准 | ICU MessageFormat（CLDR） | 自家语法（多 key） |
| Framework | React only（FormatJS 下其他框架独立） | Framework-agnostic + 各 adapter |
| 编译期提取 | 一等公民（babel-plugin-formatjs） | 社区 i18next-parser |
| Polyfill | 8+ 独立 polyfill 包 | 不依赖（自己实现 plural） |
| 商业 SaaS | 无 | locize（团队自家） |
| Weekly downloads | ~3M | ~10M |

**核心分歧**：标准 vs 实用。react-intl 押 ICU 标准，长期看跟 W3C Intl.MessageFormat 提案合流；i18next 押易用，短期内对开发者 / 译员更友好。

### vs vue-i18n

| 维度 | react-intl | vue-i18n |
|---|---|---|
| 绑定框架 | React | Vue 3 |
| Plural 标准 | ICU MessageFormat | ICU MessageFormat |
| Reactive | Context + state 提升 | Vue ref（一行切换） |
| 编译期 | babel-plugin-formatjs | @intlify/unplugin-vue-i18n |
| 官方推荐 | FormatJS（社区） | Vue 团队官方 |

**核心相似**：都用 ICU 标准。**核心差异**：vue-i18n 反应式天然（Vue ref），react-intl 要自己接 Context/状态库。

### vs lingui

| 维度 | react-intl | lingui |
|---|---|---|
| 语法 | `<FormattedMessage id="..." defaultMessage="..." />` | macro `t\`Hello ${name}\`` |
| 提取 | babel-plugin-formatjs | lingui macro 编译期展开 |
| Plural 标准 | ICU MessageFormat | ICU MessageFormat |
| TS 支持 | @formatjs/ts-transformer | 仅 babel-only |
| Bundle | ~25 KB | ~7 KB（lingui core） |

**核心分歧**：开发者人体工学。lingui 的 macro 写法更接近原生 JS 模板字符串，体感丝滑；react-intl 的 JSX 组件更显式但啰嗦。Bundle 上 lingui 完胜（runtime 极小）。

### 三方对比小结

- **要标准 + 大厂背书** → react-intl
- **要 Vue 官方** → vue-i18n
- **要最广生态 + plugin** → i18next
- **要最小 bundle + macro 体验** → lingui

## Layer 5 — 6 维评分（≥ 30 行）

| 维度 | 评分 | 说明 |
|---|---|---|
| 标准化 | 9/10 | ICU MessageFormat 是 i18n 黄金标准，向 W3C 提案靠拢 |
| 性能 | 7/10 | runtime 性能 OK，但 bundle 偏大（~25 KB）；Polyfill 进一步增加 |
| 类型安全 | 7/10 | TypeScript 完整支持，但 message id → values 类型联动需要额外配置 |
| DX（开发体验） | 6/10 | JSX 组件啰嗦，比 lingui macro / vue-i18n template 要繁琐 |
| 生态 | 7/10 | FormatJS monorepo 包齐，但 plugin 数远少于 i18next |
| 大厂可信度 | 9/10 | LinkedIn / Yahoo / Microsoft / Atlassian 用，企业级翻译流程成熟 |

总分加权：标准化（×2）+ 性能 + 类型安全 + DX + 生态 + 大厂（×2）= 9×2 + 7 + 7 + 6 + 7 + 9×2 = 63 / 80 = 7.9。

逐维细说：

1. **标准化 9/10**：扣 1 分是因为 ICU 单 key 嵌套对译员认知成本高，标准虽好但实操有 friction
2. **性能 7/10**：编译期 inline AST 后 runtime 性能很好；但首屏 bundle 包含 react-intl + intl-messageformat + parser，比 lingui 大 3-4 倍
3. **类型安全 7/10**：完整 TS 类型，但 `formatMessage({id: "x"}, values)` 的 values 类型不会根据 id 推断（要写 `@formatjs/ts-transformer` 才行）
4. **DX 6/10**：扣 4 分是因为 JSX 写法在中文项目里特别啰嗦，纯组件用 `useIntl().formatMessage()` 命令式更顺手
5. **生态 7/10**：FormatJS 30+ 子包足够覆盖核心，但社区 plugin（postProcessor / backend）远不如 i18next 100+ 丰富
6. **大厂可信度 9/10**：扣 1 分是因为大厂用归用，但中小团队迁移成本不低（要重写所有翻译）

## Layer 6 — 限制与坑（≥ 4 项）

1. **JSX 写法啰嗦**
   - 中文项目里 `<FormattedMessage id="hello" defaultMessage="你好" />` 比模板字符串重得多
   - 长文案 / 富文本嵌套时代码可读性下降
   - 缓解：用 `useIntl().formatMessage()` 命令式 + 抽工具函数 `t(id, values)`

2. **Babel 依赖在 esbuild / swc 时代是 friction**
   - `babel-plugin-formatjs` 要求 babel 工具链
   - Vite + esbuild 项目要么放弃编译期提取，要么并存 babel + esbuild（构建变慢）
   - 缓解：用 `@formatjs/ts-transformer`（ts-loader 路径）或 `@formatjs/swc-plugin`（实验性）

3. **id 策略不可逆**
   - 选 hash id 后，源 message 改一个字 → hash 变 → 所有翻译失效
   - 选手写 id 后，重命名要全局搜索，CI 检查重复
   - 缓解：上线前选定，中期不切换；用 description 字段补上下文给译员

4. **Polyfill 全家桶 ~200 KB**
   - 全开 polyfill 在老浏览器 bundle 翻倍
   - locale-data 按 locale 切但还是大
   - 缓解：feature detect + 动态 import + 只支持 modern browser（drop IE / 老安卓）

5. **没有官方 SaaS**
   - i18next 有 locize（一键集成翻译流程），FormatJS 没有
   - 团队要么接 Crowdin / Lokalise（按字数收费），要么自建
   - 缓解：小团队用 Crowdin Free Plan；中大团队接 Lokalise / Phrase

6. **reactive 不天然**
   - vue-i18n 切 locale 一行 ref，react-intl 要 state lift + IntlProvider 重渲染
   - SSR 时 locale 切换需要重水合（vs vue-i18n 的纯客户端切换）
   - 缓解：把 locale 放 Zustand / Redux，IntlProvider 订阅

7. **CLDR 数据更新滞后**
   - Polyfill 包带的 CLDR 数据（plural rules / locale data）每年要发新版
   - 老 react-intl 版本绑死老 CLDR，遇新语言（如新增小语种）要升级
   - 缓解：每半年升级一次，CI 跑 e2e 翻译回归

## 怀疑总集（≥ 4 处，集中复盘）

> 怀疑 1：FormatJS 大厂用（LinkedIn / Yahoo / Microsoft），但 weekly downloads 远不及 i18next（3M vs 10M）。「标准 vs 自家」在 i18n 领域，i18next 暂赢。是商业惯性、技术偏好、还是 React 生态本身被 next-i18next 分流？我倾向是「i18next 早期生态扩张更激进 + framework adapter 矩阵更全」，react-intl 起步晚于 i18next 3 年，先发优势是真的。

> 怀疑 2：编译期提取 + babel-plugin-formatjs 让翻译流程严谨，但 Vite + esbuild 时代 babel 配置麻烦。@formatjs/ts-transformer 走 ts-loader 路径不能跟 swc 共存。这是不是 FormatJS 的工程债？等到 swc / esbuild 完全统治 build chain 那天，formatjs 的编译期工具链可能要重写一次。

> 怀疑 3：FormatJS Polyfill 矩阵在 Modern browser 时代意义递减（Intl API 浏览器原生支持已 baseline 2022）。Polyfill 是不是 FormatJS 的「过时核心」？维护成本（CLDR 数据 + locale-data 全家桶）和实际收益是不是已经倒挂？也许未来 polyfill 包会从 monorepo 剥离成可选附件。

> 怀疑 4：ICU MessageFormat 单 key 嵌套对非技术译员的认知成本被低估。`{count, plural, =0 {...} one {# ...} other {# ...}}` 不是普通文本，译员要学 ICU 语法。i18next 的多 key 扁平方案对译员更友好，可能这才是 i18next 在 weekly downloads 上压制 react-intl 的真实原因之一——技术上 react-intl 更标准，工程上 i18next 更人性化。

> 怀疑 5：W3C Intl.MessageFormat 提案进 Stage 1+，未来浏览器原生支持 ICU 后，react-intl 的核心层（intl-messageformat + parser）可以直接砍掉，bundle 缩小一半。但提案进 Stage 4 通常要 5-7 年，react-intl 等得起吗？届时 i18next 是不是也会切 ICU？这是一场 5 年后的「标准化收割战」。

## 实战 — 一个最小 React + Vite 项目集成（≥ 30 行）

```bash
pnpm create vite@latest my-i18n-app -- --template react-ts
cd my-i18n-app
pnpm add react-intl
pnpm add -D @formatjs/cli babel-plugin-formatjs @vitejs/plugin-react
```

```ts
// src/i18n/messages/en.json
{
  "dashboard.welcome": "Hello {name}",
  "dashboard.unread": "{count, plural, =0 {No unread} one {# unread} other {# unread}}"
}

// src/i18n/messages/zh-CN.json
{
  "dashboard.welcome": "你好 {name}",
  "dashboard.unread": "{count, plural, other {# 条未读消息}}"
}
```

```tsx
// src/i18n/IntlContext.tsx
import {IntlProvider} from "react-intl";
import {ReactNode, useState} from "react";
import en from "./messages/en.json";
import zhCN from "./messages/zh-CN.json";

const dict = {en, "zh-CN": zhCN};

export function I18nProvider({children}: {children: ReactNode}) {
  const [locale, setLocale] = useState<keyof typeof dict>("zh-CN");
  return (
    <LocaleContext.Provider value={{locale, setLocale}}>
      <IntlProvider locale={locale} messages={dict[locale]} defaultLocale="en">
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}
```

```tsx
// src/App.tsx
import {FormattedMessage, useIntl} from "react-intl";
import {useLocale} from "./i18n/IntlContext";

export default function App() {
  const intl = useIntl();
  const {locale, setLocale} = useLocale();
  return (
    <div>
      <h1>
        <FormattedMessage id="dashboard.welcome" values={{name: "Alice"}} />
      </h1>
      <p>
        <FormattedMessage id="dashboard.unread" values={{count: 5}} />
      </p>
      <button onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}>
        {intl.formatMessage({id: "dashboard.switch", defaultMessage: "Switch"})}
      </button>
    </div>
  );
}
```

```js
// .babelrc.json（如启用编译期提取）
{
  "plugins": [
    ["formatjs", {
      "idInterpolationPattern": "[sha512:contenthash:base64:6]",
      "ast": true
    }]
  ]
}
```

要点：

1. IntlProvider 顶层注入 locale + messages
2. 业务组件用 `<FormattedMessage>` 或 `useIntl().formatMessage()`
3. locale 切换走 React state（自己管，IntlProvider 重渲染）
4. Babel plugin 编译期把 message AST inline，runtime 跳过 parse
5. CI 跑 `formatjs extract` 同步 messages JSON

## 学到什么 + 关联（≥ 15 行）

学到的 ≥ 7 条：

1. **标准化是 i18n 库的根本分歧**：ICU MessageFormat（react-intl / vue-intl / lingui）vs 自家格式（i18next）；选哪边决定了能不能跨工具复用翻译资产
2. **编译期提取 + AST inline** 是现代 i18n 的最大优化空间——runtime parse → compile-time AST 让 bundle 小 30-50%，启动快很多
3. **Polyfill 矩阵的设计哲学**：每包独立 + locale-data 切片 + feature detect，是 polyfill 库的标准范式（core-js 类似），值得在做工具库时借鉴
4. **Framework adapter** vs **核心库** 的拆分：react-intl 只是 thin wrapper，核心 (`@formatjs/intl` + `intl-messageformat`) 可被任何框架复用——这是 monorepo 治理的好范例
5. **id 策略**（hash vs 手写）必须早决定，中途切代价极大；hash 自动化但变更不友好，手写灵活但容易冲突
6. **没有 SaaS 是工程团队的 friction**：FormatJS 不像 i18next 有 locize，团队要自建翻译协作；这是技术选型时常被忽视但极其重要的因素
7. **standard vs popular** 的张力：技术上更标准的方案（ICU）可能输给更易用的方案（i18next 多 key），开发者偏好不全是技术理性

关联：

- [[i18next]] — 同领域，对比 framework-agnostic + 自家 plural vs FormatJS ICU 标准
- [[vue-i18n]] — 同 ICU 标准但绑 Vue；reactive 模型对照
- [[zod]] [[arktype]] [[valibot]] — schema 验证，跟 i18n 同样在「标准化 vs 易用性」上有张力
- [[react-hook-form]] [[tanstack-form]] — 表单领域，跟 i18n 一起构成「数据展示 + 翻译 + 验证」三件套
- [[date-fns]] [[dayjs]] [[luxon]] [[temporal-polyfill]] [[js-joda]] — 日期格式化，跟 ICU date format 互补
- [[d3]] [[recharts]] [[visx]] [[echarts]] — 数据可视化常需 i18n 配合（图表 label 多语言）

## 附录 A — Next.js + react-intl 集成（≥ 25 行）

Next.js 14 App Router 跟 react-intl 集成的 3 个挑战：

```tsx
// app/[locale]/layout.tsx
import {IntlProvider} from "react-intl";
import {getMessages} from "@/i18n/server";

export default async function LocaleLayout({
  children,
  params: {locale}
}: {
  children: React.ReactNode;
  params: {locale: string};
}) {
  const messages = await getMessages(locale);
  return (
    <html lang={locale}>
      <body>
        <IntlProvider locale={locale} messages={messages}>
          {children}
        </IntlProvider>
      </body>
    </html>
  );
}
```

3 个挑战：

1. **Server Component 不支持 Hooks**：`useIntl()` 只能在 Client Component 用；Server Component 要用 `intl-messageformat` 直接调
2. **Streaming + IntlProvider**：IntlProvider 是 Client Component，必须 `"use client"` 标记，整个子树降级为 client
3. **路由 + locale 前缀**：要自己用 `[locale]` 动态段 + middleware 重定向，没有像 `next-intl` 那种一键集成

替代方案：next-intl（@amann/next-intl）专为 App Router 写的，集成 RSC + middleware + ICU 标准；如果你重度用 Next 14+ 建议直接用 next-intl 而不是 react-intl。

实战注意：

1. messages 的加载在 Server 做（fetch JSON）
2. IntlProvider 作为 client boundary，子树用 hook
3. SEO：URL 带 locale（`/zh-CN/about`），robots 加 hreflang

## 附录 B — 翻译协作工作流（≥ 25 行）

react-intl 没有官方 SaaS，主流 3 种方案：

### 方案 1：Crowdin（最常用）

```yaml
# crowdin.yml
project_id: 12345
api_token_env: CROWDIN_TOKEN
preserve_hierarchy: true

files:
  - source: /lang/en.json
    translation: /lang/%two_letters_code%.json
    type: i18next4   # Crowdin 支持 ICU MessageFormat
```

CI 流程：

1. PR merge 到 main → CI 跑 `formatjs extract` → push 到 Crowdin
2. Crowdin 通知译员
3. 译员翻译 → Crowdin 自动开 PR 回仓库
4. PM review + merge

### 方案 2：Lokalise

类似 Crowdin，但 enterprise 功能更多（branching、glossary、QA check）。按字数收费。

### 方案 3：自建（大厂方案）

```
内部翻译平台
├─ formatjs extract → 推到平台
├─ 译员 web UI 翻译
├─ 平台 API → CI 拉取 → 写回 lang/{locale}.json
└─ build 时打包
```

LinkedIn / Yahoo / Microsoft 都有自家翻译平台，这也是 react-intl 在大厂受欢迎的原因——他们有内部工具，不需要 i18next + locize 的一站式方案。

工作流要点：

1. **hash id** 适合自动化（CI 自动同步），手写 id 适合手工翻译
2. **description 字段**给译员上下文，避免歧义（`apple` 是水果还是公司？）
3. **glossary**（专业术语字典）防止译员把 "Apple" 翻成「苹果」（如果是公司名应保留）
4. **QA check**（占位符匹配 / 长度 / HTML 标签）防止译员漏占位符

## 附录 C — 学到补充（≥ 12 行）

补充 8 条工程教训：

8. **早期决策的复利效应**：选 ICU vs 自家、选 hash id vs 手写、选 babel vs ts-transformer——这些决策一旦上线，迁移成本是「把整套翻译重写」级别的；i18n 库选型必须先拉 6 个月跑道，不要拍脑袋
9. **大厂 vs 中小团队的 i18n 需求差异**：大厂有翻译团队 + 内部平台 → 选 react-intl（标准 + 严谨）；中小团队没专职译员 → 选 i18next（plugin 多、SaaS 现成）
10. **ICU 的 W3C 化进程**：Intl.MessageFormat 提案 Stage 1，未来浏览器原生跑 ICU，react-intl 的核心层会变成「polyfill of native API」，跟 core-js 类似
11. **bundle 体积的真正成本**：react-intl + polyfill 全家桶 ~200 KB，对 mobile web / 弱网用户影响大；选 lingui（runtime ~7 KB）在 mobile-first 项目可能更合适
12. **类型安全的两个层次**：API 类型（formatMessage 参数）vs 业务类型（id → values 联动）；后者要靠 `@formatjs/ts-transformer` 在编译期生成类型，配置成本高
13. **多 locale fallback 链**：`zh-Hant-HK` → `zh-Hant` → `zh` → `en`，react-intl 自动处理，但 Polyfill locale-data 不一定都有，要预先 import
14. **SSR / Streaming 时代的 i18n**：RSC 时代「IntlProvider 是 client boundary」是个真实约束，会影响架构设计；选 next-intl 比硬塞 react-intl 平滑很多
15. **runtime 错误隔离**：缺 key / 占位符不匹配时，react-intl 默认 fallback 到 defaultMessage，但生产环境应配 `onError` 上报 Sentry，避免静默错误流到生产
