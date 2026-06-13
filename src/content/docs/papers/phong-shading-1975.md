---
title: "Phong Shading 1975 — 用三项公式让 CG 物体看起来被光照过"
来源: https://www.cs.utah.edu/~bway/keith-phong.pdf
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
---

## 是什么

想象你在画画。桌上放着一个红苹果，一盏台灯从左上方照下来。你看到的苹果有三个层次：

1. **整个苹果都不是死黑的**——哪怕背光的那一面也能隐约看到轮廓。这是因为房间里到处都在反弹散射光。
2. **朝灯的一面比背灯的一面亮**——而且从亮到暗是平滑渐变的，不是硬切一刀。
3. **最亮处有一个小小的白点**——那是镜面反射形成的"高光"，你头一歪它就跑掉。

1975 年，Bui Tuong Phong 在他博士论文里把这三个层次拆成了**三个独立的数学公式**，合在一起就是一个像素颜色的计算公式：

```
I = ka·ia + Σ [ kd·(L·N)·id + ks·(R·V)^n·is ]
```

逐项拆开读：

- `ka·ia` —— **环境光**（ambient）：一个常数，让背光面不死黑
- `kd·(L·N)·id` —— **漫反射**（diffuse）：朝向光源越正（L 和 N 夹角越小），越亮
- `ks·(R·V)^n·is` —— **高光**（specular）：反射方向 R 和视线 V 越对齐，闪得越厉害
- `n` —— **光泽度**（shininess）：数值越大高光越集中、越锐利

其中 `L` 是光方向、`N` 是表面法线、`R` 是反射方向、`V` 是视线方向，全是单位向量；`·` 是点乘（等于夹角的余弦值）。

## 为什么重要

不理解 Phong，下面这些都会变成黑话：

- 为什么 Three.js 的材质叫 `MeshPhongMaterial`、属性叫 `shininess` 和 `specular`——名字直接来自 1975 这篇
- 为什么所有图形学入门课**第一个能跑的着色器**都是这 8 行公式
- 为什么 50 年后的 PBR（Cook-Torrance、GGX）依然沿用 `diffuse + specular` 这种拆分思路
- 为什么 OpenGL 固定管线的默认光照就是 Phong 模型的变体（实际是 Blinn-Phong，1977 年的优化版）

这是计算机图形学史上**第一个进入工业标准**的真实感光照模型。在它之前，1971 年 Gouraud 已经实现了多边形之间的颜色平滑过渡，但没有高光——渲染出来的球体看起来像一个红色橡皮球。Phong 加上高光那一刻，CG 图像才开始接近照片。

## 核心概念

### 1. 环境光（Ambient）—— "房间里的散射光"

现实世界中，光会在墙壁、地板、天花板之间反弹无数次，每个角落都被散射光覆盖。Phong 的处理方式是：**加一个常数**。物理上这不精确，但它是最简单的 fudge factor——没有它，背光面就是纯黑色，完全不像真实世界。

```
ambient_color = ka * ia
```

`ka` 是材质对环境光的响应系数（0~1），`ia` 是环境中光的强度和颜色。通常设为很小的值（如 0.1），只起到"照亮暗部"的作用。

### 2. 漫反射（Diffuse）—— "粗糙表面的均匀散射"

粗糙表面（纸张、墙面、未抛光的塑料）会把光向四面八方均匀地散开。1760 年 Lambert 就发现了余弦定律：单位面积接收到的光强与光线方向和法线夹角的余弦成正比。

```
diffuse_color = kd * max(0, dot(L, N)) * id
```

关键特性：**和视角无关**。你绕着物体走一圈，漫反射部分的亮度保持不变。这就是为什么磨砂表面无论从哪个角度看，亮度变化不大。

### 3. 高光（Specular）—— "光滑表面的定向反射"

这是 Phong 的核心创新。光滑表面（金属、湿物、抛光塑料）把光集中在反射方向弹出去。理想镜面只在精确的 R 方向有反射，但真实表面有微观凹凸，所以亮度围绕 R 方向逐渐衰减。

```
specular_color = ks * pow(max(0, dot(R, V)), n) * is
```

`pow(dot(R,V), n)` 是关键——余弦值的 n 次方。n 很大时，只有 R 和 V 非常接近才亮；n 很小时，高光扩散成一片。

关键特性：**强烈依赖视角**。你移动头部，高光位置就会漂移。这就是为什么 glossy 表面看起来"活的"。

### 4. 光泽度参数 n —— "从橡胶到镜子的一个旋钮"

n 控制高光的大小和锐利程度：

| n 值 | 视觉效果 | 典型材质 |
|------|----------|----------|
| 1–5 | 宽而软的光斑 | 哑光橡胶 |
| 10–30 | 中等大小 | 普通塑料 |
| 50–150 | 小而锐利 | 抛光塑料、汽车漆 |
| 200+ | 极小、镜面感 | 金属、玻璃 |

## 代码示例

### 示例 1：WebGL Fragment Shader 中的 Phong 实现

```glsl
// fragment shader 片段
uniform vec3 u_lightPos;
uniform vec3 u_cameraPos;
uniform vec3 u_materialColor;
uniform float u_shininess;

void main() {
    vec3 N = normalize(v_normal);       // 表面法线
    vec3 L = normalize(u_lightPos - v_position); // 光方向
    vec3 V = normalize(u_cameraPos - v_position); // 视线方向
    vec3 R = reflect(-L, N);           // 反射方向

    // 环境光
    vec3 ambient = vec3(0.1) * u_materialColor;

    // 漫反射
    float diff = max(dot(N, L), 0.0);
    vec3 diffuse = diff * u_materialColor;

    // 高光
    float spec = pow(max(dot(R, V), 0.0), u_shininess);
    vec3 specular = spec; // 白色高光

    gl_FragColor = vec4(ambient + diffuse + specular, 1.0);
}
```

这段 shader 直接对应上面的三项公式。`u_shininess` 就是 n，调到 200 以上就能看到明显的镜面高光。

### 示例 2：JavaScript 手动计算一个像素的颜色

```javascript
// 模拟一个红色苹果在某个像素处的颜色
const ka = 0.1;                  // 环境光系数
const kd = { r: 0.8, g: 0.1, b: 0.1 }; // 红色漫反射
const ks = { r: 1.0, g: 1.0, b: 1.0 }; // 白色高光
const n = 50;                    // 光泽度

// 向量（已归一化）
const L = { x: 0.7, y: 0.7, z: 0.0 }; // 光方向
const N = { x: 0.0, y: 0.0, z: 1.0 }; // 表面法线（朝相机）
const V = { x: 0.0, y: 0.0, z: 1.0 }; // 视线方向

// 点乘 L·N
const lnDot = L.x * N.x + L.y * N.y + L.z * N.z; // = 0.0
// 换一个角度：光从斜上方来
const L2 = { x: -0.5, y: -0.5, z: 0.707 };
const lnDot2 = L2.x * N.x + L2.y * N.y + L2.z * N.z; // ≈ 0.707

// 反射方向 R = 2(N·L)N - L
const r = {
  x: 2 * lnDot2 * N.x - L2.x,
  y: 2 * lnDot2 * N.y - L2.y,
  z: 2 * lnDot2 * N.z - L2.z,
};

// R·V
const rvDot = r.x * V.x + r.y * V.y + r.z * V.z; // ≈ 0.707

// 三项分别计算
const ambient = { r: ka, g: ka, b: ka };

const diffuse = {
  r: kd.r * lnDot2,
  g: kd.g * lnDot2,
  b: kd.b * lnDot2,
};

const specularVal = Math.pow(Math.max(rvDot, 0), n);
const specular = {
  r: ks.r * specularVal,
  g: ks.g * specularVal,
  b: ks.b * specularVal,
};

// 总和
const result = {
  r: ambient.r + diffuse.r + specular.r,
  g: ambient.g + diffuse.g + specular.g,
  b: ambient.b + diffuse.b + specular.b,
};

console.log(`像素颜色: (${result.r.toFixed(3)}, ${result.g.toFixed(3)}, ${result.b.toFixed(3)})`);
// 输出: 像素颜色: (0.500, 0.071, 0.071)
// 偏红 + 一点白闪
```

如果换一个视角让 R·V = 0.5，`Math.pow(0.5, 50) ≈ 0.0000009`，高光直接消失——这就是高光"跟着视角跑"的数学原因。

## 实践案例

### 案例 1：Three.js 里的 Phong 材质

```javascript
const material = new THREE.MeshPhongMaterial({
  color: 0xff0000,       // kd 漫反射颜色（红色苹果）
  specular: 0xffffff,    // ks 高光颜色（白色高光）
  shininess: 30,         // n 光泽度（30 = 塑料感）
});
```

`shininess` 就是公式里的 n。改成 200 像抛光金属，改成 1 像哑光橡胶。

### 案例 2：Phong Shading vs Phong Reflection Model

这是最容易混淆的地方。同一篇论文里有两个相关但不同的概念：

- **Phong reflection model**（本文主角）：上面那个三项公式
- **Phong shading**：在多边形顶点之间**插值法线**，然后每个像素用插值后的法线重新算一遍三项公式

对比 1971 年的 Gouraud Shading：Gouraud 在顶点算出颜色，多边形内部插**颜色**。问题是高光如果在多边形中心，Gouraud 会漏掉它——因为顶点处没有高光。Phong shading 改成插**法线**，每像素重新算一次完整公式，高光保住了。代价是 GPU 要做 N 倍计算，1975 年的硬件跑不动，1990 年代图形卡跟上后才普及。

## 踩过的坑

1. **能量不守恒**：`ka + kd + ks` 可以随便填超过 1，物体看起来比光源还亮。现代 PBR 流程强制 `kd + ks ≤ 1`。

2. **高光永远是光源颜色**：Phong 假设高光和光源同色。但金属的高光会带上材质颜色——金色的高光是黄色的。要画金属需要改用 Cook-Torrance 模型。

3. **n 太大会有锯齿**：n=500 时高光只占一两个像素，相机一动高光就在像素之间跳跃（specular aliasing）。解法是用 prefiltered environment map 或 mipmapped specular map。

4. **反射方向 R 容易算反**：`R = 2(N·L)N - L`。新手常把 L 的方向搞反，导致高光出现在物体背面。

5. **多光源累加溢出**：多个光源各自算一遍 diffuse + specular 后相加，颜色值可能超过 1.0，需要 tone mapping 压回 [0,1] 范围。

## 适用 vs 不适用场景

**适用**：

- 教学：图形学第一个能跑的真实感模型
- 移动端 forward 渲染（每像素几十次乘法即可）
- 风格化渲染（卡通渲染常基于 Phong 修改）
- 不追求物理正确的实时场景

**不适用**：

- 物理正确渲染（PBR 流程必须用 Cook-Torrance / GGX）
- 金属、各向异性材质（拉丝金属、CD 盘面）
- 间接光照（ambient 只是常数糊弄，需要 IBL / 球谐函数 / 路径追踪）
- 半透明、次表面散射（皮肤、蜡、玉石）

## 历史小故事

- **1971**：Henri Gouraud 在 Utah 大学发表平滑着色，能在多边形间渐变颜色但没有高光
- **1973**：Bui Tuong Phong 在 Utah 大学完成博士论文，导师是 Ivan Sutherland（计算机图形学之父）
- **1975 年 6 月**：CACM 发表 6 页论文，把博士论文核心成果浓缩
- **1975 年**：Phong 因白血病去世，年仅 33 岁
- **1977**：Jim Blinn 用半角向量 H = normalize(L+V) 替代 R，得到 Blinn-Phong，省掉一次反射计算，OpenGL 选它作默认
- **1982 年后**：Cook-Torrance 等物理模型出现，但 Phong 因为快、好教，一直活到今天

## 学到什么

1. **拆解就是减少**：把"画出真实光照"这个无法直接计算的大目标，拆成三个各自只有一行公式的可计算项。这是工程学的核心方法论。

2. **经验模型也能赢 50 年**：Phong 不守恒、不完全物理，但 `cos^n` 那一项太聪明了——一个参数从橡胶滑到镜子。

3. **命名决定了寿命**：specular / diffuse / shininess / ambient 这四个词从 1975 用到现在，所有图形 API 都遵循。

4. **简单 + 早 = 教科书**：6 页论文 + 8 行公式 + 一个 `cos^n`，半个世纪没被替换。

## 延伸阅读

- 论文 PDF：[Illumination for Computer Generated Pictures](https://www.cs.utah.edu/~bway/keith-phong.pdf)（Bui Tuong Phong, 1975）
- Scratchapixel 教程：[The Phong Model](https://www.scratchapixel.com/lessons/3d-basic-rendering/phong-shader-BRDF/phong-illumination-models-brdf.html)（每一步推导都有图）
- LearnOpenGL：[Basic Lighting](https://learnopengl.com/Lighting/Basic-Lighting)（边写代码边讲，最适合零基础）

## 关联

- [[phong-1975]] —— 同一篇论文的另一种笔记（如有不同侧重）
- [[blinn-1977]] —— Blinn 1977 — 用半角向量 H 把高光算量减半
- [[gouraud-1971]] —— Gouraud 着色：Phong 的前辈，按颜色插值会丢高光
- [[lambert-cosine]] —— Lambert 余弦定律：漫反射那一项的物理基础
- [[cook-torrance-1982]] —— Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel
