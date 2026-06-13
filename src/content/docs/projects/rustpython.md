---
title: RustPython — Rust 写的 Python 解释器
来源: https://github.com/RustPython/RustPython
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**RustPython** 是 [RustPython/RustPython](https://github.com/RustPython/RustPython) 维护的 **Python 3 解释器**，主体用 **Rust** 写成，目标兼容 **CPython ≥ 3.11** 的语义与标准库子集。它不是「在 Rust 里调用 CPython」的绑定层，而是从词法分析、编译到虚拟机执行**整条链路都在 Rust 生态内完成**——可以当独立 CLI 跑脚本，可以 **embed（嵌入）** 进 Rust 应用当脚本引擎，也可以编译成 **WebAssembly（WASM）** 在浏览器里跑 Python。

日常类比：如果把 **CPython** 想成一家用 C 砌墙、用 decades 旧管道接水的**老牌中央厨房**，那 **RustPython** 更像用现代钢结构重盖的**分店**：

- **Parser（解析器）** 像进货验收台：把 `.py` 源码拆成 token，再搭成 AST（抽象语法树）；RustPython 复用 Ruff 项目的 `ruff_python_parser`，站在成熟解析器肩膀上；
- **Compiler（编译器）** 像中央配菜间：把 AST 降成 Python **字节码（bytecode）**，并做符号表、闭包 cell 等分析；
- **VM（虚拟机）** 像流水线灶台：栈式解释器按 opcode 取指、操作数栈与局部变量区（`LocalsPlus`）执行；
- **Embed 模式** 像给 Rust 主程序装了一个**可编程遥控器**——游戏引擎、CLI 工具、桌面应用用 Python 写插件，不用单独部署 CPython；
- **WASM 目标** 像把整套厨房装进**集装箱**：编译成 WASI 模块后，用户打开网页就能在浏览器里 `print("hello")`，无需服务器端 Python 环境。

和 **PyPy**（RPython 自举 + tracing JIT）、**GraalPy**（JVM 上 Truffle）同属「语言替代实现」谱系；RustPython 的差异化卖点是 **Rust 内存安全 + 无 C 运行时依赖 + 可嵌 Web**，适合「Rust 主工程 + Python 脚本层」或「浏览器内 Python」两类场景。

## 为什么重要

不懂 RustPython，下面这些话题很难讲透：

- **为什么能在浏览器里跑 Python 而不装服务器**——整解释器可编译为 WASM，配合 WASI 提供受限系统接口
- **Rust 应用如何内嵌脚本语言**——`InterpreterBuilder` 在进程内启动 `VirtualMachine`，比 fork 子进程调 `python` 更轻
- **解释器流水线长什么样**——从源码到 AST、字节码、frame 执行，与 CPython 概念对齐但实现语言不同
- **手写 C 扩展 vs Rust `#[pymodule]`**——RustPython 用过程宏把 Rust 函数/类暴露给 Python，类型经 `IntoPyObject` 桥接
- **与 CPython 生态的差距在哪**——C API 扩展、部分 stdlib、性能与 3.12+ 新特性仍在追赶；生产默认运行时仍是 CPython

## 核心概念

### 1. Python 实现谱系中的位置

| 实现 | 实现语言 | 典型卖点 | 与 RustPython 对比 |
|------|----------|----------|-------------------|
| **CPython** | C | 官方参考、生态最全 | RustPython 语义对齐目标，非绑定 |
| **PyPy** | RPython → C + JIT | CPU 密集纯 Python 更快 | PyPy 更成熟；RustPython 偏嵌入/WASM |
| **MicroPython** | C | MCU、裁剪 | 体积极小；RustPython 面向桌面/浏览器 |
| **GraalPy** | Java / Truffle | JVM 多语言 | 宿主不同 |
| **RustPython** | Rust | 嵌入 Rust、WASM、无 CPython 依赖 | 本笔记主题 |

### 2. 三阶段流水线：Parser → Compiler → VM

官方 [architecture 文档](https://github.com/RustPython/RustPython/blob/main/architecture/architecture.md) 把解释器拆成三段：

```
源码 (.py)
  ▼ Parser      ruff_python_parser → AST
  ▼ Compiler    rustpython-compiler → CodeObject（字节码 + 元数据）
  ▼ VM          rustpython-vm → run_code_obj，栈式执行
```

`src/lib.rs` 的 `run()` 是 CLI 主入口：解析 `Settings`（命令行与环境变量），经 `InterpreterBuilder` 构造 `VirtualMachine`，再按 `RunMode` 分发到脚本、`-c` 命令、`-m` 模块或 REPL。

### 3. Crate 组织（仓库结构）

| Crate / 目录 | 职责 |
|--------------|------|
| `rustpython`（顶层 binary） | CLI、`run_shell`、pip 安装逻辑 |
| `ruff_python_parser` / `ruff_python_ast` | 词法、语法、AST（外部依赖，与 Ruff linter 同源） |
| `rustpython-compiler` | AST → 字节码、符号表、优化 |
| `rustpython-vm` | `VirtualMachine`、内置类型、部分 stdlib 的 Rust 实现 |
| `Lib/` | 纯 Python 标准库（symlink 管理，Windows 需 `git config core.symlinks true`） |

执行热点在 VM 的**解释器循环**：按 `Instruction` / opcode 分派，配合 **零成本异常表（exception table）** 查找 handler，而非 CPython 早期的 block 栈模型。

### 4. VirtualMachine 与 Frame

`VirtualMachine` 是运行时中枢：内置模块表、线程帧栈、导入系统、信号与多线程同步。每次函数调用对应 `InterpreterFrame`（经 `FrameRef` 引用），持有：

- 指令指针（IP）
- **LocalsPlus**：把 fast locals、cell 变量、求值栈**拼成一块连续内存**，减少分配与 cache miss
- 对应该 `CodeObject` 的常量表、名称表

协程/生成器在 frame 上标记为可挂起；异常沿 exception table 跳转，与 Python 3.11+ 的表格化异常处理思路一致。

### 5. CLI 执行模式（与 CPython 对齐）

| 模式 | 示例 | 说明 |
|------|------|------|
| 脚本 | `rustpython script.py` | 执行文件；目录含 `__main__.py` 可当包运行 |
| 命令 | `rustpython -c "print(42)"` | 执行字符串 |
| 模块 | `rustpython -m http.server` | 以模块方式运行 |
| REPL | `rustpython` | 交互式，非 WASM 平台用 `rustyline` |

启用 `ssl` 相关 feature 后可 `--install-pip` 安装 pip，在 venv 里更接近日常 Python 开发体验。默认 HTTPS 走 `ssl-rustls-aws-lc`；嵌入方可换 `ssl-openssl` 等。

### 6. 嵌入 Rust 应用：InterpreterBuilder

库模式推荐用 **builder** 构造解释器，而不是直接 new 裸 VM：

```rust
use rustpython::vm::{Interpreter, Settings};

fn main() -> rustpython::vm::PyResult<()> {
    let settings = Settings::default();
    let interp = Interpreter::with_init(settings, |vm| {
        // 可在此注册自定义扩展模块
        Ok(())
    })?;
    interp.enter(|vm| {
        vm.run_string("print('Hello from embedded Python')", rustpython::vm::compiler::Mode::Exec, "<embedded>".to_owned(), rustpython::vm::compiler::CompileOpts::default())
    })?;
    Ok(())
}
```

典型用途：游戏 mod、配置 DSL、自动化插件——主程序用 Rust 保证性能与安全边界，业务逻辑用 Python 快速迭代。

### 7. 从 Rust 暴露 API 给 Python：`#[pymodule]`

RustPython 用过程宏定义扩展模块，与 PyO3 风格相近：

```rust
use rustpython::vm::pymodule;

#[pymodule]
mod my_math {
    #[pyfunction]
    fn add(a: i32, b: i32) -> i32 {
        a + b
    }

    #[pyattr]
    const PI: f64 = 3.141592653589793;
}
```

Python 侧 `import my_math` 后即可 `my_math.add(1, 2)`。参数与返回值需实现 `IntoPyObject` / `FromArgs`；错误用 `PyResult` 与 `vm.new_*_error` 抛出。

### 8. WebAssembly 与 WASI

`wasm32-wasi` 目标可把解释器打成独立模块，在浏览器（配合 JS glue）或边缘 WASI 运行时中执行 Python。官网提供 [在线 demo](https://rustpython.github.io/)：输入代码即在 WASM 内跑通，证明「无服务器 Python」路径可行。限制包括：文件系统、网络、线程能力受宿主沙箱约束，与原生构建不同。

### 9. 实验性 JIT

带 `jit` feature 编译时，可对函数调用 `__jit__()` 尝试编译为本地代码（依赖 LLVM 等，**非常实验性**）。日常学习与嵌入场景以解释执行为主，不要指望 PyPy 级加速。

### 10. 与 CPython 的差异与预期

- **兼容性**：大量纯 Python 与 stdlib 可跑；依赖 **C API 扩展**（如部分 NumPy 轮子）常需专用构建或不可用
- **性能**：解释型路径通常慢于 CPython 3.11+ 特化解释器与 PyPy JIT
- **版本追踪**：目标对齐 CPython 3.11+，新语法/标准库持续 port 中
- **文档**：用户指南与 API 文档在演进，读源码与 `architecture/` 仍很重要

## 代码示例

### 示例 1：安装与命令行快速验证

```bash
# 从 Git 安装 CLI（需已安装 Rust stable）
cargo install --git https://github.com/RustPython/RustPython rustpython

# 一行命令
rustpython -c "import sys; print(sys.version); print(sum(range(10)))"

# 保存为 hello.py 后执行
# print("Hello", "RustPython")
rustpython hello.py

# 交互 REPL
rustpython
```

期望看到版本字符串与 `45`（`sum(range(10))`）。若需 pip，构建时启用 SSL feature 后执行 `rustpython --install-pip`，再在 venv 中使用。

### 示例 2：纯 Python 脚本——类、异常与模块路径

`demo_pkg/greet.py`：

```python
"""RustPython 下的普通 Python 代码通常无需修改。"""

class Greeter:
    def __init__(self, name: str):
        self.name = name

    def hello(self) -> str:
        return f"Hello, {self.name}!"

def main():
    g = Greeter("RustPython")
    print(g.hello())
    try:
        1 / 0
    except ZeroDivisionError as e:
        print("caught:", type(e).__name__)

if __name__ == "__main__":
    main()
```

```bash
rustpython demo_pkg/greet.py
```

输出应包含 `Hello, RustPython!` 与 `caught: ZeroDivisionError`。这段代码强调：**语义层仍是 Python**——类、异常、dunder 与 CPython 教程一致；差异多在底层 IO、扩展与性能，不在语法表面。

### 示例 3：在 Rust 中注册模块并执行 Python

概念片段（需将 `my_math` 注册进 `Interpreter::with_init` 的回调，具体 API 以仓库当前 `examples/` 为准）：

```rust
// 注册后，在 enter 闭包内：
vm.run_string(
    r#"
import my_math
print(my_math.PI)
print(my_math.add(40, 2))
"#,
    rustpython::vm::compiler::Mode::Exec,
    "<string>".into(),
    Default::default(),
)?;
```

Rust 实现的 `add` 与常量 `PI` 在 Python 命名空间可见，说明 **双向边界**：Rust 主程序 + Python 脚本 + Rust 扩展模块三层可共存。

## 从零学习路径

1. **先会 CPython 基础**：`import`、`def`、类、异常、venv；否则难以判断「是 RustPython bug 还是用法问题」。
2. **本地跑通 CLI**：`cargo install` 或 `git clone` 后 `cargo run --release -- -c "print(1)"`（Windows 建议 `--release` 防栈溢出）。
3. **读架构一页纸**：[architecture/architecture.md](https://github.com/RustPython/RustPython/blob/main/architecture/architecture.md) 对照 `crates/vm`、`crates/compiler` 目录浏览。
4. **试 WASM demo**：打开 [rustpython.github.io](https://rustpython.github.io/)，理解浏览器场景约束。
5. **做一个最小 embed**：复制官方 `examples` 里嵌入示例，加载一段 `run_string`。
6. **贡献入口**：`DEVELOPMENT.md` 说明测试、`Lib/` 与 Rust stdlib 分工；可从 port 单个纯 Python 标准库模块或修 failing CPython unit test 入手。

## 与其他笔记的对照

| 笔记 | 关系 |
|------|------|
| [[cpython]] | 语义与字节码概念的「标准答案」参照 |
| [[pypy]] | 另一种自举路线，侧重 JIT 性能 |
| [[wasmtime]] / [[wasmer]] | WASM 运行时宿主；RustPython 可编译为 wasm 模块在其中跑 |
| [[micropython]] | 嵌入式裁剪；RustPython 偏桌面与浏览器完整解释器 |

## 小结

**RustPython** 用 Rust 重写 Python 3 解释器全栈，使 Python 能作为 **Rust 应用的嵌入式脚本**、并具备 **编译到 WebAssembly** 的部署路径。核心仍是 **解析 → 编译字节码 → 栈式 VM 执行** 的经典模型，工程上通过 Ruff 解析器、`LocalsPlus` 帧布局、过程宏互操作等现代 Rust 实践落地。它尚未取代 CPython 成为默认运行时，但对学习「解释器如何实现」、探索 Rust 与 Python 混合架构、在浏览器内跑 Python 实验，是一个文档齐全、开源活跃（MIT）的入口。
