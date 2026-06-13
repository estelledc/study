---
title: Elixir — BEAM 上的现代语言
来源: https://github.com/elixir-lang/elixir
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Elixir — BEAM 上的现代语言

## 一、Elixir 是什么

Elixir 是一门**动态的、函数式的编程语言**，运行在 **BEAM 虚拟机**之上。BEAM 是 Erlang 虚拟机的名字（以创始人名字命名）。这意味着 Elixir 代码最终会被编译成 BEAM 字节码，和 Erlang 程序共享同一个运行时。

> **日常类比**：如果把编程语言比作方言，Elixir 就像是用优雅的现代普通话说话，但它的"身体"（BEAM 虚拟机）是几十年前就建好的、极其可靠的老房子。这栋房子以"永不宕机"闻名——它支撑着电信交换机、移动支付系统（比如 M-Pesa 服务十亿用户），Elixir 继承了这份遗产。

### 为什么值得学

- **并发生而优越**：BEAM 的设计目标就是支撑百万级并发连接，Elixir 的进程模型让并发写作自然之事
- **容错哲学**："Let it crash"——允许进程出错，由监督树自动重启，而不是用 try-catch 包裹一切
- **函数式但不是纯函数式**：Elixir 鼓励用函数组合解决大部分问题，但也坦然使用状态（通过进程而非可变变量）
- **与 Erlang 互通**：可以直接调用 Erlang 的标准库，无需桥接

---

## 二、核心概念

### 1. 函数是第一等公民

Elixir 中，函数是"一等公民"——可以赋值给变量、作为参数传递、从其他函数返回。所有函数都定义在**模块（Module）**中。

```elixir
# 定义模块和函数
defmodule Math do
  def add(a, b) do
    a + b
  end
end

# 调用：模块名.函数名(参数)
Math.add(3, 5)  # => 8
```

### 2. 模式匹配（Pattern Matching）

这是 Elixir 最让初学者"哇"的概念。`=` 不是赋值，而是**匹配**。左边和右边的值必须"对得上"。

```elixir
# 成功匹配
x = 42
x  # => 42

# 直接匹配具体值
42 = x  # => 42，完全合法
# 反过来不成立：3 = x 会报错，因为 x 已经是 42

# 列表解构
[a, b, c] = [1, 2, 3]
a  # => 1
b  # => 2
c  # => 3

# 忽略不感兴趣的值
[first | rest] = [1, 2, 3, 4]
first  # => 1
rest   # => [2, 3, 4]
```

> **日常类比**：模式匹配就像拼图——你拿一块拼图片（右边的值）去和左边的图案匹配。如果形状对得上，就成功；对不上，就报错。

### 3. 进程（Process）

Elixir 的"进程"不是操作系统进程，而是**超轻量级的用户态线程**。在 BEAM 上，几十万甚至上百万个并发进程同时运行是常态。每个进程：

- 有独立的内存（互不共享）
- 通过消息传递通信
- 崩溃不影响其他进程

### 4. 不可变数据

变量一旦被绑定就不能更改。想要"改变"数据，实际上是创建了一个**新的数据副本**。

```elixir
count = 10
# count = 20  # 不允许！会报 "variable count is unused" 或匹配错误
new_count = count + 5  # => 15，这是新变量
```

---

## 三、代码示例

### 示例 1：基础语法与数据处理

```elixir
# 定义一个模块
defmodule Greeter do
  def greet(name) do
    "Hello, #{name}!"
  end

  # 模式匹配做函数重载
  def greet do
    "Hello, World!"
  end
end

Greeter.greet("Elixir")  # => "Hello, Elixir!"
Greeter.greet()          # => "Hello, World!"

# 管道操作符：把数据"流"过一连串的变换
names = ["Alice", "Bob", "Charlie"]
names
|> Enum.map(fn name -> String.upcase(name) end)
|> Enum.join(", ")
# => "ALICE, BOB, CHARLIE"

# 管道操作符让你"读起来像 sentences"
# 先 map 转大写，再 join 成字符串
```

管道操作符 `|>` 把左边表达式的结果，作为**第一个参数**传给右边的函数。这是 Elixir 代码风格的核心标志——数据像水流一样经过管道中的每一个处理步骤。

### 示例 2：并发进程与消息传递

```elixir
# 创建一个简单的"计数器"进程
defmodule Counter do
  def start_link do
    # 启动一个进程，初始值为 0
    Task.start_link(fn -> loop(0) end)
  end

  defp loop(count) do
    receive do
      :inc ->
        loop(count + 1)
      {:get, sender} ->
        send(sender, count)
        loop(count)
      {:set, new_count} ->
        loop(new_count)
    end
  end

  # 对外接口
  def increment(pid) do
    send(pid, :inc)
  end

  def get(pid) do
    send(pid, {:get, self()})
    receive do
      value -> value
    end
  end
end

# 使用
{:ok, pid} = Counter.start_link()
Counter.increment(pid)
Counter.increment(pid)
Counter.get(pid)  # => 2

# 这个进程在后台默默运行，即使创建它的函数已经返回
```

> **日常类比**：想象一个信箱系统。每个 Elixir 进程有一个信箱（mailbox）。你往信箱塞信（`send`），不需要等对方拆信——塞完就走。对方什么时候拆信、拆几封，完全由对方决定。这就是"异步消息传递"。

### 示例 3：监督树（Supervision Tree）

```elixir
# 用 Supervisor 管理子进程
defmodule MyApp do
  use Supervisor

  def start_link do
    Supervisor.start_link(__MODULE__, :ok)
  end

  def init(:ok) do
    children = [
      # Worker 进程列表
      {Task, fn ->
        # 如果这个进程挂了，Supervisor 会自动重启它
        :timer.sleep(:infinity)
      end}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end
```

`strategy: :one_for_one` 意思是：如果一个子进程挂了，只重启那个进程，不影响其他。BEAM 上最著名的哲学 **"Let it crash"** 正是通过 Supervision Tree 实现的——与其预防错误，不如让错误快速暴露、快速恢复。

---

## 四、与主流语言的对比

| 特性 | JavaScript | Python | Elixir |
|------|-----------|--------|--------|
| 编程范式 | 多范式 | 多范式 | 函数式 |
| 并发模型 | 事件循环（单线程） | GIL 限制 | 百万级轻量进程 |
| 错误处理 | try-catch / Promise | try-except | Let it crash + 监督树 |
| 数据类型 | 动态 | 动态 | 动态，不可变 |
| 运行环境 | V8 等 | CPython | BEAM VM |
| 适用场景 | Web 前端/全栈 | 数据科学/AI | 高并发/电信/实时系统 |

---

## 五、Elixir 的生态系统

- **Phoenix**：最著名的 Elixir Web 框架，以高性能和实时功能著称（WebSocket、Channels）
- **Hex.pm**：Elixir 的包管理器（类似 npm / PyPI），有数万包
- **Mix**：内置的构建工具（类似 `npm` + `Makefile`），管理依赖、编译、测试一站式
- **IEx**：交互式开发环境，输入一行代码立刻看到结果
- **Erlang/OTP**：底层可调用 Erlang 库，覆盖分布式系统、RPC、消息队列等几乎所有基础设施

---

## 六、下一步

1. **安装 Elixir**：`brew install elixir`（macOS）
2. **进入 IEx**：运行 `iex`，尝试输入 `1 + 1`
3. **官方教程**：https://elixir.hexdocs.pm/introduction.html（"Getting Started"系列是最佳起点）
4. **写第一个 Mix 项目**：`mix new my_app`

> **一句话总结**：Elixir 是一门"为大规模并发而生"的函数式语言，它不试图在语法上创新，而是把 BEAM 虚拟机几十年积累的容错、并发、热更新能力以优雅的方式暴露给你。学习 Elixir，本质上是在学习一套"用进程和消息构建可靠系统"的思维模式。
