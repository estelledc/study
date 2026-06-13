---
title: nvim-treesitter 零基础学习笔记
来源: https://github.com/nvim-treesitter/nvim-treesitter
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

# nvim-treesitter 零基础学习笔记

## 从日常类比开始：把代码当成「有结构」的文章

你读一段文章的时候，不会把每个字同等看待。你会自动识别出「这是主语」「这是谓语」「这是一个从句」。你的大脑其实在对文字做「语法分析」。

代码也是一样的。一段 Python 代码里，`def` 后面跟着的是函数名，括号里是参数，冒号后面是缩进的代码块。人类一眼就能看出来，但计算机默认只看到一堆字符，它不知道哪个是变量、哪个是函数定义。

**nvim-treesitter 做的事情就是：帮 Neovim 理解代码的语法结构。** 它用一个叫 Tree-sitter 的工具，把源代码转换成一棵「语法树」（Syntax Tree），树上的每个节点代表一个语法成分——函数声明、变量、循环、表达式……

这就好比给代码做了个 X 光扫描，每一层结构都清晰可见。

## 核心概念一：语法树（Syntax Tree）

程序代码本身是一串字符。比如这段 Python：

```python
def greet(name):
    print("Hello, " + name)
```

nvim-treesitter 会用 Tree-sitter 解析器把这串字符变成一棵树。树的根节点是整个文件，往下分出函数声明节点，再往下分出参数节点、字符串字面量节点等等。

用伪文本表示，大概长这样：

```
source_file
├── function_definition
│   ├── name: identifier (greet)
│   ├── parameters
│   │   └── identifier (name)
│   └── body
│       └── expression_statement
│           └── call
│               ├── function: identifier (print)
│               └── arguments
│                   └── string (Hello, )
```

这棵树就是所有高级编辑功能的基础。有了它，编辑器就能回答「这个变量在哪里被使用了」「这个函数的参数有哪些」「这段代码的边界在哪里」之类的问题。

**Tree-sitter 和传统解析器的区别**：传统解析器（比如 C 编译器的解析器）一旦遇到一个语法错误就会停下来报错。Tree-sitter 是「容错」的——即使代码有错误，它也会尽最大努力解析出尽可能多的结构。这对编辑器非常有用，因为你在写代码的时候代码经常是不完整的。

## 核心概念二：Query（查询语言）

有了语法树之后，怎么告诉编辑器「我想把函数名高亮成蓝色」呢？这就需要 **Query**——nvim-treesitter 自带的一种类似正则表达式的查询语言。

Query 的写法很像树的结构，用括号和下划线来匹配语法树中的节点。

### 代码示例一：语法树可视化

你可以用 nvim-treesitter 自带的命令把当前文件的语法树「画」出来，直观地看代码被解析成了什么样子：

```bash
:TSViewCursor
```

执行后会在当前窗口打开一个新 buffer，显示光标所在位置对应的语法树结构。

如果你在 Neovim 里写下面这段 Python 代码，然后把光标放在 `greet` 上执行 `:TSViewCursor`，会看到类似这样的输出：

```
(source_file
  (function_definition
    name: (identifier) @function
    parameters: (parameters
      (identifier) @parameter)
    body: (block
      (expression_statement
        (call
          function: (identifier) @function.call
          arguments: (arguments
            (string) @string)))))
```

注意那些 `@function`、`@parameter`、`@string`——这叫**捕获标签（capture labels）**。Query 就是用这些标签来告诉 Neovim「这个位置的节点应该用什么样式来高亮」。

### 代码示例二：自定义高亮 Query

nvim-treesitter 的高亮规则存储在 `queries/<语言>/highlights.scm` 文件中。这是一个 Lua 文件的示例 Query，用来把 `self` 关键字高亮成特殊颜色：

```scheme
; 匹配函数定义中的 self 参数，高亮为 @parameter.builtin
(parameter
  name: (identifier) @parameter.builtin
  (#eq? @parameter.builtin "self"))
```

再比如，把 Python 里的 `# TODO` 注释高亮成黄色，方便你追踪待办事项：

```scheme
; 匹配注释中的 TODO
(comment) @text.todo
```

这些 `.scm` 文件就是 Tree-sitter Query 文件，用一种类似 Lisp 的 S 表达式语法来描述「我想从语法树中找到什么」。

### Query 语法速查

| 符号 | 含义 |
|------|------|
| `(identifier)` | 匹配一个 identifier 节点 |
| `(identifier) @label` | 匹配并给这个节点一个标签 |
| `((identifier) @foo (#eq? @foo "self"))` | 匹配值为 "self" 的 identifier |
| `(call function: (identifier) @func.name)` | 匹配 call 节点的 function 子节点 |
| `((comment) @comment (#match? @comment "TODO"))` | 匹配包含 TODO 的注释 |

## 核心概念三：Parser（解析器）

每种编程语言都需要一个对应的 Tree-sitter 解析器。nvim-treesitter 帮你自动安装和管理这些解析器。

安装命令：

```
:TSInstall python
:TSInstall javascript
:TSInstall typescript
```

一次性安装多个：

```
:TSInstall python javascript typescript lua go rust
```

更新所有已安装的解析器：

```
:TSUpdate
```

查看已安装和可安装的解析器列表：

```
:TSInstallInfo
```

解析器存储在 Neovim 的数据目录中，通常位于 `~/.local/share/nvim/site/` 下。

## nvim-treesitter 提供的核心功能

### 1. 语法高亮（Highlighting）

这是最直观的功能。传统的正则表达式高亮只能做粗略匹配（比如匹配 `def ` 关键词），而 Tree-sitter 高亮是真正理解代码结构的。它能区分同一个单词在不同上下文中的不同身份——变量名、函数名、关键字、字符串字面量，各自有不同的颜色。

开启方式（在配置中）：

```lua
vim.api.nvim_create_autocmd('FileType', {
  pattern = { 'python', 'javascript', 'lua' },
  callback = function() vim.treesitter.start() end,
})
```

### 2. 代码折叠（Folds）

基于语法树，编辑器可以智能地折叠代码块。比如折叠整个函数体、折叠整个 if 块、折叠导入语句块。

```lua
vim.wo.foldexpr = 'v:lua.vim.treesitter.foldexpr()'
vim.wo.foldmethod = 'expr'
```

### 3. 自动缩进（Indentation）

Tree-sitter 知道哪段代码属于哪个代码块，所以能提供更准确的自动缩进。

```lua
vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
```

### 4. 多语言注入（Injections）

如果你在 HTML 文件里写了一段 JavaScript，Tree-sitter 能自动识别并给 JavaScript 部分也提供语法高亮和结构理解。这叫做「语言注入」。

```
<!-- HTML 中的 JavaScript 也会被正确高亮 -->
<script>
  const x = 1;  -- 这里也有 treesitter 高亮
</script>
```

## 安装与配置

### 前提条件

- Neovim 0.12.0 或更高版本
- `tree-sitter-cli`（通过包管理器安装，**不要用 npm**）
- C 编译器

### 推荐配置（使用 lazy.nvim）

```lua
{
  'nvim-treesitter/nvim-treesitter',
  lazy = false,
  build = ':TSUpdate',
  config = function()
    require('nvim-treesitter.configs').setup({
      ensure_installed = { 'python', 'javascript', 'typescript', 'lua', 'go' },
      highlight = { enable = true },
      indent = { enable = true },
      auto_install = true,
    })
  end,
}
```

### 常用命令速查

| 命令 | 说明 |
|------|------|
| `:TSInstall python` | 安装 Python 解析器 |
| `:TSInstallFromGrammar python` | 从 grammar 安装（未提供的语言） |
| `:TSUpdate` | 更新所有已安装的解析器 |
| `:TSUpdateSync` | 同步更新（等待完成） |
| `:TSUninstall python` | 卸载 Python 解析器 |
| `:TSToggle` | 开关语法高亮 |
| `:TSBufToggle` | 开关当前 buffer 的高亮 |
| `:TSBufDisable` | 禁用当前 buffer 的所有 treesitter 功能 |
| `:TSInstallInfo` | 查看已安装和可安装的解析器 |
| `:TSContext` | 显示光标所在语法上下文的信息 |
| `:TSHighlightInfo` | 查看当前语法树节点的高亮信息 |

## 为什么它比传统正则高亮好？

对比一下两者的区别：

**正则表达式高亮**（传统方法）的规则：
```
match = "def\\s+\\w+"    -- 匹配 def 加空格加一个词
```

它的问题是：`def` 出现在字符串 `print("def")` 中也会被匹配。

**Tree-sitter 高亮**的规则：
```scheme
(function_definition name: (identifier) @function)
```

它只匹配真正在语法树中的函数定义节点。如果 `def` 出现在字符串里，它会是一个 `string` 节点，不会被匹配。

这就是「理解结构」和「看到文本」的根本区别。

## 总结

nvim-treesitter 的本质是三件事：

1. **解析**：用 Tree-sitter 把代码变成语法树
2. **查询**：用 `.scm` Query 语言从树中提取有意义的信息
3. **映射**：把提取到的信息映射到编辑器功能（高亮、折叠、缩进等）

理解了这三步，你就理解了 nvim-treesitter 的全部工作原理。
