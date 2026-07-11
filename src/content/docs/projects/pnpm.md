---
title: pnpm — 全机器只存一份的 Node 包管理器
来源: 'https://github.com/pnpm/pnpm'
日期: 2026-05-30
分类: projects / 工具
难度: 中级
---

## 是什么

pnpm 是 Node.js 的包管理器，核心特点是**全机器只存一份依赖**。日常类比：像图书馆借书——每本书馆里只放一份，读者拿走的是"借书证"指向同一本书；而不是每个读者都自己印一份带回家。

你跑 `pnpm install`，pnpm 把每个文件按它的 sha256 哈希丢到 `~/.pnpm-store/` 这个全机器共享仓库，再在你项目的 `node_modules/` 里建**硬链接**指过去。

```bash
# 项目 A 和项目 B 都依赖 react 18.2.0
# react 的 index.js 在你硬盘上只有 1 个 inode
# 项目 A 和 B 的 node_modules 里都是硬链接指向同一份
```

结果：100 个 React 项目，react 的源码文件只占用 1 份磁盘。npm / yarn classic 是每个项目复制一份，pnpm 把它换成硬链接共享。

## 为什么重要

不理解 pnpm 的设计，下面这些事都没法解释：

- 为什么同样装 100 个项目，pnpm 的 `~/.pnpm-store` 只占几 GB，而 `node_modules/` 们却累计十几 GB——硬链接共享 inode
- 为什么 pnpm 项目里 `require('lodash')` 报错"找不到"，明明 `node_modules` 里看得到——它没声明在 package.json 里（叫 phantom dependency）
- 为什么 monorepo 工具链（Vue / Nuxt / Vite / Astro / Prisma）默认推 pnpm 而不是 npm
- 为什么 Windows 普通用户跑 pnpm 经常炸——symlink 创建权限默认关闭

## 核心要点

pnpm 的设计可以拆成 **三件事**：

1. **内容寻址存储（CAS）**：每个文件按 sha256 落到 `~/.pnpm-store/v3/files/<hex[:2]>/<hex[2:]>`。前 2 个 hex 字符做一级目录，避免单文件夹百万 inode。类比：每本书按书号入库，不按作者分类——同一字节流的文件自动去重。

2. **硬链接 + symlink 双层投影**：项目里 `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/` 的每个文件是**硬链接**到全局仓库；顶层 `node_modules/<pkg>` 是 **symlink** 指向 `.pnpm/...`。Node 找包走 symlink，磁盘共享走硬链接。

3. **workspace 协议**：monorepo 里 `package.json` 写 `"@org/utils": "workspace:^1.0"`，pnpm 把它解析成本地 workspace 包；publish 时自动展开成实际版本号。npm registry 不认 `workspace:` 前缀，pnpm 在发包前帮你 strip。

三件事合起来：**严格依赖边界 + 磁盘共享 + monorepo 一等公民**——npm / yarn classic / yarn berry 各自只拿到其中一两件。

## 实践案例

### 案例 1：从 npm 切到 pnpm 的最小步骤

```bash
# 卸了原来的 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json
# 用 pnpm 装一遍
pnpm install
# 顶层只看到你声明的包，被 hoist 出来的 phantom dependency 消失了
ls node_modules
```

切完第一次跑可能会炸——以前能 `require` 的包现在报错。这是 pnpm 在告诉你"这个包你没声明，赶紧加进 package.json"。这个报错是好事，是 phantom dependency 在编译期暴露。

### 案例 2：monorepo 用 workspace 协议引本地包

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

```json
// apps/web/package.json
{
  "dependencies": {
    "@org/utils": "workspace:^1.0.0",
    "lodash": "^4.17.21"
  }
}
```

`workspace:^1.0.0` 告诉 pnpm "去 workspace 里找 @org/utils，版本要满足 ^1.0.0"。比 `npm link` 体验好两个数量级——不用手动 link / unlink，改一行配置就生效。

### 案例 3：验证硬链接是真的共享 inode

```bash
# 找项目里某个文件的 inode（Linux / macOS 语法不同）
# Linux:
stat -c '%i' node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/lodash.js
# macOS:
stat -f '%i' node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/lodash.js
# 假设输出 1234567

# 在全局仓库里反查同一个 inode（两边通用）
find ~/.pnpm-store/v3/files -inum 1234567
# 输出指向某个 hash 路径，证明它和项目里的文件是同一个 inode
```

`-inum` 找 inode 号——硬链接的本质是"多个路径指向同一个 inode"。这个实验让你亲眼看到 pnpm 的核心机制不是"复制再 dedupe"，是文件系统层面的共享。注意 `stat` 的格式参数跨平台不通用，照抄错平台会直接报错。

## 踩过的坑

1. **store 不会自动 GC**：`~/.pnpm-store` 一直长，几年后到几十 GB 是常态。需要手动 `pnpm store prune` 清理无引用文件，否则磁盘节省的好处会被反噬。

2. **跨设备硬链接失败回退到复制**：项目和 store 在不同 mount（Docker 跨卷 / Windows 跨盘 / NFS）时报 `EXDEV`，pnpm fallback 到 copy，磁盘节省全部失效——错误是 graceful 但用户感知不到，除非看 install log。

3. **Windows 默认要开发者模式**：普通 Windows 用户没有创建 symlink 的权限，`node_modules/<pkg> -> .pnpm/...` 会失败。逃生口是设 `node-linker=hoisted` 退化成 npm 风格，但放弃了严格依赖边界。

4. **手改 `pnpm-lock.yaml` 会破坏一致性**：这文件长得像 yaml 但它是 pnpm 内部依赖图的序列化形态。要改依赖只改 package.json 然后重跑 `pnpm install`，不要直接编辑 lockfile。

## 适用 vs 不适用场景

**适用**：

- monorepo（>3 个包）—— `workspace:*` 协议是 pnpm 在这个场景碾压 npm 的关键
- 磁盘紧张的开发机 —— 100 个 Node 项目能省 10+ GB
- 团队需要严格依赖边界 —— phantom dependency 在编译期就报错，不会发版后炸
- CI 缓存 `~/.pnpm-store` —— 用 `pnpm install --frozen-lockfile` 配合 lockfile 一致性检查

**不适用**：

- 单包小项目 —— `.pnpm/` 中转目录是纯开销，npm/yarn 简单足够
- Windows 普通用户环境 —— 没开发者模式时 symlink 失败
- Docker 镜像里 node_modules 和 store 跨 mount —— 硬链接退化成复制，磁盘节省失效
- 直接缓存 `node_modules/` 的 CI 流水 —— 跨 build 复用硬链接快照会失败，要缓存就缓存 store + lockfile

## 历史小故事（可跳过）

- **2013 年**：Node 生态默认 npm v2，嵌套 `node_modules` 让 Windows 路径长度爆炸
- **2015 年**：npm v3 引入 flat hoist 解决路径过长，副作用是 phantom dependency 横行
- **2016 年**：Zoltan Kochan 在乌克兰发起 pnpm，初版就是"硬链接共享 store + 严格 node_modules"
- **2020 年**：Vite / SvelteKit 等新框架默认推荐 pnpm，monorepo 场景成为主战场
- **2024 年**：pnpm v9 lockfile 加入 env 文档（捕获 nodeVersion / pnpmVersion），向 reproducible build 再走一步

之后 pnpm 成了 Vue / Nuxt / Vite / Vercel / Astro / Prisma / Storybook 等项目的默认选择。

## 学到什么

1. **磁盘是有限资源**——SSD 时代每个 `node_modules` 200MB 不算大，但 100 个项目就是 20GB 浪费，硬链接是 Unix 几十年前就有的解法
2. **协议解析和协议语义要分层**——pnpm 的 `workspace:*` parser 只有 22 行，因为它只解字符串、不查包是否存在；上层 resolver 才管语义
3. **保留兼容 ABI 才能不和生态对抗**——yarn berry 选了消灭 `node_modules`，代价是和 IDE / TypeScript / loader 大量摩擦；pnpm 选了"形态不变、存储变"
4. **量化的优化决策**——pnpm 源码里有"~30k calls per cold install / saves ~30ms" 这种注释，"觉得快"的优化进不了 main

## 延伸阅读

- 官方动机文档：[pnpm.io/motivation](https://pnpm.io/motivation)（讲 pnpm 为什么要做硬链接共享）
- 仓库源码：[github.com/pnpm/pnpm](https://github.com/pnpm/pnpm)（30+ puzzle 包的 monorepo，自身就是 workspace 例子）
- 对比文章：[Why pnpm? — Zoltan 在 dev.to 的系列](https://dev.to/zkochan)（创始人讲设计取舍）
- [[npm-package-manager]] —— pnpm 的对照系
- [[yarn-berry-pnp]] —— 更激进的"消灭 node_modules"路线
- [[turborepo]] —— 常和 pnpm 搭档的 monorepo 任务编排器

## 关联

- [[npm-package-manager]] —— pnpm 的直接对照系，flat hoist vs 硬链接 + symlink
- [[yarn-berry-pnp]] —— 同样想解决 phantom dependency，但选了消灭 `node_modules` 的激进路线
- [[bun-runtime]] —— Bun install 思路接近 pnpm（硬链接 + 全局 cache），但 lockfile 是二进制
- [[turborepo]] —— monorepo 任务图工具，常和 pnpm 搭配做大型仓库的 build 调度
- [[content-addressable-storage]] —— pnpm 的 CAS 设计和 Git object store / Nix store 同源
- [[unix-hardlink]] —— pnpm 全机器共享的底层能力，多路径共享一个 inode
- [[symlink-vs-hardlink]] —— pnpm 同时用两种链接，理解它们的差别才看得懂 `node_modules` 的双层结构

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[bun]] —— Bun — JS 全能运行时
- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[lerna]] —— lerna — 一个仓库发几十个 npm 包的祖宗工具
- [[mise]] —— mise — 一条命令切换项目用的 Node/Python/Go 版本
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[projects/nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[projects/scoop]] —— Scoop — Windows 上的 Homebrew 风格命令行包管理器
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
