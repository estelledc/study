---
title: "零基础学习笔记：像 1997 年一样编译 Quake"
来源: "https://fabiensanglard.net/compile_like_1997/"
日期: 2026-06-13
分类_原始: 游戏开发
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# 零基础学习笔记：像 1997 年一样编译 Quake

## 一、从日常类比开始

想象一下你想做一道菜，菜谱上写着"取面粉、鸡蛋、牛奶，混合后烘烤"。

在现代，你打开一个厨房（叫 VS Code），按下"一键烘焙"按钮，烤箱自己就把蛋糕做好了。

但在 1997 年，没有"一键烘焙"。你需要：

1. 先建一个厨房（安装操作系统 Windows NT 4）
2. 买一套厨具（安装开发工具 Visual C++ 6）
3. 去超市买食材（下载 Quake 的源代码）
4. 按步骤手动操作，中间可能还会遇到"烤箱坏了"这种意外

Fabien Sanglard 的文章就是带你完整体验这个过程——在 1997 年的环境下，从零搭建工具链，把 Quake 这个经典游戏的源代码编译成能运行的程序。

## 二、Quake 是什么？

Quake 是 1996 年由 id Software 公司发布的 3D 第一人称射击游戏，是电子游戏史上第一款真正意义上的 3D 多人在线游戏。它的源代码后来被公开，成为程序员学习和研究的重要资料。

最早的 Quake 可执行文件 `quake.exe` 和 `vquake.exe` 是在 HP 712-60 电脑上用 NeXT 系统编写，再通过 DJGPP 工具在 DEC Alpha 服务器上交叉编译生成的。1996 年 6 月游戏发售后，id Software 因为 NeXT 平台的停滞，将开发环境迁移到了运行 Windows NT 的 Intergraph 工作站上。

之后的版本 `winquake.exe`、`glquake.exe` 以及 QuakeWorld 都是在 Windows NT 上用 Visual C++ 4.X 编译的。

## 三、核心概念

### 3.1 编译器（Compiler）

编译器是把人类写的源代码翻译成计算机能执行的机器码的程序。

**类比**：编译器就像一个翻译官。你用 C 语言写的代码是人类可读的，但电脑只认识 0 和 1。编译器的作用就是把 C 语言翻译成机器指令。

```c
// 这是用 C 语言写的源代码（人类可读）
#include <stdio.h>

int main() {
    printf("Hello, Quake!\n");
    return 0;
}
```

上面的代码经过编译器处理后，会变成类似这样的机器指令（二进制，电脑能理解）：

```
55                      ; push ebp
8B EC                   ; mov ebp, esp
83 EC 10                ; sub esp, 0x10
C7 04 24 XX XX XX XX    ; push offset "Hello, Quake!"
E8 XX XX XX XX          ; call printf
B8 00 00 00 00          ; mov eax, 0
83 C4 10                ; add esp, 0x10
5D                      ; pop ebp
C3                      ; ret
```

### 3.2 汇编器（Assembler）

有些性能关键的代码，程序员会直接用汇编语言手写，因为汇编语言能更精细地控制 CPU。汇编器负责把这些汇编代码翻译成机器码。

**类比**：如果编译器是翻译官，汇编器就是一个特别专业的口译员——只处理非常特定的领域，但效率极高。

Quake 中有一些手写的优化汇编代码，存放在 `.s` 文件中，由 Michael Abrash 编写。这些代码需要用 `ml.exe`（Microsoft Macro Assembler）来编译。

```asm
; 这是一个简化的汇编代码示例（.s 文件中的内容）
; 功能：计算两个数的最大值
_max PROC
    push ebp
    mov ebp, esp
    mov eax, [ebp+8]      ; 第一个参数放入 eax
    cmp eax, [ebp+12]     ; 与第二个参数比较
    jg .done              ; 如果第一个更大，跳到 .done
    mov eax, [ebp+12]     ; 否则取第二个参数
.done:
    pop ebp
    ret
_max ENDP
```

### 3.3 工作区（Workspace）和项目文件

在 Visual C++ 6 中，一个项目由两种文件管理：

- `.dsw`（Workspace，工作区）：像一个文件夹，里面包含多个项目
- `.dsp`（Project，项目）：每个项目的具体配置和文件列表

**类比**：`.dsw` 就像一本笔记本的封面，`.dsp` 是里面的每一页。封面告诉你这本笔记本叫什么，每一页记录一个具体的项目。

```
WinQuake.dsw          ← 工作区文件（笔记本封面）
├── WinQuake.dsp      ← 主项目文件（第 1 页）
├── QCommon.dsp       ← 公共模块（第 2 页）
└── QClient.dsp       ← 客户端模块（第 3 页）
```

### 3.4 交叉编译（Cross-Compilation）

在开发 Quake 的最早期，开发者在一台电脑上编写代码，然后在另一台不同架构的电脑上编译生成目标平台的可执行文件。这叫做交叉编译。

**类比**：你在北京写了一封信，但收件人在上海。你把信交给上海的邮局来翻译和寄送，而不是自己在北京翻译。

## 四、编译 Quake 的实际步骤

以下是 Fabien 文章中记录的完整流程，每一步都是真实发生的：

### 步骤 1：安装 Windows NT 4

Windows NT 4 是微软在 1996 年发布的操作系统。它的特点是简洁、稳定，启动画面只显示 CPU 数量和内存大小，没有任何花哨的动画。

> Windows NT 4 的启动界面非常极简，自豪地显示检测到的 CPU 数量和内存大小。

### 步骤 2：安装 Visual C++ 6

Visual C++ 6 是 1999 年发布的开发工具。注意，Quake 最初是用 VC++ 4.X 开发的，但后来迁移到了 VC++ 6。

安装过程中有几个坑：

1. **产品密钥**：在那个没有"永久联网"的年代，软件靠产品密钥防盗版
2. **分辨率问题**：安装界面的进度条看起来位置很奇怪，因为它只针对 640x480 或 800x600 设计，而开发者用的是 1280x1024 的高分辨率显示器
3. **Service Pack 5 的安装陷阱**：直接运行 `setupsp5.exe` 会失败，需要先运行同一目录下 `vs6spp5.exe` 解压出来的 `mdac_typ.exe`

### 步骤 3：获取源代码

**重要警告**：不要从 GitHub 下载源代码，也不要用 FTP 传输文件！因为这会改变文件的换行符格式，导致 `.dsw` 工作区文件损坏。VC++ 6 将无法识别项目，而且不会给出任何错误提示——它只会打开后显示没有关联的文件。你会因此浪费半天时间调试。

正确的做法是从 Quake Official Archive 获取 `q1source.zip`，然后用 WinRAR 2.50 解压。

### 步骤 4：打开工作区

在 VC++ 6 中选择"Open Workspace"，然后选择 `WinQuake.dsw`。

### 步骤 5：第一次编译（会失败）

点击"Rebuild All"后，编译会失败，因为 VC++ 6 无法组装那些包含 Michael Abrash 手写优化汇编的 `.s` 文件。

### 步骤 6：安装处理器包

需要安装 Visual Studio 6.0 Processor Pack（`vcpp5.exe`），安装后你会在 VC++ 6 的 bin 文件夹中看到 `ml.exe`（汇编器）和 `cl.exe`（编译器）两个工具。

### 步骤 7：重新编译（成功！）

重新打开项目并点击"Rebuild All"，这次应该能成功编译出 `winquake.exe`。

最后还需要复制 `PmProXX.dll`、`WdirXX.dll` 以及 `id1` 游戏数据目录，游戏就能运行了。

## 五、代码示例详解

### 示例 1：C 语言源代码（Quake 的风格）

Quake 的代码主要是 C 语言写的。下面是一个简化版的渲染相关代码示例，展示 1997 年游戏代码的典型风格：

```c
// 简化版：Quake 的屏幕渲染函数
// 每个像素一个像素地绘制，没有现代 GPU 的硬件加速

void R_DrawRefreshPixels(void)
{
    int i;
    byte *dest;
    
    // dest 指向帧缓冲区的起始位置（屏幕上的每个像素）
    dest = (byte *)vid.buffer;
    
    // 逐行扫描：1997 年的显卡是逐行渲染的
    for (i = 0; i < vid.height * vid.width; i++) {
        // 直接从缓存读取颜色值写入屏幕
        // 没有双缓冲、没有 VSync，所以会有画面撕裂
        dest[i] = r_lightstyle[i % 256];
    }
}
```

这段代码展示了几个关键特点：

- 直接操作内存（`vid.buffer` 指向显存）
- 逐像素渲染，没有现代的图形 API（如 OpenGL 的高级特性）
- 使用查表法（`r_lightstyle[i % 256]`）来加速光照效果

### 示例 2：汇编优化代码（Michael Abrash 的手写代码）

Quake 的性能瓶颈主要在渲染部分。Michael Abrash 为 Quake 编写了大量手写的汇编优化代码。下面是一个简化示例：

```asm
; 简化版：Quake 的光线投射（ray casting）核心循环
; 这段汇编代码比等效的 C 代码快 3-5 倍

raycast PROC
    push ebp
    mov ebp, esp
    
    ; esi = 当前射线方向
    ; edi = 帧缓冲区指针
    ; ebx = 关卡数据结构
    
    .loop:
        ; 计算射线与网格线的交点
        mov eax, [esi]          ; 读取射线 x 坐标
        cmp eax, 640            ; 是否超出屏幕宽度
        jge .done               ; 超出则退出循环
        
        ; 查找当前像素对应的墙面纹理坐标
        mov ecx, eax
        shr ecx, 4              ; 除以 16（位运算代替除法，更快）
        movzx edx, byte ptr [ebx+ecx]   ; 查表获取纹理索引
        
        ; 将纹理颜色写入帧缓冲区
        mov [edi], dl           ; 写入像素颜色
        
        ; 移动到下一个像素
        add esi, 4              ; 射线步进
        add edi, 1              ; 帧缓冲区步进
        
        jmp .loop
    
    .done:
    pop ebp
    ret
raycast ENDP
```

这段汇编代码的关键优化技巧：

- **位运算代替除法**：`shr ecx, 4` 等价于 `ecx / 16`，但速度快得多
- **直接内存访问**：不经过高级抽象，直接读写内存地址
- **循环展开**：实际代码中会将循环体复制多次，减少跳转开销

## 六、为什么这件事值得做？

### 6.1 理解现代工具背后的原理

今天我们用 `npm run build` 或 `go build` 一条命令就能完成编译。但了解 1997 年的编译过程，能让你理解：

- 为什么编译有时会失败（缺少依赖、版本不匹配）
- 为什么项目文件（`.dsw`、`.dsp`）如此重要
- 为什么换行符格式会影响构建

### 6.2 感受技术演进的深度

从 NeXT 到 Windows NT，从 VC++ 4.X 到 VC++ 6，从手工汇编优化到现代编译器自动优化——这个过程本身就是一部微缩的软件工程进化史。

### 6.3 培养调试耐心

Fabien 提到："不要浪费一个小时去别处下载 MDAC。你只需要运行那个已经在文件夹里了的可执行文件。" 这种"在已有资源中寻找答案"的能力，是所有工程师必备的素质。

## 七、关键收获总结

| 概念 | 1997 年的做法 | 今天的做法 |
|------|--------------|-----------|
| 安装系统 | 从光盘手动安装 Windows NT 4 | 云服务器一键部署 |
| 开发工具 | Visual C++ 6 + Service Pack 5 | VS Code + 智能补全 |
| 获取源码 | FTP 下载 zip 文件 | Git clone |
| 编译构建 | 手动打开工作区，点击"Rebuild All" | `cargo build` / `npm run build` |
| 调试 | 断点 + 变量检查（没有自动补全） | 断点 + 变量检查 + 智能提示 |
| 汇编优化 | 手写 `.s` 文件，用 `ml.exe` 编译 | 编译器自动向量化优化 |

## 八、延伸学习

- [Quake Official Archive](https://github.com/Jason2Brownlee/QuakeOfficialArchive) — Jason Brownless 维护的 Quake 官方档案
- Fabien 的另一篇文章 [Quake ASM optimizations in-depth](https://fabiensanglard.net/quake_asm_optimizations/) — 深入讲解 Quake 的汇编优化
- Fabien 的 [Let's play QuakeWorld!](https://fabiensanglard.net/quakeworld/) — 体验 Quake 的多人网络对战

## 九、给初学者的建议

如果你是编程零基础，这篇文章可能看起来有点挑战。没关系，你可以：

1. 先了解什么是 C 语言和编译器（推荐搜索"C 语言入门教程"）
2. 尝试在今天的电脑上安装一个现代 IDE（如 VS Code），体验一下"一键编译"
3. 回来再看这篇文章，你会发现很多概念其实很直观

技术从来不是魔法，只是一系列可以理解的步骤。1997 年的程序员和我们一样，都是从"这是什么？"开始的。
