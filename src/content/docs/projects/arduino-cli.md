---
title: Arduino CLI — 命令行驱动嵌入式全流程工具链
来源: 'https://github.com/arduino/arduino-cli'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 初级
---

## 是什么

Arduino CLI 是 Arduino 官方用 Go 编写的**全功能命令行工具**，一个可执行文件覆盖从"检测开发板"到"上传固件"的完整嵌入式开发流程——无需打开 GUI 界面。

日常类比：像一个"多功能瑞士军刀"。以前 Arduino 开发必须打开图形 IDE，鼠标点击"编译"再点击"上传"；arduino-cli 把这些操作变成一条条命令，可以串进脚本、CI/CD 管道、批处理任务。

核心能力四件套：
- **Board Manager**：安装/更新开发板核心包（支持官方 AVR、ARM 及第三方 ESP8266、NRF52 等）
- **Library Manager**：搜索、安装、更新 Arduino 库
- **编译器（compile）**：调用底层 avr-gcc / arm-gcc 工具链，产出可上传的固件
- **上传器（upload）**：通过 avrdude / bossac 等工具把固件写入板子

最关键的是它还支持 **gRPC daemon 模式**——以后台服务形式运行，让 VSCode 插件、IDE、自动化脚本通过 gRPC 调用，免去每次都冷启动进程的开销。

## 为什么重要

不理解 arduino-cli，以下这些事都没法解释：

- 为什么在 GitHub Actions 里可以"推一次代码，自动编译并上传 Arduino 固件"——这整条管道的执行引擎就是 arduino-cli
- 为什么 Arduino IDE 2.x 比 1.x 快很多——因为 IDE 2.x 底层改用 arduino-cli 做后端引擎
- 为什么嵌入式 CI/CD 能对接 Docker 容器——arduino-cli 是静态单可执行文件，天然适合容器化
- 为什么跨平台嵌入式脚本能少踩 OS 差异坑——Go 编译产物一致性好，Windows/macOS/Linux 行为几乎相同

## 核心要点

1. **FQBN — 开发板的"身份证号码"**

   每块 Arduino 兼容板子用一个 Fully Qualified Board Name（FQBN）精确标识，格式是 `厂商:架构:型号`，比如 `arduino:avr:uno`（Arduino Uno）、`esp32:esp32:esp32`（ESP32 通用板）。FQBN 贯穿编译和上传两步——类比：机场登机牌，差一个字母就登错飞机。

2. **注册表驱动的包管理**

   arduino-cli 的包管理逻辑与 npm/apt 相似：本地有一份"索引缓存"，记录所有可用的开发板核心包和库。`core update-index` / `lib update-index` 更新这份缓存，之后才能 `core install` / `lib install`。第三方板（ESP8266 等）通过 `additional-urls` 在配置文件里注入额外注册表地址，和给 npm 加私有 registry 是同一个思路。

3. **两种运行模式：CLI vs daemon**

   普通用法是每次调一条命令（`arduino-cli compile ...`），适合脚本和 CI。daemon 模式下，`arduino-cli daemon` 以 gRPC 服务常驻后台，客户端（如 VSCode 插件）复用同一进程，避免重复加载索引、重复启动工具链——平均加速 2–3 倍。这两种模式共享同一套配置文件（`~/.arduino15/arduino-cli.yaml`），切换零成本。

## 实践案例

### 案例 1：GitHub Actions 全自动编译 + 上传固件

最典型的 CI/CD 用法：代码推到仓库，Action 自动编译，产出固件文件，可进一步触发上传或打 Release。

```yaml
# .github/workflows/build.yml
name: Build Arduino Firmware
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install arduino-cli
        run: |
          curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
          sudo mv bin/arduino-cli /usr/local/bin/
      - name: Update index & install core
        run: |
          arduino-cli core update-index
          arduino-cli core install arduino:avr
      - name: Compile sketch
        run: |
          arduino-cli compile \
            --fqbn arduino:avr:uno \
            --output-dir ./build \
            ./sketch/blink
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: firmware
          path: ./build/*.hex
```

**逐部分解释**：
- `core update-index` 更新注册表缓存，确保能找到最新版核心包
- `core install arduino:avr` 安装 AVR 系列工具链（包含 avr-gcc 等）
- `--fqbn arduino:avr:uno` 指定目标板子型号
- `--output-dir` 指定输出目录，`.hex` 文件可直接用 avrdude 上传或作为 Release 附件

### 案例 2：批量上传相同固件到多块开发板

测试场景或批量生产时，需要把同一份固件烧进多块板子。

```bash
#!/bin/bash
# batch_upload.sh — 把 firmware.hex 上传到所有连接的 Arduino Uno

FQBN="arduino:avr:uno"
SKETCH="./sketch/blink"

# 先编译一次，产出 .hex
arduino-cli compile --fqbn "$FQBN" --output-dir ./build "$SKETCH"

# 列出所有匹配的串口
arduino-cli board list --fqbn "$FQBN" | awk 'NR>1 {print $1}' | while read PORT; do
  echo "Uploading to $PORT ..."
  arduino-cli upload \
    --fqbn "$FQBN" \
    --port "$PORT" \
    --input-dir ./build \
    && echo "  $PORT: OK" \
    || echo "  $PORT: FAILED"
done
```

**逐部分解释**：
- `board list --fqbn` 过滤出特定型号的所有连接板，避免误上传到不同类型的板子
- 编译只跑一次，上传复用同一份 `.hex`，效率更高
- `&&` / `||` 分支让每块板的结果独立报告，不因一块失败而中断整个流程

### 案例 3：daemon 模式供编辑器插件调用

当你在 VSCode 里装 Arduino 扩展时，插件后台就是通过这个模式与 arduino-cli 通信的。以下演示用 `grpc-tools` 直接调 daemon 接口（方便理解原理）：

```bash
# 启动 daemon，监听 50051 端口
arduino-cli daemon --port 50051 --log-level debug &

# 用 grpcurl 查已安装的 core（等价于 arduino-cli core list）
grpcurl -plaintext \
  -d '{"instance": {"id": 1}}' \
  localhost:50051 \
  cc.arduino.cli.commands.v1.ArduinoCoreService/PlatformList
```

**逐部分解释**：
- `--port 50051` 指定 gRPC 监听端口，客户端（插件 / 脚本）连这个端口
- daemon 启动后保持索引和工具链在内存，后续每次 compile/upload 请求响应更快
- `ArduinoCoreService` 是 arduino-cli 定义的 protobuf 服务，所有 CLI 功能都有对应的 RPC 方法

## 踩过的坑

1. **FQBN 拼错导致 `invalid FQBN` 报错**：`arduino:avr:uno` 每个段都不能多空格或大小写错误，用 `arduino-cli board listall` 查正确 FQBN，不要凭记忆猜。

2. **忘了 `core update-index` 就找不到板**：装新开发板前如果不先更新索引，`install` 会说"找不到该 core"，明明网上有却本地缓存过期，更新一次索引立即解决。

3. **Linux 端口权限问题**：`/dev/ttyACM0` 需要 `dialout` 组权限，用 `sudo usermod -aG dialout $USER` 后**必须重新登录**才生效，否则一直 `permission denied`，重启也无效。

4. **第三方 core 的 `additional_urls` 只在配置文件设置不够**：某些命令（如 `core search`）还需每次加 `--additional-urls` 参数，或在 `~/.arduino15/arduino-cli.yaml` 的 `board_manager.additional_urls` 里永久配置，否则搜索结果里看不到第三方板。

## 适用 vs 不适用场景

**适用**：
- CI/CD 管道中自动编译 Arduino 固件，推代码即验证
- 批量管理多块开发板，脚本循环上传、自动化测试
- 嵌入式 IDE 扩展的后端引擎，通过 gRPC daemon 复用工具链
- 容器化嵌入式开发环境，arduino-cli 静态二进制天然适合 Docker 镜像
- 跨平台团队统一开发板管理，减少"在我机器上能跑"问题

**不适用**：
- 纯粹交互式的学生入门开发——Arduino IDE 图形界面更友好，直观性更强
- 不支持 Arduino 框架的嵌入式目标（如纯 ESP-IDF、Zephyr RTOS）——这些有自己的 CLI 工具
- 需要深度调试（GDB、断点、实时变量查看）——arduino-cli 没有集成调试适配器，需搭配 OpenOCD 等

## 历史小故事（可跳过）

- **2018 年**：Arduino 官方宣布启动 arduino-cli 项目，目标是取代老旧的 Arduino Builder 和 IDE 内置工具链，选用 Go 语言是看中其跨平台静态编译和并发处理能力。
- **2019 年**：发布 0.1.0，首次实现 board manager、library manager 和基本编译/上传功能，同时提供 gRPC daemon 接口草案。
- **2021–2022 年**：Arduino IDE 2.x 正式切换到以 arduino-cli 为后端引擎，这意味着所有 IDE 2.x 用户实际上都在间接使用 arduino-cli，项目从"开发者工具"升格为"基础设施"。
- **现在**：arduino-cli 已是 Arduino 生态的事实命令行标准，GitHub Actions Marketplace 里有多个专门封装它的官方 Action，让嵌入式 CI/CD 进入主流。

## 学到什么

1. **把 GUI 操作变成命令是嵌入式开发进入 CI/CD 的关键门槛**——arduino-cli 的本质贡献不是技术创新，而是"自动化可及性"
2. **FQBN 机制体现了"精确标识比模糊识别更可靠"**——用结构化字符串而不是"尝试匹配"来指定板子，消除了一整类歧义错误
3. **daemon 模式是 CLI 工具演进的常见模式**——Language Server Protocol（LSP）、buildkite-agent 都走同一条路：先做 CLI，再加 daemon，让编辑器/CI 复用进程
4. **静态二进制 + 注册表索引是"可重现嵌入式构建"的标准答案**——工具链版本锁定在 `board_manager_additional_urls` + `core install arduino:avr@1.8.6`，就像 `package-lock.json` 锁 npm

## 延伸阅读

- 官方文档：[Arduino CLI Getting Started](https://arduino.github.io/arduino-cli/latest/getting-started/)（最权威的入门手册，覆盖配置文件格式）
- GitHub Actions 官方 Action：[arduino/setup-arduino-cli](https://github.com/arduino/setup-arduino-cli)（CI 集成首选方案）
- gRPC API 参考：[arduino-cli proto 定义](https://github.com/arduino/arduino-cli/tree/master/rpc)（想写自定义客户端必读）
- [[act]] —— 本地模拟 GitHub Actions，搭配 arduino-cli 在本机跑嵌入式 CI
- [[actions-runner-controller]] —— K8s 上的 GitHub Actions Runner，配合 arduino-cli 做嵌入式大规模 CI

## 关联

- [[act]] —— 本地跑 GitHub Actions 的工具，arduino-cli + act 可以不推代码就调试 CI 流程
- [[actions-runner-controller]] —— K8s 上托管 Actions Runner，嵌入式 CI 规模扩大时搭档使用
- [[docker]] —— arduino-cli 静态二进制天然适合打进 Docker 镜像，实现可重现的嵌入式构建环境
- [[ansible]] —— 批量管理多台开发机时，Ansible 可以统一安装 arduino-cli 并保持版本一致
- [[buildroot]] —— 同为嵌入式构建工具链，buildroot 管 Linux 根文件系统，arduino-cli 管裸机 sketch；两者在物联网项目里经常共存

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
