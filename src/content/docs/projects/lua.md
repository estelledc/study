---
title: Lua — 极简嵌入式语言
来源: 'https://github.com/lua/lua'
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**Lua** 是 1993 年由巴西[Pontifical Catholic University](https://www.puc-rio.br/)（PUC-Rio）团队创造的一门**轻量级、可嵌入的脚本语言**。当前最新版本是 5.5.0（2025-12-22 发布）。它用纯 C 实现，语法简洁到核心手册不到 100 页——对编程零基础的人来说，它是"看起来最不像编程的东西"之一。

日常类比：

- 如果把 **Python** 想成一部功能齐全的智能汽车（自动驾驶、空调、大屏导航），那 **Lua** 就像一把**瑞士军刀**——没有花哨功能，但刀叉、开瓶器、小刀片全都有，而且你能把它塞进任何口袋
- 或者更贴切地说：Lua 是任何应用程序都可以随身携带的"**万能插件接口**"。你想让 Photoshop 用脚本批量修图？Lua。想让游戏《魔兽世界》的 UI 可定制？Lua。想让 Redis 执行原子脚本？Lua。想让 Nginx 做动态路由？Lua（OpenResty）

## 核心概念

### 1. 一切皆"表"——一种数据结构

Lua 只有一种**原始数据结构**：`table`（表）。它同时扮演其他语言里多种角色的工作：

| 其他语言 | Lua 的表 |
|---|---|
| 数组（Array） | 下标从 1 开始的表 |
| 字典/哈希（Dictionary/HashMap） | 字符串或任意类型当键的表 |
| 对象/结构体（Object/Struct） | 字段是键、方法是对应的函数 |
| 集合（Set） | 只用键、值为 `true` 的表 |

这个设计被称为"一切皆表"，意味着你不需要记住十几种容器类型——一种结构走天下。

### 2. 所有变量默认全局——但有本地变量

Lua 里如果一个变量**没声明**就赋值，它会直接成为**全局变量**：

```lua
x = 10  -- 全局变量 x
```

这看起来像"陷阱"，但 Lua 提供了一个关键字 `local` 来创建**局部变量**（类似 Python 的函数内变量、C 的局部变量）：

```lua
local y = 20  -- 局部变量，只在当前块有效
```

最佳实践：**始终用 `local`**——这就像在房间里说话（局部）还是对着大喇叭喊（全局）的区别。

### 3. 下标从 1 开始

Lua 的数组索引从 **1** 开始（不是 0）。这是它最著名的"反常规"设计，创始人 Roberto Ierusalimschy 的解释是：**对非技术人员来说，"第 1 行"比"第 0 行"更符合直觉**。

### 4. 真正的 nil

Lua 里有一个 `nil` 值，表示"不存在"。如果把一个变量的值设为 `nil`，就等同于**删除**了它：

```lua
local t = {a = 1, b = 2}
t.a = nil  -- 等同于删除了 key "a"
```

## 代码示例

### 示例 1：基础语法——变量、控制流、函数

这个例子展示了 Lua 最基础的三样东西：变量赋值、条件判断、循环和函数定义：

```lua
-- 1. 变量和类型
local name = "Lua"           -- 字符串
local version = 5.5           -- 数字（Lua 不分整数和浮点数）
local is_embeddable = true    -- 布尔值
local nothing = nil           -- 空值

-- 2. 条件判断（注意：用 then / end 包裹，不用大括号）
if is_embeddable then
    print(name .. " 可以被嵌入任何程序")
elseif version < 5 then
    print("版本太旧")
else
    print("默认分支")
end

-- 3. 循环：for 从 1 到 3（含）
for i = 1, 3 do
    print("计数: " .. i)
end

-- 4. 函数定义（函数是一等公民，可以赋值给变量）
local function greet(person)
    return "你好, " .. person .. "!"
end

print(greet(name))  -- 输出: 你好, Lua!
```

**关键点拆解：**

- `..` 是**字符串连接符**（不是 `+`，那是给数字用的）
- `do ... end` 是代码块——每层 `if`、`for`、`function` 都必须用 `end` 闭合
- `local function` 定义局部函数，不加 `local` 就是全局函数

### 示例 2：表（Table）——Lua 最核心的数据结构

这个例子展示了如何用一张表同时做字典、对象和"类"：

```lua
-- 1. 创建一个表（像一个万能盒子）
local person = {
    name = "田中太郎",
    age = 30,
    hobbies = {"读书", "编程", "摄影"},  -- 嵌套的表当数组用
}

-- 2. 访问和修改
print(person.name)       -- 输出: 田中太郎
person.age = 31          -- 修改现有字段
person.city = "东京"      -- 新增字段（之前不存在，自动创建）

-- 3. 遍历表的每一个字段
for key, value in pairs(person) do
    print(key .. ": " .. tostring(value))
end

-- 4. 给表"绑定方法"——这就是 Lua 的面向对象方式
local car = {
    brand = "Toyota",
    speed = 0,
}

-- 把函数放进表里当方法
function car:speed_up(by)
    self.speed = self.speed + by
    print(self.brand .. " 加速到 " .. self.speed .. " km/h")
end

function car:brake(by)
    self.speed = math.max(0, self.speed - by)  -- 不能低于 0
    print(self.brand .. " 减速到 " .. self.speed .. " km/h")
end

-- 调用方法（用冒号: 会自动传入 self）
car:speed_up(30)  -- 输出: Toyota 加速到 30 km/h
car:speed_up(20)  -- 输出: Toyota 加速到 50 km/h
car:brake(15)     -- 输出: Toyota 减速到 35 km/h
```

**关键点拆解：**

- `table[key]` 和 `table.key` 都能访问字段——后者更简洁，但键名必须是合法标识符（不能是数字或以数字开头）
- `pairs(t)` 遍历表的所有键值对
- `self` 是冒号 `:` 语法糖——`car:speed_up(30)` 等价于 `car.speed_up(car, 30)`，`self` 就是 `car` 本身
- `math.max(0, ...)` 是 Lua 标准库的数学函数，确保速度不低于 0

### 示例 3：模块与加载——让代码可复用

```lua
-- 假设保存为 math_utils.lua
local M = {}  -- M 代表 Module，约定俗成的写法

function M.add(a, b)
    return a + b
end

function M.multiply(a, b)
    return a * b
end

function M.factorial(n)
    if n <= 1 then
        return 1
    end
    return n * M.factorial(n - 1)  -- 递归调用
end

return M  -- 对外暴露这个表
```

在另一个文件中加载：

```lua
local math_utils = require("math_utils")
print(math_utils.add(3, 5))        -- 输出: 8
print(math_utils.factorial(5))     -- 输出: 120
```

`require` 是 Lua 的模块加载器——它确保同一个模块**只加载一次**，后续调用直接返回缓存结果。`M` 是约定：把想对外暴露的函数和变量放进它，最后 `return M`。

## 为什么 Lua 值得学

对嵌入式场景而言，Lua 有几个几乎**无法被替代**的优势：

- **极小体积**——解释器核心（lua.c + 标准库）编译后不到 300KB，比大多数单张 PNG 图片还小
- **与 C 无缝互操作**——Lua 的设计目标就是让 C 程序能轻松"调用脚本"。主程序用 C 写核心逻辑，用户逻辑用 Lua 写——像游戏引擎让 Mod 作者用 Lua 改玩法
- **纯 C 实现、无第三方依赖**——能在嵌入式 Linux、RTOS、甚至没有操作系统的单片机上编译运行
- **动态类型 + 自动内存管理（垃圾回收）**——不用手动 `malloc/free`，对初学者友好，也不会像 Python 那样内存开销巨大
- **一门语言解决多种数据结构问题**——一个 `table` 搞定数组、字典、对象、集合，减少学习成本

## 常见应用场景

- **游戏 Mod 系统**——《魔兽世界》、《GTA V》（LUA mod）、`LÖVE` 游戏框架
- **Web 服务器脚本层**——OpenResty（Nginx + Lua）、Skynet 游戏服务器框架
- **数据库脚本**——Redis 的 `EVAL` 命令执行 Lua 脚本保证原子性
- **配置与扩展**——Neovim（编辑器配置）、Wireshark（协议解析器）、ImageMagick（图像处理管道）

## 下一步

- 官方文档：<https://www.lua.org/manual/5.5/>
- 在线交互式练习：<https://www.lua.org/demo.html>
- 经典教程书 *Programming in Lua*（PIL4）：<https://www.lua.org/pil/>
