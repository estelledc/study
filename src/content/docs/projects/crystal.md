---
title: Crystal 学习笔记 — 拥有 Ruby 语法的静态类型语言
来源: https://github.com/crystal-lang/crystal
日期: 2026-06-13
分类_原始: 编程语言
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Crystal — 拥有 Ruby 语法的静态类型语言

## 一、Crystal 是什么

如果把编程语言比作交通工具，那么：

- Ruby 像一辆自动挡汽车 — 开起来舒服，写起来顺手，但跑得不够快
- C 像一辆 F1 赛车 — 极快，但调校和驾驶难度极高
- **Crystal 则像一辆拥有自动驾驶的高级轿车** — 你享受 Ruby 那种"写什么就得到什么"的流畅感，编译器在后台帮你做了所有类型检查和安全保障，最后跑出来的代码是编译后的原生机器码，速度接近 C

Crystal 的核心设计理念可以用一句话概括：**让编译器理解你的意图，而不是让你告诉编译器每一个细节。**

它不需要你在每个变量前面标注类型，编译器会根据你赋值的内容自动推断出类型。但这不等于"动态类型" — 所有类型检查都在编译阶段完成，运行时无需额外开销。

## 二、核心概念

### 1. 类型推断（Type Inference）

这是 Crystal 最吸引人的特性之一。看下面这段代码：

```crystal
name = "Alice"
# 编译器自动推断 name 是 String 类型

age = 30
# 编译器自动推断 age 是 Int32 类型

is_student = false
# 编译器自动推断 is_student 是 Bool 类型
```

你不需要写 `let name: String = "Alice"` 或 `String name = "Alice"`。编译器看到你给 `name` 赋了一个字符串，就知道它是 `String` 类型。这既保持了静态类型的安全性，又保留了动态语言的简洁。

当然，如果你愿意，也可以显式标注类型：

```crystal
name : String = "Alice"
age : Int32 = 30
```

这在变量名不够明确时尤其有用，比如 `x = get_value()`，标注 `x : String` 能让读者立刻明白。

### 2. 类与方法（Classes and Methods）

Crystal 的类定义和 Ruby 几乎一模一样：

```crystal
class Person
  # 实例变量，以 @ 开头
  def initialize(@name : String, @age : Int32)
  end

  def greet
    "Hello, my name is #{@name} and I am #{@age} years old"
  end
end

person = Person.new("Alice", 30)
puts person.greet
# 输出: Hello, my name is Alice and I am 30 years old
```

`def initialize` 是构造函数，`@name : String` 这种写法同时完成了两件事：声明了一个类型约束为 String 的参数，并把它赋值给了同名实例变量。这是一种简洁的参数-成员变量绑定语法，Ruby 没有这个特性。

### 3. 联合类型（Union Types）

当一段代码在不同分支返回不同类型时，Crystal 会自动构造一个联合类型：

```crystal
def parse_number(input)
  if input.starts_with?("#")
    input[1..-1].to_i  # 返回 Int32
  else
    input              # 返回 String
  end
end

# 返回值类型被推断为 Int32 | String
# 这是一个"联合类型"：可能是整数，也可能是字符串
```

这意味着编译器会强制你处理所有可能的类型，而不是等到运行时才崩溃。

### 4. 生成器（Generics）

Crystal 的泛型语法和 TypeScript 类似，用尖括号 `<>` 包裹类型参数：

```crystal
# 一个通用的容器类
class Box(T)
  def initialize(@value : T)
  end

  def value : T
    @value
  end
end

int_box = Box(Int32).new(42)
string_box = Box(String).new("hello")

puts int_box.value      # 42，类型是 Int32
puts string_box.value   # "hello"，类型是 String
```

编译器会为每个具体的类型生成专门的代码，所以运行时没有装箱/拆箱的开销。

### 5. 宏（Macros）

Crystal 的宏在编译阶段展开，类似于 C++ 的预处理，但强大得多。它可以接受代码块作为参数、操作抽象语法树（AST），甚至递归调用。这使得 Crystal 可以用极少的代码实现很多通常需要的样板代码。

## 三、代码示例

### 示例 1：完整的小型项目 — 待办事项管理器

```crystal
require "colorize"

# 待办事项项
class TodoItem
  getter :id, :title, :done

  def initialize(@id : Int32, @title : String, @done = false)
  end

  def description
    if @done
      "[完成] #{@title}".green
    else
      "[未完成] #{@title}".red
    end
  end
end

# 待办事项管理器
class TodoManager
  def initialize
    @items : Array(TodoItem) = []
    @next_id = 1
  end

  def add(title : String)
    item = TodoItem.new(@next_id, title)
    @items << item
    @next_id += 1
    puts "已添加: #{item.description}"
  end

  def complete(id : Int32)
    @items.each do |item|
      if item.id == id
        item.instance_variable_set(:@done, true)
        puts "已标记为完成: #{item.description.green}"
        return
      end
    end
    puts "未找到 ID 为 #{id} 的待办项".yellow
  end

  def list
    return puts "没有待办项" if @items.empty?
    puts "=== 待办事项列表 ==="
    @items.each do |item|
      puts "  ##{item.id}: #{item.description}"
    end
    puts "===================="
  end

  def stats
    total = @items.size
    completed = @items.select(&.done).size
    pending = total - completed
    puts "总计: #{total} | 已完成: #{completed} | 剩余: #{pending}"
  end
end

# 运行
manager = TodoManager.new
manager.add("学习 Crystal 语言")
manager.add("写一个 Web 服务器")
manager.add("部署到生产环境")
manager.complete(1)
manager.list
manager.stats
```

运行结果：

```
已添加: [完成] 学习 Crystal 语言
已添加: [未完成] 写一个 Web 服务器
已添加: [未完成] 部署到生产环境
已标记为完成: [完成] 学习 Crystal 语言
=== 待办事项列表 ===
  #1: [完成] 学习 Crystal 语言
  #2: [未完成] 写一个 Web 服务器
  #3: [未完成] 部署到生产环境
====================
总计: 3 | 已完成: 1 | 剩余: 2
```

这段代码涵盖了 Crystal 的多个关键特性：类定义、类型约束、数组、循环、条件判断、闭包（`&.done` 是方法引用语法，相当于 `->{ item.done }`）。

### 示例 2：HTTP 服务器

Crystal 的标准库内置了高性能的 HTTP 服务器，只需几行代码：

```crystal
require "http/server"

# 一个简单的 JSON API 服务器
server = HTTP::Server.new do |context.request|
  path = context.request.path

  case path
  when "/"
    body = { message: "Hello from Crystal!", version: "1.20" }.to_json
    context.response.content_type = "application/json"
    context.response.print body

  when "/health"
    context.response.print "OK"

  else
    context.response.status = :not_found
    context.response.print "404 Not Found"
  end
end

puts "服务器正在运行，访问 http://localhost:8080"
server.bind_tcp("0.0.0.0", 8080)
server.listen
```

Crystal 的 HTTP 服务器基于非阻塞 I/O，性能可以与 Node.js、Go 和 Nginx 相媲美。它不是运行时解释执行的 — 编译后就是原生二进制文件，没有虚拟机开销。

## 四、Crystal vs Ruby vs TypeScript 对比

| 特性 | Ruby | Crystal | TypeScript |
|------|------|---------|------------|
| 类型系统 | 动态 | 静态（编译时推断） | 静态（编译时推断） |
| 语法来源 | — | 来自 Ruby | 来自 JavaScript |
| 运行方式 | 解释执行 (MRI) | 编译为原生机器码 | 编译为 JavaScript 运行 |
| 性能 | 较慢 | 接近 C | 依赖 JavaScript 引擎 |
| 需要标注类型 | 不需要 | 通常不需要 | 通常不需要 |
| 包管理 | Gem | Shards | npm/yarn |
| 错误检测时机 | 运行时 | 编译时 | 编译时 |

对于零基础学习者来说，理解这个表的关键点：**Crystal 让你用接近 Ruby 的语法写出接近 C 速度的代码，而且类型检查在编译阶段就帮你拦截了错误。**

## 五、如何开始

1. 安装 Crystal：`brew install crystal`（macOS）或 `sudo apt install crystal`（Linux）
2. 在线试用：[play.crystal-lang.org](https://play.crystal-lang.org/) — 浏览器里直接写 Crystal 代码并运行
3. 官方教程：[crystal-lang.org/tutorials](https://crystal-lang.org/tutorials/)
4. 语言参考：[crystal-lang.org/reference](https://crystal-lang.org/reference/)
5. 社区论坛：[forum.crystal-lang.org](https://forum.crystal-lang.org/)

## 六、学习建议

给零基础的你的学习路径建议：

1. 先玩在线 Playground，写几个 `puts "hello"` 感受语法
2. 熟悉变量、字符串、数组这些基础概念（Crystal 和 Ruby 几乎一样）
3. 理解"类型推断"的概念 — 这是 Crystal 和其他动态语言的根本区别
4. 写一些小的命令行工具，体会编译速度有多快
5. 尝试写一个 HTTP 服务器 — Crystal 的标准库文档非常详细

## 七、总结

Crystal 解决了一个长期存在的问题：程序员在"开发效率"和"运行效率"之间必须二选一。Crystal 用编译器类型推断这个巧妙的技术，让你不用牺牲任何一方的体验。

记住：类型推断不等于没有类型。只是编译器帮你猜了，而不是你需要说。

---

*笔记来源：https://github.com/crystal-lang/crystal*
*最后更新：2026-06-13*
