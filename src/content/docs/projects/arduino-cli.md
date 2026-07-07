---
title: Arduino CLI — 用命令行管理 Arduino 开发全流程
来源: 'https://github.com/arduino/arduino-cli'
日期: 2026-06-24
分类: 嵌入式
难度: 初级
---

## 是什么

Arduino CLI 是 Arduino 官方出品的**下一代命令行工具链**，用 Go 语言编写。日常类比：Arduino IDE 像一个全功能的厨房——灶台、冰箱、刀具全在里面，但你只能站在厨房里做菜。Arduino CLI 则像一套便携厨具，你可以在任何地方（服务器、CI 流水线、你的终端）完成"备菜、烹饪、装盘"全流程。

它提供五大核心能力：

- 开发板管理（Board Manager）——安装、更新各芯片平台的编译工具链
- 库管理（Library Manager）——搜索、安装、卸载第三方库
- 编译（Sketch Builder）——把 `.ino` 源码交叉编译成目标板的二进制
- 板卡检测（Board Detection）——自动识别 USB 连接的板子型号
- 上传（Uploader）——把编译产物通过串口或网络烧录到板子

一句话概括——**不开 IDE，用一行命令完成从写代码到烧录的所有事**。

## 为什么重要

- 传统 Arduino IDE 是图形界面，无法嵌入自动化流程。Arduino CLI 让你在 CI/CD、Docker、远程服务器上编译和测试 Arduino 项目
- 它是 Arduino Create（在线编辑器）和 VS Code Arduino 扩展的底层引擎，理解它就理解了整个 Arduino 工具链的核心
- Go 单二进制分发，无依赖安装，跨平台（Windows/macOS/Linux/ARM）
- 提供 gRPC 接口，第三方 IDE 和工具可以把它当"编译服务"调用
- 配置文件（`arduino-cli.yaml`）支持自定义 Board Manager URL，可以接入 ESP32、STM32 等第三方核心——一个工具管所有兼容板卡

## 核心要点

Arduino CLI 的工作流分 **四步**：

1. **安装核心（core）**：`arduino-cli core install arduino:avr`——相当于告诉工具链"我要用什么芯片"。核心包含编译器工具链、板卡定义、底层库。

2. **管理库**：`arduino-cli lib install Servo`——下载第三方库到本地，编译时自动链接。

3. **编译**：`arduino-cli compile --fqbn arduino:avr:uno MySketch`——FQBN（Fully Qualified Board Name）精确指定板卡型号，编译器据此选择正确的工具链和参数。

4. **上传**：`arduino-cli upload -p /dev/ttyUSB0 --fqbn arduino:avr:uno MySketch`——通过串口把二进制刷入板子。

关键概念：FQBN 是"厂商:架构:板卡"的三段式标识，例如 `esp32:esp32:esp32` 表示 ESP32 官方核心的 ESP32 开发板。

补充：Arduino CLI 的配置目录默认在 `~/.arduino15/`，里面存放已安装的核心、库、以及 `arduino-cli.yaml` 配置文件。你可以用 `arduino-cli config dump` 查看当前生效配置。想加第三方核心（比如 ESP32），只需在配置文件的 `board_manager.additional_urls` 里加一行 URL，然后 `core update-index`。

## 实践案例

### 案例 1：在 GitHub Actions 里自动编译

```yaml
# .github/workflows/build.yml
- uses: arduino/compile-sketches@v1
  with:
    fqbn: arduino:avr:uno
    sketch-paths: ./src
```

这个 Action 底层调用的就是 Arduino CLI。每次 push 自动编译，编译失败立刻报错——不用手动打开 IDE 点按钮。

对于有多个 sketch 的仓库，还可以用 matrix 策略同时编译多块板子（Uno、Mega、Nano），一次 CI 覆盖全部目标。

### 案例 2：一条命令发现并烧录

```bash
# 列出已连接的板子
arduino-cli board list
# 输出：/dev/ttyUSB0  Arduino Uno  arduino:avr:uno

# 编译 + 上传一气呵成
arduino-cli compile -u -p /dev/ttyUSB0 --fqbn arduino:avr:uno Blink
```

`-u` 参数表示编译完直接上传，省去两步操作。

### 案例 3：用 gRPC 让自定义 IDE 调用编译能力

```bash
# 启动 daemon 模式
arduino-cli daemon
# 默认监听 localhost:50051，支持 gRPC 调用
```

Arduino CLI 启动 daemon 模式后暴露 gRPC 端口，任何语言写的前端都能调用编译、上传接口——VS Code Arduino 扩展就是这么做的。客户端发送一个 `Compile` 请求，daemon 返回编译输出流，整个过程异步且可以复用同一个 daemon 实例。

这种"CLI + daemon + gRPC"架构意味着：命令行用户直接敲命令，图形界面用户通过 GUI 调 gRPC，两者共享同一套核心逻辑——任何 bug 修复两边都受益。

## 踩过的坑

1. **FQBN 写错无提示**：写成 `arduino:avr:UNO`（大写）会报"platform not found"，但错误信息不会告诉你是大小写问题。解决：用 `arduino-cli board listall` 查看精确名称。

2. **core index 没更新**：安装第三方核心（如 ESP32）前必须先 `arduino-cli core update-index`，否则搜不到。这跟 `apt update` 一个道理——先刷索引再装包。

3. **串口权限（Linux）**：上传时报 `permission denied on /dev/ttyUSB0`，需要把用户加入 `dialout` 组：`sudo usermod -aG dialout $USER`，然后重新登录。

4. **编译缓存导致"幽灵错误"**：改了 `platform.txt` 或切换核心版本后，旧缓存可能导致链接错误。用 `arduino-cli compile --clean` 强制全量重编。

## 适用场景 vs 不适用场景

**适用**：

- CI/CD 自动编译验证 Arduino 项目——每次 push 跑一遍编译确保不 break
- 无头服务器（无 GUI）环境的嵌入式开发——SSH 到树莓派上也能编译上传
- 需要脚本化批量烧录多个板子——用 shell 循环对一排设备逐个刷固件
- 构建自定义 IDE 或编辑器插件的底层引擎——通过 gRPC 接口集成
- 教学场景的标准化环境——学生不用各自配 IDE 版本，统一用 CLI + 配置文件

**不适用**：

- 初学者第一次接触 Arduino——直接用 Arduino IDE 2.0 更友好，有自动补全和串口监视器
- 需要可视化串口绘图器（Serial Plotter）——CLI 没有图形界面，得自己接工具
- 非 Arduino 生态的芯片（如 STM32 裸机开发）——用 [[platformio]] 或厂商工具链更合适
- 复杂的多目标构建系统（如同时编译 Linux 内核模块 + MCU 固件）——需要 CMake 或 Makefile 级别的构建工具

## 历史小故事（可跳过）

2018 年 Arduino 团队决定用 Go 重写工具链后端。动机很明确：老 Java 版 IDE（Arduino IDE 1.x）的编译逻辑和 GUI 完全耦合，第三方编辑器想调用编译能力必须 hack 内部 API——解析命令行输出、模拟点击，极其脆弱。

Go 被选中有两个原因：交叉编译到所有目标平台只需设置两个环境变量（GOOS/GOARCH），以及 Go 的 `cobra` 库天然适合做 CLI 子命令结构。最终产物是一个不到 30MB 的静态链接二进制，下载即用。

Arduino CLI 0.1.0 发布后，Arduino Create 在线编辑器、VS Code 插件、PlatformIO 的 Arduino 框架支持都开始依赖它。到 2024 年 GitHub stars 突破 4k，成为官方推荐的"headless Arduino"方案。Arduino IDE 2.0 本身也是一个 Electron 壳 + Arduino CLI daemon 的组合。

## 学到什么

1. **命令行工具 = 自动化的基石**——有 CLI 才能写脚本、接 CI、做批量操作；GUI 是锦上添花，CLI 是地基
2. **FQBN 三段式命名**是 Arduino 生态里定位"目标硬件"的唯一标识符——记住这个格式比记板子名字有用
3. **单二进制 + gRPC daemon**是现代 CLI 工具的经典架构模式——前后端分离，GUI 只是 gRPC 的一个客户端
4. **Go 语言适合写 CLI**——交叉编译简单、启动快、分发无依赖，cobra 库几乎是 Go CLI 的标配
5. **嵌入式开发的"编译-上传"二步是不可跳过的**——不像 Python 可以直接运行，硬件开发必须经历交叉编译再烧录

## 延伸阅读

- 官方文档：[Arduino CLI Documentation](https://arduino.github.io/arduino-cli/)——命令参考、配置说明、平台规范全在这里
- 中文教程：[Arduino CLI 完整使用指南](https://blog.csdn.net/gitblog_00315/article/details/156528306)——从安装到 CI 集成的中文入门
- 源码仓库：[arduino/arduino-cli](https://github.com/arduino/arduino-cli)——Go 代码结构清晰，适合学习 CLI 设计模式
- gRPC 接口定义：仓库 `rpc/` 目录下的 `.proto` 文件——想写自定义前端从这里看协议
- Arduino IDE 2.0 源码：[arduino/arduino-ide](https://github.com/arduino/arduino-ide)——Electron + CLI daemon 的真实集成案例

## 关联

- [[platformio]] —— 另一个跨平台嵌入式 CLI，支持 Arduino 框架但不限于 Arduino
- [[openwrt]] —— 路由器嵌入式系统，同样强调命令行工具链管理
- [[nuttx]] —— 实时操作系统，Arduino CLI 管不到的领域由它接管
- [[esp-idf]] —— ESP32 官方工具链，Arduino CLI 的 ESP32 核心底层依赖它
- [[micropython]] —— 另一条嵌入式开发路线：不编译，直接解释执行 Python
- [[buildroot]] —— 嵌入式 Linux 构建系统，和 Arduino CLI 一样强调"一条命令完成构建"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[buildroot]] —— Buildroot — 30 分钟从零搭出一个嵌入式 Linux
- [[circuitpython]] —— CircuitPython — 拖文件就能给芯片写程序的 Python
- [[embedded-hal]] —— embedded-hal — Rust 嵌入式硬件抽象的统一接口
- [[micropython]] —— MicroPython — 在巴掌大的芯片上跑 Python
- [[nuttx]] —— Apache NuttX — 把 POSIX 塞进单片机的实时操作系统
- [[openwrt]] —— OpenWrt — 把家用路由器变成 Linux 服务器
- [[platformio-core]] —— PlatformIO Core — 一条命令编译上传任意嵌入式板子
- [[probe-rs]] —— probe-rs — Rust 写的嵌入式调试烧录工具
- [[smoltcp]] —— smoltcp — 在没有操作系统的芯片上跑 TCP/IP

