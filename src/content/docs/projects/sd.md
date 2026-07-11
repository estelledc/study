---
title: sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
来源: 'https://github.com/chmln/sd'
日期: 2026-05-30
分类: cli
难度: 初级
---

## 是什么

sd 是一个**命令行查找和替换工具**，用来把一段文字换成另一段。日常类比：Word 里的"查找替换"框，但搬到终端里，能跑在管道和大批文件上。

它跟 `sed` 干的是同一件事，区别在**写法**。sed 让你写：

```bash
sed 's/before/after/g' file
```

而 sd 让你写：

```bash
sd before after file
```

少了一个 `s/`、少了一个尾巴的 `/g`、少了一堆斜杠。语法是 JavaScript / Python 那种正则，不是 sed 自家的怪方言。它是 Rust 写的；README 基准里**正则替换**可比 GNU sed 快约 12 倍（简单字面量替换大约 2 倍），常跟 `ripgrep` `fd` `bat` 一起出现在"现代 CLI 全家桶"推荐里。

## 为什么重要

不理解 sd 的设计取舍，下面这些事会让人困惑：

- 为什么 sed 命令越写越像电报密码——sd 用一句话证明可以更短
- 为什么"用 -F 切字面量"是 sd 的一个核心设计，而不是顺手加的开关
- 为什么 sd 不挑战 sed 的"流编辑器"全部功能，只做替换
- 为什么 Rust CLI 工具能集体把 GNU 老兵替换掉，而不是各扫各家门

## 核心要点

sd 的灵魂可以拆成 **三件事**：

1. **位置参数代替命令字符串**：sed 把"操作 + 模式 + 替换"压成一个字符串 `'s/x/y/g'`，sd 把它拆成位置参数 `sd x y`。类比：让你"动手做菜"，而不是"先背一句咒语"。

2. **JavaScript/Python 风格正则 + 命名捕获**：用 `(?P<name>...)` 而不是 sed 的 `\(...\)`，引用用 `$name` 而不是 `\1`。类比：终于不用记两套正则了，写代码什么样、写命令就什么样。

3. **默认正则但有 -F 一键切字面量**：sd 知道日常一半场合是想换"那串字符"而不是"那个模式"，所以提供 `-F`（fixed strings）让正则元字符全部失效。类比：水龙头默认热水，但有个一推就冷的杠杆。

## 实践案例

### 案例 1：在文件里把 window.fetch 换成 fetch

```bash
sd 'window.fetch' 'fetch' http.js
```

**逐部分解释**：

- 第一个参数 `'window.fetch'` 是要找的模式（默认按正则解析，但这里没有元字符所以等同字面量）
- 第二个参数 `'fetch'` 是替换内容
- 第三个参数 `http.js` 是文件，**直接原地改写**，不用 `-i` 也不用重定向

如果只想预览不改文件：加 `-p`（preview），sd 把改后的全文打印到 stdout，原文件不动。

### 案例 2：用命名捕获重组字符串

```bash
echo "123.45" | sd '(?P<dollars>\d+)\.(?P<cents>\d+)' '$dollars dollars and $cents cents'
```

**输出**：`123 dollars and 45 cents`。

**逐部分解释**：

- `(?P<dollars>\d+)` 捕获整数部分，命名为 `dollars`
- `(?P<cents>\d+)` 捕获小数部分，命名为 `cents`
- 替换串里 `$dollars` 引用第一个捕获组，写法跟 JS 模板字符串很像

如果替换串后面紧接字母，要用 `${dollars}` 防止 sd 把字母吞进变量名。

### 案例 3：和 fd 串起来批量改全项目

```bash
fd --type file --extension ts --exec sd 'from "react"' 'from "preact"'
```

**逐部分解释**：

- `fd` 列出所有 .ts 文件（fd 是 find 的现代替代）
- `--exec sd ...` 让 fd 对每个文件分别跑一次 sd
- sd 直接原地修改每个文件

这条命令是 sd 真正的杀手场景：跨几百个文件做一致改名，比 sed + xargs 短一半。

## 踩过的坑

1. **默认是正则不是字面量**：`sd '.' 'X' file` 会把**每一个字符**都换成 X（`.` 在正则里匹配任意字符）。想换"那个点"必须加 `-F`：`sd -F '.' 'X' file`。

2. **`$1abc` 会被当一个变量名**：替换串 `$1abc` 不是"第一组 + abc"，而是变量 `1abc`（不存在）。**正确写法**：`${1}abc`。

3. **第一个参数以 `-` 开头被当 flag**：想换 `-foo` 这种字面量，要先写 `--` 终止 flag 解析：`sd -- '-foo' 'BAR' file`。

4. **替换串里的 `$` 字面量要写两个**：想输出 `$5` 必须写 `$$5`，单个 `$` 总被解析成捕获引用，没匹配到就出空字符串。

## 适用 vs 不适用场景

**适用**：

- 大批文件里把 A 字符串改成 B 字符串（最常见）
- 用正则提取并重排字段（命名捕获很顺手）
- 写在 shell 脚本 / Makefile / CI 里——比 sed 短、比 sed 跨平台稳

**不适用**：

- 不只想替换，还想做删除行 / 插入行 / 条件跳转——sed 的 `d` `a` `i` `b` 命令 sd 没有，老老实实用 sed 或 awk
- 需要匹配跨行（换行符、多行块）却忘了加 `-A`/`--across`——默认按行处理，跨行模式才吃 `\n`
- 多文件需要事务性回滚——sd 不带原子性，错了就要 git 救
- 二进制文件 / 编码非 UTF-8 的旧文本——sd 不处理这些边界，需要先转码

## 历史小故事（可跳过）

- **2018 年**：Gregory（GitHub: chmln）开始写 sd，动机是被 sed 的反斜杠和方言折磨够了
- **2019-2020 年**：sd 进入"现代 Rust CLI 全家桶"推荐列表，常与 `ripgrep` `fd` `bat` 并列
- **2022 年前后**：dotfiles 社区里 alias `sed=sd` 的人多起来，但 sd 维持只做替换的克制
- **2026 年**：GitHub 7k+ star，进了 awesome-rust 必收名单，但仍未试图覆盖 sed 的"流编辑器"全部能力

它的故事也是 Rust CLI 生态的缩影：不重写 GNU 老兵的全部功能，**只做最常用的那 20%，把它做到极致**。

## 学到什么

1. **CLI 工具的"语法成本"是真实成本**——sed 的方言赶走了多少新手，sd 用更短的写法接住了
2. **默认值是设计选择**——sd 选默认正则 + `-F` 切字面量；ripgrep 选默认正则 + `-F`；它们是一致的
3. **小工具不必什么都做**——sd 只做替换，把"流编辑"留给 sed，反而活得好
4. **现代 Rust CLI 全家桶是一个生态**，不是单点工具，组合用才有最大威力

## 延伸阅读

- 项目主页：[chmln/sd](https://github.com/chmln/sd)（README 里 5 个例子涵盖 80% 用法）
- 文档：sd `--help` 全文，比大多数 README 还短
- 视频：[Modern Unix tools](https://www.youtube.com/results?search_query=modern+unix+tools+rust)（讲整个 Rust CLI 生态）
- [[ripgrep]] —— 同生态的"现代 grep"
- [[fd]] —— 同生态的"现代 find"，跟 sd 串管道用
- [[bat]] —— 同生态的"现代 cat"

## 关联

- [[ripgrep]] —— grep 的现代替代，正则方言和 sd 一致
- [[fd]] —— find 的现代替代，常用 `fd --exec sd` 做项目级替换
- [[bat]] —— cat 的现代替代，配 sd 看改完效果很自然
- [[lsd]] —— ls 的现代替代，同生态成员
- [[dust]] —— du 的现代替代，再凑一个家族成员
- [[biome]] —— 同样用 Rust 写、同样想替代经典老兵（替的是 ESLint+Prettier）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[miller]] —— Miller (mlr) — 懂 CSV/JSON 表头的 awk
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd
