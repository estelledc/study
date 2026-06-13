---
title: GraalVM — 多语言通用 VM
来源: https://github.com/oracle/graal
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

## 是什么

**GraalVM** 是 Oracle 开源的 **高性能 JDK 发行版 + 多语言运行时平台**，仓库 [oracle/graal](https://github.com/oracle/graal) 把三件事焊在同一套底座上：

1. **兼容 OpenJDK 的 Java 运行时**（可替代 Temurin / Corretto 跑普通 Java）
2. **Truffle 多语言引擎**（在同一进程里跑 JavaScript、Python、Ruby、WebAssembly、LLVM 位码等）
3. **Native Image**（把 Java 乃至多语言程序 **ahead-of-time** 编译成无 JVM 依赖的原生可执行文件）

日常类比：如果把 **OpenJDK HotSpot** 想象成一座**只服务 Java 乘客的火车站**——进站检票（类加载）、候车大厅（堆内存）、临时加开高铁（JIT）都是为 Java 设计的；那 **GraalVM** 更像 **国际机场 + 海关一体化枢纽**：

- **Graal 编译器**是新的「高铁调度中心」，既能给 Java 字节码提速，也能给 Truffle 语言生成的中间表示提速；
- **Truffle** 是标准化的「航空公司柜台协议」——每家航司（JS、Python、Ruby…）按同一套规则办登机，旅客（数据对象）**不用换机场就能转机**；
- **Native Image** 是「把常用航线时刻表提前印成一本独立小册子」——启动时不再搭整个机场，拎册子就走，适合 Serverless、CLI、边缘容器。

你已经在用的 **Quarkus Native**、**Micronaut Native**、**Spring Boot Native**，底层编译器栈往往就是 GraalVM Native Image；Kafka 3.8 的原生 Broker、Google Java Formatter 的单文件二进制，也是同一技术路线的产物。

## 为什么重要

不懂 GraalVM，下面这些现象很难讲清「为什么能这样」：

- **为什么 Java 云原生框架能把冷启动从秒级压到几十毫秒**——Native Image 在构建期完成类初始化、反射配置、字节码 → 机器码，运行时没有 JVM 预热
- **为什么能在 Java 里 `eval` Python 再无缝把结果当 Java 对象用**——Truffle 的 **Polyglot 互操作协议**让 guest 语言共享同一堆、同一 JIT 管线
- **为什么 Native Image 构建要配一堆 `reflect-config.json`**——AOT 编译器在构建期必须「看见」所有可能用到的反射、资源、JNI
- **为什么 GraalVM 既是 JDK 又是编译器项目**——Graal 编译器既可嵌入 HotSpot 作 JIT，也可在 Substrate VM 里作 AOT 后端

## 核心概念

### 1. 三层架构：JDK / Truffle / Native Image

```
┌─────────────────────────────────────────────────────────┐
│  应用层：Java / Kotlin 主机 + Polyglot 嵌入 guest 语言    │
├─────────────────────────────────────────────────────────┤
│  Truffle 语言实现：GraalJS / GraalPy / TruffleRuby / …   │
│  （自优化 AST + partial evaluation → Graal JIT）         │
├─────────────────────────────────────────────────────────┤
│  Graal 编译器：高级优化 IR，服务 Java 字节码 + Truffle IR │
├─────────────────────────────────────────────────────────┤
│  运行时底座：HotSpot JVM（JIT 模式）或 Substrate VM（AOT） │
└─────────────────────────────────────────────────────────┘
```

| 组件 | 角色 | 类比 |
|------|------|------|
| **Graal Compiler** | 用 Java 写的优化编译器，替代或补充 HotSpot C2 | 新调度算法，能同时排 Java 高铁和 Truffle 城际线 |
| **Truffle** | 用 Java 写 guest 语言解释器的框架 | 航司柜台标准协议 |
| **Polyglot API** | `org.graalvm.polyglot` 嵌入与跨语言调用 | 海关过境免签 |
| **Native Image** | `native-image` 工具 + Substrate VM | 预印时刻表，单机可执行 |
| **Sulong** | LLVM 位码跑在 Truffle 上 | 货机码头，C/C++ 经 LLVM IR 入境 |

理论细节见专题笔记 [[graalvm-truffle]]；本文聚焦 **GraalVM 作为产品/平台**怎么用、怎么选。

### 2. GraalVM 作为 JDK

安装 GraalVM for JDK（例如 21 或 25）后，`java` / `javac` 与标准 OpenJDK 用法一致：

```bash
java -version
# openjdk version "25" ... GraalVM CE ...
javac Hello.java && java Hello
```

在部分配置下，HotSpot 会用 **Graal 作为 JIT 编译器**（`-XX:+UseJVMCICompiler` 等），峰值性能与 C2 互有胜负，取决于工作负载。生产上更常见的卖点仍是 **Polyglot** 与 **Native Image**，而非替换普通 Java 服务器的 HotSpot。

### 3. Polyglot：同一进程、同一堆

Truffle 语言之间通过 **标准化互操作消息** 传值：Java 的 `Value`、JS 的 object、Python 的 `int` 在边界上自动适配，无需 JNI 序列化。主机语言通常是 Java，guest 语言通过 Maven 依赖按需引入：

```xml
<dependency>
  <groupId>org.graalvm.polyglot</groupId>
  <artifactId>polyglot</artifactId>
  <version>${graalvm.polyglot.version}</version>
</dependency>
<dependency>
  <groupId>org.graalvm.polyglot</groupId>
  <artifactId>js</artifactId>
  <version>${graalvm.polyglot.version}</version>
</dependency>
```

JDK 21+ 起，语言 JAR 像普通依赖一样放在 classpath/module path；构建 Native Image 时语言资源也会打进镜像（详见官方 Embedding Languages 文档）。

### 4. Native Image：构建期世界

**Native Image** 在 **构建期** 做类路径分析、可达性分析、静态初始化，把反射/JNI/资源访问尽量**固化**进镜像：

```bash
native-image -jar myapp.jar -o myapp
# 或使用 Maven/Gradle Native Build Tools 插件
./myapp   # 无 java 命令，毫秒级启动
```

代价：

- **构建慢**（分钟级）、**构建期内存大**（常需 8G+）
- **动态特性受限**：反射、动态代理、类加载、部分 Agent 需显式配置
- **峰值吞吐** 有时低于长期运行的 HotSpot C2（无运行时 JIT 再优化空间）

适合：**CLI、Serverless、Kubernetes scale-to-zero、安全沙箱边缘节点**；不适合：重度反射的遗留单体、需要频繁动态加载插件的 IDE 式应用（除非大量手工配置）。

### 5. 语言生态一览

| 语言组件 | 成熟度（约 2025–2026） | 典型用途 |
|----------|-------------------------|----------|
| **GraalJS** | 生产可用 | 嵌入脚本、JSON 处理、与 Java 互调 |
| **GraalPy** | 稳定（纯 Python / Jython 场景） | 数据科学库嵌入、脚本扩展 |
| **TruffleRuby** | 生产可用 | 高性能 Ruby、与 Java 互操作 |
| **GraalWasm** | 稳定 | 沙箱执行 Wasm 模块 |
| **Espresso** | 专用 | Java-on-Truffle（元循环） |
| **Sulong** | 实验/专用 | LLVM 位码、原生库互操作 |

各语言也可单独用启动器运行，例如 `js`、`graalpy`，并支持 `--polyglot` 选项打开跨语言模式。

## 代码示例

### 示例 1：Java 嵌入 JavaScript（Polyglot API）

在 Java 主机里执行 JS、读取 guest 返回值并转成 Java 类型：

```java
import org.graalvm.polyglot.*;

public class HelloPolyglot {
    public static void main(String[] args) {
        try (Context context = Context.newBuilder("js")
                .allowAllAccess(true)  // 教学示例；生产应收紧权限
                .build()) {
            Value fn = context.eval("js", "x => x * x");
            int result = fn.execute(7).asInt();
            System.out.println("7^2 = " + result);  // 49

            context.eval("js", """
                const data = { lang: 'GraalJS', year: 2026 };
                data.lang;
                """);
            Value lang = context.getBindings("js").getMember("data")
                    .getMember("lang");
            System.out.println(lang.asString());  // GraalJS
        }
    }
}
```

**要点**：

- `Context` 代表一个 guest 语言隔离环境，应用 **try-with-resources** 关闭（JDK 24+ 也会在 GC 时自动关闭，但仍推荐显式关闭）
- `Value` 是跨语言统一句柄；`asInt()` / `asString()` 等做类型转换
- 多语言时 `Context.newBuilder("js", "python").build()` 可一次加载多种语言

命令行快速体验（已安装 GraalVM 且含 `js` 组件）：

```bash
js --jvm --polyglot -e "print(Polyglot.import('java.lang.System').getProperty('java.version'))"
```

### 示例 2：把 Polyglot 程序编译成原生可执行文件

下面是一个最小 **Java + JavaScript** 混合应用，用 Native Image 打成单文件二进制（思路同 Oracle 官方 polyglot native 指南）：

```java
import org.graalvm.polyglot.*;

public class PrettyPrintJSON {
    public static void main(String[] args) throws Exception {
        String json = new String(System.in.readAllBytes());
        try (Context ctx = Context.create("js")) {
            ctx.getBindings("js").putMember("raw", json);
            ctx.eval("js", """
                const obj = JSON.parse(raw);
                console.log(JSON.stringify(obj, null, 2));
                """);
        }
    }
}
```

`pom.xml` 中引入 `org.graalvm.polyglot:polyglot` 与 `org.graalvm.polyglot:js`，然后：

```bash
mvn -Pnative package
echo '{"GraalVM":{"role":"polyglot+native"}}' | ./target/prettyprintjson
```

**要点**：

- 构建会把 **Truffle JS 引擎与语言资源** 一并打进镜像，体积和内存显著大于纯 Java native 镜像
- 反射、资源、JNI 若构建报错，需查 **GraalVM Reachability Metadata** 仓库或手写 `META-INF/native-image/` 配置
- 推荐用 **Native Build Tools**（Maven/Gradle 插件）而非手写 `native-image` 长命令

### 示例 3：纯 Java 的 Native Image 冷启动对比

```bash
# JVM 模式
time java -jar target/quarkus-app/quarkus-run.jar
# 常见：1–3 s 启动

# Native 模式（Quarkus / Micronaut / Spring Boot 3+ 均提供 profile）
time ./target/myapp-runner
# 常见：0.02–0.08 s 启动，RSS 明显下降
```

这不是魔法，而是 **把类初始化、依赖图、反射元数据在构建期算完** 的代价转移。

## 安装与组件选择

1. **下载**： [GraalVM 官网](https://www.graalvm.org/downloads/) 或 SDKMAN `sdk install java 25-graal-ce`
2. **按需装语言**：`gu install js python ruby wasm llvm`（`gu` 是 GraalVM 组件管理器；Maven 依赖方式下可不用 `gu`）
3. **Native Image**：`gu install native-image` 或使用带 `native-image` 的完整发行版
4. **验证**：`native-image --version`、`js --version`

开发 Polyglot 嵌入时，优先查当前 JDK 版本对应的 **Embedding Languages** 与 **Polyglot Programming** 手册（JDK 21 起 API 与打包方式有重要修订）。

## 与 OpenJDK / 其他方案对比

| 维度 | OpenJDK HotSpot | GraalVM JIT 模式 | GraalVM Native Image |
|------|-----------------|------------------|----------------------|
| 启动时间 | 秒级 | 秒级 | 毫秒～百毫秒级 |
| 峰值吞吐 | 很高（C2 成熟） | 高 | 中～高（视 workload） |
| 内存占用 | 较大 | 较大 | 小 |
| 动态反射/类加载 | 完整 | 完整 | 需配置 |
| 多语言 | 仅 JVM 语言 | Truffle 全家桶 | 可嵌入多语言 |
| 运维 | `java -jar` | `java -jar` | 单二进制 |

| 对比对象 | 差异 |
|----------|------|
| **[[openjdk]]** | GraalVM 是发行版超集；可只当 JDK 用 |
| **[[wasmtime]]** / **[[wasmer]]** | Wasm 专用运行时更轻；GraalWasm 胜在 JVM 生态与 Polyglot |
| **[[quickjs]]** | 嵌入式 JS 极小；GraalJS 胜在 JIT 与 Java 互调 |
| **[[quarkus]]** / **[[micronaut]]** | 框架层；Native 能力依赖 GraalVM |

## 常见坑与排错

1. **Native 构建 OOM**：增大 `JAVA_HOME` 指向的构建 JVM 堆，如 `export MAVEN_OPTS="-Xmx8g"`
2. **反射/资源缺失**：运行时 `ClassNotFoundException` / `NoSuchMethodException` → 补 `reflect-config.json` 或依赖库的 reachability metadata
3. **Polyglot 权限**：默认沙箱较严，嵌入时显式配置 `allowHostAccess` / `allowIO`，生产避免 `allowAllAccess(true)`
4. **JDK 模块**：classpath 模式有时需 `--add-modules=org.graalvm.polyglot`；JDK 24+ 注意 `--enable-native-access` 警告
5. **Uber JAR**：官方不推荐把 Polyglot 打成 fat jar；Native Image **不支持** 这类 uber jar
6. **调试**：Native 镜像调试需 ahead-of-time 带调试信息，体验仍差于普通 HotSpot；开发期用 JVM 模式

## 适用场景速查

| 场景 | 建议 |
|------|------|
| 普通 Spring 单体、长时间跑批 | OpenJDK HotSpot 即可 |
| Serverless / Knative / Lambda 冷启动敏感 | Native Image + Quarkus/Micronaut |
| Java 应用内嵌脚本引擎 | Polyglot（JS/Python） |
| 多语言同一进程、频繁跨语言调用 | GraalVM Polyglot |
| 极致小包嵌入式 JS | 考虑 QuickJS；要 JIT+Java 选 GraalJS |
| 研究语言实现 / 编译器 | Truffle 框架 + [[graalvm-truffle]] 论文 |

## 时间线（简表）

| 年份 | 里程碑 |
|------|--------|
| 2013 | Onward!《One VM to Rule Them All》提出 Truffle + Graal 多语言愿景 |
| 2017 | PLDI partial evaluation 工业化；TruffleRuby 等成熟 |
| 2019+ | Native Image 进入 Spring / Quarkus 主流叙事 |
| 2023–2024 | GraalPy、GraalWasm 宣布生产可用；语言改为 Maven 依赖分发 |
| 2025–2026 | Native Image Layers、Reachability Metadata 默认集成；Kafka native broker 等案例落地 |

## 延伸阅读

- 官方：[Polyglot Programming](https://www.graalvm.org/latest/reference-manual/polyglot-programming/)
- 官方：[Embedding Languages](https://www.graalvm.org/latest/reference-manual/embed-languages/)
- 官方：[Native Image 指南](https://www.graalvm.org/latest/reference-manual/native-image/)
- 本库论文笔记：[[graalvm-truffle]] — Truffle 自优化 AST 与 partial evaluation 原理
- 本库项目笔记：[[quarkus]]、[[micronaut]] — GraalVM Native 的云原生框架实践
- 本库：[[openjdk]] — HotSpot 与 GraalVM 的分工与渊源
