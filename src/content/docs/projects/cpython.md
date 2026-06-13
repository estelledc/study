---
title: CPython — Python 官方实现
来源: https://github.com/python/cpython
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**CPython** 是 [Python 语言规范](https://docs.python.org/3/reference/) 的**官方参考实现**，由 Python 核心开发团队在 [python/cpython](https://github.com/python/cpython) 仓库维护，主体用 **C 语言** 写成。你在官网下载的 `python3`、macOS 自带的 Python、大多数 Linux 发行版里的 `python3`、以及 PyPI 上无数库的默认运行环境，几乎都是 CPython。

日常类比：如果把 **Python 语言** 看成一本全国通用的《菜谱大全》，CPython 就是政府开源的那家**中央厨房**——

- **词法分析器 / 解析器** 像审稿编辑：把你的 `.py` 稿子拆成词语（token），再排成语法树（AST）；
- **编译器** 像配菜间：把 AST 翻译成厨房内部指令单（**字节码 bytecode**），并缓存成 `__pycache__/*.pyc`；
- **字节码解释器（eval loop）** 像流水线厨师：按指令单一步步操作，本质是**栈式虚拟机**；
- **`PyObject` 与引用计数** 像每道菜上的标签和扫码枪：每个对象都有类型牌和「被引用几次」，归零就回收；
- **GIL（全局解释器锁）** 像厨房里**只允许一把火**的规则：同一时刻只有一个线程在执行 Python 字节码，简化内存安全，但限制 CPU 密集型多线程并行；
- **标准库 `Lib/`** 像配套餐具和预制酱料：`os`、`json`、`asyncio` 等随厨房一起发货。

你写的 Django、PyTorch 脚本、`pip install` 装的第三方包，在默认环境下最终都由 **CPython 解释器 + 标准库 + C 扩展** 执行。其他实现（PyPy、Jython、GraalPy、MicroPython）能跑很多相同代码，但**语言特性的「标准答案」仍以 CPython 为准**。

## 为什么重要

不懂 CPython，下面这些现象很难讲透：

- **为什么 `import` 第二次更快**——`__pycache__` 里缓存了 marshal 序列化的字节码，跳过解析与编译
- **为什么多线程跑 CPU 密集任务几乎不加速**——**GIL** 让同一解释器内只有一个线程执行 Python 字节码
- **为什么 `multiprocessing` 能利用多核而 `threading` 常常不能**——多进程各有独立解释器与 GIL；多线程共享一个 GIL
- **为什么 `dis.dis()` 看到的指令和源码对不上**——编译器会做 peephole 优化、常量折叠，且 3.11+ 有**自适应特化解释器**
- **为什么 C 扩展写错了会 segfault**——扩展与解释器共享地址空间，绕过 Python 层的异常安全网
- **为什么 Python 3.13 有「无 GIL」实验构建**——`--disable-gil` 自由线程模式正在探索，但生态与 ABI 仍在演进

## 核心概念

### 1. Python 语言 vs CPython 实现

| 概念 | 含义 |
|------|------|
| **Python 语言** | 语法、语义规范（`docs.python.org` 的 Language Reference） |
| **CPython** | 用 C 写的解释器 + 标准库 + 构建系统，规范的**参考实现** |
| **PyPy** | 带 JIT 的替代实现，通常 CPU 密集更快，兼容性略差 |
| **MicroPython** | 面向 MCU 的裁剪实现 |

说「Python 慢」「Python 有 GIL」时，几乎总是在说 **CPython 的实现选择**，不是语言规范强制如此。

### 2. 源码树布局

```
cpython/
├── Python/           # 解释器核心：ceval.c（字节码循环）、compile.c、import 等
├── Objects/          # 内置类型：int、str、list、dict 的 C 实现
├── Modules/          # 标准库 C 扩展：_socket、_json、posix…
├── Lib/              # 纯 Python 标准库：asyncio、http、unittest…
├── Include/          # C API 头文件：Python.h
├── Parser/           # 词法、语法分析（PEG 解析器，3.9+）
└── Programs/         # python 可执行文件入口
```

执行热点路径：**`Python/ceval.c`** 里的 `_PyEval_EvalFrameDefault`——一个巨大的 opcode 分派循环（switch 或 computed goto）。

### 3. 从 `.py` 到执行的流水线

官方文档与 `InternalDocs/compiler.md` 描述的编译链：

```
源码 (.py)
  ▼ Tokenize     Parser/tokenizer
  ▼ Parse        Parser/ → AST
  ▼ Symtable     符号表、作用域分析
  ▼ Compile      Python/compile.c → 伪指令
  ▼ CFG + 优化   Python/flowgraph.c（peephole 等）
  ▼ Assemble     Python/assemble.c → 字节码
  ▼ Code object  types.CodeType（co_code, co_consts, co_varnames…）
  ▼ Eval loop    Python/ceval.c 栈式虚拟机执行
```

导入模块时，若 `.pyc` 时间戳/哈希与 `.py` 一致，可直接 **marshal 加载** 字节码，跳过前端编译。

### 4. 字节码与栈式虚拟机

CPython 字节码是 **16 位 code unit**：低 8 位 `opcode`，高 8 位 `oparg`。解释器是**栈机**——`LOAD_CONST`、`BINARY_ADD` 等指令操作**求值栈（evaluation stack）**，栈深度由编译器算出，存在 `co_stacksize`。

每个函数调用对应一帧 **`_PyInterpreterFrame`**（3.11+ 更轻量，常分配在线程栈上），保存指令指针、局部变量、栈指针、全局/ builtins 命名空间等。

### 5. `PyObject`：一切皆对象

在 C 层，所有 Python 值都是 `PyObject*`。典型布局：

- **`ob_refcnt`**：引用计数
- **`ob_type`**：指向 `PyTypeObject`（类型对象，类似 vtable）
- 类型专有数据（如 `PyLongObject` 的数值、`PyListObject` 的元素数组）

小整数 **-5～256** 有全局缓存；短字符串会 **intern**。`id(x)` 在 CPython 里通常是对象地址（实现细节，勿依赖可移植语义）。

### 6. 内存管理：引用计数 + 循环垃圾回收

- **主路径**：`Py_INCREF` / `Py_DECREF`，计数为 0 立即调用类型的 `tp_dealloc`
- **循环引用**：仅靠引用计数无法回收 `a ↔ b`，因此有 **`gc` 模块**的分代循环检测（mark-sweep，三代）
- **pymalloc**：小对象（≤512B）从专用 arena/pool 分配，减轻 `malloc` 压力

### 7. GIL（Global Interpreter Lock）

GIL 是一把互斥锁，保证**同一解释器进程中**只有一个线程执行 Python 字节码。原因包括：引用计数与多数内置结构**非线程安全**，用一把锁比给每个对象加锁更简单，且历史上保护了单线程性能。

| 场景 | 表现 |
|------|------|
| **I/O 阻塞**（网络、磁盘） | 等待 I/O 时会释放 GIL，多线程仍有用 |
| **CPU 密集纯 Python** | 多线程几乎无法并行，用 `multiprocessing` 或 C 扩展释放 GIL |
| **NumPy 等 C 扩展** | 计算时在 C 层 `Py_BEGIN_ALLOW_THREADS` 释放 GIL |

`sys.getswitchinterval()` 控制线程切换间隔（默认约 5ms 量级）。Python 3.13 **实验性 free-threaded** 构建尝试用每对象锁 + 偏置引用计数去掉 GIL，尚非默认生产路径。

### 8. C API 与扩展模块

用 C/C++/Rust（PyO3）写的模块在运行时与解释器**同进程加载**，直接操作 `PyObject*`。好处是性能与系统调用；代价是**崩溃即整个进程完蛋**，且须跟随 CPython 版本维护 ABI（稳定 ABI `limited API` 可缓解）。

### 9. 运行时层级（3.12+ 文档化模型）

`Doc/reference/executionmodel.rst` 把运行时分为：

```
进程
 └── Python 全局运行时状态
      └── 解释器（Interpreter）── sys.modules 等
           └── 线程状态（Thread state）── 异常、调用栈
                └── 字节码解释器循环（eval loop）
```

`concurrent.interpreters`（3.12+）可在同进程创建**多个子解释器**，各自有独立 GIL（3.12 per-interpreter GIL），是「多核友好」探索方向之一。

## 从源码到运行（零基础走读）

```python
def greet(name: str) -> str:
    return f"Hello, {name}"
```

1. **`python script.py`** → `Programs/python.c` 启动，初始化解释器与 `__main__` 模块
2. **读取源码** → tokenize → PEG parser → AST
3. **`compile()`** → 字节码 + `code object`；写入 `__pycache__/script.cpython-312.pyc`（若可写）
4. **`PyEval_EvalCode`** → 创建 frame，`_PyEval_EvalFrameDefault` 执行 opcode
5. **`f"..."`** 在编译期可能生成 `BUILD_STRING` 等指令；运行时在栈上拼接 `str`
6. 临时对象引用计数增减；无循环则立即回收，有循环则等待 `gc` 收集

## 代码示例

### 示例 1：用 `dis` 阅读字节码

理解 CPython 在干什么的最快方式之一，是直接看编译产物：

```python
import dis

def add_tax(price: float, rate: float) -> float:
    total = price * (1.0 + rate)
    return round(total, 2)

print("=== add_tax 字节码 ===")
dis.dis(add_tax)

code = add_tax.__code__
print("\nco_consts:", code.co_consts)
print("co_varnames:", code.co_varnames)
print("co_stacksize:", code.co_stacksize)
```

典型输出会包含 `LOAD_FAST`、`LOAD_CONST`、`BINARY_OP`、`CALL`、`RETURN_VALUE` 等。Python 3.11+ 还会出现**自适应特化**相关 opcode（如 `BINARY_OP_ADAPTIVE`），解释器根据运行时类型反馈把通用指令**特化成快速路径**。

配合命令行：

```bash
python -m dis your_module.py
# 或
python -O -m dis your_module.py   # -O 去掉 assert 等
```

### 示例 2：观察 import 缓存与 `marshal`

第二次 `import` 更快，是因为 `.pyc` 跳过了编译前端：

```python
import importlib.util
import marshal
import dis
import pathlib
import time
import sys
import tempfile

snippet = '''
def work():
    s = 0
    for i in range(100_000):
        s += i
    return s
'''

tmp = pathlib.Path(tempfile.mkdtemp())
src = tmp / "demo_mod.py"
src.write_text(snippet, encoding="utf-8")

spec = importlib.util.spec_from_file_location("demo_mod", src)
mod = importlib.util.module_from_spec(spec)

t0 = time.perf_counter()
spec.loader.exec_module(mod)
cold = time.perf_counter() - t0

# 触发写入 __pycache__
importlib.invalidate_caches()
pyc = next(tmp.joinpath("__pycache__").glob("demo_mod*.pyc"))

t1 = time.perf_counter()
with open(pyc, "rb") as f:
    f.read(16)  # skip pyc header (magic + flags + timestamp/hash)
    code_obj = marshal.load(f)
warm = time.perf_counter() - t1

print(f"冷启动 exec_module: {cold*1000:.2f} ms")
print(f"marshal 加载 code:   {warm*1000:.2f} ms")
print(f"pyc 路径: {pyc}")
dis.dis(code_obj)
```

你会看到：**marshal 只恢复 `code object`**，仍由 eval loop 执行；但解析与编译成本在重复导入时被省掉。删除 `__pycache__` 或修改 `.py` 后哈希不匹配，CPython 会重新编译。

### 示例 3：GIL 与 `sys.setswitchinterval`（现象演示）

下面用纯 Python CPU 循环对比线程数（结果因机器而异，但趋势稳定）：

```python
import sys
import time
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

def cpu_chunk(n: int) -> int:
    s = 0
    for i in range(n):
        s += i * i
    return s

N = 4
CHUNK = 2_000_000

def bench(label: str, fn) -> None:
    t0 = time.perf_counter()
    fn()
    print(f"{label}: {time.perf_counter() - t0:.2f}s")

def serial():
    for _ in range(N):
        cpu_chunk(CHUNK)

def threaded():
    with ThreadPoolExecutor(max_workers=N) as ex:
        list(ex.map(cpu_chunk, [CHUNK] * N))

def multiprocess():
    with ProcessPoolExecutor(max_workers=N) as ex:
        list(ex.map(cpu_chunk, [CHUNK] * N))

if __name__ == "__main__":
    print("switch interval:", sys.getswitchinterval())
    bench("serial", serial)
    bench("threads (GIL)", threaded)
    bench("processes", multiprocess)
```

在 CPython 上，**`threaded` 往往接近 `serial`**，而 **`multiprocess` 可接近线性加速**——这就是 GIL 对 CPU 密集 Python 代码的经典影响。I/O 密集任务请不要照搬此结论，应使用 `asyncio` 或多线程阻塞 I/O。

## 构建与参与（开发者向）

从源码构建 CPython（Unix /macOS 典型流程）：

```bash
git clone https://github.com/python/cpython.git
cd cpython

# macOS 通常已有 clang；Linux 需 build-essential
./configure --enable-optimizations   # PGO，构建更慢，运行更快
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

./python -c "import sys; print(sys.version)"
./python -m test -j4   # 运行回归测试（耗时）
```

参与途径：

- **PEP**（Python Enhancement Proposal）：新语法与/stdlib 改动的设计文档
- **GitHub Issues / PR**：[devguide.python.org](https://devguide.python.org/) 描述贡献流程
- **InternalDocs/**：源码树内维护的解释器、编译器内部文档

## 与周边生态的关系

| 项目 | 关系 |
|------|------|
| **PyPI** | 包索引；轮子（wheel）常含 CPython 版本的 C 扩展 `.so` |
| **pip** | 纯 Python 工具，在 CPython 上安装依赖 |
| **PyPy** | 替代实现，兼容大部分 CPython 语义，JIT 更快 |
| **Cython / pybind11 / Rust PyO3** | 生成或编写 CPython C API 扩展 |
| **[[openjdk]]** | 同为「语言规范 + 参考 VM」模式；对比可理解字节码、GC、GIL vs JVM 线程模型 |
| **[[v8]]** | JS 引擎；同样有分层 JIT，但 CPython 长期以解释器为主（3.11+ 特化加速） |

## 常见误区

1. **「Python 等于 CPython」**——语言是规范；MicroPython、PyPy 也是 Python，但行为细节可能不同
2. **「多线程永远没用」**——I/O 等待会释放 GIL；`threading` 仍适合阻塞 I/O 与 GUI 回调
3. **`.pyc` 是机器码」**——仍是字节码，需解释器执行；不是 CPU 直接跑的 native code
4. **`del x` 立刻 free 内存」**——`del` 减少引用；回收时机取决于引用计数与 `gc`
5. **「去掉 GIL 就自动快 N 倍」**——free-threaded 有锁与缓存竞争成本；需基准测试与实际版本验证

## 学习路径建议

1. **会用**：安装 Python 3.12+，熟悉 `venv`、`pip`、`python -m`
2. **会读**：`dis.dis`、`inspect.getsource`、`-X importtime` 看导入耗时
3. **会调**：`cProfile`、`tracemalloc`、`py-spy` 采样；理解 GIL 与 I/O
4. **会挖**：读 `Objects/listobject.c`、`Python/ceval.c` 片段；配合 Anthony Shaw《CPython Internals》
5. **会跟**：每年看 [What's New in Python](https://docs.python.org/3/whatsnew/) 与 3.11 特化解释器、3.13 free-threading 进展

## 小结

CPython 是 Python 生态的**默认运行时**：把你的源码经词法/语法分析、编译成字节码，再在**栈式虚拟机**里执行，用**引用计数 + 循环 GC** 管理对象，用 **GIL** 协调多线程。零基础记住一条链：**`.py` → AST → bytecode → `code object` → eval loop → `PyObject*`**。往上是 NumPy、Django、PyTorch；往下是 C API、解释器优化与 PEP 演进。把 CPython 当成「自带菜谱库、默认单灶火力的中央厨房」，学习曲线就会清晰很多。
