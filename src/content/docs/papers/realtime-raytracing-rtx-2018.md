---
title: Real-Time Ray Tracing on NVIDIA RTX Hardware
来源: https://developer.nvidia.com/blog/real-time-ray-tracing/
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
---

## 日常类比：手电筒与黑暗的房间

想象你走进一间完全黑暗的、满是镜子的大房子。

**传统渲染（光栅化）** 像是让一个人拿着手电筒，从房间门口朝一个方向快速扫射，只照亮他看得见的墙壁表面。速度快，但光线永远不会拐弯——你看不见镜子反射出的另一个房间的景象。

**光线追踪（Ray Tracing）** 则是让每一束光从你的眼睛出发，逆向射进房间——碰到镜子就弹开，碰到玻璃就穿过，碰到不透明的墙就停下。这样能精确模拟真实世界中光线的反射、折射和阴影。问题是：算这些东西需要大量时间。

**NVIDIA RTX 的突破** 是给每束光配备了 1000 个助手，每个助手同时负责一束光。配合专门的硬件加速结构，原本需要几分钟的计算被压缩到几毫秒——这就是"实时"的含义。

---

## 核心概念

### 1. 从光栅化到光线追踪

传统图形管线（光栅化管线）的工作流程是：

1. 把 3D 模型的三角面片投影到 2D 屏幕上
2. 逐个像素填充颜色（"片元"）
3. 用近似公式（如 Phong 模型）计算光照

这种方式的本质是**正向建模**：从物体到屏幕，速度快但真实感有限。

光线追踪则是**逆向建模**：从屏幕上的像素点出发，逆向追踪光线的路径。核心算法是**射线求交（Ray-Sphere/Ray-Triangle Intersection）**——判断一条射线是否击中某个几何体。

### 2. 光线追踪的核心公式

给定一条射线（Ray），由原点 O 和方向 D 定义：

```
R(t) = O + tD
```

要判断射线是否与球体相交，球心 C、半径 r，解方程：

```
|O + tD - C|² = r²
```

展开为二次方程后求解 t，即可得到交点。

### 3. NVIDIA RTX 的硬件加速

RTX 显卡引入了两个关键的硬件单元：

- **RT Core（光线追踪核心）**：专门用于加速射线-图元求交测试。传统 GPU 需要几百个 CUDA 核心来模拟一次求交，RT Core 一条指令就能完成。
- **Tensor Core**：用于 AI 加速，在 RTX 光线追踪中主要用于 DLSS（深度学习超级采样），通过 AI 低分辨率渲染 + 超采样 upscale 来保证帧率。

### 4. BVH（层次包围盒）

如果每束光线都要和场景中所有三角面片求交，复杂度是 O(N)。BVH 将场景组织成树形结构：

```
       [Root BVH Node]
      /                \
  [Left Child]      [Right Child]
  /      \          /        \
Mesh L1  Mesh L2  Mesh R1  Mesh R2
```

射线首先测试是否命中父节点的包围盒，如果不命中就跳过整个子树。复杂度降为 O(log N)。

RTX 硬件在 RT Core 中实现了**并行 BVH 遍历**，这是实时光线追踪的关键。

---

## 代码示例

### 示例 1：基础光线-球体求交（C++ 概念实现）

```cpp
// 定义一条射线
struct Ray {
    float3 origin;   // 射线起点（通常为相机位置）
    float3 direction; // 射线方向（已归一化）
};

// 定义一个球体
struct Sphere {
    float3 center;
    float radius;
};

// 计算射线与球体的交点
// 返回交点距离 t，若不相交则返回 FLT_MAX
float intersectSphere(const Ray& ray, const Sphere& sphere) {
    // 向量 OC = 球心 - 射线原点
    float3 oc = sphere.center - ray.origin;

    // 投影：a = D · D = 1（因为方向已归一化）
    // b = D · OC
    // c = OC · OC - r²
    float a = dot(ray.direction, ray.direction);
    float b = 2.0f * dot(ray.direction, oc);
    float c = dot(oc, oc) - sphere.radius * sphere.radius;

    // 判别式
    float discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
        return FLT_MAX; // 不相交
    }

    // 取较小的正 t 值（最近的交点）
    float t = (-b - sqrtf(discriminant)) / (2.0f * a);
    return t > 0 ? t : FLT_MAX;
}

// 计算交点颜色
float3 trace(const Ray& ray, const std::vector<Sphere>& scene, int depth) {
    if (depth <= 0) return float3(0, 0, 0); // 递归深度限制

    float closestT = FLT_MAX;
    const Sphere* hitSphere = nullptr;

    // 遍历场景中所有球体，找到最近的交点
    for (const auto& sphere : scene) {
        float t = intersectSphere(ray, sphere);
        if (t < closestT) {
            closestT = t;
            hitSphere = &sphere;
        }
    }

    if (!hitSphere) {
        return float3(0.2, 0.2, 0.2); // 背景色
    }

    // 计算交点
    float3 hitPoint = ray.origin + ray.direction * closestT;
    float3 normal = normalize(hitPoint - hitSphere->center);

    // 生成两条反射/折射射线，递归追踪
    Ray reflected = { hitPoint, reflect(ray.direction, normal) };
    Ray refracted = { hitPoint, refract(ray.direction, normal, 1.5f) };

    // 混合反射和折射颜色
    return 0.5f * trace(reflected, scene, depth - 1)
         + 0.5f * trace(refracted, scene, depth - 1);
}
```

### 示例 2：Vulkan Ray Tracing Pipeline（GLSL 光线追踪着色器）

```glsl
#version 460
#extension GL_EXT_ray_query : require

// 定义光线属性
layout(set = 0, binding = 0) uniform accelerationStructureEXT tlas;

// 输入：从光栅化阶段传递过来的像素坐标
layout(location = 0) in vec2 fragCoord;

// 输出：最终像素颜色
layout(location = 0) out vec4 outColor;

// 相机参数
layout(set = 1, binding = 0) uniform Camera {
    mat4 viewMatrix;
    mat4 projectionMatrix;
    vec3 cameraPosition;
} camera;

// 主光线追踪函数
void main() {
    // 1. 根据像素坐标构建射线
    vec2 uv = (fragCoord - 0.5) * 2.0;
    vec4 viewDir = inverse(projectionMatrix) * vec4(uv, -1.0, 1.0);
    viewDir.w = 0.0;

    // 在相机空间中转换射线方向
    vec3 direction = mat3(viewMatrix) * viewDir.xyz;

    // 2. 初始化 rayQuery
    rayQueryEXT rayQuery;
    rayQueryInitializeEXT(
        rayQuery,
        tlas,
        GL-RayFlagsTerminateOnFirstHitEXT,
        0xFF,
        cameraPosition,
        0.0,       // near plane
        1000.0,    // far plane
        direction
    );

    // 3. 追踪光线
    while (rayQueryProceedEXT(rayQuery)) {
        // 检查是否命中了三角面片
        if (rayQueryGetIntersectionTypeEXT(rayQuery, true) ==
            RayQueryCommittedIntersectionTriangleEXT) {
            // 获取交点信息
            float t = rayQueryGetIntersectionTEXT(rayQuery, true);
            vec3 hitPoint = cameraPosition + direction * t;

            // 获取法线和材质属性
            vec3 normal = normalize(
                rayQueryGetIntersectionNormalEXT(rayQuery, true)
            );

            // 简单的光照计算（Phong 模型）
            vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
            float diff = max(dot(normal, lightDir), 0.0);

            outColor = vec4(diff * vec3(1.0), 1.0);
            return; // 找到最近交点，结束
        }
    }

    // 4. 未命中任何物体，返回背景色
    outColor = vec4(0.1, 0.1, 0.1, 1.0);
}
```

### 示例 3：BLAS 构建（Ray Tracing Acceleration Structure，C++ 伪代码）

```cpp
// 构建底部级别加速结构（Bottom-Level Acceleration Structure）
// BLAS 包含单个几何体的光线追踪加速结构

VkBuffer buildBlasBuffers(
    const std::vector<Triangle>& triangles,
    VkDevice device
) {
    // 1. 查询构建后所需的缓冲区大小
    VkAccelGeometryDataEXT geometry;
    geometry.type = GEOMETRY_TRIANGLES_EXT;
    geometry.triangles.pVertexData = triangles.data();

    // 2. 构建 BLAS（底层加速结构）
    VkBuildAccelerationStructureFlagsEXT flags =
        VK_BUILD_ACCELERATION_STRUCTURE_ALLOW_COMPACTION_BIT;

    // RTX 硬件通过 RT Core 加速 BVH 遍历
    // 每个 RT Core 可以同时处理多条射线的 BVH 遍历
    VkAccelerationStructureBuildGeometryInfoEXT buildInfo = {
        .type = VK_ACCELERATION_STRUCTURE_TYPE_BOTTOM_LEVEL_EXT,
        .flags = flags,
        .mode = VK_BUILD_ACCELERATION_STRUCTURE_MODE_BUILD_EXT,
        .geometryCount = 1,
        .pGeometries = &geometry
    };

    // 3. 创建 TLAS（顶层加速结构）
    // TLAS 将多个 BLAS 组合成一个完整的场景加速结构
    VkAccelerationStructureBuildGeometryInfoEXT tlasBuildInfo = {
        .type = VK_ACCELERATION_STRUCTURE_TYPE_TOP_LEVEL_EXT,
        .mode = VK_BUILD_ACCELERATION_STRUCTURE_MODE_BUILD_EXT,
        .geometryCount = 1,
        .pGeometries = &tlasGeometry
    };

    return nullptr;
}
```

---

## 关键术语对照表

| 术语 | 含义 | 类比 |
|------|------|------|
| Ray | 从相机发出的探测线 | 手电筒光束 |
| Triangle | 场景中的最小几何单位 | 一面墙 |
| Intersection | 光线击中几何体 | 光打在墙上 |
| BVH | 层次包围盒树结构 | 房子的楼层平面图 |
| BLAS | 底部加速结构（单个模型） | 一件家具的内部结构 |
| TLAS | 顶部加速结构（整个场景） | 整栋房子的楼层图 |
| RT Core | NVIDIA 硬件光线求交单元 | 1000 个同时照射手电筒的人 |
| Tensor Core | AI 计算单元（用于 DLSS） | 智能画质增强助手 |
| Ray Payload | 光线携带的信息（颜色、深度等） | 手电筒带回来的情报 |
| Hit Shader | 命中时执行的着色器 | 看到墙后决定墙的颜色 |
| Miss Shader | 未命中时的着色器 | 看到天空时的背景色 |

---

## 总结

NVIDIA RTX 实时光线追踪的核心创新在于**专用硬件（RT Core）+ 高效数据结构（BVH）+ AI 增强（Tensor Core/DLSS）** 的三结合。

传统光栅化是"从物体到像素"的近似方法，而光线追踪是"从像素到物体"的物理精确方法。RTX 通过 RT Core 将光线求交的复杂度从 O(N) 降至 O(log N)，使得在消费级硬件上实现 60 FPS 的光线追踪成为可能。

对于初学者来说，理解光线追踪的关键是：**不要从公式开始，要从"光线如何从相机出发找到交点"这个过程开始**。公式只是描述这个过程的语言。
