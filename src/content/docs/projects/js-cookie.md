---
title: js-cookie — 把 document.cookie 收成可替换的浏览器读写器
description: 介绍 js-cookie 3.0.8 如何用 converter、冻结属性和按天 expires 包装 document.cookie。
来源: https://github.com/js-cookie/js-cookie
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/js-cookie/js-cookie
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d7a10966e3f2cbcbfa96e34e7544d23aab9e3372
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.8
---

## 是什么

js-cookie 是一个只面对浏览器 `document.cookie` 的读写库。日常类比：它不自己开冰箱，只给冰箱门上的纸条规定怎么写、怎么读；没有 `document` 时，`set` / `get` 直接返回，什么也不做。

你写：

```js
import Cookies from 'js-cookie'

Cookies.set('theme', 'dark', { expires: 7 })
Cookies.get('theme')
Cookies.remove('theme')
```

`expires: 7` 会被当成 **7 天**，不是 7 毫秒。固定 3.0.8 的源码入口是 `src/api.mjs`；npm 包真正导出的是构建后的 `dist/js.cookie.mjs` / `dist/js.cookie.js`。本页绑定的 git 树里没有 `dist/`。

## 为什么重要

不理解这条“字符串协议 + 默认 path=/”的合同，就解释不了下面几件事：

- 为什么在 Node 里 `import` 之后调用 `set` 看起来成功、其实什么都没写
- 为什么 `Cookies.remove('theme')` 删不掉当初用 `path: ''` 写下的 cookie
- 为什么 `expires` 写 `7` 和 Node 侧 [[cookies]] 的 `maxAge: 7` 完全不是一回事
- 为什么 `withAttributes` 不会改掉你手里那份默认实例

## 核心要点

固定 3.0.8 的主链可以拆成五步：

1. **先确认有 `document`**：`set` 见到 `typeof document === 'undefined'` 就返回；`get` 在没有 `document`、或传了空名字时同样返回。

2. **合并并冻结属性**：每次 `set` 用 `assign({}, defaultAttributes, attributes)`。默认实例的 `defaultAttributes` 是 `{ path: '/' }`。`attributes` 与 `converter` 都挂在 `Object.freeze` 上，不能事后改默认对象。

3. **数字 `expires` 按天换算**：`typeof expires === 'number'` 时写成 `new Date(Date.now() + expires * 864e5)`，再 `toUTCString()`。`remove` 只是 `set(name, '', { expires: -1 })`。

4. **名字和值走 converter**：名字先 `encodeURIComponent`，再放回 RFC 允许的 `# $ & + ^ \` |`，并把 `()` 交给 `escape`。值走 `converter.write`；读的时候按 `; ` 切开，`decodeURIComponent` 名字，再用 `converter.read`。同名 cookie 第一次写入 jar 后不再覆盖。

5. **换默认值就换实例**：`withAttributes` / `withConverter` 都调用 `init(...)` 返回新对象，不修改当前实例。属性值为假值时该属性不会写进 cookie 字符串；属性值里的 `;` 按 RFC 6265 截到第一段。

## 实践示例

### 案例 1：按天过期，不是按毫秒

```js
Cookies.set('sessionHint', '1', { expires: 1 })
```

源码把 `1` 乘上 `864e5`，得到大约一天后的 UTC 过期时间。若你把 Node `cookies` 的毫秒习惯带过来，会写成几乎立刻过期的 cookie。

### 案例 2：删除必须带上当初的 path / domain

```js
Cookies.set('nav', 'open', { path: '' })
Cookies.remove('nav')            // 默认 path=/，对不上
Cookies.remove('nav', { path: '' })
```

浏览器按 name + path + domain + secure + sameSite 识别 cookie。`remove` 只是写一条立刻过期的同名记录，属性对不上就删不掉。

### 案例 3：换 converter，不改默认实例

```js
const raw = Cookies.withConverter({
  write: (value) => value,
  read: (value) => value
})
raw.set('plain', 'a=b')
Cookies.converter === raw.converter
```

`withConverter` 用 `assign` 叠一层 read/write，再 `init` 出新 API。默认实例的 `converter` 仍是冻结的那份百分号编解码。

## 踩过的坑

1. **把 js-cookie 当 SSR 会写 cookie 的库**：没有 `document` 就静默返回。服务端 Set-Cookie 要看 [[cookies]] 或框架自己的 cookie API。

2. **把 `expires: 7` 理解成 7 毫秒或 7 秒**：这里是天。README 也写明小于一天要自己换算。

3. **删 cookie 时省略 path**：默认 `path=/`。用空 path 或自定义 domain 写下的条目，必须原样传给 `remove`。

4. **把 npm `gitHead` 当成源码 tag**：`js-cookie@3.0.8` 的 npm `gitHead` 是父提交 `248e685e20c7aa9553453f0084f14a62173462d2`；源码 tag `v3.0.8` 剥皮提交是 `d7a10966...`，只改了 `package.json` / lock 的版本号。`src/` 两份提交相同。

5. **把 README 的 gzip 体积当成本轮测量**：文档写过 “< 800 bytes”。本轮未安装依赖、未打包、未测体积。

## 适用 vs 不适用场景

**适用**：

- 浏览器里读写可见 cookie，并接受默认 `path=/`
- 需要按实例换默认属性或编解码，而不改全局单例
- 能接受“只包装 `document.cookie`，不签名、不 HttpOnly”

**不适用**：

- 要在 Node 请求/响应上写 `Set-Cookie`、默认 HttpOnly、可选签名——看 [[cookies]]
- 会话 cookie 还要自己挡 CSRF、管数据库——看 [[lucia]] / [[better-auth]]
- 不能接受源码仓不带 `dist/`、npm 发布树与 tag 差一个版本提交

## 固定版本边界

- 本文绑定 `js-cookie/js-cookie@d7a10966e3f2cbcbfa96e34e7544d23aab9e3372`，源码 tag 为 `v3.0.8`，`package.json` 的 `version` 为 `3.0.8`。
- npm `js-cookie@3.0.8` 的 `gitHead` 是祖先提交 `248e685e20c7aa9553453f0084f14a62173462d2`；tag 提交只做发布版本号，`src/api.mjs` / `converter.mjs` / `assign.mjs` 无差异。
- `assign` 会跳过 `__proto__`。默认 converter 在 write 时放回部分 RFC 允许字符，read 时去掉包围引号再解码。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **浏览器 cookie 仍是一条字符串**——库只规定怎么拼、怎么拆，不提供隔离存储。
2. **过期单位写在实现里，不写在参数名里**——这里的数字是天，对面 Node 库常常是毫秒。
3. **默认实例是冻结的**——要换 path 或编码，就 `withAttributes` / `withConverter` 出新对象。
4. **发布树可以和源码 tag 差一个版本提交**——读 npm `gitHead` 前要看它是不是 tag 的祖先。

## 应用型自测

1. `Cookies.set('a', 'b', { expires: 1 })` 里的 `1` 会乘上 `864e5` 还是直接当毫秒用？
2. 在没有 `document` 的环境调用 `Cookies.get('a')`，返回值是什么？
3. `Cookies.remove('a')` 会不会带上你当初传入的自定义 `path`？

检查点：

1. 会乘上 `864e5`，按天换算。
2. 返回 `undefined`，不会抛错。
3. 不会。必须自己把当初的 `path` / `domain` 再传一遍。

## 延伸阅读

- 文档：[js-cookie README](https://github.com/js-cookie/js-cookie/tree/latest#readme)
- 固定源码：[js-cookie/js-cookie](https://github.com/js-cookie/js-cookie) —— 本文绑定提交 `d7a10966e3f2cbcbfa96e34e7544d23aab9e3372`
- [[cookies]] —— Node `Cookie` / `Set-Cookie` 对照，默认 HttpOnly，过期用毫秒
- RFC 6265：cookie 属性遇到 `;` 就截断

## 关联

- [[cookies]] —— 同一对 cookie helper 的服务端对照
- [[lucia]] —— 会话 token 怎么放进 cookie，库不代劳
- [[better-auth]] —— 框架自己写 cookie，不走 document.cookie
- [[next-js]] —— 服务端组件读 cookie 走框架 API
- [[express]] —— 浏览器写入的 cookie，下一跳会进 `Cookie` 头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
