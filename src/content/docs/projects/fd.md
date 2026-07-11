---
title: fd — Rust 写的现代 find
来源: https://github.com/sharkdp/fd
日期: 2026-05-29
分类: CLI
难度: 中级
---

## 是什么

`fd` 是 David Peter（GitHub 用户名 sharkdp）在 2017 年用 Rust 写的"友好版 find"。命令短、速度快、默认行为符合人类直觉。

日常类比：

> `find` 是 80 岁老爷爷——语法古老（1970 年代设计）、慢、参数容易记错。
> `fd` 是同样能力的年轻人——命令短、速度快、颜色友好。

最直观的对比：

```bash
# find：找文件名含 readme 的，要拼一长串
find . -iname '*readme*'

# fd：直接写关键词
fd readme
```

两条命令做同一件事，`fd` 这条短了一半，还自带颜色高亮。

## 为什么重要

不熟悉 `fd`，下面这些痛点你每天都在踩：

- **`find` 的语法地狱**：要记 `-name` `-iname` `-print0` `-exec` `\;` `+` `-prune` 一堆古怪参数；少一个反斜杠就报错
- **慢**：`find` 单线程逐个目录走；大仓库（node_modules / target）能等半分钟
- **噪音**：默认会把 `.git` `node_modules` 全列出来；想过滤只能手写一长串 `-not -path`
- **不可读**：参数顺序敏感，`find -name foo .` 和 `find . -name foo` 行为不同，新手容易翻车

`fd` 把这些问题反过来设计：

- 默认并行（用 rayon 多线程）
- 默认读 `.gitignore` 自动跳过仓库忽略目录（和 [[ripgrep]] 一脉相承）
- 默认隐藏 `.git` 和点开头文件
- 默认彩色输出，按文件类型上色

它和 [[ripgrep]] 是 Rust CLI 的"双标杆"——`fd` 找文件名、`rg` 找文件内容，组合起来覆盖 90% 命令行搜索场景。

## 核心要点

`fd` 的设计可以拆成 **三个默认**：

1. **Pattern 默认 substring**：写 `fd readme`，等价于 `find . -iname '*readme*'`。不用通配符，不用引号，关键词直接糊脸。

2. **默认排除噪音**：`.gitignore` / `.ignore` / `.fdignore` 列出的、以及点开头的隐藏项——一律不显示（**不会**按「二进制扩展名」过滤）。要看隐藏文件加 `-H`，要看 ignore 规则里的加 `-I`。

3. **默认并行 + 着色**：内部用 rayon 多线程遍历目录，扫整个 home 目录通常 < 1 秒；输出按文件类型自动上色（目录蓝、可执行绿、压缩包红）。

进阶常用 flag：

- `-e EXT`：按扩展名过滤，如 `fd -e py` 只找 .py 文件
- `-t TYPE`：按类型过滤，`-t f` 文件 / `-t d` 目录 / `-t l` 符号链接
- `-x CMD`：对每个匹配执行命令（自动并行），等价 `find -exec` 但更快
- `-X CMD`：所有匹配一次性传给命令（等价 `xargs`）
- `--exclude PATTERN`：排除某些路径（取代 `find -prune`）

## 实践案例

### 案例 1：找文件名

```bash
fd readme
```

从当前目录递归找，文件名含 `readme`（默认大小写不敏感）。会自动跳过 `.git` 和 `node_modules`。

### 案例 2：限定扩展名 + 限定目录

```bash
# 扩展名 .md，且文件名匹配 docs（docs 是 pattern，不是路径）
fd -e md docs

# 在 docs/ 目录下找所有 .md（第二个位置才是搜索根；`.` 表示匹配任意名）
fd -e md . docs
```

读作：`fd [OPTIONS] [pattern] [path...]`。只写 `fd -e md docs` 时，`docs` 是**文件名模式**；要限定目录，把 pattern 写成 `.`（或 `''`），再跟路径。

### 案例 3：批量删除 node_modules

```bash
fd -t d node_modules -x rm -rf
```

`-t d` 只看目录、`-x` 对每个匹配跑 `rm -rf`、自动并行。一行清掉整个 monorepo 的 node_modules，比 `find . -name node_modules -type d -exec rm -rf {} +` 短一半还更快。

### 案例 4：和 [[ripgrep]] 串联

```bash
fd -e py | xargs rg "TODO"
```

读作"找所有 .py 文件 → 在它们里 grep TODO"。`fd` 负责文件名层、`rg` 负责内容层，两件事各做一件，组合起来比 `grep -r` 快得多。

## 踩过的坑

1. **默认大小写不敏感，但 pattern 含大写就切换**：`fd readme` 会匹配 README.md，但 `fd README` 只匹配大写。这叫 "smart case"，和 [[ripgrep]] 一致。要强制大小写敏感用 `-s`，强制不敏感用 `-i`。

2. **默认隐藏 dotfile / .gitignore 内容**：在新仓库刚 clone 完想找 `.env.example`，`fd env` 找不到——因为 .env.example 被 .gitignore 排除了。加 `-H` 看隐藏、加 `-I` 看 .gitignore 内的、`-HI` 全开。

3. **`--exclude` 不是 `-prune`**：`find` 用 `-prune` 配合 `-name` 排除，逻辑反人类。`fd --exclude '*.log'` 直接写就行，但注意 `--exclude` 不会排除已经命中的目录的子内容（要用 `--exclude DIR/`）。

4. **macOS / Debian 命名冲突**：Debian 系（Ubuntu 等）把 `fd` 改名为 `fdfind`，因为 `fd` 已被另一个老包占用。Homebrew 装的 `fd` 没事；用 `apt install fd-find` 装的要么用 `fdfind`，要么自己 alias。

## 适用 vs 不适用场景

**适用**：

- 找文件名（按名 / 按扩展名 / 按类型）
- 在仓库里快速定位文件，自动尊重 .gitignore
- 批量对文件做操作（`-x` / `-X`）替代 `xargs`
- 与 [[ripgrep]] 组合做"先筛文件、再筛内容"的两步搜索

**不适用**：

- 按文件**内容**搜——那是 [[ripgrep]] 的活
- 按 mtime / size / inode 这类元数据复杂条件——`fd` 支持简单的 `--changed-within 1d`，但复杂查询还是 `find` 强
- 需要 `find` 特有的副作用（如 `-delete` 内置删除）——`fd` 故意不内置危险操作，要删用 `-x rm`

## 历史小故事

- **2017 年**：sharkdp 在 GitHub 公开 `fd`，README 写明"`find` 的简化替代品"；同期 Rust 社区已经有 [[ripgrep]] 站稳脚跟，`fd` 借这股 Rust CLI 浪潮迅速走红
- **2019 年**：v8 加 `--threads` / `-j` 控制并行度，开始被 CI / 大型 monorepo 大量采用
- **2024 年**：v9 与 [[ripgrep]] 一起成为"默认安装"清单上的常客（dotfiles / new mac setup 必装）

`fd` 的成功不是"它能做 find 做不到的事"——它和 find 能力基本重合。它的成功是"把 80% 高频操作的语法做短"。这是 CLI 设计的范式转变：从"灵活但难用"到"默认就对"。

## 学到什么

1. **默认行为决定一切**：`fd` 没创新功能，只是把 `.gitignore` / 颜色 / 并行 / smart case 设为默认。这种"换默认"的产品力比加 100 个 flag 都管用。
2. **长生态位也能重做**：`find` 1971 年就有了，55 年后还能被替换。证明"老软件 = 不可动"是错的——只要使用习惯有痛点，就有重做空间。
3. **专做一件事 + 组合**：`fd` 不去抢 `grep` / `xargs` / `rsync` 的活，专心做"找文件名"。和 [[ripgrep]] 组合就覆盖 90% 场景。Unix 哲学的现代演绎。
4. **Rust + 多线程 = CLI 红利**：rayon 让"加并行"变成几行代码的事。同样的工作量在 C 时代要专门项目，所以 `fd` / [[ripgrep]] / bat / dust / hyperfine 这一批 Rust CLI 集体崛起。
5. **接力旧工具的 muscle memory**：`fd` 故意不复用 `find` 的 flag 名字（不像 GNU coreutils 那种向后兼容包袱），直接定一套更短的新 flag——切换工具时让用户主动"重学"反而更省事，也避免半新半旧的烂泥。
6. **gitignore 默认尊重是隐性产品力**：开发场景里 99% 的查询都不想看 `node_modules` / `target`，把"忽略" 内置成默认而不是 flag，等于把整套现代工程目录约定写进 CLI 的世界观。

## 延伸阅读

- 仓库 README：[github.com/sharkdp/fd](https://github.com/sharkdp/fd)（手册级清晰，对比表直接列出 find vs fd）
- 作者博客：sharkdp 写过 `fd` 的设计回顾，讲为什么默认行为这样选
- [[ripgrep]] —— `fd` 的姊妹项目，做内容搜索；两者一起装是 Rust CLI 入门标配

## 关联

- [[ripgrep]] —— `fd` 找文件名、`rg` 找内容；组合是命令行搜索的"现代标配"
