---
title: openapi-typescript — 把 OpenAPI 3 文档编译成 TypeScript AST
description: 用 Redocly 校验并 bundle OpenAPI 3.x，再把 paths / operations / components 编成可打印的 TS 类型
来源: https://github.com/openapi-ts/openapi-typescript
日期: 2026-08-27
分类: projects
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/openapi-ts/openapi-typescript
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5709d33a5977c4908b9e331f01cd0f9e181b1c37
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.13.0
---

## 是什么

openapi-typescript 是一个把 **OpenAPI 3.x 文档编译成 TypeScript AST** 的代码生成器。日常类比：它不是前台去发 HTTP 请求的人，而是把墙上那张接口说明书抄成一份 TypeScript 合同，给调用方在编译期对照。

固定 7.13.0 是 monorepo 里的 `packages/openapi-typescript`。入口 `openapiTS()` 接受 URL、文件路径、YAML/JSON 字符串、Buffer、Readable 或已解析对象，返回 `ts.Node[]`；要用文件得再 `astToString()`。

```ts
import fs from "node:fs";
import openapiTS, { astToString } from "openapi-typescript";

const ast = await openapiTS(new URL("./openapi.yaml", import.meta.url));
fs.writeFileSync("./schema.d.ts", astToString(ast));
```

它不发请求、不校验运行时 JSON。类型文件只描述 paths、webhooks、components、`$defs` 和 `operations`。

## 为什么重要

不理解这条编译链，下面这些事会对不上：

- 为什么生成物是 `paths["/pets/{id}"]["get"]`，而不是一个现成 HTTP client
- 为什么缺 `operationId` 的接口进不了顶层 `operations` 表
- 为什么空对象默认变成 `Record<string, never>`，而不是 `unknown`
- 为什么 Swagger 2.0 / `openapi: 2.x` 会直接抛错

一句话：它是 TS 生态里常见的 **OpenAPI → 类型** 台阶，再往上才是 openapi-fetch 或手写 [[axios]] 调用。

## 核心要点

固定版本的主链可以拆成五步：

1. **解析输入**：字符串若以 `{` 开头当 JSON；`http(s):` / `file:` 走 Redocly resolver；否则当 YAML。对象原样包成 document。

2. **版本门**：读 `openapi` 字段。存在 `swagger`、缺失 `openapi`、或主版本不在 `[3, 4)`，一律拒绝。Swagger 2.x 的错误信息是明确的：`Use OpenAPI 3.x instead.`

3. **lint + bundle**：默认 Redocly config 继承 `minimal`，并把 `operation-operationId-unique` 提到 error。lint/bundle 的 error 会抛；warning 在非 silent 时打印。`$ref` 被 bundle，但 `dereference: false`，类型侧再用 `resolve($ref)` 取值。

4. **编 AST**：`transformSchema()` 依次处理 `paths`、`webhooks`、`components`、`$defs`。默认导出 interface；`exportType: true` 才改成 type alias。没有 operations 时会补一个空的 `operations` 记录类型。

5. **operationId 提升**：path item 上若有 `operationId`，方法类型改成指向 `operations[id]` 的引用，并把参数（path-level 与 operation-level 合并，后者覆盖）注入顶层 `operations`。没有 id 的操作只留在 `paths` 字面量里。

## 实践示例

### 案例 1：CLI 生成声明文件

```bash
npx openapi-typescript ./openapi.yaml -o ./schema.d.ts
```

CLI 读 Redocly config（默认 `redocly.yaml`），可用 `--check` 对比已有输出是否过期。`-o` 不写就打印到 stdout。

### 案例 2：按路径取操作类型

```ts
import type { paths } from "./schema";

type GetPet = paths["/pets/{id}"]["get"];
type Pet = GetPet["responses"][200]["content"]["application/json"];
```

没有 `operationId` 时只能走这条路径索引。有 id 时还可以 `operations["getPet"]`。

### 案例 3：只读 / 只写标记

```ts
const ast = await openapiTS(spec, { readWriteMarkers: true });
```

打开后会注入 `$Read` / `$Write` / `Readable` / `Writable` 辅助类型，把 schema 的 `readOnly` / `writeOnly` 编进属性。默认关闭。

## 踩过的坑

1. **把生成类型当成运行时 client**：`openapiTS()` 只返回 AST。发请求要另接 HTTP 库或同家族的 fetch wrapper。

2. **继续喂 Swagger 2.0**：`document.parsed.swagger` 存在就抛错。要先升到 OpenAPI 3，或换仍接受 2.0 的 [[swagger-js]]。

3. **以为空 object schema 是 `unknown`**：默认 `emptyObjectsUnknown` 为 false，空对象编成 `Record<string, never>`。需要宽松对象时显式打开选项。

4. **重复 operationId**：默认 Redocly 规则把它当 error，整次生成失败，而不是默默改名。

5. **把 `default` 当运行时填充**：`defaultNonNullable` 默认 true，只影响属性是否写成可选；生成文件不会在运行时补默认值。

## 适用 vs 不适用场景

**适用**：

- 已经有 OpenAPI 3.0 / 3.1 文档，要在 TS 里按路径或 operationId 取请求/响应类型
- 希望 `$ref` bundle、重复 operationId 和 3.x 版本门由同一条 Redocly 链处理
- 需要 AST 级 `transform` / `postTransform`，而不是只拿一份字符串

**不适用**：

- 还在 Swagger 2.0，且不打算先转换
- 需要一个能按 operationId 真正发请求的运行时 client → 看 [[swagger-js]]
- 需要运行时 schema 校验 → 看 [[zod]] / [[valibot]]，不要指望 `.d.ts`
- 把 OpenAPI 当 gRPC / tRPC 的替代协议本身

## 固定版本边界

- 本文绑定 `openapi-ts/openapi-typescript@5709d33a...`，annotated tag `openapi-typescript@7.13.0` 剥开后指向该 commit；`packages/openapi-typescript/package.json` 自报 `7.13.0`。
- npm `openapi-typescript@7.13.0` 未发布 `gitHead`，因此 revision 以 GitHub tag 对象为准，没有用 registry 反推。
- 运行时依赖 `@redocly/openapi-core`、`parse-json`、`yargs-parser` 等；CLI 走 `bin/cli.js`，库入口是 ESM/CJS 双导出。
- 本文未安装依赖、未跑上游测试、未对真实 spec 执行 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **类型生成器的产品边界是 AST，不是 HTTP**——谁发请求、谁校验 JSON，是下一层的事。
2. **先 lint/bundle 再变换**：版本门和重复 id 在编类型之前失败，避免半份 `.d.ts`。
3. **operationId 是可选索引，不是必经之路**：没有它仍然能从 `paths` 取类型。
4. **默认值都偏紧**：空对象、附加属性、deprecated 字段都要显式打开才会变松。

## 应用型自测

1. 把一份 `swagger: "2.0"` 文档传给固定 7.13.0 的 `openapiTS()`，会生成类型还是抛错？
2. 某个 GET 没有 `operationId`。生成文件里还能用 `operations["..."]` 取到它吗？
3. 不传选项时，一个没有 properties 的 object schema 更接近 `unknown` 还是 `Record<string, never>`？

检查点：

1. 抛错。存在 `swagger` 字段就被拒绝。
2. 不能。没有 id 的操作只留在 `paths`。
3. `Record<string, never>`。`emptyObjectsUnknown` 默认 false。

## 延伸阅读

- 官方站点：[openapi-ts.dev](https://openapi-ts.dev)
- 固定入口：[packages/openapi-typescript/src/index.ts](https://github.com/openapi-ts/openapi-typescript/blob/5709d33a5977c4908b9e331f01cd0f9e181b1c37/packages/openapi-typescript/src/index.ts)
- 校验与 bundle：[packages/openapi-typescript/src/lib/redoc.ts](https://github.com/openapi-ts/openapi-typescript/blob/5709d33a5977c4908b9e331f01cd0f9e181b1c37/packages/openapi-typescript/src/lib/redoc.ts)
- [[swagger-js]] —— 运行时 resolve + 按 operation 发请求
- [[zod]] —— 运行时 schema，不能被 `.d.ts` 替代

## 关联

- [[swagger-js]] —— 同一份 OpenAPI 的运行时对偶：resolve / execute，不生成 TS
- [[axios]] —— 常见的手写 client 底座；类型仍要另接生成器
- [[ofetch]] —— 另一条 fetch wrapper；同样不读 OpenAPI
- [[fastapi]] —— 服务端产出 OpenAPI 文档的常见来源
- [[zod]] —— 若要把外部 JSON 当可信数据，需要 runtime parse

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[swagger-js]] —— swagger-js — 按 OpenAPI 文档 resolve 并执行操作的 JS client
