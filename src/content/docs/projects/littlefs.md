---
title: littlefs — 给 MCU 用的掉电安全小文件系统
来源: https://github.com/littlefs-project/littlefs
日期: 2026-06-13
分类: 操作系统
子分类: 嵌入式
难度: 初级
provenance: pipeline-v3
---

## 日常类比：停电老楼里的「保险柜账本」

你在停电频发的老楼 attic 里记流水账，存储介质是一块**只能整页撕掉重写、擦写次数有限**的 NOR Flash。

| 做法 | 像什么 | 断电会怎样 |
| --- | --- | --- |
| 裸写 Flash 或 ad-hoc 布局 | 直接在账本原页上涂改 | 页码和内容可能对不上，整本乱码 |
| **FatFs** 挂 SD 卡 | Windows U 盘 | PC 即插即用，但改目录项时断电可能损坏 FAT |
| **SPIFFS** | 专业记账员 | 小 Flash 上往往更快，RAM 却随文件数涨 |
| **littlefs** | 保险柜式账本 | 先在草稿纸写好完整一笔，再一次性换页贴进账本；最多丢当前草稿，账本停在上一完整状态 |

**littlefs** 把「掉电可恢复」「Flash 磨损均衡」「RAM 有上限」写进设计目标。由 [littlefs-project](https://github.com/littlefs-project/littlefs) 维护（BSD-3-Clause），在 ESP8266/ESP32、RP2040、[[zephyr]]、Mbed 等生态里是常见选择。

---

## 是什么

littlefs 是一个**专为微控制器（MCU）设计的嵌入式文件系统**——C99 实现、不依赖操作系统，你把它链进固件里，就能在 SPI Flash / eMMC / 片内 Flash 上像 Linux 一样 `open` / `read` / `write` 文件。

和 [[sqlite]] 不同：SQLite 管**结构化表 + SQL**；littlefs 管**路径 + 字节流文件**。和 PC 上的 ext4 / NTFS 也不同：后者假设 GB 级 RAM 和内核 VFS，littlefs 假设**几十 KB RAM、没有 MMU、随时可能拔电池**。

## 为什么重要

不理解 littlefs，下面这些嵌入式场景很难选对栈：

- 为什么 **ESP8266 / ESP32 / RP2040** 生态里常见 `mklittlefs` 烧录工具——官方/社区把 littlefs 当默认用户数据分区格式
- 为什么 **[[zephyr]]** 的 `CONFIG_FILE_SYSTEM_LITTLEFS` 和 Mbed 的 `LittleFileSystem` 都包它——ARM 系 RTOS 需要一套可认证、可裁剪、掉电安全的 FS
- 为什么有人弃 **SPIFFS** 转 littlefs——SPIFFS 在 NOR Flash 上静态磨损均衡很强，但 RAM 随文件数涨；littlefs 用**有界 RAM**，文件多了也不爆内存
- 为什么 IoT 设备要强调 **OTA + 配置 JSON + 日志文件** 共存——你需要 POSIX 式目录树，而不是自己发明「第 3 扇区存 WiFi 密码」的 ad-hoc 布局

一句话：**在「没有 Linux、不能起 PostgreSQL、Flash 会磨坏、随时断电」的四重约束下，littlefs 是当前最常被引用的开源答案之一。**

## 核心要点

littlefs 的设计可以拆成 **四层**，从下到上：

### 1. 块设备抽象（Block Device）

littlefs **不直接操作 Flash 芯片**，只认你提供的四个回调：

| 回调 | 作用 |
|------|------|
| `read` | 从物理地址读字节 |
| `prog` | 按页编程（Flash 只能从 1 写 0） |
| `erase` | 擦除一个 erase block |
| `sync` | 若底层有写缓存，刷到介质；无缓存可返回 0 |

你在 `lfs_config` 里还要声明几何参数：`read_size`、`prog_size`、`block_size`、`block_count`。所有读写长度必须是这些粒度的整数倍——这和真实 NOR/NAND 的 page / sector 对齐一致。

### 2. metadata pair（元数据对）

文件系统的「目录项、文件名、大小、指向数据的指针」存在 **metadata pair** 里：两个块组成的小型 append-only log。更新元数据时**原子地**在 log 里追加新记录，旧记录作废——类似数据库 WAL 的一页。这样 rename、unlink、mkdir 在断电时不会把目录树写穿。

### 3. CTZ skip-list（文件数据的 COW 树）

文件内容不走原地覆盖，而是 **copy-on-write**：改文件 = 写新块 + 更新元数据指针，旧块标记可回收。结构上是一棵 CTZ（count trailing zeros）skip-list 树，追加写友好、读路径可跳跃。好处：**改 1 字节不会擦整扇区**，磨损放大比「日志型整文件重写」低。

### 4. 块分配器 + 动态磨损均衡

所有块由统一 allocator 分配。参数 `block_cycles` 限制**同一块在被重分配前最多经历多少次 erase**——擦得少的块优先复用，从而在**无 FTL 的裸 Flash** 上做动态 wear leveling。块若 `prog`/`erase` 失败或读回校验失败，可返回 `LFS_ERR_CORRUPT`，allocator 会绕开坏块。

### 5. 有界 RAM

`cache_size`、`lookahead_size` 等缓冲可在 `lfs_config` 里**静态分配**。官方承诺：RAM 用量**不随文件系统总容量增长**——1 MB 分区和 1 GB 分区用同样 config，占同样 RAM。这对 32 KB SRAM 的 STM32F0 是硬需求。

### 6. POSIX 式 API，但结构体你自己分配

挂载后可用 `lfs_file_open`、`lfs_dir_open`、`lfs_rename` 等。和 POSIX 的关键差别：`lfs_t`、`lfs_file_t` 由**调用方分配**（栈或静态），库内部不 `malloc`（除非你显式用默认分配器）。**文件内容在 `close` 或 `sync` 之前不一定落盘**——这和 `stdio` 缓冲类似，断电前必须 `close`。

## 架构一图

```
  应用: lfs_file_write / lfs_mkdir / lfs_rename
              │
              ▼
         lfs_t + lfs_config
              │
    ┌─────────┴─────────┐
    ▼                   ▼
 metadata pair      CTZ 文件树
 (目录/元数据 log)    (COW 数据块)
    │                   │
    └─────────┬─────────┘
              ▼
      块分配器 (wear leveling)
              │
              ▼
   read / prog / erase / sync  ← 你实现的驱动
              │
              ▼
        SPI Flash / 片内 Flash
```

## 实践案例

### 案例 1：官方 boot_count——断电安全的计数器

README 里的经典例子：每次启动读 `boot_count` 文件，+1 写回。任意时刻断电，文件系统仍一致，计数最多少加一次：

```c
#include "lfs.h"

lfs_t lfs;
lfs_file_t file;

const struct lfs_config cfg = {
    .read  = user_provided_block_device_read,
    .prog  = user_provided_block_device_prog,
    .erase = user_provided_block_device_erase,
    .sync  = user_provided_block_device_sync,
    .read_size = 16,
    .prog_size = 16,
    .block_size = 4096,
    .block_count = 128,
    .cache_size = 16,
    .lookahead_size = 16,
    .block_cycles = 500,
};

int main(void) {
    int err = lfs_mount(&lfs, &cfg);
    if (err) {
        lfs_format(&lfs, &cfg);
        lfs_mount(&lfs, &cfg);
    }

    uint32_t boot_count = 0;
    lfs_file_open(&lfs, &file, "boot_count", LFS_O_RDWR | LFS_O_CREAT);
    lfs_file_read(&lfs, &file, &boot_count, sizeof(boot_count));

    boot_count += 1;
    lfs_file_rewind(&lfs, &file);
    lfs_file_write(&lfs, &file, &boot_count, sizeof(boot_count));

    /* 必须 close 成功，变更才真正提交 */
    lfs_file_close(&lfs, &file);
    lfs_unmount(&lfs);

    printf("boot_count: %u\n", boot_count);
}
```

要点：`mount` 失败先 `format`（仅首启）；**`close` 才是 commit 边界**；`block_cycles = 500` 开始参与磨损均衡。

### 案例 2：最小块设备驱动 + 目录与配置写入

下面用「RAM 模拟 Flash」展示驱动形状，以及创建 `/cfg/wifi.json` 的典型流程（真实项目里把 `bd_read` 等换成 SPI Flash HAL）：

```c
#include "lfs.h"
#include <string.h>

#define BLOCK_SIZE 4096
#define BLOCK_COUNT 32
static uint8_t flash[BLOCK_SIZE * BLOCK_COUNT];

static int bd_read(const struct lfs_config *c, lfs_block_t block,
                   lfs_off_t off, void *buffer, lfs_size_t size) {
    memcpy(buffer, &flash[block * c->block_size + off], size);
    return 0;
}

static int bd_prog(const struct lfs_config *c, lfs_block_t block,
                   lfs_off_t off, const void *buffer, lfs_size_t size) {
    /* 真实 Flash：只能把 1 变成 0，需按页 merge */
    memcpy(&flash[block * c->block_size + off], buffer, size);
    return 0;
}

static int bd_erase(const struct lfs_config *c, lfs_block_t block) {
    memset(&flash[block * c->block_size], 0xFF, c->block_size);
    return 0;
}

static int bd_sync(const struct lfs_config *c) {
    (void)c;
    return 0;
}

void app_fs_init(lfs_t *lfs, const struct lfs_config *cfg) {
    if (lfs_mount(lfs, cfg)) {
        lfs_format(lfs, cfg);
        lfs_mount(lfs, cfg);
    }
}

void app_save_wifi(lfs_t *lfs, const char *json) {
    lfs_mkdir(lfs, "cfg");  /* 已存在则返回 LFS_ERR_EXIST，可忽略 */

    lfs_file_t f;
    lfs_file_open(lfs, &f, "cfg/wifi.json", LFS_O_WRONLY | LFS_O_CREAT | LFS_O_TRUNC);
    lfs_file_write(lfs, &f, json, strlen(json));
    lfs_file_close(lfs, &f);  /* 原子提交点 */
}
```

`lfs_config` 里 `.context` 可传 SPI 句柄；`LFS_O_TRUNC` 截断旧文件；目录深度默认有限制（见 `lfs.h` 的 `LFS_NAME_MAX`）。

### 案例 3：在 PC 上调试——FUSE 与镜像工具

生态里的辅助项目：

- **littlefs-fuse**：Linux 下把 littlefs 镜像挂成目录，用 `hexdump` / `diff` 查盘
- **mklittlefs** / **littlefs-python**：在 CI 里生成要烧录的 `.bin` 镜像
- **littlefs** 自带 `bd/lfs_emubd.h` + `make test`：在主机上用 TOML 用例跑断电模拟

嵌入式团队常见工作流：主机生成镜像 → J-Link / esptool 写入 → 设备 `lfs_mount` 直接读。

## 关键配置参数怎么调

| 参数 | 含义 | 调大 | 调小 |
|------|------|------|------|
| `cache_size` | 读缓存 | 顺序读更快 | 省 RAM |
| `lookahead_size` | 分配器位图窗口 | mount 更快、分配更准 | 省 RAM |
| `block_cycles` | 每块最大 erase 次数 before 迁移 | 磨损更均匀、元数据搬迁更频 | 性能更好、磨损略不均 |
| `block_count` | 分区总块数 | 更大容量 | 设 `0` 可从 superblock 自动探测 |

`read_size` / `prog_size` **必须匹配芯片手册**——设错会导致驱动越界或 silent corruption。

## 踩过的坑

1. **忘了 `close` 就断电**：`write` 成功只表示进了 FS 缓存层，**commit 在 `close`/`sync`**。日志里「写成功但重启丢数据」多半是这里。

2. **`sync` 是空实现但硬件有 cache**：SPI Flash 或 QSPI 控制器若内部缓冲，`sync` 必须 flush，否则 littlefs 的读回校验也救不了。

3. **`prog` 必须遵守 Flash 语义**：NOR 只能 `1→0`，不能 `0→1` 除非先 `erase`。RAM 模拟可以偷懒；真芯片要在 `prog` 里做 read-modify-write 或按页合并。

4. **首启 `format` 会清空分区**：`mount` 失败就 `format` 是官方示例模式；OTA 双分区时要**只对数据分区** format，别误擦固件槽。

5. **与 SPIFFS 选型**：小容量、以 append 为主、文件数少，SPIFFS 有时更快；**文件数多、需要目录树、RAM 要硬上限**，littlefs 更合适。

6. **多线程要开 `LFS_THREADSAFE`**：并在 `lfs_config` 提供 `lock`/`unlock`；默认单线程。

7. **全分区擦除 ≠ `lfs_format`**：出厂擦除 Flash 后仍要 `lfs_format` 写 superblock；反之 `lfs_format` 不会帮你擦物理芯片上 FS 以外的区域。

## 适用 vs 不适用

**适用**：

- MCU / MPU 上 SPI NOR、QSPI、片内 Flash 的用户数据区
- 需要 **目录 + 配置文件 + 小日志**，且可能**突然断电**
- RAM 预算固定（几 KB～几十 KB），不能接受 FS 随文件增多涨内存
- 已有 RTOS（[[zephyr]]、FreeRTOS、Mbed）但需要标准 FS 层

**不适用**：

- 需要 mount 到 Windows/macOS 且不想装驱动——用 **FAT/exFAT**（[[ChaN FatFs]]）换即插即用，牺牲掉电安全
- 大容量 eMMC + Linux——直接用 ext4 / f2fs
- 纯键值、无路径——可能 [[sqlite]] 或嵌入式 KV 更简单
- 需要完整 POSIX（mmap、硬链接、权限位）——littlefs 只覆盖子集

## 和相近方案对比

| 方案 | 掉电安全 | RAM | 磨损均衡 | PC 互读 |
|------|----------|-----|----------|---------|
| **littlefs** | 强（COW + metadata pair） | 有界 | 动态 | 需工具/FUSE |
| SPIFFS | 强 | 随文件数增 | 静态 | 需工具 |
| FatFs | 弱 | 小 | 无 | 原生 |
| 裸 Flash 键值 | 看实现 | 最小 | 看实现 | 无 |

## 历史与设计来源

littlefs 最初是 ARM 工程师 **Christopher Haster（geky）** 的实验项目：在 MCU 约束下能否做出**不依赖无界 RAM** 的掉电安全 FS。设计文档 [DESIGN.md](https://github.com/littlefs-project/littlefs/blob/master/DESIGN.md) 和 on-disk 规范 [SPEC.md](https://github.com/littlefs-project/littlefs/blob/master/SPEC.md) 写得很透——metadata pair 来自 JFFS 思路，CTZ 结构参考了 ColaFS 等论文，整体是「**小 log 管元数据 + 大树管数据 + 统一分配器管磨损**」的分层蛋糕。

## 延伸阅读

- 官方仓库：[littlefs-project/littlefs](https://github.com/littlefs-project/littlefs)
- API 注释：[lfs.h](https://github.com/littlefs-project/littlefs/blob/master/lfs.h)
- 在 [[zephyr]] 中启用：`CONFIG_FILE_SYSTEM_LITTLEFS` + devicetree 分区
- 对比 SPIFFS / Dhara / FatFs：见官方 README Related projects 一节
