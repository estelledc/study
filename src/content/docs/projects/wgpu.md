---
title: wgpu 零基础入门笔记
来源: https://github.com/gfx-rs/wgpu
日期: 2026-06-13
分类: 图形学
子分类: security-tools
provenance: pipeline-v3
---

# wgpu 零基础入门笔记

## 一、wgpu 是什么？

想象一下：CPU 像是一个总指挥，负责发号施令；GPU 像是一个庞大的工厂流水线，负责干重活——画像素、算光影、做变形。你想让 GPU 干活，就得先跟它"签合同"、"建厂房"、"写说明书"。wgpu 就是帮你跟 GPU 打交道的 Rust 库。

wgpu 是一个跨平台的纯 Rust 图形 API。它基于 W3C 的 WebGPU 标准设计，可以同时运行在多种后端上：

- **原生桌面**：Vulkan（Linux/Windows）、Metal（macOS/iOS）、Direct3D 12（Windows）
- **Web 端**：WebGPU 和 WebGL2（通过 WebAssembly）

它的核心设计原则就四个字：**安全、跨平台**。安全是指它通过 Rust 的借用检查和资源生命周期管理，让你在编译期就避开大部分 GPU 错误；跨平台是指你写一次代码，可以在桌面、移动端和浏览器上运行。

---

## 二、核心概念速查表

| 概念 | 日常类比 | wgpu 中的角色 |
|------|----------|--------------|
| **Instance** | 整个公司的存在 | 初始化 wgpu 库本身 |
| **Surface** | 一块画布 / 屏幕区域 | 渲染输出到的窗口或 canvas |
| **Adapter** | 显卡硬件 | 选择你机器上可用的 GPU |
| **Device** | 逻辑上的 GPU 连接 | 真正发命令的对象 |
| **Queue** | 快递传送带 | 按顺序把命令送进 GPU |
| **Buffer** | 一块内存集装箱 | 存放顶点数据、颜色等 |
| **Texture** | 一张图片 | 存放颜色、深度、纹理贴图 |
| **Shader** | 菜谱 / 配方 | 告诉 GPU 怎么算每个像素的颜色 |
| **Render Pipeline** | 整个烹饪流程 | 把 shader + 配置打包成一个"烹饪方案" |
| **Bind Group** | 调料台 | 把 texture 和 sampler 连到 shader 上 |
| **Command Encoder** | 做菜清单 | 把要做的菜逐一写下来 |
| **Render Pass** | 一道菜的制作过程 | 在清单中记录"做某道菜"的指令 |

核心流程的直觉模型：

```
你写代码 → Command Encoder 记录指令 → Queue 送进 GPU → GPU 画到 Surface
```

就像你给餐厅下单：先写在点菜单上（Encoder），然后交给厨房（Queue），厨房做完端出来（Surface）。

---

## 三、第一个代码示例：初始化 GPU

这是 wgpu 程序的"Hello World"——连接到 GPU。

```rust
use wgpu::{Instance, Device, Queue, Surface, Adapter, RenderPass};

// 1. 创建 Instance —— 这是 wgpu 的全局入口
let instance = Instance::new(&InstanceDescriptor {
    backends: wgpu::Backends::PRIMARY, // 优先用 Vulkan / Metal / D3D12
    ..Default::default()
});

// 2. 创建 Surface —— 告诉 wgpu 你要渲染到哪个窗口上
//    这里假设你用一个叫 `window` 的窗口对象（比如 winit 提供的）
let surface = instance.create_surface(window)?;

// 3. 找一张显卡 —— Adapter 就是你电脑里的 GPU
let adapter = instance
    .request_adapter(&wgpu::RequestAdapterOptions::default())
    .await
    .expect("找不到可用的 GPU");

// 4. 拿到 Device 和 Queue —— 这才是真正跟 GPU 对话的对象
let (device, queue) = adapter
    .request_device(
        &DeviceDescriptor {
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::default(),
            label: None,
        },
        None,
    )
    .await
    .expect("无法连接到 GPU");
```

每一步都在"层层递进"：
- **Instance** 是"开门"——启动 wgpu 库
- **Surface** 是"选画布"——告诉 wgpu 画到哪儿
- **Adapter** 是"选硬件"——找到你电脑上哪张显卡干活
- **Device + Queue** 是"签合同"——正式建立 GPU 连接，Device 管定义，Queue 管执行

---

## 四、第二个代码示例：创建一个渲染管线并画东西

这一步是核心中的核心——告诉 GPU **怎么画**。

```rust
// 假设你已经有了 device、queue 和 surface 的配置 config

// 1. 写一个 WGSL 着色器 —— 这是 GPU 上的"菜谱"
//    WGSL 是 WebGPU Shading Language 的缩写，专门给 GPU 写的语言
let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
    label: Some("基础着色器"),
    source: wgpu::ShaderSource::Wgsl(
        include_str!("shader.wgsl").into(),
    ),
});

// 2. 定义渲染管线 —— 把"菜谱"和"烹饪方式"打包
let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    label: Some("基础渲染管线"),
    layout: None, // 用默认的管线布局
    vertex: wgpu::VertexState {
        module: &shader,          // 用上面的 shader
        entry_point: Some("vs_main"), // 顶点着色器的入口函数名
        compilation_options: Default::default(),
        // 告诉 GPU 从 buffer 里读什么样的顶点数据
        buffers: &[wgpu::VertexBufferLayout {
            array_stride: 2 * sizeof(f32), // 每个顶点占 2 个 f32（x, y）
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[wgpu::VertexAttribute {
                offset: 0,
                shader_location: 0,  // 对应 shader 中的 @location(0)
                format: wgpu::VertexFormat::Float32x2,
            }],
        }],
    },
    primitive: wgpu::PrimitiveState {
        topology: wgpu::PrimitiveTopology::TriangleList, // 用三角形列表
        ..Default::default()
    },
    fragment: Some(wgpu::FragmentState {
        module: &shader,            // 同一个 shader 文件
        entry_point: Some("fs_main"), // 片元着色器的入口函数名
        compilation_options: Default::default(),
        targets: &[Some(wgpu::ColorTargetState {
            format: config.format,   // 屏幕缓冲区格式
            blend: None,             // 不需要混合
            write_mask: wgpu::ColorWrites::ALL, // 可以写入颜色
        })],
    }),
    depth_stencil: None,
    multisample: wgpu::MultisampleState::default(),
    multiview: None,
});

// 3. 每一帧渲染时：创建命令编码器、记录指令、提交
let command_encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
    label: Some("渲染命令编码器"),
});

{
    // 开始记录一个渲染通道
    let mut render_pass = command_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("基础渲染通道"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: &texture_view,    // 画到哪里 —— 纹理的视图
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), // 每帧先清空成黑色
                store: wgpu::StoreOp::Store,
            },
        })],
        ..Default::default()
    });

    // 设置要用哪个渲染管线
    render_pass.set_pipeline(&render_pipeline);

    // 画！draw 就是"开火"——告诉 GPU 开始画了
    render_pass.draw(0..3); // 画 3 个顶点（一个三角形）
}

// 4. 把命令编码器里记录的所有指令交给 Queue —— GPU 开始干活了
queue.submit(std::iter::once(command_encoder.finish()));
```

对应的 **shader.wgsl**（GPU 上的菜谱）：

```wgsl
// 顶点着色器：处理每个顶点的位置
@vertex
fn vs_main(@location(0) position: vec2<f32>) -> @builtin(position) vec4<f32> {
    return vec4<f32>(position, 0.0, 1.0);
}

// 片元着色器：决定每个像素的颜色
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.4, 0.4, 1.0); // 粉红色
}
```

---

## 五、完整流程总结

把上面两段代码串起来，wgpu 的完整生命周期是这样的：

```
┌──────────────────────────────────────────────────────┐
│  初始化阶段                                           │
│  ┌─────────┐  ┌────────┐  ┌──────────┐  ┌────────┐  │
│  │Instance │→ │Surface │→ │ Adapter  │→ │Device  │  │
│  └─────────┘  └────────┘  └──────────┘  └───┬────┘  │
│  ┌─────────┐                                │       │
│  │ Queue   │◄───────────────────────────────┘       │
│  └─────────┘                                       │
├──────────────────────────────────────────────────────┤
│  资源创建阶段（通常在初始化时做一次）                  │
│  Shader → RenderPipeline → Buffer → Texture          │
├──────────────────────────────────────────────────────┤
│  渲染循环（每一帧重复）                               │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ Command      │  │ Command      │                  │
│  │ Encoder      │→ │ Encoder      │                  │
│  │              │  │ finish()     │                  │
│  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                          │
│         ▼                 ▼                          │
│  ┌──────────────────────────────┐                   │
│  │     Queue.submit()           │                   │
│  │     (把命令送到 GPU 执行)     │                   │
│  └──────────────┬───────────────┘                   │
│                 ▼                                    │
│  ┌──────────────────────────────┐                   │
│  │        GPU 硬件               │                   │
│  │  顶点着色 → 光栅化 → 片元着色 │                   │
│  │  → 写入屏幕                   │                   │
│  └──────────────────────────────┘                   │
└──────────────────────────────────────────────────────┘
```

---

## 六、几个关键理解

1. **命令是"录制"式的**：你不能用 GPU 做任何"实时查询"——它只接受你预先录好的命令。Command Encoder 就是你的"摄像机"，Queue.submit 就是"按下播放键"。

2. **Pipeline 很重，要复用**：创建 RenderPipeline 是一个相对昂贵的操作（可能要编译 shader、做内部优化），所以通常在初始化时创建一次，渲染循环里直接复用。

3. **WGSL 是 GPU 的专属语言**：vertex shader 处理"顶点去哪儿"，fragment shader 决定"每个像素是什么颜色"。这两步合起来就是你看到的最终画面。

4. **所有资源都有生命周期**：wgpu 通过引用计数管理资源，当你不再需要 buffer、texture、shader 时，让它自然 drop 就行，不需要手动释放。

---

## 七、下一步学什么？

有了上面的基础，接下来的学习路径推荐：

- **Buffer 和顶点数据**：学习怎么把具体形状的坐标数据塞进 buffer，然后画出一个真正的三角形
- **Bind Group 和 Bind Group Layout**：学习怎么把纹理贴图和采样器绑定到 shader 上
- **Depth Buffer 和 Stencil Test**：学习处理"前面挡后面的"遮挡关系
- **Compute Shader**：不用来画画，而是用来做通用计算（物理模拟、图像处理等）
- **Learn Wgpu 教程**：https://sotrh.github.io/learn-wgpu/ —— 非常优秀的 wgpu 官方推荐教程，从入门到高级一步步来

---

## 参考资源

- wgpu 源码与仓库：https://github.com/gfx-rs/wgpu
- 在线文档：https://docs.rs/wgpu
- Learn Wgpu 教程：https://sotrh.github.io/learn-wgpu/
- WebGPU Fundamentals（JS 版，API 相似）：https://webgpu.github.io/webgpu-samples/
