---
title: OpenXR SDK — Khronos VR/AR 标准
来源: 'https://github.com/KhronosGroup/OpenXR-SDK-Source'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 中级
---

## 是什么

**OpenXR** 是 Khronos Group 制定的 **跨平台 XR（扩展现实）API 标准**，覆盖 VR、AR、MR 整条光谱。日常类比：如果把各家头显（Quest、SteamVR、Windows MR、Pico……）比作不同品牌的「电影院放映系统」，那 OpenXR 就是**统一的电影票与放映协议**——你按同一套流程买票（创建实例）、选厅（绑定系统）、租银幕（Swapchain）、按帧放映（提交合成层），放映厅内部怎么接线由各家 Runtime 自己搞定，应用不必为每个品牌重写一套集成代码。

[OpenXR-SDK-Source](https://github.com/KhronosGroup/OpenXR-SDK-Source) 仓库提供 **Loader（加载器）**、示例 API Layer、**hello_xr** 等参考实现与构建脚本；若只想在应用里链接头文件和预编译 Loader，更轻量的 [OpenXR-SDK](https://github.com/KhronosGroup/OpenXR-SDK) 已包含生成好的 `openxr.h`，无需 Python 代码生成。规范当前主线为 **OpenXR 1.1**，Apache-2.0 协议。

```
应用 (Application)
    ↓ 调用 xrCreateInstance / xrWaitFrame …
OpenXR Loader          ← SDK 里你链接的库
    ↓ 可选注入
API Layers             ← 校验层、性能分析层等
    ↓
XR Runtime             ← Meta、Steam、Monado 等，管合成、追踪、输入
    ↓
头显 / 手柄 / 摄像头硬件
```

## 为什么重要

不了解 OpenXR，下面这些事很难讲清楚：

- 为什么同一款 PC VR 游戏能在 SteamVR 与 Windows Mixed Reality 上跑——应用只对着 OpenXR Runtime，不直接绑厂商 SDK
- 为什么 Quest 上既有原生 OpenXR 路径，也有通过兼容层转调的情况——**Loader 在运行时探测「当前活跃 Runtime」** 并绑定到 `XrInstance`
- 为什么图形 API 可以是 Vulkan、OpenGL、D3D11/12——通过 **KHR 扩展**（如 `XR_KHR_vulkan_enable`）把已有渲染管线「挂」进 Session，而不是另起一套 GPU API
- 为什么输入不再写死「A 键 / 扳机」——**Action / ActionSet** 把语义动作与具体手柄布局解耦，Runtime 负责建议绑定

## 核心概念

### 1. Loader 与 Runtime

**Loader** 是应用链接的薄库：负责枚举扩展、加载 API Layer、在 `xrCreateInstance` 时选中系统上**当前活跃**的 Runtime，并为每个 `XrInstance` 构建 **dispatch table**（函数调用链）。**Runtime** 则掌控完整 XR 子系统：姿态预测、帧合成、显示时序、设备驱动。类比：Loader 像电话总机，Runtime 像具体营业厅——你拨的是同一号码，接通哪家由当时在线的那家决定。

### 2. Instance（`XrInstance`）— 与 Runtime 的「总合同」

`xrCreateInstance` 传入 `XrInstanceCreateInfo`（应用名、API 版本、要启用的扩展列表），得到无父句柄的 `XrInstance`。之后几乎所有查询（扩展、系统、图形需求）都从这里出发。销毁 Instance 会级联销毁其下 Session、Space 等子句柄。

### 3. System（`XrSystemId`）— 逻辑上的「一套 XR 设备组」

`xrGetSystem` 根据 `XrFormFactor`（如 `XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY`）选中 Runtime 提供的一套显示 + 追踪 + 输入组合。你不需要知道具体是 Quest 3 还是 Index，只需对 `systemId` 创建 Session。

### 4. Session（`XrSession`）— 可渲染、可收输入的「工作会话」

`xrCreateSession` 必须附带 **图形绑定**（`XrGraphicsBindingVulkanKHR` 等，通过 `next` 链挂在 `XrSessionCreateInfo` 上）。Session 有状态机：`IDLE` → `READY` → `SYNCHRONIZED` → `VISIBLE` → `FOCUSED` → …，应用应在 `FOCUSED` 且已 `xrBeginSession` 后才跑帧循环。类比：Instance 是会员卡，Session 是你真正走进场馆、戴上头显的那一刻。

### 5. Swapchain 与帧循环 — 「双眼画布」的租借与归还

每个 Swapchain 是一组 GPU 图像（常为左右眼各一条链）。标准帧序列为：

1. `xrWaitFrame` — 等 Runtime 给出本帧 `predictedDisplayTime`
2. `xrBeginFrame`
3. 对每个 Swapchain：`xrAcquireSwapchainImage` → 渲染 → `xrWaitSwapchainImage` → `xrReleaseSwapchainImage`
4. `xrEndFrame` — 提交 `XrCompositionLayerProjection` 等合成层

Runtime 负责畸变、合成、重投影；应用只填「每层里左右眼的视图矩阵与 Swapchain 切片」。

### 6. Space、View、Action — 追踪、相机与输入

- **Space**（`XrSpace`）：坐标系锚点（`VIEW`、`LOCAL`、`STAGE` 等），`xrLocateSpace` 得位姿
- **View**：每帧 `xrLocateViews` 返回左右眼 FOV、位姿，用于投影矩阵
- **ActionSet / Action**：声明「跳跃」「抓取」等语义；`xrSyncActions` 后读 `XrActionState*`；手柄物理键由 Runtime 通过 **Interaction Profile** 建议绑定

### 7. 扩展（Extension）与 API Layer

**扩展**以 `XR_KHR_*`、`XR_EXT_*` 等字符串启用，能力从图形绑定到手部追踪、透视混合等。**API Layer** 可选插入 Loader 与 Runtime 之间，用于校验、截帧、性能统计——类似 Vulkan Validation Layer。

## 第一个示例：最小 Instance 创建与扩展探测（C++）

下列代码展示零基础应用最常写的「第一步」：创建 Instance、查询 Runtime 名称与版本、枚举一层扩展、干净退出。错误处理用 `XR_CHECK` 宏简化（生产代码应完整处理 `XrResult`）。

```cpp
#define XR_USE_PLATFORM_WIN32
#define XR_USE_GRAPHICS_API_VULKAN
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>
#include <iostream>
#include <vector>

#define XR_CHECK(expr) \
  do { \
    XrResult r = (expr); \
    if (XR_FAILED(r)) { \
      std::cerr << "OpenXR error " << r << " at " << __FILE__ << ":" << __LINE__ << "\n"; \
      return 1; \
    } \
  } while (0)

int main() {
  XrInstance instance{XR_NULL_HANDLE};

  XrInstanceCreateInfo createInfo{XR_TYPE_INSTANCE_CREATE_INFO};
  createInfo.applicationInfo.apiVersion = XR_CURRENT_API_VERSION;
  strncpy(createInfo.applicationInfo.applicationName, "HelloOpenXR",
          XR_MAX_APPLICATION_NAME_SIZE);
  strncpy(createInfo.applicationInfo.engineName, "StudyNotes",
          XR_MAX_ENGINE_NAME_SIZE);
  createInfo.applicationInfo.applicationVersion = 1;
  createInfo.applicationInfo.engineVersion = 1;

  const char* extensions[] = {XR_KHR_VULKAN_ENABLE_EXTENSION_NAME};
  createInfo.enabledExtensionCount = 1;
  createInfo.enabledExtensionNames = extensions;

  XR_CHECK(xrCreateInstance(&createInfo, &instance));

  XrInstanceProperties props{XR_TYPE_INSTANCE_PROPERTIES};
  XR_CHECK(xrGetInstanceProperties(instance, &props));
  std::cout << "Runtime: " << props.runtimeName
            << " (version " << XR_VERSION_MAJOR(props.runtimeVersion) << "."
            << XR_VERSION_MINOR(props.runtimeVersion) << "."
            << XR_VERSION_PATCH(props.runtimeVersion) << ")\n";

  uint32_t extCount = 0;
  XR_CHECK(xrEnumerateInstanceExtensionProperties(nullptr, 0, &extCount, nullptr));
  std::vector<XrExtensionProperties> extProps(
      extCount, {XR_TYPE_EXTENSION_PROPERTIES});
  XR_CHECK(xrEnumerateInstanceExtensionProperties(
      nullptr, extCount, &extCount, extProps.data()));
  std::cout << "Instance extensions available: " << extCount << "\n";

  xrDestroyInstance(instance);
  return 0;
}
```

编译时需链接平台 Loader（Windows 上常为 `openxr_loader`），并保证头显对应的 Runtime 已安装，否则 `xrCreateInstance` 可能失败或枚举不到 HMD 系统。

## 第二个示例：Session 帧循环骨架（伪代码 + 关键 API）

完整 Vulkan/D3D 绑定篇幅很长，下面抽出**与图形 API 无关的帧骨架**，对应 `hello_xr` 主循环结构；左右眼各一条 Swapchain 时，在 `RenderView` 内对 `swapchainIndex` 做 GPU 绘制即可。

```cpp
// 假定已完成：instance, systemId, session, swapchains[], spaces...

void XrApp::PollEvents() {
  XrEventDataBuffer event{XR_TYPE_EVENT_DATA_BUFFER};
  while (xrPollEvent(instance, &event) == XR_SUCCESS) {
    if (event.type == XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED) {
      auto* ev = reinterpret_cast<XrEventDataSessionStateChanged*>(&event);
      sessionState = ev->state;
      if (sessionState == XR_SESSION_STATE_READY) {
        XrSessionBeginInfo beginInfo{XR_TYPE_SESSION_BEGIN_INFO};
        beginInfo.primaryViewConfigurationType =
            XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
        xrBeginSession(session, &beginInfo);
      }
      if (sessionState == XR_SESSION_STATE_STOPPING) {
        xrEndSession(session);
      }
    }
  }
}

void XrApp::RenderFrame() {
  if (sessionState != XR_SESSION_STATE_FOCUSED) return;

  XrFrameWaitInfo waitInfo{XR_TYPE_FRAME_WAIT_INFO};
  XrFrameState frameState{XR_TYPE_FRAME_STATE};
  XR_CHECK(xrWaitFrame(session, &waitInfo, &frameState));

  XrFrameBeginInfo beginInfo{XR_TYPE_FRAME_BEGIN_INFO};
  XR_CHECK(xrBeginFrame(session, &beginInfo));

  // 定位双眼视图（FOV + 位姿）
  XrViewState viewState{XR_TYPE_VIEW_STATE};
  uint32_t viewCount = 2;
  std::array<XrView, 2> views{
      XrView{XR_TYPE_VIEW}, XrView{XR_TYPE_VIEW}};
  XrViewLocateInfo locateInfo{XR_TYPE_VIEW_LOCATE_INFO};
  locateInfo.viewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
  locateInfo.displayTime = frameState.predictedDisplayTime;
  locateInfo.space = appSpace;
  XR_CHECK(xrLocateViews(session, &locateInfo, &viewState, viewCount, &viewCount,
                         views.data()));

  for (uint32_t eye = 0; eye < viewCount; ++eye) {
    uint32_t imageIndex = 0;
    XrSwapchainImageAcquireInfo acquireInfo{XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO};
    XR_CHECK(xrAcquireSwapchainImage(swapchains[eye], &acquireInfo, &imageIndex));
    // --- 在此用 Vulkan/OpenGL/D3D 渲染到 swapchainImages[eye][imageIndex] ---
    XrSwapchainImageWaitInfo waitImg{XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO};
    waitImg.timeout = XR_INFINITE_DURATION;
    XR_CHECK(xrWaitSwapchainImage(swapchains[eye], &waitImg));
    XrSwapchainImageReleaseInfo releaseInfo{XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO};
    XR_CHECK(xrReleaseSwapchainImage(swapchains[eye], &releaseInfo));
  }

  XrCompositionLayerProjectionView projViews[2] = {/* 填 pose、fov、subImage */};
  XrCompositionLayerProjection layer{XR_TYPE_COMPOSITION_LAYER_PROJECTION};
  layer.space = appSpace;
  layer.viewCount = 2;
  layer.views = projViews;

  const XrCompositionLayerBaseHeader* layers[] = {
      reinterpret_cast<const XrCompositionLayerBaseHeader*>(&layer)};
  XrFrameEndInfo endInfo{XR_TYPE_FRAME_END_INFO};
  endInfo.displayTime = frameState.predictedDisplayTime;
  endInfo.environmentBlendMode = XR_ENVIRONMENT_BLEND_MODE_OPAQUE;
  endInfo.layerCount = 1;
  endInfo.layers = layers;
  XR_CHECK(xrEndFrame(session, &endInfo));
}
```

要点：**显示时间戳**（`predictedDisplayTime`）在 `WaitFrame`、`LocateViews`、`EndFrame` 间保持一致，Runtime 才能做异步重投影；Swapchain 图像必须成对 acquire/release，否则下帧会卡住。

## 第三个示例：Action 输入（声明语义，不绑物理键）

```cpp
XrActionSet actionSet{XR_NULL_HANDLE};
XrAction grabAction{XR_NULL_HANDLE};

XrActionSetCreateInfo setInfo{XR_TYPE_ACTION_SET_CREATE_INFO};
strncpy(setInfo.actionSetName, "gameplay", XR_MAX_ACTION_SET_NAME_SIZE);
setInfo.priority = 0;
xrCreateActionSet(instance, &setInfo, &actionSet);

XrActionCreateInfo actionInfo{XR_TYPE_ACTION_CREATE_INFO};
actionInfo.actionType = XR_ACTION_TYPE_FLOAT_INPUT;
strncpy(actionInfo.actionName, "trigger_click", XR_MAX_ACTION_NAME_SIZE);
strncpy(actionInfo.localizedActionName, "Trigger", XR_MAX_NAME_SIZE);
actionInfo.countSubactionPaths = 0;
xrCreateAction(actionSet, &actionInfo, &grabAction);

// Session 创建后：xrAttachSessionActionSets + xrSuggestInteractionProfileBindings
// 每帧：
XrActionsSyncInfo syncInfo{XR_TYPE_ACTIONS_SYNC_INFO};
syncInfo.countActiveActionSets = 1;
XrActiveActionSet active{actionSet, XR_NULL_PATH};
syncInfo.activeActionSets = &active;
xrSyncActions(session, &syncInfo);

XrActionStateGetInfo getInfo{XR_TYPE_ACTION_STATE_GET_INFO};
getInfo.action = grabAction;
XrActionStateFloat triggerState{XR_TYPE_ACTION_STATE_FLOAT};
xrGetActionStateFloat(session, &getInfo, &triggerState);
if (triggerState.currentState > 0.5f) { /* 开火 */ }
```

这样「扳机」在不同手柄上由 Runtime 映射，应用只读 0~1 浮点。

## 仓库结构与学习路径

| 路径 | 内容 |
|------|------|
| `include/openxr/` | 标准头文件 `openxr.h`、`openxr_platform.h` |
| `src/loader/` | Loader 实现，理解实例与 dispatch |
| `src/tests/hello_xr/` | **首选阅读**：完整图形绑定 + 多后端示例 |
| `src/api_layer/` | 如何编写 API Layer |
| `specification/registry/xr.xml` | 机器可读 API 注册表 |

建议学习顺序：**规范导读（Instance → Session → Rendering 三章）→ 构建 hello_xr → 改图形后端（Vulkan/OpenGL）→ 加 Action 输入**。若做 Android/Quest，再查 `XR_KHR_android_create_instance`、`XR_KHR_opengl_es_enable` 等扩展。

## OpenXR-SDK 与 OpenXR-SDK-Source 怎么选

| 项目 | 适用场景 |
|------|----------|
| **OpenXR-SDK-Source** | 改 Loader、写 Layer、读测试与生成逻辑、贡献 Khronos |
| **OpenXR-SDK** | 游戏/引擎集成：预生成头文件，CMake `find_package(OpenXR)` |

## 与 WebXR、引擎的关系

- **WebXR**（浏览器内）是另一套 JS API，概念上与 OpenXR 平行：会话、参考空间、XR 帧回调。A-Frame、Three.js 封装的是 WebXR，不是直接链 OpenXR C API
- **Godot 4 / Unity / Unreal** 通过官方或插件 OpenXR 后端对接 PC/独立头显；自研引擎则常直接链 Loader + Vulkan

## 常见坑

1. **未装 Runtime**：PC 上无 SteamVR / Oculus / Monado 等时，`xrGetSystem` 会失败——不是 SDK 坏了，是「放映厅没开门」
2. **图形绑定不匹配**：Session 的 `next` 链必须填与当前设备兼容的 `XrGraphicsBinding*`，且扩展已在 Instance 启用
3. **在错误 Session 状态渲染**：非 `FOCUSED` 时 `xrWaitFrame` 可能阻塞或返回空帧
4. **Swapchain 格式**：用 `xrEnumerateSwapchainFormats` 选 Runtime 支持的格式，别硬套桌面 SDR 格式
5. **混淆两个仓库**：应用集成优先 **OpenXR-SDK**；读 Loader 源码才去 **OpenXR-SDK-Source**

## 进一步阅读

- [OpenXR 1.1 规范（HTML）](https://registry.khronos.org/OpenXR/specs/1.1/html/xrspec.html)
- [Loader 设计与运作](https://registry.khronos.org/OpenXR/specs/1.0/loader.html)
- [OpenXR API 手册页](https://registry.khronos.org/OpenXR/specs/1.1/man/html/openxr.html)
- [hello_xr 源码](https://github.com/KhronosGroup/OpenXR-SDK-Source/tree/main/src/tests/hello_xr)
- [Khronos OpenXR 门户](https://www.khronos.org/openxr)
