# Sanitize / validate source review (writer JD)

> 用途：记录 xss-filters、validator 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：JD
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- reserved lanes：未使用 HM–ID；未选用 xss、insane、sanitize-html、isomorphic-dompurify

## xss-filters

- canonical source：`https://github.com/YahooArchive/xss-filters`
- historical / npm URL：`https://github.com/yahoo/xss-filters`（GitHub 重定向到 YahooArchive；仓库已 archived）
- revision：`5174da0a282f5fbd9289be1d0dd217f874a9f05c`
- package：`xss-filters@1.2.7`
- inspected：
  - `package.json`
  - `README.md`
  - `src/xss-filters.js`（`_getPrivFilters`、`yd`/`yc`/`yavs`/`yavd`/`yavu`、`yubl`/`yup`/`yufull`、`uriInAttr`、公开 API 与 URI 变体）
- observed：
  - `package.json` 无 runtime 依赖，`main=src/xss-filters.js`，`version=1.2.7`，许可证为 Yahoo BSD；
  - 公开 API 是按 HTML 上下文选过滤器，不是 HTML 解析器或标签白名单；
  - `inHTMLData` 只把 `<` 编成 `&lt;`；双引号属性只编 `"`，单引号属性只编 `'`；
  - `inUnQuotedAttr` 会编码空白、`=`、引号、`<>` 和空串（空串注入 `\uFFFD`）；
  - URI 属性过滤器顺序是 `encodeURI` / `yufull` → 属性编码器 → `yubl`；`yubl` 必须最后执行；
  - `URI_BLACKLIST_PROTOCOLS` 含 `javascript` / `data` / `vbscript` / `mhtml` / `x-schema`，命中后加 `x-` 前缀；
  - README 明确禁止把过滤器放进 `<script>` / `<style>` / `onXXX` / `style=""` 等可脚本上下文；
  - tag `v1.2.7`、剥皮提交与 npm `xss-filters@1.2.7` 的 `gitHead` 指向同一提交。

## validator

- canonical source：`https://github.com/validatorjs/validator.js`
- revision：`7a8079709cd4cb27b2a1846e6f6508d68c9d928f`
- package：`validator@13.15.35`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.js`
  - `src/lib/util/assertString.js`
  - `src/lib/util/merge.js`
  - `src/lib/isEmail.js`
  - `src/lib/isURL.js`
  - `src/lib/escape.js`
- observed：
  - tag `13.15.35`、`src/index.js` 内 `version` 与 npm `validator@13.15.35` 的 `gitHead` 指向同一提交；
  - `package.json` 无 runtime 依赖，`sideEffects` 为 false，`engines.node >= 0.10`；发布物来自 Babel 构建的 `index.js` / `lib` / `es`；
  - 每个校验 / 清洗函数先走 `assertString`；非字符串抛 `TypeError`，不是返回 false；
  - `isEmail` 默认最大长度 254，按最后一个 `@` 拆 user/domain，domain 走 `isFQDN`（可选 IP domain）；
  - `isURL` 默认协议 `http` / `https` / `ftp`，默认 `require_protocol=false`，并用正则识别无 `//` 的 scheme（含 `javascript:`）；
  - `escape` 只做字符级 HTML 实体替换；README 写明 XSS sanitization 已在历史提交 `2d5d6999` 移除，并指向 xss-filters / DOMPurify 作为替代，本轮未审查 DOMPurify。
