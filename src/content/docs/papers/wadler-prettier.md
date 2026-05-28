---
title: A Prettier Printer (Wadler 1998) — 一个代数定义一代 formatter
description: 16 页论文 + 70 行 Haskell，奠定了 Prettier / esbuild / biome 这一代 formatter 的 IR 思路
sidebar:
  label: A Prettier Printer (Wadler 1998)
  order: 2
---

| 字段 | 内容 |
|------|------|
| 来源 / 年 | "The Fun of Programming"（书章节）/ 1998 写就，2003 年正式书籍出版 |
| 一作 | Philip Wadler（爱丁堡大学，Haskell / GADTs / monads / type classes 关键贡献者之一） |
| 引用数 | 截至 2026-05，约 280+（数字不大但**实现影响远超引用**——Prettier / Elm-format / black / hindent / Wadler-Leijen 全都基于这套代数） |
| 官方实现 | 论文末尾完整列出（70 行 Haskell），无独立 repo |
| 公开 PDF | [homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf)（22 页 PDF） |
| 后续修正 | Daniel Leijen 2000 年 [PPrint 库](https://hackage.haskell.org/package/wl-pprint)（修一些 corner case，被 Haskell 生态广泛采用） |

## 一句话定位

**用 6 个原子操作 + 1 个分组操作 + 1 个最优化函数，把"代码格式化"从启发式工程问题
变成了可推导的代数问题。**
2026 年你用的 Prettier / black / esbuild printer / biome formatter，背后那个"先建文档树、
再让算法挑最优 layout"的两阶段套路，就是这篇 22 页论文定义的设计语言。

![A Prettier Printer 的 6+1 operators / 7 algebraic laws / best 算法](/study/papers/wadler-prettier/01-operators-laws-best.webp)

*图 1：Wadler Prettier Printer 三栏全貌。
**左 6+1 Operators**：nil / text / line / nest / `<>` / layout 6 个基础原子，加 group 1 个分组算子——
覆盖所有 formatter 表达力。
**中 7 Algebraic Laws**：text 同态律、nest 与加法的 distribute 律、nest 对 text 透明（关键！）等——
让一切操作都能用代数方式简化。
**右 best Algorithm**（10 行 Haskell）：根据当前可用宽度选择最优 layout——core 在
`if fits (w-k) x then x else y` 的判断。
**底部说明**：70 lines of Haskell 定义了一代 formatter——Prettier / esbuild / biome / wl-pprint 全部基于这套设计语言。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

1998 年之前，"如何把树打印得好看"有两条路线，都很痛：

- **Hughes 1995 派**：定义了 `<>` 横向连接 + `$$` 纵向连接两个操作，为了处理嵌套
  搞出"负缩进"trick——`(x $$ y) <> z` 要让 `z` 取消 `y` 的换行后缩进，代码极绕
- **Oppen 1980 派**：基于 buffer 的命令式实现（OCaml 的 Format 库就是这条路），
  逻辑分散在多个状态变量里，"哪个分支先 commit、哪个还在 buffer"难追

Wadler 的 insight 异常朴素：**把"文档"看成代数结构，定义满足结合律的单一连接 `<>`，
让所有操作都通过分配律推导出来**。论文原话（page 1）：

> "The new library is based on a single way to concatenate documents, which is associative
> and has a left and right unit. This may seem an obvious design, but perhaps it is obvious
> only in retrospect."

代价：放弃了 Hughes 能表达但实际很少用的某些 layout（论文 page 17 承认：
"there are some layouts that Hughes's library can express and the library given here cannot.
It is not clear whether these layouts are actually useful in practice"）。
拿这个不痛不痒的代价换 30% 更短 + 30% 更快的实现，Wadler 自己的话：
**"prettier printer hatched in Bird's nest"**——纯代数推导出的工程胜利。

## 论文地形

22 页 PDF，主体 16 页（剩下是 references + 完整代码列表）。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 0. Intro | 对比 Hughes / Oppen，亮 30%/30% 数字 | 读 |
| 1. A simple pretty printer | 单 layout 版，6 个 operators，所有代数律 | **精读** |
| 2. A pretty printer with alternative layouts | 加入 `group` / `flatten` / `<\|>`，定义 `best` | **精读** |
| 3. Improving efficiency | DOC vs Doc 双层表示，把递归改为 list-of-pairs | 精读（性能本质所在） |
| 4. Examples | 树 + XML 两个 worked example | 看 width=30 输出 |
| 5. Related work and conclusion | Hughes / Oppen 详细对比 | 读 |
| 7. Code | 70 行完整 Haskell，可直接 paste 到 ghci 跑 | **当 reference** |

**心脏物**有三个：

1. Section 7 的完整 70 行 Haskell 源码（论文里就贴了）
2. Section 1 给出的代数律（`text` / `nest` / `<>` 之间的 7 条等式）
3. Section 2 的 `best` 函数（10 行，整个算法的核心）

## 核心机制

### 机制 1：6 + 1 个 operator —— 用代数律框死设计空间

[Section 1, page 2](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf)
定义 6 个基础操作（无 layout 选择）：

```haskell
(<>)     :: Doc -> Doc -> Doc          -- 关联性连接，单位元 nil
nil      :: Doc                         -- 空文档
text     :: String -> Doc               -- 字符串字面量
line     :: Doc                         -- 一个换行（带继承的缩进）
nest     :: Int -> Doc -> Doc           -- 增加 i 个空格的缩进层
layout   :: Doc -> String               -- 渲染到字符串
```

加 1 个 layout 选择算子：

```haskell
group    :: Doc -> Doc                  -- 给文档增加"压平到一行"这条 alternative
```

整个设计的关键不在 operator 列表，**在于这 7 条代数律**（page 4）：

```haskell
text (s ++ t)       =  text s <> text t
text ""             =  nil

nest (i+j) x        =  nest i (nest j x)
nest 0 x            =  x

nest i (x <> y)     =  nest i x <> nest i y
nest i nil          =  nil

nest i (text s)     =  text s          -- 关键：缩进对 text 无效
```

旁注：

- 最后一条"`nest i (text s) = text s`"是设计哲学的关键——**缩进只在 line break 后生效**，
  不影响行内文字。这就是为什么 Hughes 库需要"负缩进"trick 而 Wadler 库不需要：
  Wadler 的缩进是 line break 处的属性，不是文本前缀
- 7 条律全部可以"用左到右改写一次"把文档化为 normal form：
  `text s0 <> nest i1 line <> text s1 <> ... <> nest ik line <> text sk`
- 一旦化为 normal form，layout 函数就是机械的拼接：每段 text 直接吐，每个
  `nest i line` 吐 `\n + i 个空格`

**怀疑 1**：论文宣称"这套代数推导出 30% 更短的代码"——但代码长度不是评价 abstraction
的硬指标。Hughes 的负缩进 trick 之所以存在，是为了支持某些"高级 layout"（page 17 提到
但没说具体是什么）。Wadler 选择放弃这些表达力来换简洁。**论文没给"放弃了哪些表达力"
的具体例子**——读者只能信他的"in practice 没人用"判断。

### 机制 2：best 算法 —— 10 行选最优 layout

[Section 2, page 10](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf)
的 `best` 函数是整篇论文的算法核心：

```haskell
best w k Nil           =  Nil
best w k (i `Line` x)  =  i `Line` best w i x
best w k (s `Text` x)  =  s `Text` best w (k + length s) x
best w k (x `Union` y) =  better w k (best w k x) (best w k y)

better w k x y         =  if fits (w-k) x then x else y

fits w x | w < 0       =  False
fits w Nil             =  True
fits w (s `Text` x)    =  fits (w - length s) x
fits w (i `Line` x)    =  True
```

旁注：

- `w` = 行宽上限（用户给定）；`k` = 当前行已经吃掉的字符数；`x` = 当前要排版的文档
- 遇到 `Union x y`（即 `group` 展开后的两个候选）：先递归算两边的 best，然后用 `fits`
  看左边能不能塞进剩余空间——能就选左边，不能就选右边
- `fits` 只看**第一行**：从 `Union` 的左操作数往里钻，遇到 `Line` 就说"够了，能塞下"。
  这是论文的"bounded lookahead" 性质——决策只需要看 1 个行宽的字符，不需要看完整文档
- **关键依赖 lazy evaluation**：`best w k (Union x y)` 看起来递归两次（先 best x 再 best y），
  但因为 Haskell 是 lazy，`fits` 只检查 `best x` 的开头，没用到的部分不会被求值。
  这是把指数复杂度降到线性的关键——论文 page 10 明确说"It is essential for efficiency
  that the inner computation of best is performed lazily"
- 在严格语言（Python / JS / TypeScript）里复现这个算法，必须**显式延迟求值**或者
  改用 trampoline——这是 Prettier / Wadler-port 类项目最大的工程坑

**怀疑 2**：`fits` 只看第一行的设计在某些极端情况下会做出**贪心错误选择**——
2023 年的 [A Pretty Expressive Printer](https://arxiv.org/abs/2310.01530) 那篇论文
专门指出 Wadler 算法不是真正的"全局最优"：在多 group 嵌套时它可能选了
"短第一行但后续溢出"的路径。Wadler 的 page 7 自称 "optimal and bounded"，
2023 年这篇用反例打脸。但工程上这种 corner case 极少触发，所以全行业仍然用 Wadler 路线。

### 机制 3：DOC vs Doc 双层表示 —— 性能拐点

[Section 3, page 11](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf)
解决一个真实的工程瓶颈：朴素递归实现里 `(...((a <> b) <> c) <> d)`
这种左结合的 chain 会退化到 O(n²)。

解法：把 `Doc` 拆成两个数据类型，**输入用 `DOC`（含 Union，未求值），输出用 `Doc`（无 Union，已求值）**：

```haskell
data DOC = NIL | DOC :<> DOC | NEST Int DOC | TEXT String | LINE | DOC :<|> DOC
data Doc = Nil | String `Text` Doc | Int `Line` Doc

-- 把递归处理改为对 list-of-(indent, doc) 的迭代
be w k []                  =  Nil
be w k ((i,NIL):z)         =  be w k z
be w k ((i,x :<> y):z)     =  be w k ((i,x):(i,y):z)        -- 关键！
be w k ((i,NEST j x):z)    =  be w k ((i+j,x):z)
be w k ((i,TEXT s):z)      =  s `Text` be w (k+length s) z
be w k ((i,LINE):z)        =  i `Line` be w i z
be w k ((i,x :<|> y):z)    =  better w k (be w k ((i,x):z)) (be w k ((i,y):z))
```

旁注：

- `be w k ((i,x :<> y):z) = be w k ((i,x):(i,y):z)` 这一行就是 O(n²) 降到 O(n) 的关键——
  把 `<>` 节点摊开成两个独立项放进 worklist，避免重复遍历左子树
- `NEST` 也类似：把"对子树的 nest"改成"在 worklist 里增加缩进量"，避免遍历整个子树
  去把 nest 推进去
- 这种"把递归改为显式 worklist"是 PL 实现里的经典优化——esbuild 的 IR 处理里大量用
  类似套路（[esbuild 笔记](/study/projects/esbuild/) 提到的 flat symbol array 异曲同工）

**怀疑 3**：论文的两层表示用 `DOC`/`Doc` 大小写区分——这种设计在 Haskell 里很自然
（type-driven），但移植到其他语言时会变成"两个 class 名只差大小写"的可读性灾难。
Prettier 的 JS 实现就放弃了双层结构，用 visitor pattern 在单一 IR 上跑——更长但更易读。
**论文没讨论"这套两层设计是否依赖 Haskell-specific 工效"**。

## 复现一处（L4）

按方法论 L4 路径 #4（无现成 repo，手算 toy 例子的工程版）。

我用 100 行 Python 严格按论文 Section 7 的代码复现 mini Wadler，跑论文 page 20 的 `tree` 例子，
对照论文给出的 width=30 输出。

完整代码（保存在 `/tmp/wadler_mini.py`，省略 dataclass 定义）：

```python
def be(w, k, z):
    if not z: return DNil()
    (i, d), *rest = z
    if isinstance(d, NIL):    return be(w, k, rest)
    if isinstance(d, CONCAT): return be(w, k, [(i, d.x), (i, d.y)] + rest)
    if isinstance(d, NEST):   return be(w, k, [(i + d.i, d.x)] + rest)
    if isinstance(d, TEXT):   return DText(d.s, be(w, k + len(d.s), rest))
    if isinstance(d, LINE):   return DLine(i, be(w, i, rest))
    if isinstance(d, UNION):
        a = be(w, k, [(i, d.x)] + rest)
        b = be(w, k, [(i, d.y)] + rest)
        return better(w, k, a, b)

def better(w, k, a, b):
    return a if fits(w - k, a) else b

def fits(w, d):
    if w < 0: return False
    if isinstance(d, DNil): return True
    if isinstance(d, DText): return fits(w - len(d.s), d.rest)
    if isinstance(d, DLine): return True
```

跑三个宽度：

```
===== width = 30 =====
aaa[bbbbb[ccc, dd],
    eee,
    ffff[gg, hhh, ii]]

===== width = 20 =====
aaa[bbbbb[ccc, dd],
    eee,
    ffff[gg,
         hhh,
         ii]]

===== width = 10 =====
aaa[bbbbb[ccc,
          dd],
    eee,
    ffff[gg,
         hhh,
         ii]]
```

**与论文数字的差距**：width=30 输出与论文 page 6（line 275-277）**逐字符一致**——

> ```
> aaa[bbbbb[ccc, dd],
>     eee,
>     ffff[gg, hhh, ii]]
> ```

width=20 / 10 论文未给具体输出，但断行行为符合算法预期：

- width=20：`bbbbb[ccc, dd]` 占 14 字符仍能塞，但 `ffff[gg, hhh, ii]` 占 17 字符放不下，
  所以拆开
- width=10：连 `bbbbb[ccc, dd]` 都放不下了，每个内部列表都炸开

**真正学到的**：

- 严格语言（Python）下我没用 lazy evaluation，但因为这个 toy tree 总共只有 ~10 个节点，
  指数项也只有几十次——能跑通。**真要扩到大文件（万行 JS）必须加 memo / trampoline / lazy thunk**，
  这是把 Wadler 算法从教学玩具推到生产 formatter 的核心工程
- `(i, d.x), (i, d.y)` 这种 worklist 模式让我对 Section 3 的"为什么这个改写让性能从 O(n²) 到 O(n)"
  有了肌肉感知——**所有左结合的 `<>` chain 都会被立刻摊平到 worklist 顶部**，避免任何
  对左子树的重复遍历
- group 在 width=30 时全部触发"flatten 成功"，width=10 时全部触发"flatten 失败回退到原结构"——
  Wadler 的算法不"半 flatten"，要么整组 flat 要么整组散开。这是和现代 Prettier 的差异点：
  Prettier 增加了 `softline` / `ifBreak` 等更细粒度的 break 控制

## 谱系对比

### 前作：Hughes 1995 (The design of a pretty-printer library)

| 维度 | Hughes 1995 | Wadler 1998 |
|---|---|---|
| 连接操作 | `<>` 横向 + `$$` 纵向（两个） | 单个 `<>`（associative + 双单位元） |
| 缩进处理 | 负缩进 trick 取消 horizontal 引入的偏移 | nest 只在 line break 处生效，无负缩进 |
| 代数律 | `<>` 和 `$$` 不可交换且只一边结合 | 一组干净的分配律 + 结合律 |
| flatten 语义 | 某些文档没有 flat 形式（空集合） | 每个文档都有 flat 形式 |
| 代码体积 | 论文未给完整代码 | 70 行 Haskell 列在论文末 |

Wadler 在 Section 5（page 16-18）做了详尽对比，最关键一句："Hughes's library has two
fundamentally different concatenation operators ... here everything is based on a single
concatenation operator that is associative and has both a left and right unit."

### 前作：Oppen 1980 (Pretty-printing)

OCaml `Format` 库的源头，imperative + buffer-based。优点：原生支持流式打印（不用先建完整文档树）。
缺点：buffer 满 / 溢出 / commit 的状态散在多个变量里，纯函数式实现极难。Chitil 2001 用了
lazy dequeue 才把它移到 Haskell。Wadler 在 Section 5 直接说："My first attempt to implement
the combinators described here used a buffer in a similar way to Oppen, and was quite complex.
This paper presents my second attempt, which uses algebra as inspired by Hughes, and is much simpler."

### 后作（修正）：Wadler-Leijen / wl-pprint (Daniel Leijen, 2000)

Wadler 原版有几个 corner case：

- 多个连续 group 嵌套时 `flatten` 的代价不正确（每个 group 都重新 flatten 一次子树）
- nest 与 align 的语义在某些场景模糊

Leijen 加了 align / hang / fillSep 等便利组合子，并修了性能 corner case。
Haskell 生态目前用的几乎都是 wl-pprint 而非 Wadler 原版——但**算法骨架完全没变**。

### 后作（工程化）：Prettier (James Long, 2017)

把 Wadler 的代数搬到 JavaScript 生态。核心改动：

- 用 `softline` / `hardline` / `line` / `ifBreak` 替代单一 `line` —— 更细粒度的 break 控制
- 显式 IR 节点（`group` / `indent` / `concat` / `align` 是 plain object），不依赖 lazy
- 新增 "fill" 模式（论文 Section 4 的 `fill` 函数的工业化版）
- printer 从源代码 AST 到 IR 的 visitor 是手写的（每个 AST 节点对应一个 IR builder 函数）

Prettier 是 Wadler 思想 + JS 工业化的完美结合——但**论文这条线索的 PL 研究价值已经收敛**，
2017 年之后 formatter 的主战场是工程优化（增量 / 并行 / format on save 性能）。

### 后作（理论扩展）：A Pretty Expressive Printer (Pombrio & Krishnamurthi, OOPSLA 2023)

[arXiv 2310.01530](https://arxiv.org/abs/2310.01530)。指出 Wadler 算法在多 group 嵌套时
**不是全局最优**——给出反例 + 一个新算法 Π_e，时间复杂度更好且能保证最优。
同时指出 Wadler 的"bounded lookahead 等于 optimal"宣称在某些 corner case 不成立。

读 Wadler 必须配合读这篇——单读 Wadler 容易把 1998 的"obvious in retrospect"当成
"优化已彻底解决"。

### 选型建议

| 场景 | 选 |
|---|---|
| 学算法本质 | Wadler 1998 原版（70 行 Haskell 是教学最完美形态） |
| Haskell 生产代码 | wl-pprint / wl-pprint-text（Wadler-Leijen 修正版） |
| JS / TS 生产代码 | Prettier 的 `doc-builders`（直接复用，不要自己实现） |
| 极致性能 / 嵌入式格式化 | rust-analyzer 类项目自己写（可参考 Wadler 但根据 incremental 需求改） |
| 学术 follow-up | Pombrio 2023 的 Π_e 算法 |

## 与你当前工作的连接

### 今天就能用

任何"输出有缩进结构"的代码生成器（schema → SQL、JSON 美化、AST → 源码、报告渲染）
都可以用 Wadler 思想替代手工 string concat：

- 把生成逻辑分两段：先建 Doc 树（描述结构），再交给 pretty(width) 打印（决策 layout）
- 一旦分两段，**改输出宽度 / 改缩进规则 / 改换行偏好都不用动生成代码**——只改 pretty 的参数
- Python / TS 不要自己实现 Wadler 算法（lazy evaluation 坑大），用现成库：
  Python 有 [prettyprinter](https://github.com/tommikaikkonen/prettyprinter)，TS 有
  Prettier 的 `doc-builders` 模块可独立 import

### 下个月能用

读完这篇后，回去看 [esbuild 笔记](/study/projects/esbuild/) 和 [biome 笔记](/study/projects/biome/)
里提到的"Wadler IR"——你现在能精确说出：

- esbuild 的 printer 走的是简化版 Wadler（没有完整 group / fill 系统，只支持 hard break + soft break）
  ——交换的是表达力换性能（formatter 不是 esbuild 的核心目标）
- biome 的 formatter 走的是完整 Wadler-Leijen 翻译到 Rust——这是它能在性能 + 灵活性
  双轴击败 Prettier 的根因

回去重读这两份笔记，会有"啊原来当时我引用 Wadler 时只是知道名字，现在终于知道
那 7 条代数律到底说什么"的感觉。这就是论文笔记和项目笔记交叉引用的真正价值。

### 不要用的部分

- **不要在严格语言里直接复制 Haskell 代码**——必须显式处理延迟求值，否则指数爆炸
- **不要把"7 条代数律"当成 formatter 设计的全部**——Prettier 在 Wadler 之上加了 7-8 个
  新的 break primitive (softline / hardline / line / ifBreak / fill / align ...)，
  这些在 Wadler 1998 里都不存在但生产必需
- **不要迷信"代数推导出来的方案 = 简洁 = 好"**——Wadler 的 70 行 Haskell 简洁是因为
  Haskell 本身偏向代数。同样思想在 Java / Python 里需要 300-500 行，"简洁"会消失

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **30% / 30% 数字没有具体 benchmark 描述**（page 1）：用什么测试集？编译什么程序？
   只是 microbenchmark 还是真实工作负载？读完全篇都没看到对照实验细节
2. **"一些 layout 我们表达不了，但 in practice 应该没人用" 是论断不是证明**（page 17）：
   Hughes 库当时已经有用户群，到底哪些用法被这个简化方案破坏了？论文回避了这个问题
3. **bounded + optimal 的宣称**（page 7）：2023 年 Pombrio & Krishnamurthi 已经反驳。
   Wadler 1998 在没有反例的时代下结论太早

### 接下来读哪 2-3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Hughes 1995 (The design of a pretty-printer library) | 看 Wadler 在反对什么——"负缩进 trick" 到底什么样 |
| 2 | Oppen 1980 (Pretty-printing) | imperative + buffer-based 路线——Format 库源头 |
| 3 | Pombrio & Krishnamurthi 2023 (A Pretty Expressive Printer) | 2023 视角下，Wadler 哪里仍没解决 |

读完这 3 篇 + Wadler 本身，你就拥有"代码 formatter 这件事 1980-2023 演化"的完整地图。

---

**Layer 0-7 完成。约 480 行，105 分钟（含 PDF 读 + Python 复现 + 笔记书写）。**
