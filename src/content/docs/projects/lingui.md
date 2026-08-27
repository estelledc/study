---
title: Lingui — 编译期把自然语言收成 ICU catalog
description: 介绍 Lingui 如何用 macro 提取 msgid，再让运行时 i18n 读取编译后的 ICU catalog
来源: https://github.com/lingui/js-lingui
日期: 2026-08-27
分类: 前端国际化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lingui/js-lingui
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 665a19815378dedd89346bb7707bdb0e28df79e7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.6.0
---

## 是什么

Lingui 是一套把“源码里的自然句子”收成翻译目录的 JavaScript i18n 工具。日常类比：点菜时直接说“番茄炒蛋”，而不是报菜单编号；编译器负责把这句话登记成 msgid，译员填对照表，运行时再读回来。

你写：

```js
import { t } from '@lingui/core/macro';
import { i18n } from '@lingui/core';

i18n.load('en', { 'Hello {name}': 'Hello {name}' });
i18n.activate('en');
t`Hello ${name}`;
```

固定 6.6.0 里，默认 macro 入口是 `@lingui/core/macro` 和 `@lingui/react/macro`。Babel 插件把 `t\`Hello ${name}\`` 收成 `i18n._({ id, message, values })`。`t` 在运行时只是 `I18n._` 的别名。

## 为什么重要

不理解 macro 入口、catalog 合并和 Provider 订阅，就解释不了下面几件事：

- 为什么现在不再从 `@lingui/macro` 默认导入
- 为什么改了一句英文会变成“新 key + 旧 key obsolete”，而不是自动 fuzzy
- 为什么 `I18nProvider` 在没 `activate` 时可能渲染 `null`
- 为什么生产环境未编译的字符串会丢掉复数插值

## 核心要点

固定 6.6.0 的主链可以拆成五步：

1. **编译期提取**：`@lingui/babel-plugin-lingui-macro` 识别 `t` / `plural` / `Trans` / `Plural`。JS 调用展开成 `i18n._(descriptor)`；`useLingui()` 里解构的 `t` 会被改写成运行时 `_`。生产默认 `descriptorFields: "id-only"`。

2. **收目录**：`@lingui/cli` 提供 `extract` / `compile`。`mergeCatalog` 按 key 集合分成 new、merge、obsolete；删掉的 key 标 `obsolete: true`，除非传入 `--files` 限制范围。

3. **格式是独立包**：`makeConfig` 拒绝字符串 `format: "po"`。`.po` 要显式 `import { formatter } from "@lingui/format-po"`。fuzzy 是 PO flag，合并器不会因为两句相近英文就自动打上。

4. **运行时**：`I18n.load` 写入 `_messages[locale]`，`activate` 改当前 locale 并 `emit('change')`。缺词时先 `missing` 事件，再回退 `options.message` 或 id。开发态会挂上 `compileMessage`；生产期望预编译 catalog。

5. **React 订阅**：`I18nProvider` 用 `useSyncExternalStore` 听 `change`，并用 `Proxy` 换新引用。`<Trans>` 走到 `i18n._(id, values, { message, formats })`。另有实验性 `TransNoContext` 给 RSC。

## 实践示例

### 案例 1：macro 入口与运行时 `_`

```js
import { t, plural } from '@lingui/core/macro';
import { Trans, Plural } from '@lingui/react/macro';

t`Hi ${name}, your inbox`;
plural(count, { one: '# message', other: '# messages' });
```

插件把这些调用收成 message descriptor，再生成 `i18n._(...)`。默认配置不再把 `@lingui/macro` 当作 core/jsx package。

### 案例 2：load 之后必须 activate

```js
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';

i18n.load('zh', messages);
i18n.activate('zh');
```

`load` 只合并 catalog 并发 `change`。`activate` 才设置 `_locale`。`I18nProvider` 看到空 locale 时，开发态打印说明并返回 `null`。

### 案例 3：改文案是新 key，不是自动 fuzzy

```js
// 昨天：t`Hi ${name}`
// 今天：t`Hello ${name}`
```

`mergeCatalog` 把 `Hello {name}` 当 new key，把不再出现的 `Hi {name}` 标 obsolete。它不会把旧译文抄到新 msgid 并标 `#, fuzzy`。PO 文件可以保留已有 fuzzy flag，但那是格式层，不是合并器的自动匹配。

## 踩过的坑

1. **继续装 npm 上的 `@lingui/macro@5.9.5`**：那个包的 `gitHead` 是 `7b55bd79...`，不是本页绑定的 `v6.6.0`。v6 默认入口是 `@lingui/core/macro` / `@lingui/react/macro`；经 `babel-plugin-macros` 的旧路径会打印弃用警告。

2. **以为改句子会像 gettext msgmerge 一样 fuzzy 续上**：Lingui 合并按 id 精确集合运算。自然语言当 id 时，改几个词就换 key。

3. **生产环境喂未编译字符串**：没有 `setMessagesCompiler` 时，ICU 复数/插值不会按编译 token 走。开发态之所以“看起来能跑”，是因为构造器在非 production 挂了 `compileMessage`。

4. **Provider 包了一层却不 activate**：`I18nProvider` 在 `!context.i18n.locale` 时返回 `null`，整棵子树不会出现。

5. **把 Vite 插件理解成 `handleHotUpdate`**：`@lingui/vite-plugin` 用 `(\.po|\?lingui)$` 做 transform。本 revision 没有 `handleHotUpdate`。

## 适用 vs 不适用场景

**适用**：

- 希望源码里写自然句子，由编译器生成 id / catalog
- 团队已经用 `.po` 或独立 formatter，并能接受 extract → compile 两步
- 需要 React Context 订阅，或实验性 `TransNoContext` 路径

**不适用**：

- 习惯手写 `t('save')` 扁平 key、按 namespace 懒加载——看 [[i18next]]
- 只要 ICU 运行时、不要 macro 工具链——看 [[react-intl]]
- 不能把构建切到 Babel / 官方 SWC 插件
- 运行时 Node 低于 `>=22.19.0`——这是本 revision 的 engines

## 固定版本边界

- 本文绑定 `lingui/js-lingui@665a19815378dedd89346bb7707bdb0e28df79e7`，源码 tag 为 `v6.6.0`。
- `@lingui/core@6.6.0` 与 `@lingui/cli@6.6.0` 的 npm `gitHead` 同指此提交；根 workspace `package.json` 仍写 `version: 6.0.0` 且 `private: true`。
- npm `@lingui/macro@5.9.5` 指向另一提交，本页不绑定。
- `I18n.date` / `I18n.number` 已标 deprecated，源码建议直接用 `Intl.*`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **macro 包名是合同的一部分**——v6 把入口拆进 `@lingui/core/macro` 与 `@lingui/react/macro`。
2. **运行时真正执行的是 `_`**——`t` 只是别名；Provider 解构也会被改写成 `_`。
3. **catalog 合并认 id，不认“看起来像同一句”**——obsolete 有，自动 fuzzy 续译没有。
4. **开发态编译器会掩盖生产缺口**——未编译 catalog 在 production 不会 magically 获得 ICU。

## 应用型自测

1. 固定 6.6.0 的默认 JS macro 入口模块名是什么？
2. `t\`Hello\`` 展开后调用的是 `i18n` 的哪个方法？
3. 把 `t\`Hi ${name}\`` 改成 `t\`Hello ${name}\`` 后，旧译文会自动标 fuzzy 并挂到新 msgid 吗？

检查点：

1. `@lingui/core/macro`（JSX 则是 `@lingui/react/macro`）。
2. `_`。
3. 不会。旧 key 变 obsolete，新 key 是另一条记录。

## 延伸阅读

- 文档：[lingui.dev](https://lingui.dev/)
- ICU：[UTS #35](https://unicode.org/reports/tr35/)
- 固定源码：[lingui/js-lingui](https://github.com/lingui/js-lingui) —— 本文绑定提交 `665a19815378dedd89346bb7707bdb0e28df79e7`
- [[i18next]] —— 运行时 key + 插件总线的对照
- [[react-intl]] —— 同一 ICU 家族，但默认手写 id

## 关联

- [[i18next]] —— 手写 key、后缀复数、框架无关运行时
- [[react-intl]] —— FormatJS 的 ICU 运行时
- [[react]] —— `@lingui/react` 的 Provider / Trans
- [[vite]] —— `@lingui/vite-plugin` 编译 `.po`
- [[babel]] —— `@lingui/babel-plugin-lingui-macro`
- [[swc]] —— 文档提到的另一条转译器，本仓此 tag 未包含 SWC 插件源码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[vue-i18n]] —— vue-i18n — Vue 官网推荐的 i18n，切语言整页自己刷新
