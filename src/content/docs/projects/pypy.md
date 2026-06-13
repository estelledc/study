---
title: PyPy — RPython 写的 Python JIT
来源: https://github.com/pypy/pypy
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**PyPy** 是 [pypy/pypy](https://github.com/pypy/pypy) 维护的 **Python 语言替代实现**，核心卖点不是「又一个解释器」，而是自带 **Tracing JIT（跟踪式即时编译器）**，在 CPU 密集的纯 Python 循环上常常比官方 **CPython** 快 **数倍到数十倍**。整个项目的主体用 **RPython**（Restricted Python，受限 Python 子集）写成，再经 **翻译工具链（translation toolchain）** 自动降到 C，并在翻译阶段**生成** JIT，而不是手写一份与解释器平行的汇编后端。

日常类比：如果把 **CPython** 想成一家**中央厨房**——每道菜（每条字节码）都按固定菜谱一步步手工炒（解释执行），那 **PyPy** 更像带**品控摄像头的连锁厨房**：

- **解释器（interpreter）** 是标准流水线厨师，照常按字节码炒菜；
- **Profiler** 像店长数客流：哪道「用户菜」（app-level 循环）被点了又点，就标成 **hot loop（热循环）**；
- **Tracing** 像跟拍一整轮出菜过程：不是只拍一个 opcode，而是把「解释器连续执行多条用户字节码」的轨迹录下来；
- **JIT 编译器** 像深夜加班的配方研发部：把录像剪成「用户语言层面的循环」，优化后烙成 **机器码**，下次同样路径直接上铁板烧；
- **Guard（守卫）** 像每步前的尝味：假设「这个变量一直是 `int`」「这个列表长度不变」——一旦假设破了，立刻 **deoptimize（去优化）** 回解释器，保证语义仍与 CPython 一致。

关键反直觉点：**PyPy 团队并没有手写「Python 专用 JIT」**。他们写的是 **用 RPython 实现的 Python 解释器**，翻译器读少量 **JIT hints（提示）**，在构建期**自动生成**与解释器语义绑定的 JIT。解释器改了，JIT 跟着重生，不会两套代码各改各的——这是 PyPy 相对早期 **Psyco**（单函数 JIT 扩展）和手写 TraceMonkey 类 JIT 的架构差异。

## 为什么重要

不懂 PyPy，下面这些话题很难讲透：

- **「Python 很慢」到底慢在哪**——CPython 字节码解释 + 动态类型每次都要查；PyPy 把热路径编译成假设明确的机器码
- **为什么科学计算仍推荐 CPython + NumPy**——热点在 C 扩展里，PyPy 的 JIT 帮不上忙；且 **C API 扩展（cpyext）** 在 PyPy 上有额外桥接成本
- **Tracing JIT 和 HotSpot「按方法编译」有何不同**——PyPy 以**实际执行轨迹**为单元，天然内联一串 opcode，而不是先按函数边界切
- **RPython 是什么**——不是给用户写业务代码的方言，而是**写虚拟机、再翻译成 C** 的实现语言；PyPy 自己是「用 Python 子集写 Python」的元循环
- **JIT 如何不破坏 `pdb`、traceback、完整语义**——`jit_merge_point` 等退出点保证随时可 bail 回解释器

## 核心概念

### 1. Python 实现谱系中的位置

| 实现 | 语言 | 执行模型 | 典型场景 |
|------|------|----------|----------|
| **CPython** | C | 字节码解释器 + 可选特化（3.11+） | 默认生态、C 扩展 |
| **PyPy** | RPython → C + 生成 JIT | 解释 + tracing JIT | CPU 密集纯 Python、长时间跑的服务 |
| **GraalPy** | Java / Truffle | Truffle JIT + Polyglot | JVM 内嵌 Python |
| **MicroPython** | C | 裁剪解释器 | MCU |

说「换 PyPy 就全面更快」是误区；说「 tight loop 的纯 Python 在 PyPy 上经常快一个数量级」则有大量基准支撑。

### 2. RPython：写解释器的 Python 子集

**RPython** 不是给应用开发者用的第二门 Python，而是 **PyPy 翻译器能静态分析、类型推断并降到 C 的受限子集**。特征包括：

- 变量类型在 **控制流合并点** 上必须能推断一致；
- 容器、函数一等公民，但避免过度动态（翻译期需能落地成 C 结构）；
- 整个 **Python 解释器**（对象模型、字节码 dispatch、GC）用 RPython 描述，再 **translate** 成 C 程序。

用户写的普通 Python 脚本 **不会** 被 RPython 翻译；它们仍由生成好的 VM 解释 / JIT。RPython 面向的是 **VM 实现者**。

### 3. 翻译工具链（translation toolchain）

高层流程：

```
RPython 源码（含解释器 + stdlib 移植）
  ▼ 类型推断、限制检查
  ▼ RPython → C（或 JVM/CLI 等后端，常用 C）
  ▼ 可选：JIT 生成 pass（apply_jit / warmspot）
  ▼ 链接 → pypy3 可执行文件
```

翻译一次耗时很长（小时级），产出是 **独立二进制**，部署时不需要宿主 CPython。PyPy 自带兼容层跑大部分纯 Python 与 **cffi / ctypes**；依赖 **C API** 的扩展需 **PyPy 专用 wheel** 或接受较慢的 cpyext。

### 4. Meta-Tracing JIT：跟踪解释器，而非只跟踪用户字节码

PyPy 的 JIT 属于 **meta-tracing**：记录的是 **RPython 写的解释器** 在执行用户程序时的操作序列，再通过 **promotion / 虚拟化** 把解释器栈上的操作 **提升** 成用户级循环的机器码。

经典两提示（概念名，具体 API 在 `pypy/interpreter` 与 `interp_jit` 一带）：

| Hint | 作用 | 在 CPython 字节码模型中的直觉位置 |
|------|------|-----------------------------------|
| **`jit_merge_point`** | JIT 可安全 **退回解释器** 的合并点 | 字节码分派循环入口 |
| **`can_enter_jit`** | 标记 **用户级循环头**，可进入 JIT | 如 `JUMP_ABSOLUTE` 跳回循环顶 |

**Green 变量**（循环常量）：在一次用户指令执行中不变，例如 `pc`、当前 `code object`、字节码数组——相同 green 组合再次出现 ⇒ 可能处于同一 **用户循环**。

**Red 变量**（循环变量）：被用户程序改变的数据，如操作数栈上的值、局部变量。

Tracing 启动后，解释器进入 **tracing mode**，记录操作；当 green 状态与 trace 起点匹配，闭合成环 ⇒ 优化 ⇒ 汇编 ⇒ 后续迭代跑机器码。机器码里布满 **guard**；失败则回解释路径，必要时 **side exit** 再 **bridge** 新 trace。

### 5. 与 Method JIT（如 HotSpot C2）的对比

| 维度 | Method JIT | PyPy Tracing JIT |
|------|------------|------------------|
| 编译单元 | 函数 / 方法 | 热 **trace**（实际跑过的路径） |
| 内联 | 需显式启发式 | trace 自然串起多 opcode |
| 去优化 | 罕见路径 deopt | guard 失败即回解释器 |
| 维护 | JIT 与 VM 常分离 | **翻译期生成**，与解释器同步 |

### 6. 性能与边界

**通常更快：**

- 纯 Python 数值循环、递归、字符串处理（无 C 扩展热点）
- 长时间运行的 Web worker、批处理脚本、模拟器

**未必更快甚至更慢：**

- 重度 **NumPy / PyTorch / pandas C 扩展** 工作负载
- 短进程 CLI（JIT **预热** 来不及）
- 个别 CPython 微优化路径或依赖 CPython 内部行为的黑客代码

官方与社区经验：常见 **4×–10×** 加速，极端 tight loop 更高；I/O 密集差异小。PyPy 也有 **GIL**（与 CPython 类似的多线程模型），多进程扩展仍适用。

### 7. 生态与兼容性

- **Python 版本**：跟踪 CPython 特性节奏（如 3.10+），具体以发行说明为准
- **pip**：一般可用；**带 C 扩展的包** 需查是否提供 `pp*` 标签 wheel
- **cffi** 在 PyPy 上往往比老式 **ctypes / cpyext** 更舒服
- **调试**：完全兼容有成本；生产路径优先性能

## 架构一图

```
用户 .py
  ▼
PyPy 字节码解释器（RPython 实现，已翻译为 C）
  ├─ 冷路径：逐 opcode 解释
  └─ 热路径：can_enter_jit → trace → optimize → 机器码
         │                      │
         │ guard 失败           │ jit_merge_point
         └──────── deopt ───────┘ 回解释器
```

## 代码示例

### 示例 1：感受 PyPy 对 tight loop 的加速

保存为 `bench_loop.py`，分别用 `python3` 与 `pypy3` 运行（需先安装 [PyPy 发行版](https://pypy.org/download.html)）：

```python
"""纯 Python 累加 — 典型 PyPy 甜点负载。"""
import sys
import time

def sum_squares(n: int) -> int:
    total = 0
    for i in range(n):
        total += i * i
    return total

def main() -> None:
    n = 5_000_000
    # 预热：给 JIT 一次编译热循环的机会
    sum_squares(1000)

    t0 = time.perf_counter()
    result = sum_squares(n)
    elapsed = time.perf_counter() - t0

    print(f"implementation: {sys.implementation.name}")
    print(f"version: {sys.version.split()[0]}")
    print(f"result mod 1e9: {result % 1_000_000_000}")
    print(f"elapsed: {elapsed:.3f}s")

if __name__ == "__main__":
    main()
```

典型现象（因 CPU 而异）：**第二次起 PyPy 明显快于 CPython**；CPython 时间近似线性，PyPy 在预热后斜率更陡。短脚本只跑一次时，JIT 编译成本可能吃掉收益——对 **长驻进程** 更划算。

命令行对比：

```bash
python3 bench_loop.py
pypy3 bench_loop.py
```

### 示例 2：用 `dis` 看清「用户循环」在字节码层长什么样

PyPy JIT 的 **can_enter_jit** 锚点对应用户循环头；理解字节码有助于理解「trace 录的是什么」：

```python
import dis

def dot(a: list[float], b: list[float]) -> float:
    s = 0.0
    for i in range(len(a)):
        s += a[i] * b[i]
    return s

print("=== dot 字节码（CPython / PyPy 同一套 compile 语义）===")
dis.dis(dot)

a = [float(x) for x in range(1000)]
b = [float(x * 2) for x in range(1000)]
assert dot(a, b) == sum(x * (x * 2) for x in range(1000))
print("ok:", dot(a, b))
```

在 CPython 上你会看到 `JUMP_BACKWARD`（3.11+）或 `JUMP_ABSOLUTE` 跳回循环顶——这正是「用户级回边」。PyPy 解释器执行到这类回边且循环够热时，meta-tracer 会尝试 **展开字节码分派**，把多次 opcode 合成 **一条用户级 trace**，再生成机器码。纯 `list` 下标在 trace 里可能因 **类型稳定** 而去掉部分动态查找；若某次 `a[i]` 变成非 float 列表，**guard 失败** 回解释器。

### 示例 3：何时不该指望 PyPy（NumPy 热点在 C 里）

```python
import sys
import time

def numpy_heavy():
    import numpy as np
    x = np.random.randn(2_000_000)
    return float((x * x).sum())

if __name__ == "__main__":
    t0 = time.perf_counter()
    r = numpy_heavy()
    print(sys.implementation.name, "numpy sum:", r, "time:", time.perf_counter() - t0)
```

此例热点在 **NumPy 的 C/Fortran 内核**，不在 Python 字节码循环。PyPy 与 CPython 差距往往不大，有时因 **cpyext / 桥接** PyPy 更慢。选运行时要看 **profiler 热点在哪一层**。

## 安装与使用

```bash
# macOS / Linux 常见：下载预编译 PyPy3
# https://pypy.org/download.html

pypy3 -m venv .venv-pypy
source .venv-pypy/bin/activate
pip install -U pip wheel
pip install httpx pydantic   # 纯 Python / 有 pp wheel 的包

pypy3 -c "import sys; print(sys.implementation)"
```

开发 **PyPy 本身**（翻译 VM）是另一条深坑：clone 仓库、安装依赖、`python translate.py targetpypystandalone` 等，见官方 [dev docs](https://doc.pypy.org/en/latest/)。零基础用户先会 **用 pypy3 跑服务** 即可。

## 与周边项目的关系

| 项目 | 关系 |
|------|------|
| **[[cpython]]** | 语义基准；PyPy 追求兼容，细节差异见发行说明 |
| **Psyco** | 早期 CPython 扩展式 JIT；PyPy 团队经验演化为 meta-tracing |
| **[[graalvm]]** / GraalPy | 另一套「写 Truffle 解释器 + JVM JIT」路线 |
| **Cython / Numba** | 把热点降到 C/LLVM；与 PyPy「全自动 JIT 纯 Python」互补 |
| **cffi** | PyPy 上推荐的 C 互操作方式之一 |

## 常见误区

1. **「PyPy 是 Python 语法超集」**——用户代码仍是标准 Python；RPython 只属于 VM 源码
2. **「装 PyPy 就能让 NumPy 更快」**——除非瓶颈在纯 Python 包装层，否则未必
3. **「JIT 等于没有解释器」**——冷代码、guard 失败、调试路径仍走解释器
4. **「Tracing JIT 会编译死循环第一次迭代」**——有热度阈值；只跑一次的循环可能永远不 JIT
5. **「与 CPython 100% 相同」**——极边缘反射、内部 API、`id` 时机等可能有差异；关键业务要测

## 学习路径建议

1. **会用**：下载 PyPy，对现有纯 Python 服务做 A/B 基准（含预热）
2. **会判**：`cProfile` / `py-spy` 看热点在 Python 还是 C 扩展
3. **会读**：RPython 文档 [JIT overview](https://rpython.readthedocs.io/en/latest/jit/overview.html)、AOSA PyPy 章节
4. **会挖**：`pypy/interpreter/pyopcode.py`、`module/pypyjit` 中的 hint；对比 `Python/ceval.c`
5. **会扩展**：若做新语言 VM，了解 meta-tracing 与 **RPython 翻译器** 是否适合你的语义

## 小结

PyPy 证明了一条独特路线：**用 RPython 写 Python 解释器，翻译成 C 时自动生成 tracing JIT**，让热循环从字节码解释跃迁到带 guard 的机器码，同时保持与 CPython 接近的语义。零基础记住三句话：**用户跑的是普通 Python；快的是长时间纯 Python 热点；C 扩展主导时请仍用 CPython 或把热点降到 native**。把 PyPy 当成「会看客流、能把常点套餐烙成铁板烧的连锁厨房」，再对照 **CPython 中央厨房** 与 **GraalVM 机场枢纽**，整个 Python 实现版图就清晰了。
