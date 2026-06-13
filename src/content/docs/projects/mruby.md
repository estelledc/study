---
title: mruby — 嵌入式 Ruby 解释器
description: 轻量级 Ruby 实现，可嵌入 C/C++ 固件与游戏引擎
来源: 'https://github.com/mruby/mruby'
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**mruby** 是 [mruby/mruby](https://github.com/mruby/mruby) 维护的 **轻量级 Ruby 解释器**，语法与 Ruby 4.x 兼容，目标是符合 ISO Ruby 标准的子集，并能 **静态链接进 C/C++ 应用**。它不是「在设备上装一套 CRuby + gem」，而是像给主程序配一个 **可裁剪的脚本引擎**——你决定解释器里装哪些能力、占多少 Flash/RAM。

日常类比：如果把 **CRuby** 想成城市里完整的 **Ruby 主题乐园**（Rails、Bundler、OpenSSL、全量 stdlib 一应俱全），那 **mruby** 更像塞进微波炉说明书里的 **迷你食谱卡**：

- **体积小**——默认构建的 `libmruby.a` 可压到几百 KB 量级，适合路由器固件、IoT MCU、游戏引擎插件层；
- **可嵌入**——主程序是 C，Ruby 当「用户可改的配置脚本」，不用 fork 子进程、不用系统级 Ruby 安装；
- **可预编译**——`mrbc` 把 `.rb` 编成 `.mrb` 字节码，甚至嵌成 C 数组，部署时不必带源码；
- **能力靠 mrbgems 拼装**——正则、IO、`Enumerable` 扩展等不是「内核自带」，而是像乐高块一样在 `build_config/*.rb` 里勾选。

典型使用者包括 **mruby/c**（面向微控制器的裁剪版）、游戏引擎（如部分任天堂平台工具链）、以及需要在 **单一二进制** 里跑 Ruby 逻辑的边缘设备。

## 为什么重要

不懂 mruby，下面这些场景很难选型：

- **为什么 IoT / 嵌入式要用 Ruby 而不是 Lua**——mruby 提供 Ruby 语法与生态 familiarity，同时体积远小于 CRuby；和 Lua 一样可嵌入，但团队若已熟悉 Ruby，迁移成本更低
- **固件里如何让用户写「插件脚本」**——C 主程序 `mrb_open()` 创建虚拟机，加载 `.rb` 或预编译 `.mrb`，通过 C API 双向调用
- **为什么 `NoMethodError` 可能是「没链进 gem」**——mruby 把 CRuby 内核里的很多特性拆成 **mrbgems**；minimal 构建可能没有 `Regexp`、`Kernel#binding` 等
- **和 MicroPython、WASM 运行时如何分工**——MicroPython 占 MCU 极致裁剪；mruby 占「要 Ruby 语义 + C 嵌入」；WASM 占跨语言沙箱——mruby 是 **原生进程内脚本 VM** 路线

一句话：**mruby 把 Ruby 从「服务器语言」拉进「你的 C 程序里」。**

## 核心概念

### 1. 工具链四件套

| 工具 | 作用 | 类比 |
|------|------|------|
| `mruby` | 执行 `.rb` 或 `-b` 字节码 | 迷你 `ruby` |
| `mirb` | 交互 REPL | 迷你 `irb` |
| `mrbc` | 编译到 `.mrb` 或生成 C 字节码数组 | 迷你 `ruby -c` + 部署器 |
| `libmruby.a` | 嵌入用静态库 | 可链接的 VM 内核 |

构建流程：`git clone` → `rake` → 产物在 `bin/` 与 `build/host/lib/`。

### 2. mrb_state：一个 Ruby「小宇宙」

每个嵌入场景通常对应一个 **`mrb_state *`**——独立的堆、GC、全局常量表、异常状态。多实例 = 多宇宙，彼此隔离（类似 Lua 的 `lua_State`）。

- `mrb_open()`：带默认 gems 的完整状态
- `mrb_open_core()`：更精简，无 gems
- `mrb_close(mrb)`：释放

### 3. 执行路径：源码 vs 字节码

```
.rb 源码 ──mrbc──► .mrb 字节码 ──mrb_load_irep──► VM 执行
     │                                              ▲
     └── mrb_load_string / mrb_load_file ──────────┘
```

- **开发期**：改 `.rb` 即生效，适合迭代
- **发布期**：`mrbc app.rb` 只部署字节码，体积更小、加载更快，且可不链 `mruby-compiler` gem 以减小二进制

### 4. mrbgems：编译期功能开关

mruby 没有 CRuby 那种运行时 `gem install`。扩展在 **编译 mruby 本身** 时通过 `conf.gem` 链入：

```ruby
MRuby::Build.new do |conf|
  conf.toolchain :gcc
  conf.gembox 'default'   # 预置 gem 集合
  conf.gem core: 'mruby-socket'  # 按需追加
end
```

`default.gembox` / `stdlib.gembox` 覆盖常见开发；`minimal` 配置可裁到只剩核心，换功能 = 换构建配置后 **重编 libmruby**。

### 5. C API 双向桥接

| 方向 | 典型 API | 用途 |
|------|----------|------|
| C → Ruby | `mrb_load_string`, `mrb_funcall` | 执行脚本、调 Ruby 方法 |
| Ruby → C | `mrb_define_method`, `mrb_get_args` | 暴露原生函数给脚本 |
| 数据 | `mrb_fixnum_value`, `mrb_str_new_lit` | C 值与 `mrb_value` 互转 |

**重要**：编译扩展 C 代码时必须使用 `mruby-config --cflags`，与库构建时的 `MRB_*` 宏一致，否则可能 **静默内存布局错误**。

### 6. 与 CRuby 的关键差异（选型前必读）

| 主题 | CRuby | mruby |
|------|-------|-------|
| 部署 | 解释器 + gems + 系统库 | 静态链接进你的二进制 |
| 隐式类型转换 | `to_int` / `to_str` 等 | 基本不支持，要显式类型 |
| 模式匹配 | 完整 `case/in` |  mainly `=>` 右向赋值 |
| Refinements | 支持 | 不支持 |
| Encoding | `Encoding` 类 | 默认字节串；UTF-8 需编译选项 |
| Fiber | 可跨 Ruby 调用栈 | **不能** 在 C 函数边界内切换（类 Lua 协程） |
| Array 实例变量 | 支持 | **不支持**（省内存） |

完整列表见官方 [limitations.md](https://github.com/mruby/mruby/blob/master/doc/limitations.md)。

### 7. 架构一瞥（贡献者向）

```
源码 / 字节码
    ▼ Parser + Codegen（mruby-compiler gem）
    ▼ IRep（中间表示）
    ▼ VM 指令循环（栈式）
    ▼ 三色标记 GC +（可选）分代
```

对象用 **`mrb_value`** 编码（value boxing / NaN boxing 等，由编译配置决定）。与 CRuby 的 `VALUE` + `RStruct` 思路类似，但布局更紧凑。

## 快速上手

### 构建与运行

```bash
git clone https://github.com/mruby/mruby.git
cd mruby
rake

# 交互
./bin/mirb

# 脚本
echo 'puts "Hello, mruby!"' > hello.rb
./bin/mruby hello.rb

# 字节码
./bin/mrbc hello.rb          # → hello.mrb
./bin/mruby -b hello.mrb
```

### 示例一：Ruby 侧——设备配置 DSL

下面这段脚本适合放在路由器或网关固件里，由用户改写 Wi-Fi 与 LED 行为，无需重编 C：

```ruby
# config.rb — 由嵌入层预先注入 `Device` 类（C 实现）
Device.wifi_ssid = "home-lab"
Device.led_mode  = :blink_slow

def apply_profile(name)
  case name
  when "night"
    Device.led_mode = :off
    Device.wifi_power_save = true
  when "party"
    Device.led_mode = :rainbow
  else
  end
  Device.commit!
end

apply_profile("night")
puts "SSID=#{Device.wifi_ssid}, LED=#{Device.led_mode}"
```

主程序在启动时用 `mrb_load_file` 加载该文件；`Device` 的方法在 C 里用 `mrb_define_method` 绑定到硬件寄存器。改配置只换 `.rb` 或 `.mrb`，OTA 可只推送脚本层。

### 示例二：C 侧——最小嵌入 + 注册原生方法

```c
#include <stdio.h>
#include <mruby.h>
#include <mruby/compile.h>
#include <mruby/string.h>

/* Ruby 可调用的 C 函数：my_add(a, b) */
static mrb_value
my_add(mrb_state *mrb, mrb_value self)
{
  mrb_int a, b;
  mrb_get_args(mrb, "ii", &a, &b);
  return mrb_fixnum_value(a + b);
}

int main(void)
{
  mrb_state *mrb = mrb_open();
  if (!mrb) return 1;

  /* 挂到 Kernel，全局可用 */
  mrb_define_method(mrb, mrb->kernel_module, "my_add",
                    my_add, MRB_ARGS_REQ(2));

  /* 执行 Ruby */
  mrb_load_string(mrb,
    "puts my_add(3, 4)\n"
    "puts 'embedded OK'\n");

  if (mrb->exc) {
    mrb_print_error(mrb);
    mrb_close(mrb);
    return 1;
  }

  mrb_close(mrb);
  return 0;
}
```

链接（在 mruby 源码树内）：

```bash
gcc -I include $(build/host/bin/mruby-config --cflags) embed.c \
  $(build/host/bin/mruby-config --ldflags --libs) -o embed
./embed
# 7
# embedded OK
```

### 示例三：预编译字节码嵌入（无 compiler gem）

发布固件时去掉解析器可省空间：

```bash
bin/mrbc -Bruby_code app.rb   # 生成 app.c，内含 ruby_code[]
```

```c
#include <mruby.h>
#include <mruby/irep.h>
#include "app.c"

int main(void) {
  mrb_state *mrb = mrb_open();
  mrb_load_irep(mrb, ruby_code);
  if (mrb->exc) mrb_print_error(mrb);
  mrb_close(mrb);
  return 0;
}
```

## 构建定制与集成模式

### gembox 与交叉编译

- `MRUBY_CONFIG=build_config/minimal.rb rake`：极简 VM
- `conf.gembox 'default'`：日常开发推荐集合
- mruby 构建系统基于 **Rake + Ruby DSL**，支持为 ARM/RISC-V 等目标 **交叉编译** 同一套 `build_config`

### Amalgamation（单文件嵌入）

类似 SQLite 的 amalgamation：`rake amalgam` 生成 `mruby.c` + `mruby.h`，把整棵源码树塞进你的工程，适合不便管理子模块的遗留 C 项目。

### mruby/c

[mruby/c](https://github.com/mruby-rocks/mruby/c)（社区常称 mruby/c）在 mruby 之上再裁 VM、对象模型和 GC，面向 **几十 KB RAM** 的 MCU。若 RAM 以 KB 计，先评估 mruby/c；若以 MB 计且团队要 Ruby 语法，标准 mruby 更合适。

## 与相近项目对比

| 项目 | 语言 | 嵌入方式 | 典型场景 |
|------|------|----------|----------|
| **CRuby** | C | 进程外调用为主 | 服务器、Rails、全生态 |
| **mruby** | C | `libmruby.a` 进程内 | 固件、游戏、桌面应用脚本层 |
| **MicroPython** | C | 静态链接 | MCU、教育硬件 |
| **Lua** | C | `lua.h` | 游戏脚本事实标准 |
| **RustPython** | Rust | Rust crate | Rust 宿主 + Python 语法 |

选型口诀：**要 Rails → CRuby；要 Ruby 语法进 C 固件 → mruby；要 Python 进 Rust → RustPython；要极致 KB 级 → Lua / MicroPython / mruby/c。**

## 调试与排错

- **交互验证**：`mirb` 快速试 API 与 gem 是否链入
- **mrdb**：官方调试器 gem，可断点单步（需构建时启用）
- **常见坑**：
  - `NoMethodError` → 查是否缺少对应 **mrbgem**
  - C 扩展崩溃 → 检查 **GC Arena**（`mrb_gc_arena_save` / `restore`）与 `mrb_value` 生命周期
  - 与 CRuby 结果不一致 → 先查 [limitations](https://github.com/mruby/mruby/blob/master/doc/limitations.md)，不要假设完整语义

## 学习路径建议

1. 本机 `rake` 构建，用 `mirb` 熟悉 **语言子集**（哪些语法可用）
2. 读 `doc/guides/getting-started.md`，跑通 **embed.c** 最小示例
3. 写一个 **C 定义类 + Ruby 调用** 的小项目（如 `Sensor.read`）
4. 用 `mrbc` 走通 **字节码部署** 路径，测量二进制体积差异
5. 打开 `build_config/default.rb`，理解 **gem 列表** 与裁剪
6. 若上 MCU，转读 **mruby/c** 与目标板的 `build_config`

## 官方资源

- 仓库：<https://github.com/mruby/mruby>
- 官网与发布说明：<https://mruby.org/>（当前稳定版 4.0.0）
- 文档索引：<https://github.com/mruby/mruby/tree/master/doc>
- C API：<https://github.com/mruby/mruby/blob/master/doc/guides/capi.md>
- 语言特性：<https://github.com/mruby/mruby/blob/master/doc/guides/language.md>

## 小结

mruby 不是「小号的 CRuby」，而是 **为嵌入而生的 Ruby VM**：编译期用 mrbgems 定能力边界，运行期用 C API 与宿主共舞，部署期可用字节码隐藏源码。理解 **mrb_state、mrbgems、mrbc 与 limitations 四条线**，就能在固件、引擎或工具里安全地贴上 Ruby 脚本层——而不必把整个 Ruby 世界搬进设备。
