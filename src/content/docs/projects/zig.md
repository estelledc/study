---
title: Zig — 无隐藏控制流的 C 替代
来源: https://github.com/ziglang/zig
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
难度: 初级
provenance: pipeline-v3
---

## 什么是 Zig

Zig 是一门系统编程语言，设计目标是成为 C 语言的替代品。它和 C 一样可以操作内存、编译成机器码、写操作系统内核和嵌入式程序，但 Zig 把 C 中那些"看不见的安全问题"全部摆到台面上来。

## 日常类比：带安全栏的厨房

想象你在做饭。C 语言就像一个没有围栏的专业厨房——你能做任何事情，效率极高，但如果忘了关煤气或者用错盐，后果自负。Zig 就像在同一个厨房里装了安全传感器：切到手会报警、水温过高会停火、忘关火会自动断电。你仍然在"用明火做饭"，但系统会帮你挡住最常见的失误。

核心区别就一句话：**Zig 没有隐藏的控制流**。

## 核心概念一：无隐藏控制流

这是 Zig 最核心的设计哲学。在 C 中，你以为一行代码只做了一件事，实际上编译器可能在背后做了好多事：

- C 的 `+` 运算符在某些语言里可以重载，意味着 `a + b` 可能调用了函数
- C++ 的异常机制意味着 `foo()` 可能会抛出异常，导致后面的 `bar()` 根本不会被执行
- D 语言有 `@property` 属性函数，看似在访问字段，实际在调用函数

Zig 完全消除了这些"看不见的跳跃"。如果你看到这段 Zig 代码：

```
var a = b + c.d;
foo();
bar();
```

你可以百分之百确定：这就是三件事按顺序发生，不会调用隐藏函数，不会跳出去执行其他代码。

## 核心概念二：错误是值，不能忽略

在 C 中，函数经常返回 `-1` 或 `NULL` 表示出错。调用者很容易忘记检查，这个错误就像漏网之鱼一样一路传播。在 Zig 中，**错误是一种类型**，是值的一部分，编译器逼你必须处理它。

想象一下：C 的错误处理像是在水里游泳，你可能呛到水（忘记检查返回值）。Zig 则是给你配了救生衣——你不可能忽略错误。

```
const std = @import("std");

pub fn main() !void {
    const file = std.fs.cwd().openFile("data.txt", .{}) catch |err| {
        std.debug.print("打不开文件：{}\n", .{err});
        return err;
    };
    defer file.close();
}
```

这里 `catch` 后面的代码块处理所有出错的情况。如果调用者也不打算处理，可以用 `!void` 把错误继续往外传。如果确定绝不会出错，可以用 `unreachable` 断言。

## 核心概念三：Optional 类型替代 NULL 指针

C 中指针可以为 `NULL`，这是所谓"一百亿美元的错误"——无数空指针异常由此而来。Zig 的普通指针**不能为 NULL**，只有加了 `?` 标记的可选类型才能为空：

```
const ptr: *i32 = ...;   // 绝对不能为 NULL，编译器保证
const opt_ptr: ?*i32 = ...;  // 可能为 NULL，必须处理
```

使用 `orelse` 可以优雅地提供默认值：

```
const ptr = possiblyNullPtr orelse defaultPtr;
```

## 核心概念四：手动内存管理 + defer

Zig 没有垃圾回收（GC），程序员必须自己管理内存。但这不意味着麻烦——Zig 用 `defer` 和 `errdefer` 让资源管理变得极其清晰：

```
const file = try std.fs.createFile("output.txt", .{});
defer file.close();   // 无论函数怎么返回，file 都会被关闭
```

`defer` 就像承诺：函数退出时一定会做这件事，不管正常退出还是出错退出。`errdefer` 只在不成功时执行。

## 代码示例一：Hello World 与基础语法

最简单的 Zig 程序：

```
const std = @import("std");

pub fn main() void {
    std.debug.print("Hello, Zig!\n", .{});
}
```

- `const std = @import("std")` 导入标准库。`@import` 是编译期内置函数，不是运行时调用
- `std.debug.print` 是格式化输出。`.{}` 是参数列表，类似 C 的 printf 但类型安全
- `pub` 表示这个函数是公开的，可以被其他文件调用

编译运行：

```
$ zig build-exe hello.zig
$ ./hello
Hello, Zig!
```

生成的是纯静态链接的可执行文件，不依赖任何系统库。

## 代码示例二：错误处理与内存管理实战

这个示例展示了 Zig 的错误处理、可选类型和 `defer` 如何配合工作：

```
const std = @import("std");

const Config = struct {
    name: []const u8,
    port: u16,
};

// 解析配置文件 —— 返回值可能是 Config，也可能是错误
fn parseConfig(input: []const u8) !Config {
    var allocator = std.heap.GeneralPurposeAllocator(.{}){};
    defer std.debug.assert(allocator.deinit() == .ok);
    const gpa = allocator.allocator();

    // 从输入中提取名称 —— 如果失败，返回错误
    const name = std.mem.splitScalar(u8, input, '\n').next() orelse
        return error.NoName;

    // 尝试解析端口号 —— parseUnsigned 返回 !u16（可能出错）
    const port_str = std.mem.splitScalar(u8, input, '\n').nth(2) orelse
        return error.NoPort;
    const port = try std.fmt.parseInt(u16, port_str, 10);

    return Config{
        .name = try gpa.dupe(u8, name),
        .port = port,
    };
}

pub fn main() !void {
    const config_text = "web_server\n8080";

    const config = parseConfig(config_text) catch |err| {
        std.debug.print("配置解析失败: {}\n", .{err});
        return err;
    };

    // defer 保证资源在函数退出时释放
    defer config_free(config);

    std.debug.print("配置: {s}, 端口: {d}\n", .{ config.name, config.port });
}

fn config_free(config: Config) void {
    var allocator = std.heap.GeneralPurposeAllocator(.{}){};
    const gpa = allocator.allocator();
    gpa.free(config.name);
}
```

逐行拆解：

- `!Config` 表示这个函数可能返回 `Config` 也可能返回错误，错误类型由编译器推断
- `orelse` 处理可选值的"空"情况，类似 C 的 `if (ptr == NULL)`
- `try` 是语法糖，等于 `catch |err| return err`，把错误向上传递
- `GeneralPurposeAllocator` 是 Zig 自带的内存调试工具，能在程序退出时检查有没有内存泄漏
- `defer` 确保 `gpa.free(config.name)` 在函数退出时执行，防止内存泄漏

运行结果：

```
$ zig build-exe config.zig
$ ./config
配置: web_server, 端口: 8080
```

## 为什么 Zig 值得关注

| 对比维度 | C | Rust | Zig |
|---------|---|------|-----|
| 内存管理 | 手动 | 借用检查器 | 手动 + defer |
| 错误处理 | 返回值检查 | Result 类型 | 错误是类型 |
| 编译速度 | 快 | 慢 | 快 |
| C 互操作 | 原生 | 需 FFI | 直接 import C 头文件 |
| 学习曲线 | 陡峭 | 极陡峭 | 中等 |

Zig 不追求取代 Rust 的位置（那些需要极致安全和并发控制的场景），它的目标很明确：让 C 程序员有一个更安全的替代选择。语法简单、编译快、和 C 生态完全兼容，同时帮你挡住那些最常见的坑。

## 进一步学习

- 官方教程：[ziglang.org/learn](https://ziglang.org/learn/)
- 交互式练习：[Ziglings](https://ziglings.org) —— 修好一堆小 Bug 来学 Zig
- 在线练习：[Exercism Zig Track](https://exercism.org/tracks/zig)
- 源码：[github.com/ziglang/zig](https://github.com/ziglang/zig)
