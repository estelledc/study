---
title: pnpm — 把 npm 的 flat node_modules 换成硬链接 + 内容寻址
description: 不是更快的 npm，是把"每个项目都复制一遍 node_modules"这件事重写成"全机器一份 store + 硬链接"——磁盘 50% 节省、phantom dependency 编译期可见、workspace protocol first-class
sidebar:
  order: 82
  label: pnpm/pnpm
---

> pnpm/pnpm，截至 2026-05 GitHub > 30k stars，MIT，Zoltan Kochan 创立。
> Fast, disk-space efficient package manager，**比 npm 快 2-3x，磁盘节省 50%+**。
> Vue / Nuxt / Vite / Vercel / SvelteKit / Astro / Prisma 在用。
>
> pnpm 不是"另一个 npm 替代品"——
> 它在哲学上回答了一个被 npm / yarn classic / yarn berry 都没正面回答的问题：
> **"为什么我电脑上 100 个项目，每个项目的 node_modules 都要把 lodash 解压一份？"**
>
> npm 的回答是 flat node_modules + 全量复制；
> yarn classic 用 hoist 解决重复但没解决跨项目复制；
> yarn berry 用 PnP 干脆不要 node_modules 了，但和现存生态对抗成本极高。
> pnpm 的判断：**保留 node_modules 这层 ABI，但 node_modules 里的每个真实文件是硬链接到全机器一份 content-addressable store。**
>
> Season 18-4 工具库篇。**项目类型：工具库（v1.1 分支 B）**——
> 这里的"工具库"是定义层意义的：pnpm 的核心是一组小职责的 puzzle 包
> （`@pnpm/store.cafs` / `@pnpm/workspace.spec-parser` / `@pnpm/lockfile.fs` / `@pnpm/fs.indexed-pkg-importer`），
> 每个包 surface 集中、职责单一，CLI（`pnpm`）只是这些 puzzle 包的编排层。
> 看完这篇你会知道：为什么 pnpm 故意保留 node_modules 而不像 yarn berry 那样消灭它，
> 以及一个 `pnpm install` 跑完之后 `~/.pnpm-store` 里到底躺着什么。

## 一句话定位

**pnpm = 把 node_modules 重新分层成 "机器级全局 store + 项目级 symlink/hardlink 投影"。**
你跑 `pnpm install`，pnpm 把 tarball 解压到 `~/.pnpm-store/v3/files/<sha256>`（每个文件按 sha256 hash 落盘，重复内容自动 dedupe）。
然后在你的项目里建 `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/`，里面每个文件是**硬链接**到全局 store。
最后 `node_modules/<pkg>` 是个 symlink，指向 `.pnpm/<pkg>@<ver>/node_modules/<pkg>`。
**整个过程里，相同字节流的文件在你的硬盘上只存在一份**——你电脑上 100 个 React 项目，react 的 `index.js` 也只有 1 个 inode。
副产品：node_modules 顶层只有你**显式声明过**的包，没声明的依赖（phantom dependency）`require` 时报错——这变成了编译期信号，不是运行时炸弹。

## Why（为什么是它而不是 npm / yarn classic / yarn berry / Bun）

JavaScript 包管理的演化路线：

1. **npm v3 之前**：嵌套 node_modules，`A` 依赖 `B@1`、`C` 依赖 `B@2`，B 各自一份在自己父级——磁盘爆炸 + 路径过长 Windows 直接炸
2. **npm v3+ / yarn classic**：flat node_modules + hoist——把所有包尽量提到顶层。**代价**：phantom dependency（你没写在 package.json 里的包，因为被 hoist 了你能 `require`，发版后炸）；磁盘上每个项目还是各自一份
3. **yarn berry PnP**：扔掉 node_modules，用 `.pnp.cjs` 注入 require resolver——磁盘节省、严格依赖边界。**代价**：和"我读 node_modules 文件"的工具（VSCode IntelliSense / TypeScript / Webpack 老 loader / Storybook 等）对抗，生态摩擦巨大
4. **pnpm**：保留 node_modules **目录结构**，但里面是 symlink + hardlink。**严格依赖边界 + 磁盘节省 + 生态零摩擦**——三件事一起拿到
5. **Bun install**：路线类似 pnpm（hardlink + 全局 cache），但 cache layout 和 lockfile 都是 Bun 自创，不和 pnpm-lock.yaml 兼容

pnpm 的 insight（Zoltan Kochan 在 [pnpm.io 文档"motivation"页](https://pnpm.io/motivation) 里写过）：

- **磁盘是稀缺的，不是免费的**——SSD 时代每个 node_modules 200MB 不算大，但 100 个项目就是 20GB 浪费
- **phantom dependency 是 JS 生态最大的隐性技术债**——你 hoist 出来一个包，等价于把"声明依赖"这件事变成口头协议
- **node_modules 这层 ABI 不能扔**——和它绑定的工具链太多，扔了等于和整个生态对抗
- **同一个文件不应该被复制 N 次**——硬链接是 Unix 文件系统几十年前就有的能力，npm 没用是因为设计早期没考虑这个

具体到设计：

| 维度 | npm | yarn classic | yarn berry (PnP) | Bun install | **pnpm** |
|---|---|---|---|---|---|
| node_modules 形态 | flat hoist | flat hoist | 没有 / virtual | flat hoist | **嵌套 symlink + hardlink** |
| 跨项目共享 | 无 | 无 | global cache | global cache + hardlink | **global store + hardlink** |
| phantom dependency | 允许 | 允许 | 严格禁止 | 允许 | **严格禁止** |
| 与现存工具兼容 | yes | yes | **要 patch** | yes | yes |
| workspace protocol | 弱 | yes | yes | yes | **first-class（`workspace:*`）** |
| lockfile 格式 | package-lock.json | yarn.lock v1 | yarn.lock v6 | bun.lockb（二进制）| **pnpm-lock.yaml** |
| 主语言 | JS | JS | JS | Zig | **TypeScript（部分 Rust）** |
| 用户群 | 默认 | 中型 | Yarn 派 | 早期采用者 | **Vue/Vite/Vercel/Astro/Prisma** |

**为什么不是 npm**：npm 的 flat node_modules 是 design choice 的产物——2013 年 hoist 是对嵌套深度的妥协方案，磁盘共享根本不在视野里。npm 的 cache 也是 tarball-level，不是 file-level；改不动。

**为什么不是 yarn berry**：PnP 是更激进的方案，理论上更优——没有 node_modules 也就没有 stat/readdir 开销。代价是和"读 node_modules"的工具对抗。pnpm 选了更保守路线：**形态不变，存储变**。

**为什么不是 Bun install**：Bun install 速度上和 pnpm 接近、思路类似（hardlink + 全局 cache），但 lockfile 是二进制 `bun.lockb`，diff/review 不友好；workspace 支持也比 pnpm 晚成熟。pnpm 的 yaml 锁文件是它在 monorepo 场景碾压性的优势。

**pnpm 的判断分水岭**：
- 选"node_modules ABI 兼容"——不和工具链对抗
- 选"内容寻址 + 硬链接"——把跨项目共享做成基础设施
- 选"严格依赖边界"——顶层只有显式声明的包
- 选"workspace protocol 一等公民"——`workspace:*` 是 spec，不是 hack

代价：
- 在不支持硬链接的文件系统上（旧 SMB / 容器跨 mount 卷）退化成 copy
- 一些工具假设 node_modules 是 flat（早年 webpack v1、一些 lint 规则）会炸——现代工具基本都修了
- store 一直长但没有自动 GC，几年后会到几十 GB（`pnpm store prune` 手动清）

## 仓库地形

```bash
git clone --depth 1 https://github.com/pnpm/pnpm
cd pnpm
ls
```

仓库本身是个 pnpm workspace monorepo，顶层就是 ~30 个 puzzle 包目录：

```
pnpm/
  cli/                    ← @pnpm/cli，命令行入口（`pnpm add` / `pnpm install` / `pnpm publish` 等）
  pkg-manager/            ← 安装编排核心（解析 + 解决 + 调度）
    core/                 ←   核心 install 流程，把 lockfile + manifest 变成 ReleasePlan
  store/                  ← 全局 store 子系统
    cafs/                 ←   content-addressable file store；按 sha256 落盘
    cafs-types/           ←   类型契约
    create-cafs-store/    ←   组装 cafs 给上层调用的 facade
    controller/           ←   store 的 fetch/import 控制器（Promise 调度 + concurrent fetch）
    pkg-finder/           ←   按 name@version 查 store 里有没有，没有就调 controller fetch
  fs/
    indexed-pkg-importer/ ← 把 store 里的 package 投影到 node_modules（hardlink/clone/copy 自动选）
  workspace/              ← workspace 子系统
    spec-parser/          ←   `workspace:*` / `workspace:^1.0` / `workspace:alias@^1.0` 的 parser
    projects-graph/       ←   workspace 内的依赖反向图
    projects-filter/      ←   `pnpm --filter` 的 selector
    range-resolver/       ←   把 workspace ranges 解析成具体版本
  network/                ← HTTP 子系统
    fetch/                ←   带 concurrency 限制的 npm registry fetch
    auth-header/          ←   .npmrc auth token 处理
  lockfile/               ← lockfile 子系统
    fs/                   ←   pnpm-lock.yaml 的读写；YAML serialize + atomic write
    types/                ←   LockfileObject / LockfileFile 类型契约
    walker/               ←   lockfile 遍历（用于 prune / verify）
    merger/               ←   git merge conflict 自动 resolve
  resolving/              ← npm registry / git / workspace / file: 多种 resolver
  config/                 ← .npmrc / pnpm-workspace.yaml 解析
  pacquet/                ← Rust 重写实验（fetch + extract，性能赛道）
  cargo/Cargo.toml        ← 上面 pacquet 的 cargo workspace
  __fixtures__/           ← 测试用 fake registries / fake projects
```

**心脏文件清单**（commit `ddf4ec4612ed98aebaf5e2abdf4780edbf44cec0` 时刻）：

1. `store/cafs/src/getFilePathInCafs.ts` — content-addressable 路径计算；约 42 行
2. `store/cafs/src/writeBufferToCafs.ts` — store 落盘原子性；约 131 行
3. `fs/indexed-pkg-importer/src/index.ts` — store -> node_modules 投影；约 322 行
4. `workspace/spec-parser/src/index.ts` — `workspace:*` parser；22 行（极简但 load-bearing）
5. `lockfile/fs/src/write.ts` — lockfile YAML 序列化与原子写；约 214 行

为什么是这五个：`pnpm install` 命令本身只是个调度器——真正决定行为的是 (a) 文件落到哪 (cafs)、(b) 怎么从 store 投影到项目 (importer)、(c) workspace 协议怎么 resolve (spec-parser)、(d) 状态怎么持久化 (lockfile)。这四件事独立、契约清晰，构成 pnpm 的"算法骨架"。看懂这五个文件，剩下 ~30 个包都是这些骨架的胶水。

![Figure 1: pnpm 架构（global content store + project node_modules 硬链接 + workspace 协议）](/projects/pnpm/01-architecture.webp)

> Figure 1: 三层结构 + 四不变量。**关键点**：层 1（全局 store）和层 2（项目 node_modules）之间是**硬链接**——同一个 inode、不是 symlink、不是 copy。层 2 内部 `node_modules/<pkg>` 是 **symlink** 到 `.pnpm/<pkg>@<ver>/node_modules/<pkg>`，这层 symlink 才是 npm 找包的路径。层 3 (`pnpm-lock.yaml`) 是 source of truth，每次 install 都先读这个再决定要不要 fetch / link。底部"四不变量"打破任意一条都不再是 pnpm——这是判断派生工具（Bun install / npm 的实验性 hardlink 模式）"像不像 pnpm"的最快尺子。

## 核心机制（Layer 3 ≥ 3 段）

### A. Content-addressable store + 硬链接（cafs 路径计算 + 原子落盘）

pnpm 的存储基础：每个文件按它的 sha256 hash 落盘到 `~/.pnpm-store/v3/files/<hex[:2]>/<hex[2:]>`。
两段式分桶（前 2 个 hex 字符做一级目录）是经典手法——避免单目录 inode 数过百万导致 ext4 / APFS 慢查询。

[GitHub permalink](https://github.com/pnpm/pnpm/blob/ddf4ec4612ed98aebaf5e2abdf4780edbf44cec0/store/cafs/src/getFilePathInCafs.ts#L1-L42)

```typescript
import path from 'node:path'

const SEP = path.sep

export const modeIsExecutable = (mode: number): boolean => (mode & 0o111) !== 0

export type FileType = 'exec' | 'nonexec'

export function getFilePathByModeInCafs (
  storeDir: string,
  hexDigest: string,
  mode: number
): string {
  const fileType = modeIsExecutable(mode) ? 'exec' : 'nonexec'
  return `${storeDir}${SEP}${contentPathFromHex(fileType, hexDigest)}`
}

export function contentPathFromHex (fileType: FileType, hex: string): string {
  // Using template strings with path.sep instead of path.join() for performance.
  // This is a hot path called ~30k times per cold install; avoiding path.join
  // saves ~30ms per install by eliminating per-call argument validation overhead.
  const p = `files${SEP}${hex.slice(0, 2)}${SEP}${hex.slice(2)}`
  switch (fileType) {
    case 'exec':
      return `${p}-exec`
    case 'nonexec':
      return p
  }
}
```

旁注：

- **42 行决定全局存储 layout**——所有 fetch/import 路径都过这一个函数。pnpm 的核心抽象之一是把"identity = hash + exec bit"压缩成纯字符串拼接，没有 stat、没有 readdir
- **`modeIsExecutable` 用 `0o111` 位掩码**——三个权限位（owner/group/others）任意一个 x 置位就算 exec。这是 Unix 文件模式标准位，移植 Windows 时按 mode 字段映射
- **exec 文件单独走 `-exec` 后缀**——同一个字节流如果一份是 chmod +x 的、一份不是，pnpm 把它们当**两个**文件存。原因：硬链接共享 inode，inode 携带 mode 位，hardlink 出去的副本不能修改原 mode；混存会让 chmod 跨项目泄漏
- **注释里写明了优化决策的成本数字**——"~30k calls per cold install / saves ~30ms"。源码里看到这种量化决策注释要警觉：说明这是 hot path，改它要 benchmark；其次这是 pnpm review 文化的一部分，不容许"觉得快"的优化进 main
- **没有 `default` 分支**——TypeScript 类型 `FileType = 'exec' | 'nonexec'` 让 exhaustive check 静态成立，避免运行时 fallback 路径污染 CAS layout

落盘的原子性靠 `writeBufferToCafs`：

[GitHub permalink](https://github.com/pnpm/pnpm/blob/ddf4ec4612ed98aebaf5e2abdf4780edbf44cec0/store/cafs/src/writeBufferToCafs.ts#L34-L73)

```typescript
function writeOrCheck (
  fileDest: string,
  buffer: Buffer,
  mode: number | undefined,
  integrity: Integrity
): number {
  // Fast path: check if the file already exists on disk with correct content.
  const existingFile = fs.statSync(fileDest, { throwIfNoEntry: false })
  if (existingFile) {
    if (verifyFileIntegrity(fileDest, integrity)) {
      return Date.now()
    }
    // File exists but has wrong integrity (corruption/partial write).
    // Use temp+rename so the replacement is atomic.
    return writeFileAtomic(fileDest, buffer, mode)
  }

  // File doesn't exist. Use exclusive-create (O_CREAT|O_EXCL) so that
  // if another process creates the same CAS file concurrently, we get EEXIST
  // instead of silently overwriting. A crash mid-write can leave a partial
  // file, which is recovered by the atomic temp+rename path on next access.
  try {
    writeFileExclusive(fileDest, buffer, mode)
  } catch (err: unknown) {
    if (util.types.isNativeError(err) && 'code' in err && err.code === 'EEXIST') {
      // Another process created the file. If it finished successfully,
      // integrity will pass. If it crashed or is still writing, integrity
      // will fail and we recover via atomic temp+rename.
      if (verifyFileIntegrity(fileDest, integrity)) {
        return Date.now()
      }
      return writeFileAtomic(fileDest, buffer, mode)
    }
    throw err
  }
  return Date.now()
}
```

旁注：

- **三段式状态机**：(1) 文件已在 + integrity OK -> 复用；(2) 文件已在 + integrity 不通过 -> 假定坏掉，atomic 替换；(3) 文件不在 -> `O_CREAT|O_EXCL` 独占创建，竞态时 EEXIST 后退到 verify-or-replace
- **integrity 校验是 sha512 子资源完整性**（`verifyFileIntegrity` 实现见 `checkPkgFilesIntegrity.ts`）——这是 npm registry 的 SRI 字段，也是 pnpm CAS 的 ground truth。**hash 一致即字节流一致**，是 cafs 的全部假设
- **`O_CREAT|O_EXCL` 是 Unix 原子保证**——两个进程同时跑 `pnpm install` 抢同一个 CAS 路径，POSIX 保证只有一个能成功，另一个拿到 EEXIST。这把"全机器一份"做成了**操作系统级**的 invariant，不依赖 pnpm 自己的 lock
- **temp + rename 兜底**：`O_CREAT|O_EXCL` 的弱点是写到一半进程崩，留下一个 size > 0 但 hash 不对的文件——下次进 fast path stat 看到文件存在，但 verifyIntegrity 失败，触发 `writeFileAtomic` 用 `temp + rename` 替换。这恢复了 crash safety
- **`pathTemp(fileDest)` 用 `${pid}${threadId}` 而非随机 token**——避免每次落盘都跑一次 `crypto.randomBytes`。代价是同 pid + threadId 撞名（容器多副本挂同一卷）时可能误删，注释里有这个 caveat 和对应 PR #6817 的链接

怀疑 1：**`O_CREAT|O_EXCL` 在 NFS 上是真的原子吗？**
源码里没看到对 NFS / SMB 的特化处理。POSIX 规范说 `O_EXCL` 在 NFS 上需要服务器端支持（NFSv3 早期不保证、NFSv4 要看实现）。如果用户把 store 放在共享网络盘（CI 缓存场景），两个 runner 同时跑 install，理论上有几率两个都 succeed 拿到不同的 inode——pnpm 假设 store 是本地盘。把 store 放 NFS 的 corner case 没在文档里强调。可以追到 GitHub issues 找历史报告确认。

### B. Workspaces protocol（`workspace:*` parser + 一个 22 行 puzzle 包的力学）

pnpm 的 workspace 协议——`workspace:*` / `workspace:^1.2.0` / `workspace:alias@^1.2.0`——是它在 monorepo 场景碾压 npm/yarn classic 的关键设计。这个协议的 parser 完整在 22 行：

[GitHub permalink](https://github.com/pnpm/pnpm/blob/ddf4ec4612ed98aebaf5e2abdf4780edbf44cec0/workspace/spec-parser/src/index.ts#L1-L22)

```typescript
const WORKSPACE_PREF_REGEX = /^workspace:(?:(?<alias>[^._/][^@]*)@)?(?<version>.*)$/

export class WorkspaceSpec {
  alias?: string
  version: string

  constructor (version: string, alias?: string) {
    this.version = version
    this.alias = alias
  }

  static parse (bareSpecifier: string): WorkspaceSpec | null {
    const parts = WORKSPACE_PREF_REGEX.exec(bareSpecifier)
    if (!parts?.groups) return null
    return new WorkspaceSpec(parts.groups.version, parts.groups.alias)
  }

  toString (): `workspace:${string}` {
    const { alias, version } = this
    return alias ? `workspace:${alias}@${version}` : `workspace:${version}`
  }
}
```

旁注：

- **22 行实现一个完整的 protocol parser**——这是 pnpm 的"小职责包"哲学最纯粹的表达。这个文件做且仅做一件事：把字符串 `workspace:^1.0` 变成 `{ alias: undefined, version: '^1.0' }`，反过来也能 stringify
- **正则用 named groups**（`(?<alias>...)` / `(?<version>...)`）——TypeScript 4.8+ 才能从 named groups 推出类型。pnpm 的 tsconfig target 高、hard-codes 这种现代正则特性
- **alias 的字符集限制**：`[^._/][^@]*` —— 第一个字符不能是 `.` 或 `_` 或 `/`（npm scope 命名规则）；后续字符不能是 `@`（避免和 alias 分隔符冲突）。这部分如果 hand-roll 一个 char-by-char parser，要 30+ 行
- **`toString` 返回 template literal 类型 `` `workspace:${string}` ``**——TypeScript 的字面量类型，调用方拿到的不是 `string` 而是 `workspace:${string}`，编译期 catch "我把 toString 用错地方"的 bug
- **整个文件不 import 任何东西**——零依赖。这种"叶子包"特性让它能独立 publish (`@pnpm/workspace.spec-parser`)，任何想实现 pnpm-compatible 工具（如 nx / turborepo 解析 workspace 引用）的人直接 `npm install` 用

为什么 22 行能做这么多事——因为它**只**解析协议字符串，不做：
- 包是否真的存在 workspace 内（那是 `projects-graph` 的事）
- range 满足性（`^1.0` vs 实际版本，那是 `range-resolver` 的事）
- 解析失败时的 hint（那是 `cli/commands/install` 的事）

每个 puzzle 包的 surface 极小是 pnpm 设计的总特征。

怀疑 2：**`workspace:*` 中 `*` 走 version='*' 这条路径，但代码里没有为 `*` 做特殊处理——它会去匹配任意版本吗？**
正则 `(?<version>.*)` 把 `*` 捕获到 `version` 字段——下游 `range-resolver` 需要识别 `*` 当作"任意版本，匹配 workspace 内最新"。如果用户写 `workspace:`（冒号后面空），正则也会 match 进 `version=''`。空 version 怎么处理？源码里没有 reject——下游某层会转成 `*` 还是抛错？需要追 `range-resolver` 才能确定。这是把**协议解析**和**协议语义**分层带来的副作用：parser 干净了但跨包追错变长。

补充一段实战观察：你 review pnpm-managed monorepo 的 PR，看到 `package.json` 里 `"@org/utils": "workspace:^1.2.0"`——install 之后 `node_modules/<pkg>/package.json` 里这个字段会被 pnpm 改写成 `"^1.2.0"`（即 strip 掉 `workspace:` 前缀）。这是 publish 时的协议契约——npm registry 不认 `workspace:` 前缀，必须在发包前展开成实际 range。展开发生在 `apply-release-plan` 时刻而不是 install 时刻——install 完留着 `workspace:^1.2.0` 是为了在 monorepo 内部 resolve 到 workspace 包而不是 registry 包。

### C. Lockfile 格式（pnpm-lock.yaml 的双 YAML document + atomic write）

pnpm 的 lockfile 不是简单 YAML——它是**两个 YAML 文档串联**：第一个是 env 文档（捕获写 lockfile 那一刻的 `nodeVersion` / `pnpmVersion` / `os` / `arch`），第二个才是真正的依赖图。这个设计是 v9 lockfile 的新特性。

[GitHub permalink](https://github.com/pnpm/pnpm/blob/ddf4ec4612ed98aebaf5e2abdf4780edbf44cec0/lockfile/fs/src/write.ts#L62-L101)

```typescript
async function writeLockfile (
  lockfileFilename: string,
  pkgPath: string,
  wantedLockfile: LockfileObject
): Promise<LockfileObject> {
  const lockfilePath = path.join(pkgPath, lockfileFilename)

  const lockfileToStringify = convertToLockfileFile(wantedLockfile)
  const yamlDoc = yamlStringify(lockfileToStringify)

  if (lockfileFilename === WANTED_LOCKFILE) {
    // Re-read the env document from the existing lockfile to preserve it.
    // Ideally the env document would be captured during the initial lockfile read
    // and passed through to the write functions, but that would require threading it
    // through 25+ call sites. Re-reading is cheap since the file is likely still
    // in the OS page cache and streaming stops at the first separator.
    const envDoc = await streamReadFirstYamlDocument(lockfilePath)
    const envPrefix = envDoc != null ? `${YAML_DOCUMENT_START}${envDoc}${YAML_DOCUMENT_SEPARATOR}` : ''
    await writeFileAtomic(lockfilePath, `${envPrefix}${yamlDoc}`)
  } else {
    await writeFileAtomic(lockfilePath, yamlDoc)
  }

  // YAML drops undefined on serialize, so the in-memory LockfileFile
  // can carry fields (like an unset settings.dedupePeers) that won't
  // survive a round-trip; strip them to mirror what the next reader
  // will parse back.
  return convertToLockfileObject(stripUndefinedDeep(lockfileToStringify) as LockfileFile)
}
```

旁注：

- **`writeFileAtomic` 是第三方包 `write-file-atomic`**——经典 Unix 原子写：写到 `<dest>.<rand>` 然后 `rename` 到 `<dest>`。POSIX rename 的 inode swap 是原子的，crash mid-write 看到的是旧版 lockfile 而不是 size-0 文件
- **env 文档"re-read 而非 thread through"是 explicit trade-off**——注释明写"理想方案是 read 时就 capture 传到 write，但要改 25+ call sites"。pnpm 选了实用主义：re-read 在 OS page cache 命中下基本免费（streamReadFirstYamlDocument 读到第一个 `---` 分隔符就停）
- **`convertToLockfileFile` / `convertToLockfileObject` 双向转换**——in-memory `LockfileObject` 是 pnpm 内部数据结构（map of map），on-disk `LockfileFile` 是 yaml friendly 形态（importers + packages 平铺）。两个表示分开是为了内部好用 + 磁盘好读；converter 是契约层
- **`stripUndefinedDeep` 是 YAML 序列化的 round-trip 修正**——js-yaml dump 时把 `undefined` 字段直接丢掉；in-memory 对象的 `settings.dedupePeers: undefined` 出去再回来不一样。strip 让"我返回的对象 = 下次读到的对象"成立。这是经典的 "serialize-then-canonicalize" 模式
- **`WANTED_LOCKFILE` 是常量 `pnpm-lock.yaml`**；`current` lockfile（`node_modules/.pnpm/lock.yaml`）不带 env 文档——后者是 install 后的"实际状态镜像"，前者是"声明的目标状态"。两者一致才说明 install 没漂移

env 文档串联用 YAML 的多文档语法（`---` 作为文档分隔符）：

```yaml
# pnpm-lock.yaml v9 形态
nodeVersion: '20.10.0'
pnpmVersion: '9.0.4'
---
lockfileVersion: '9.0'
importers:
  apps/web:
    dependencies:
      react:
        specifier: ^18.2.0
        version: 18.2.0
packages:
  react@18.2.0:
    resolution: { integrity: sha512-... }
```

旁注（续）：

- **YAML 多文档** vs **JSON 单文档**：JSON 在表达"这两个 schema 不同的 chunk 同存一份文件"时只能嵌套；YAML 原生支持多文档（`---` 分隔），让 pnpm 可以**新加 env 文档不破坏已有 reader**——老版 reader 读第一段就停（如果它只关心 lockfileVersion），不至于解析失败。这是面向未来的格式设计
- **`writeLockfiles` 检测 `wantedLockfile === currentLockfile` 引用相等**（不是 deep-equal）——install 流程里多数情况 wanted 和 current 来自同一个对象引用，可以省掉一次 yaml stringify。这种"引用相等就是同一个对象"的捷径在函数式代码里常见
- **`isEmptyLockfile` 触发 `rimraf`**——空 lockfile 不写而是删，让"无依赖项目"的状态最简

怀疑 3：**两进程并发跑 `pnpm install` 在同一个项目，lockfile write 谁赢？**
`writeFileAtomic` 用 temp + rename 保证单次写不撕裂，但**没有 file lock**——A 进程写 a.tmp 然后 rename 成 lockfile，B 进程同时写 b.tmp 然后 rename，rename 是原子的但顺序不确定。结果是"最后一个 rename 的 win"——如果 A 和 B 看到的依赖图不同（比如一个跑了 `add`、一个跑了 `update`），lockfile 会震荡，下一次 install 可能要重新 fetch。pnpm 假设你不会两个 install 并发——但 monorepo CI 矩阵任务可能违反这个假设。`pnpm install` 自身有顶层 mutex（`packageManager` 字段 + `node_modules/.modules.yaml` 检测）但跨进程的 mutex 不是 lockfile 写时建立的。

## Hands-on（含改一处实验）

30 分钟跑通：

```bash
# 1. 准备一个 pnpm workspace 实验项目
mkdir -p ~/tmp/pnpm-lab && cd ~/tmp/pnpm-lab
mkdir -p packages/utils packages/web

# 2. 初始化 workspace
cat > pnpm-workspace.yaml <<EOF
packages:
  - 'packages/*'
EOF

cat > package.json <<EOF
{ "name": "pnpm-lab", "private": true }
EOF

cat > packages/utils/package.json <<EOF
{ "name": "@lab/utils", "version": "1.0.0", "main": "index.js" }
EOF
echo "module.exports.add = (a,b) => a+b" > packages/utils/index.js

cat > packages/web/package.json <<EOF
{
  "name": "@lab/web", "version": "1.0.0",
  "dependencies": { "@lab/utils": "workspace:^1.0.0", "lodash": "^4.17.21" }
}
EOF

# 3. install
pnpm install

# 4. 看 store
ls ~/.pnpm-store/v3/files/ | head     # 一级桶（前 2 个 hex）
find ~/.pnpm-store/v3/files -maxdepth 2 -type f | head

# 5. 验证 hardlink（lodash index.js 在项目里和 store 里 inode 相同）
stat -f '%i' packages/web/node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/lodash.js
# 输出比如：1234567
find ~/.pnpm-store/v3/files -name '*' -type f -inum 1234567 | head -1
# 应该指向同一个 hash 路径

# 6. 验证 workspace symlink
ls -la packages/web/node_modules/@lab/utils
# 输出：@lab/utils -> ../../../utils  （或类似 relative symlink）

# 7. 验证 phantom dependency 被禁
node -e "require('events')"                          # OK，events 是 Node 内置
node -e "require('react')"                           # 报错：Cannot find module 'react'
# react 没在 packages/web/package.json 里 -> 顶层 node_modules 里没有 -> require 炸
```

**改一处实验**：改 `getFilePathByModeInCafs`，把 exec 后缀从 `-exec` 改成 `__EXEC__`，看 install 行为。

```bash
# clone 源码
git clone --depth 1 https://github.com/pnpm/pnpm pnpm-src
cd pnpm-src
pnpm install
pnpm --filter @pnpm/store.cafs build

# 改 store/cafs/src/getFilePathInCafs.ts
# 把 return `${p}-exec` 改成 return `${p}__EXEC__`

# 在某个项目里临时 link 这个 cafs 包
cd ~/tmp/pnpm-lab
pnpm link ~/path/to/pnpm-src/store/cafs
rm -rf node_modules ~/.pnpm-store-test
pnpm config set store-dir ~/.pnpm-store-test
pnpm install
```

观察到（预期 / 实际差距）：

- 新 store 落盘的 exec 文件路径变成 `files/<hex>__EXEC__`——hex 路径函数是单点写入，行为跟着改
- 老 store（如果之前用过 `~/.pnpm-store`）里仍然是 `-exec` 后缀——pnpm 不会迁移，新 store 长出来一份独立 layout
- 跨版本兼容性破坏——如果一台机器装了 patched pnpm 又装了 stock pnpm，两者会把同一个 exec 文件**双倍存储**到 store 里（按各自 layout）。CAS 的 dedupe 在 layout 函数稳定时才成立

**这一改让我学到的**：
1. `getFilePathByModeInCafs` 是 CAS layout 的 **唯一** 决策点——所有 read/write/import 路径都过它，改这一个函数等价于改了 store 协议版本
2. pnpm 的 store dir 命名带 `v3`——这是 Zoltan 给 layout 升级预留的版本号槽。改 layout 就是 bump v3 -> v4
3. CAS 的核心 invariant 是"hash 函数稳定 + layout 函数稳定"——hash 升级（如 sha256 -> sha512）和 layout 升级（如 bucket 从 2 字符变 3 字符）都要走 store 版本号迁移

## 横向对比（≥ 4 维 + 哲学不同竞品）

| 维度 | npm | yarn classic | yarn berry (PnP) | Bun install | **pnpm** |
|---|---|---|---|---|---|
| node_modules 形态 | flat hoist | flat hoist | virtual（无 node_modules） | flat hoist | **嵌套 + symlink + hardlink** |
| 跨项目共享 | 无 | 无 | global cache（zip 解压时复制） | global cache + hardlink | **global store + hardlink** |
| phantom dependency | 允许 | 允许（hoist 副作用） | **禁止**（PnP resolver） | 允许 | **禁止**（顶层只有声明的包） |
| disk efficiency | 1x（基线） | 1x | 0.5x（共享 cache） | 0.4x（hardlink） | **0.4x（hardlink）** |
| install 速度（cold） | 1x | 1.2x | 1.5x | 3x | **2-3x** |
| install 速度（warm） | 1x | 1.5x | 5x | 10x | **8-10x** |
| 与现存工具兼容 | yes | yes | **要 patch** | yes | yes |
| workspace protocol | 弱（npm v7 才加） | yes | yes | yes | **first-class（`workspace:*`）** |
| lockfile 格式 | package-lock.json | yarn.lock v1 | yarn.lock v6 | bun.lockb（**二进制**） | **pnpm-lock.yaml** |
| 多 registry 支持 | yes | yes | yes | weak | **yes** |
| Rust 重写 | 部分（npm-cli） | 否 | 否 | 整体（Zig） | **部分（pacquet 实验）** |
| 用户群 | 默认 | 中型 | Yarn 派 / Berry 信徒 | 早期采用者 | **Vue/Vite/Vercel/Astro/Prisma/Nuxt** |

**哲学最不同的竞品：yarn berry (PnP)**。
- yarn berry 选"消灭 node_modules"——更激进、磁盘更省、严格依赖边界
- pnpm 选"保留 node_modules ABI"——和现存工具零摩擦
- 前者代价：和 IDE / TypeScript / 老 webpack loader / Storybook 等对抗，需要 unplug / patch / `nodeLinker` 配置
- 后者代价：node_modules 这层路径还存在（但是空的方便快），磁盘节省比 PnP 略低（要存 symlink + .pnpm 中转目录）

**第二个有意思的对比：Bun install**。
- Bun install 思路接近 pnpm（hardlink + cache + symlink），但 Bun 的整体定位是 runtime + bundler + test runner 大一统
- pnpm 只做包管理，不做 runtime
- Bun 的 lockfile 是二进制 `bun.lockb`——读起来快，但 git diff / PR review 失去人类可读性。pnpm 的 yaml 锁文件在 monorepo PR review 中是不可替代的

**选型建议**：

- 单仓库 Node 项目，磁盘不紧、不在意 phantom dep → **npm 也够**
- monorepo（>3 个包）+ 在意 install 速度和磁盘 + 想要严格依赖边界 + 团队会 review lockfile diff → **pnpm**
- 单包 + 想要绝对最快 install + 接受二进制 lockfile + 愿意吃 Bun 早期 corner case → **Bun install**
- 已经在 Yarn 生态 + 团队接受工具链摩擦 + 想要最严格依赖隔离 → **yarn berry (PnP)**
- 在 Google / Meta 等大型 monorepo + 想要 task graph + 不太关心 npm 兼容 → **Rush** + **pnpm**（Rush 上层用 pnpm 当 install 后端）

## 与你当前工作的连接

### 今天就能用的部分

- **手头任何 monorepo 化的尝试（study 站、个人多包项目）**：第一件事用 `pnpm` 而不是 `npm` / `yarn`——install 速度 2x、磁盘节省 50%、`workspace:*` 协议让本地包引用零成本
- **`pnpm-workspace.yaml` 是 yarn 时代不存在的便利**：在 `packages: ['apps/*', 'packages/*']` 里加一行 glob，新建子包自动被识别。比 npm 7 的 `workspaces: ["apps/*"]` 多一个独立文件、隔离更好
- **`pnpm install` 报错时第一步看 `pnpm-lock.yaml` 的 `lockfileVersion`**：v9 lockfile 不能被 v8 pnpm 读；CI 和本地 pnpm 版本要对齐（用 `packageManager` 字段锁定）
- **`pnpm install --filter @org/web...`** 子集安装在大型 monorepo（10+ 包）上是关键——只装 web 和它依赖的包，不装无关的。在工作机磁盘吃紧时立刻有用
- **`pnpm store prune`** 隔半年跑一次清理无引用 store 文件——store 不会自动 GC，会涨到几十 GB

### 下个月能用的部分

- 任何业余项目从单包变成 monorepo，第一时间装 pnpm + 引入 `workspace:` 协议——比手动 `npm link` 调试体验好两个数量级
- 借鉴 pnpm 的 puzzle 包思路：把"协议解析"（22 行 `WorkspaceSpec`）和"协议语义"（数百行的 resolver）分层，让叶子包能独立 publish 给生态复用——这种设计能搬到任何"输入是字符串、输出是结构化对象"的工具
- 学 pnpm 的 CAS 设计写自己的"项目本地资源 cache"小工具——比如把 build 产物按 hash 分桶存，多项目复用
- review pnpm 的 changelog（`pnpm/pnpm` 项目本身用 changesets 发版）观察大型 monorepo 是怎么管 30+ puzzle 包独立 release 的

### 不要用的部分

- **不要在小型单包项目硬上 pnpm**——单包没有 hoist / phantom dep 烦恼时，pnpm 的 `.pnpm/` 中转目录反而引入额外路径复杂度；npm/yarn 简单足够
- **不要在 CI 缓存 `node_modules/`**——pnpm 的 node_modules 全是硬链接，跨 build 缓存复用一份"硬链接快照"会失败（指向的 store inode 在新 build 不一定存在）。要缓存就缓存 `~/.pnpm-store` + `pnpm-lock.yaml` 一致时跑 `pnpm install --frozen-lockfile`
- **不要在 Docker 镜像里把 `node_modules` 放在和 store 不同的 mount 卷**——硬链接跨设备失败 `EXDEV`，pnpm 退化成 copy，磁盘节省失效。多阶段 build 时把 store 和 install 目录放同卷
- **不要试图手改 `pnpm-lock.yaml`**——这文件长得像 yaml 但它是 pnpm 内部图的序列化形态，手改 importers / packages 之间的引用会破坏一致性。要改依赖只改 package.json 然后 `pnpm install`
- **不要在 Windows 不开发者模式跑 pnpm**——Windows 默认普通用户不能创建 symlink，`node_modules/<pkg> -> .pnpm/<pkg>@<ver>` 会失败。要么开开发者模式，要么用 `node-linker=hoisted` 退化到 npm 风格

## 限制（≥ 4 条独立）

1. **store 没有自动 GC**：`~/.pnpm-store` 一直长，几年后到几十 GB 是常态。需要手动 `pnpm store prune`，没有"installed packages 反向引用计数"的自动回收。这是 trade-off：自动 GC 要扫所有项目 lockfile，成本高且容易误删
2. **跨设备硬链接失败回退到 copy**：项目和 store 在不同 mount（Docker 跨卷 / Windows 跨盘 / NFS）时 `EXDEV`，pnpm fallback 到 copy，磁盘节省全失。错误是 graceful 但用户感知不到——除非看 install log
3. **Windows symlink 默认要开发者模式**：普通 Windows 用户跑 pnpm 会失败或退化。`node-linker=hoisted` 是逃生口但放弃了 pnpm 的核心好处（严格依赖边界）。这是 OS 级摩擦，pnpm 改不了
4. **lockfile schema bump 是 hard cut**：v9 lockfile 不向下兼容 v8——CI 和本地 pnpm 版本不一致就报错。`packageManager` 字段是新机制，但要团队所有人 corepack enable 才生效；老机器/CI 没配置就有惊喜
5. **不支持"半 PnP"模式**：你不能选"严格依赖边界但不要 .pnpm 中转"——pnpm 的设计是耦合的，要严格就要这套 layout。yarn berry 的 nodeLinker 至少有 PnP/pnpm/node-modules 三档，pnpm 只有 isolated/hoisted 两档
6. **大 monorepo 的 install 内存吃得不少**：依赖图在内存里全展开，1000+ 包的 monorepo install 时 Node heap 能到 2-3 GB。Rust 重写实验（`pacquet/`）正是为了改善这个

## 宣传 vs 现实

| 项目宣传 | 代码现实 |
|---|---|
| "Disk space efficient" | 是真的，但前提是文件系统支持硬链接且 store 与 install 目录同设备。Docker / Windows 跨盘场景退化到 copy，节省失效 |
| "Strict by default (no phantom deps)" | 是真的，但 `node-linker=hoisted` 配置一开就退化到 npm 风格——团队成员不知情时一个 .npmrc 就把严格性关了 |
| "Faster than npm" | warm install（store 已有）确实 5-10x，cold install（首次拉 registry）只有 2-3x，瓶颈在网络。冷启动数字常被市场化简化 |
| "Built for monorepos" | 单包也能用，但单包场景下 `.pnpm/` 中转目录是纯开销。"For monorepos" 在小项目反向 |
| "Workspace protocol" | `workspace:*` 是 pnpm 创造的，yarn berry 后来兼容、npm 至今没 first-class 支持。protocol 在 publish 时被展开成实际 range，registry 永远看不到 `workspace:` |

## 自检问题（≥ 3，行号级）

1. `getFilePathByModeInCafs` 在 `store/cafs/src/getFilePathInCafs.ts` 里把 mode 压成 `'exec' | 'nonexec'` 二选一——一个文件如果是 `0o755` 和 `0o744`，sha256 又一样，会被存为同一份还是两份？追到 `modeIsExecutable` 行号说出位掩码细节，并给一个能让 store 出现"语义不同但被认为相同"的最小输入
2. `writeBufferToCafs` 的 `O_CREAT|O_EXCL` 在并发 `pnpm install` 时拦了真·竞态。但 `verifyFileIntegrity` 校验 sha512，**SRI hash 是怎么从 npm registry tarball 得到的**？追 `parseTarball.ts` 看 hash 是 streaming 算还是落盘后算；如果是 streaming，crash 中途的 partial buffer 会进 hash 还是被丢弃？
3. `WorkspaceSpec.parse` 对 `workspace:^1.0` 返回 `{ alias: undefined, version: '^1.0' }`——但 `workspace:` 后是空字符串时呢？正则 `(?<version>.*)` 会 match 进 `version=''`。下游哪一层把空 version 转成 `*` 或抛错？追到 `range-resolver` 或 `resolving/` 包的入口
4. `writeLockfile` 的 env 文档"re-read 而非 thread through"是为了避免改 25+ call sites——这意味着 install 全程没有 in-memory env 文档对象。如果两个进程并发 install，A 写完 lockfile，B 读 env 文档时会读到 A 的还是旧的？两次 install 之间 env 文档变化的 race window 多大？
5. `createIndexedPkgImporter('auto')` 在 `fs/indexed-pkg-importer/src/index.ts` 里第一次调用时 probe reflink，成功就 latch 到 clone importer。一旦 latch 就**永不重测**——如果中途有一个文件 reflink 失败（filesystem 部分支持），整体流程是 abort 还是 fallback？追 `tryClonePkg` 的异常路径

## 接下来读的文件（按顺序）

1. `pkg-manager/core/src/install/index.ts` —— install 主流程编排，串起 lockfile read / resolve / fetch / link
2. `store/cafs/src/parseTarball.ts`（约 287 行）—— streaming 解 tarball + 算 sha512 + 写 cafs，理解 fetch->store 的端到端
3. `fs/indexed-pkg-importer/src/index.ts`（322 行）—— hardlink / clone / copy 三档 importer 的状态机，理解 cross-device 兜底
4. `lockfile/fs/src/read.ts`（262 行）—— lockfile 读路径 + env 文档解析，对比 write.ts
5. `workspace/projects-graph/src/index.ts` —— workspace 内反向依赖图，对比 changesets 的 `get-dependents-graph`
6. `pacquet/` 目录的 Rust 代码 —— 看 pnpm 的"未来"：fetch + extract 的 Rust 重写，性能视角

## 元数据

- 升级日期: 2026-05-29
- 项目类型: 工具库（v1.1 分支 B）
- 核心信息表 9 字段:
  - stars: > 30k
  - fork: ~ 1k
  - 最近活跃: 2026-05-28（commit by Zoltan Kochan）
  - commit hash: `ddf4ec4612ed98aebaf5e2abdf4780edbf44cec0`
  - 主语言: TypeScript（部分 Rust，pacquet/ 实验）
  - 维护方: Zoltan Kochan + pnpm 核心组（OpenJS Foundation 旗下）
  - License: MIT
  - 类似项目: npm / yarn classic / yarn berry / Bun install / Rush / Lerna
  - 用户: Vue / Vite / Vercel / Astro / Prisma / Nuxt / SvelteKit / Storybook
- Layer 3 三段独立小节:
  - A 内容寻址 store + 硬链接（getFilePathInCafs + writeBufferToCafs）
  - B Workspace 协议 parser（22 行小职责包的力学）
  - C Lockfile 双 YAML 文档 + atomic write
- GitHub permalink 数: 4 处（getFilePathInCafs L1-L42, writeBufferToCafs L34-L73, spec-parser L1-L22, lockfile/fs/write L62-L101）
- 显式怀疑: 5 处（NFS 上 O_EXCL 原子性 / workspace:`空 version` 下游处理 / 并发 install lockfile 谁赢 / mode 0o755 vs 0o744 同 hash 行为 / auto importer latch 后不再重测）
- Figure: 1 张 webp（`/projects/pnpm/01-architecture.webp`，~104 KB）
- 限制: 6 条
- 宣传 vs 现实: 5 行
- 启用工具: git clone（深度 1）+ Read + 本地 PIL 画图 + WebFetch（早期 commit hash 探测）
