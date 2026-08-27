---
title: pnpm — 用内容寻址 store 做严格 workspace 安装
来源: https://github.com/pnpm/pnpm
日期: 2026-05-30
分类: 工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/pnpm/pnpm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cef4816dfbc9aa7ffbe67fa727c1eb9be5d5e1e7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.24.0
---

## 是什么

pnpm 是 Node 的包管理器：依赖文件先按内容哈希进全局 store，再投影到项目的 `node_modules`。日常类比：图书馆只存一本原书（store），阅览室的座位上放的是借书卡和指向原书的链接，不是每人再印一册。

固定 `pnpm@11.24.0` 来自仓库目录 `pnpm11/pnpm`。用户拿到的 npm 包是打包后的 JS CLI：`bin/pnpm.mjs` 先检查 Node，再动态 `import('../dist/pnpm.mjs')`。`pn` 是同一入口，`pnpx` / `pnx` 是执行器别名。引擎声明 `node >=22.13`。

```bash
pnpm install --frozen-lockfile
```

这一句按 `pnpm-lock.yaml` 还原图；本轮没有执行安装。

## 为什么重要

不理解固定 11.24.0 的分层，下面这些旧印象会错位：

- 为什么不能再写 `~/.pnpm-store/v3`——常量 `STORE_VERSION` 已是 `v11`
- 为什么 pnpm 11 的 lockfile 仍报 major `9`——包版本和 lockfile 协议不是同一个号
- 为什么 `workspace:^1.0.0` 在 workspace 里找不到同名包会直接抛错，而不是去 registry 碰运气
- 为什么 README 里的 Rust / pacquet 不能当成这个 npm 包的入口——发布物是 `pnpm11/pnpm` 的 JS bundle

## 核心要点

固定版本可以拆成四层：

1. **内容寻址 store**：`STORE_VERSION = "v11"`。能链到 home 盘时，默认路径是 `path.join(pnpmHomeDir, "store", "v11")`；跨卷硬链接失败则落到 `<mount>/.pnpm-store/v11`。CAFS 文件在 `files/<digest 前 2 位>/...`。导入方法是 `auto | hardlink | copy | clone | clone-or-copy`。

2. **严格投影**：`nodeLinker` 为 `isolated | hoisted | pnp`，store-status 默认 `isolated`。isolated 下，一个包通常只能看到自己在 manifest 里声明的依赖；没声明的“幽灵依赖”解析不到。

3. **workspace 协议**：`pnpm-workspace.yaml` 列出成员。`workspace:*` / `workspace:^` / `workspace:~` / `workspace:^1.0.0` 在 workspace 包集合里解析；名字不在集合里抛 `WORKSPACE_PKG_NOT_FOUND`。`workspace:./`、`workspace:../` 走本地目录，不是裸包名。

4. **锁与布局版本分开**：`WANTED_LOCKFILE = "pnpm-lock.yaml"`，`LOCKFILE_VERSION = "9.0"`，`LAYOUT_VERSION = 5`。升级 pnpm 主版本不等于自动换 lockfile major。

## 实践示例

### 案例 1：从 npm 切到 pnpm

```bash
rm -rf node_modules package-lock.json
pnpm install
```

isolated 布局下，顶层 `node_modules` 通常只露出当前项目声明过的包。以前靠 hoist 才能 `require` 到的包会在这里暴露——这是边界，不是偶然报错。

### 案例 2：workspace 引用本地包

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

```json
{
  "dependencies": {
    "@org/utils": "workspace:^1.0.0"
  }
}
```

`workspace:^1.0.0` 先在成员里找 `@org/utils`，再用这个 range 挑本地版本。成员里没有这个名字时，源码抛 `WORKSPACE_PKG_NOT_FOUND`，并附上当前 workspace 里有哪些包名。

### 案例 3：store 在哪

未自定义 `storePath` 时，实现先试 home 盘能否硬链接当前项目；能，就用 `pnpmHomeDir/store/v11`。不能，就在可链接的挂载点写 `.pnpm-store/v11`。Docker 跨卷、Windows 跨盘会走到后一条，磁盘“只存一份”的前提不成立。

## 踩过的坑

1. **把 store 路径写成 v3**：固定源码常量是 `v11`。pkg-finder README 示例里的 `v10` 也不是这个提交的常量。
2. **把 pnpm 11 理解成 lockfile 11**：lockfile major 仍是 `9`。
3. **Node 20 当“还能凑合用”**：`bin/pnpm.mjs` 对 Node 20 只警告，对 `<22.13` 直接 `exit 1`。
4. **手改 `pnpm-lock.yaml`**：它是依赖图的序列化，不是给人当 YAML 配置改的。
5. **把仓库里的 Rust crate 当成 `pnpm@11.24.0`**：npm 包入口是 `pnpm11/pnpm`；`./pnpm` 是实验性 port。

## 适用 vs 不适用场景

**适用**：

- 需要严格依赖边界的 workspace（>3 个包尤其明显）
- 同一块盘上多个项目共享 store，且能硬链接 / clone
- CI 缓存 store + `--frozen-lockfile`，而不是直接复用 `node_modules` 快照

**不适用**：

- 项目和 store 经常跨 mount，硬链接失败只能 copy
- 必须用 Node 20 跑这一版 CLI
- 只要评测 Rust port / `@pnpm/exe` 独立二进制——应另绑那些产物，不是这篇 npm 包页

## 固定版本边界

- 本文绑定 `pnpm/pnpm@cef4816d...`，tag `v11.24.0`，包版本 `11.24.0`。
- npm `pnpm@11.24.0` 没有 `gitHead`；身份靠 tag + 版本 + 提交。
- 同仓还有 Rust workspace（`pnpm/crates/*`、`pnpr/crates/*`），未当作本页入口。
- 未安装依赖、未跑 `pnpm install` 或 store prune，状态保持 `UNVERIFIED`。

## 学到什么

1. **共享 inode 比“再复制一份再去重”更省**——前提是同一文件系统能链接
2. **协议字符串和解析语义要分层**——`workspace:` 先判形式，再查成员集合
3. **产品版本、lockfile、store、node_modules layout 可以各走各的号**
4. **仓库里同时存在 JS 发布物和实验 port 时，必须先钉入口目录**

## 应用型自测

1. 固定源码里全局 store 的版本目录名是 `v3`、`v10` 还是 `v11`？
2. `is-positive@workspace:^3.0.0` 写在依赖里，但 workspace 没有这个包名。解析会去 npm registry 吗？
3. 当前 Node 是 22.12。`bin/pnpm.mjs` 会继续加载 `dist/pnpm.mjs` 吗？

检查点：

1. `v11`。`STORE_VERSION` 写死为 `'v11'`。
2. 不会。源码抛 `WORKSPACE_PKG_NOT_FOUND`。
3. 不会。`<22.13` 先 `console.error` 再 `process.exit(1)`。

## 延伸阅读

- 官方文档：[pnpm.io](https://pnpm.io)
- 固定源码：[github.com/pnpm/pnpm](https://github.com/pnpm/pnpm) —— 本文绑定 `cef4816dfbc9aa7ffbe67fa727c1eb9be5d5e1e7`
- 审查记录：仓库内 `docs/lerna-pnpm-source-review-20260827-dy.md`
- [[lerna]] —— 同批次对照：读 pnpm workspace 文件做 version/publish
- [[nx]] —— 任务图 / 缓存，不管 store
- [[bun]] —— 另一条带全局 cache 的安装器，lockfile 模型不同

## 关联

- [[lerna]] —— 可把 `npmClient` 设为 pnpm 并读 `pnpm-workspace.yaml`
- [[nx]] —— 调度层，常和 pnpm workspace 叠用
- [[turborepo]] —— 任务缓存对照
- [[changesets]] —— workspace 发版的另一条合同
- [[bun]] —— 安装器对照
- [[node-js]] —— 引擎下限 `>=22.13`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[bun]] —— Bun — JS 全能运行时
- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[lerna]] —— lerna — 在 workspace 上做拓扑 version / publish
- [[mise]] —— mise — 一条命令切换项目用的 Node/Python/Go 版本
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[scoop]] —— Scoop — Windows 上的 Homebrew 风格命令行包管理器
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
