---
title: Lingui — 写自然字符串，编译期自动提取 i18n msgid
来源: 'https://github.com/lingui/js-lingui + lingui.dev'
日期: 2026-05-30
分类: projects / 前端国际化
难度: 中级
---

## 是什么

Lingui 是一个 **React / JS 国际化库**，特点是开发者**不用手动起 key**——直接写自然字符串，由编译器把字符串自己当成 key。日常类比：像点菜时直接说"番茄炒蛋"，而不是说"菜单第 12 道"——前者人能直接读懂，后者要查表。

你写：

```tsx
import { Trans } from '@lingui/macro'
function Hello({ name }) {
  return <Trans>Hello {name}, welcome</Trans>
}
```

编译时，Babel macro 把这段替换成 `i18n._('Hello {name}, welcome', { name })`，并把 `Hello {name}, welcome` 这个字符串作为 **msgid**（消息 ID）提取到 `.po` 翻译文件里。译员去翻译这个文件，运行时再加载回来。整条链路里你**没起过一个 key**。

## 为什么重要

不理解 Lingui 的设计，下面这些事都没法解释：

- 为什么 i18next / react-intl 用户都要争论 "key 怎么命名"，Lingui 用户根本没这个会议
- 为什么 Lingui 用户量只有 i18next 的 1/100，但用过的人几乎不肯换
- 为什么前端社区到 2024 年还在用 1990 年代 GNU gettext 的 `.po` 文件
- 为什么"自然字符串当 key"这个想法在后端（Python / PHP）很常见，前端要等到 2017 年才出现

## 核心要点

Lingui 的工作流可以拆成 **三步**：

1. **编译期提取**：Babel macro 把 `` t`Hello ${name}` `` 这种模板字符串替换成 `i18n._('Hello {name}', { name })`，同时把 `Hello {name}` 写进消息目录。类比：盖公章——源码上还是自然语言，背面盖章成"已登记的 msgid"。

2. **gettext 工作流**：CLI `lingui extract` 把所有 msgid 收集成 `.po` 文件，译员用 poedit / Crowdin 填中文/日文翻译，新加文案自动追加，删除文案标 obsolete，改过的 msgid 标 fuzzy 等人审核。

3. **运行时加载**：CLI `lingui compile` 把 `.po` 编成 `.js`，应用启动时 `i18n.load('zh', messages)` + `i18n.activate('zh')` 切到中文。复数 / 选择走 ICU MessageFormat 标准，跟 react-intl / next-intl 同一套语法。

## 实践案例

### 案例 1：写一个带复数的文案，走完 extract → 翻译 → compile

```tsx
import { Trans, Plural } from '@lingui/macro'

export function Inbox({ name, count }) {
  return (
    <div>
      <Trans>Hi {name}, your inbox</Trans>
      <Plural value={count} one="# message" other="# messages" />
    </div>
  )
}
```

跑 `pnpm lingui extract` 后，`locales/zh/messages.po` 里出现两条 msgid（`Hi {name}, your inbox` 和 ICU 复数表达式）。译员填 msgstr，再 `pnpm lingui compile` 编译成 `.js`，运行时就看见中文了。**整段代码里 0 个手写 key**。

### 案例 2：切语言

```ts
import { i18n } from '@lingui/core'
import { messages as zhMessages } from './locales/zh/messages'
import { I18nProvider } from '@lingui/react'

i18n.load('zh', zhMessages)
i18n.activate('zh')      // 一行切语言
```

`I18nProvider` 监听 `i18n` 实例的 locale 变化，整棵组件树自动重渲染。无需 reload，无需 router 切换。

### 案例 3：改一个文案，已有翻译会怎样

源码把 `<Trans>Hi {name}</Trans>` 改成 `<Trans>Hello {name}</Trans>`。再跑 `lingui extract`：

```po
#, fuzzy
msgid "Hello {name}"
msgstr "你好 {name}"
```

旧翻译保留，但加 `fuzzy` 标记，提示译员"原文改了，请复审"。这是 gettext 灵魂——**翻译不丢但要人确认**。

## 踩过的坑

1. **Babel 配置门槛**：Vite / Turbopack / Rspack 默认走 esbuild / SWC 不跑 Babel，要塞 Babel 进 pipeline 性能就降一档。SWC plugin 还在 v4.10 实验，覆盖率约 70%。

2. **macro 调试困难**：macro 是编译期 silent transform，出错经常落在展开后的代码上。新人看见 `i18n is not defined` 不知道是少装 `@lingui/macro` 还是 Provider 没挂。

3. **placeholder 名耦合源码**：把 `${userName}` 改成 `${user.name}`，msgid 从 `{userName}` 变成 `{name}`，所有翻译变 fuzzy。"自然字符串" 抽象的代价。

4. **`.po` 对前端不友好**：习惯 `.json` 的团队要装 poedit 或学 Crowdin，`fuzzy` / `obsolete` / `Plural-Forms` 都是 gettext 概念，没两小时学不完。

## 适用 vs 不适用场景

**适用**：

- 中长字符串文案多的应用（产品介绍、邮件模板、营销页）——"不写 key"收益最大
- 团队里有专职译员或对接 Crowdin / Lokalise / Phrase 工作流
- 字符串改动频繁、要 fuzzy / obsolete 这种细粒度状态管理
- 多语言数 ≥ 5 的项目，写 key 的开销被放大

**不适用**：

- Next.js App Router 重 RSC 项目——选 next-intl，原生支持成熟
- 字符串短而少（label / button），团队习惯 `t('save')` 这种 key——i18next 心智更顺
- 全 esbuild / Turbopack 的 build 配置，不想塞 Babel
- 5 人以下小团队、单语言为主——直接 i18next 配 `.json` 够了

## 历史小故事（可跳过）

- **2017 年**：Tomáš Ehrlich 个人项目起步，初衷是"为啥前端要写 key 而后端 gettext 不用"。
- **2019 年**：v2 稳定，社区集中在捷克 / 东欧 React 圈（gettext 文化重）。
- **2022 年**：v3 加 `.json` 格式支持，但默认仍是 `.po`，向 React Native / Vue 实验扩展。
- **2024 年**：v4 切自家 ICU parser fork、加 Vite plugin、实验 SWC plugin 和 RSC 支持。
- **现状**：weekly downloads ~100k，stars 4.5k+，没爆但忠实用户粘性极高，在中长字符串多 / 多语言团队中口碑极好。

## 学到什么

1. **抽象的代价是双向的**——不写 key 让开发爽，但编译期 / 运行时心智要同时建，新人成本不低。
2. **复用标准比发明标准强**：ICU MessageFormat 是 Unicode 官方规范，复用它意味着译员只学一次，这种 leverage 很值。
3. **小众不等于差**：技术最对的方案不一定占市场份额，工程世界优势经常被"配置成本 + 文档"消解。
4. **编译期工具链是双刃剑**：能换来 DX 极佳的体验，也意味着被 Babel / SWC 路线绑架，build pipeline 一变就要重做适配。
5. **gettext 不是老古董**：`.po` 文件元数据 / fuzzy / 工具链都比 `.json` 强，前端不熟只是社区认知偏差。

## 延伸阅读

- 官方文档：[lingui.dev](https://lingui.dev/)（v4 文档，含 Vite / Next / SWC 路线图）
- GitHub 仓库：[lingui/js-lingui](https://github.com/lingui/js-lingui)
- 视频：[Tomáš Ehrlich — Lingui v3 in Practice](https://www.youtube.com/results?search_query=lingui+react+i18n)（YouTube 搜索）
- ICU MessageFormat 规范：[unicode.org/reports/tr35](https://unicode.org/reports/tr35/)
- gettext 文档：[GNU gettext manual](https://www.gnu.org/software/gettext/manual/)（理解 .po / fuzzy / Plural-Forms 起点）

## 关联

- [[i18next]] —— runtime-first、要手写 key 的对手；和 Lingui 是两条不同路线
- [[react]] —— Lingui 的主战场，`<Trans>` 走 React Context 注入 i18n 实例
- [[vite]] —— `@lingui/vite-plugin` 把 `.po` 当 module 加载，HMR 走 handleHotUpdate
- [[babel]] —— Babel macro 是 Lingui 的引擎，`babel-plugin-macros` 提供宿主机制
- [[swc]] —— v4.10+ 在做 SWC plugin 替代 Babel macro，性能预期 5-10x
- [[turborepo]] —— 多 locale 仓库做 build cache 时，`.po` / `.js` 编译产物要正确缓存

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[vue-i18n]] —— vue-i18n — Vue 官网推荐的 i18n，切语言整页自己刷新
