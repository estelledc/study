---
title: littlefs — MCU 友好的掉电安全文件系统
来源: 'https://github.com/littlefs-project/littlefs'
日期: 2026-07-08
分类: embedded
难度: 中级
---

## 是什么

littlefs 是一个给微控制器用的**小型、掉电安全、会做损耗均衡的文件系统**。日常类比：普通文件系统像办公室档案柜，假设有人会正常关门下班；littlefs 像户外急救包，随时可能被雨淋、摔地、断电，但下次打开还要能找到最后一份完整记录。

它要解决的不是“怎么把文件做得很大”，而是“只有几十 KB RAM、几 MB flash、还可能突然断电时，怎么放心地保存配置、日志、计数器”。这正是手环、传感器、蓝牙设备、工业采集器常见的存储环境。

最小使用姿势大概长这样：

```c
lfs_t lfs;
lfs_file_t file;

lfs_mount(&lfs, &cfg);
lfs_file_open(&lfs, &file, "boot_count", LFS_O_RDWR | LFS_O_CREAT);
lfs_file_write(&lfs, &file, &count, sizeof(count));
lfs_file_close(&lfs, &file);  // close/sync 成功后才算真正提交
lfs_unmount(&lfs);
```

把它理解成“嵌入式设备里的可靠小抽屉”就够了：每次写入先找安全位置，确认无误后再让新内容生效。

## 为什么重要

不用 littlefs，下面这些事很容易解释不通：

- 设备刚写完配置就被拔电，为什么下一次启动可能直接读到半截文件或坏目录。
- flash 不能像硬盘一样无限擦写，为什么同一个配置文件反复更新会把少数块提前磨坏。
- MCU RAM 很小，为什么桌面文件系统的缓存、日志、目录树结构搬不过来。
- 嵌入式产品没有“安全关机”按钮，为什么文件系统必须假设任何一行写入都可能被打断。

## 核心要点

1. **写坏了也能退回上一个好状态**：littlefs 用 copy-on-write 和带校验的 metadata pair，让更新像“先写新便签，确认完整后再贴到公告板”。如果中途断电，旧便签还在，新便签校验不过就被忽略。

2. **动态损耗均衡**：flash 块有擦写寿命，littlefs 的分配器会让经常变化的数据在不同块之间移动。类比：不要总踩同一块地砖，而是把脚步分散到整条走廊。

3. **RAM 使用有上限**：它不会因为文件越来越多就偷偷吃更多内存。类比：你出门只带固定大小的工具包，修小车和修大车都用这一包工具，只是来回次数不同。

这三点合起来，就是 littlefs 的定位：牺牲一部分吞吐和桌面兼容性，换来 MCU 上更重要的可恢复性、寿命和可预测内存。

## 实践案例

### 案例 1：每次开机保存 boot_count

README 里的经典例子是“每次启动把计数器加一”。代码可以缩成这样：

```c
uint32_t count = 0;

if (lfs_mount(&lfs, &cfg) != 0) {
    lfs_format(&lfs, &cfg);
    lfs_mount(&lfs, &cfg);
}

lfs_file_open(&lfs, &file, "boot_count", LFS_O_RDWR | LFS_O_CREAT);
lfs_file_read(&lfs, &file, &count, sizeof(count));
count += 1;
lfs_file_rewind(&lfs, &file);
lfs_file_write(&lfs, &file, &count, sizeof(count));
lfs_file_close(&lfs, &file);
```

逐部分解释：

- `lfs_mount` 先尝试挂载；第一次启动没有文件系统，就 `lfs_format` 后再挂载。
- `LFS_O_CREAT` 表示文件不存在就创建，适合保存配置或计数器。
- `lfs_file_close` 很关键，littlefs 的文件更新到 close 或 sync 成功后才真正提交。

### 案例 2：在 PC 上跑官方测试，复现某个目录问题

littlefs 主仓带了 emulated block device，开发者可以不用真实板子先跑测试：

```bash
make test
./scripts/test.py -l runners/test_runner
./scripts/test.py -L runners/test_runner test_dirs
./scripts/test.py runners/test_runner test_dirs_root:1g12gg2 --gdb
```

逐部分解释：

- `make test` 会在 Linux 环境跑完整测试集，适合改源码前后做回归。
- `-l` 和 `-L` 先列测试套件与测试用例，避免盲跑全部。
- 失败信息里带的 test id 可以直接传回 `test.py`，再加 `--gdb` 单点调试。

### 案例 3：用 littlefs-fuse 在电脑上检查镜像

官方关联项目 littlefs-fuse 可以把 littlefs 镜像挂到 Linux 用户态，适合调试固件导出的 flash 内容：

```bash
sudo chmod a+rw /dev/loop0
dd if=/dev/zero of=image bs=512 count=2048
losetup /dev/loop0 image
./lfs --format /dev/loop0
mkdir mount
./lfs /dev/loop0 mount
printf "hello\n" > mount/hi.txt
umount mount
sudo losetup -d /dev/loop0
```

逐部分解释：

- `image` 是一个 1 MB 的假块设备，方便在没有开发板时实验。
- `./lfs --format` 会清空并格式化这个块设备，真实设备上要特别小心。
- 挂载后可以用普通文件命令读写，便于确认 MCU 写出的目录和文件是否符合预期。

## 踩过的坑

1. **把 close 当成可选步骤**：文件写入不是调用 `lfs_file_write` 就落盘，没 close/sync 成功时断电可能只保留旧版本。
2. **`sync` 回调没有真的刷到底层 flash**：如果驱动自己缓存写入却不 flush，littlefs 的掉电保证就会被底层破坏。
3. **block 几何参数随便填**：`read_size`、`prog_size`、`block_size` 必须匹配 flash 特性，否则轻则性能差，重则写入失败。
4. **期待它像桌面文件系统一样全能**：littlefs 默认没有时间戳、权限、符号链接这些 PC 文件系统能力，因为它优先照顾 MCU 可靠性。

## 适用 vs 不适用场景

**适用**：

- MCU 上保存配置、校准参数、启动计数、少量日志。
- SPI NOR flash、片上 flash 这类擦写寿命有限的存储。
- 没有正常关机流程、随时可能断电的电池设备。
- 希望在 Zephyr、Mbed OS、裸机 C 项目里用同一套小文件接口。

**不适用**：

- 需要和 Windows/macOS 直接插拔互认的 U 盘场景，FAT 系列更合适。
- 超高吞吐、大文件、多用户权限、复杂目录元数据的桌面或服务器场景。
- 只写一次、几乎不更新的只读资源包，用简单分区或只读镜像更省。
- NAND flash 上需要完整坏块管理和静态损耗均衡的场景，要评估 FTL 或专用方案。

## 历史小故事（可跳过）

- **2017 年前后**：littlefs 最早在 Arm/Mbed 生态里成长，目标是给小 MCU 一个能抗掉电的文件系统。
- **设计初衷**：作者把它当作文件系统设计实验，问题是“如何在有限 RAM 里同时处理掉电和 flash 磨损”。
- **文档演进**：主仓把高层设计写进 `DESIGN.md`，把磁盘格式写进 `SPEC.md`，说明它不只是代码片段，而是可被工具理解的格式。
- **社区扩展**：后来出现 littlefs-fuse、littlefs-python、Rust/Nim 绑定和镜像工具，说明大家不只在 MCU 上用，也需要在 PC 上制作、检查、迁移镜像。
- **当前定位**：GitHub 上已有数千 stars，是嵌入式文件系统里经常和 SPIFFS、FatFs、Dhara 放在一起比较的方案。

## 学到什么

- **嵌入式存储的第一目标不是快，而是断电后还能回来**：littlefs 把失败恢复放在设计中心。
- **flash 和硬盘不是一种东西**：擦除昂贵、写入单向、块会磨损，所以文件系统必须理解存储介质。
- **小系统也需要工程化测试**：官方 test runner、emulated block device、FUSE 工具让文件系统问题可以在 PC 上复现。
- **抽象边界很清楚**：littlefs 管文件系统语义，但底层 `read/prog/erase/sync` 驱动必须诚实可靠。

## 延伸阅读

- 官方 README：[littlefs-project/littlefs](https://github.com/littlefs-project/littlefs)
- 设计文档：[The design of littlefs](https://github.com/littlefs-project/littlefs/blob/master/DESIGN.md)
- 磁盘格式：[littlefs technical specification](https://github.com/littlefs-project/littlefs/blob/master/SPEC.md)
- 调试工具：[littlefs-fuse](https://github.com/littlefs-project/littlefs-fuse)
- [[zephyr]] —— Zephyr 可以把 littlefs 作为嵌入式文件系统后端。
- [[lwip]] —— 同样服务 MCU：一个管网络，一个管掉电安全存储。

## 关联

- [[zephyr]] —— 常见宿主 RTOS，示例里就有 LittleFS filesystem sample。
- [[freertos]] —— 很多产品会用 FreeRTOS 调度任务，再用 littlefs 保存配置。
- [[lwip]] —— 嵌入式联网与嵌入式存储经常一起出现在 IoT 设备里。
- [[mbedtls]] —— TLS 证书、密钥或会话信息可能需要落到可靠小文件系统。
- [[openwrt]] —— 对比理解：OpenWrt 面向 Linux 路由器，littlefs 面向更小的 MCU。
- [[rocksdb]] —— 都在处理持久化，但 rocksdb 面向服务器 SSD，littlefs 面向小 flash。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
