---
title: OpenJDK — Java 标准实现
来源: https://github.com/openjdk/jdk
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**OpenJDK**（Open Java Development Kit）是 Java 平台的**官方开源参考实现**，也是当今绝大多数「Java」发行版的共同祖先。你安装的 Amazon Corretto、Eclipse Temurin、Oracle JDK、Azul Zulu，乃至 Android 工具链里用到的部分 Java 类库，追根溯源都指向 [openjdk/jdk](https://github.com/openjdk/jdk) 这棵大树。

日常类比：如果把 **Java 语言规范（JLS）** 和 **JVM 规范（JVMS）** 看成国家颁布的「交通规则」，OpenJDK 就是政府开源的那套**标准驾校 + 车管所 + 公路养护队**——

- **javac** 像驾校教练：把你的 `.java` 讲义翻译成 JVM 能读的 **字节码**（`.class`）；
- **HotSpot JVM** 像公路上的智能调度中心：刚上路用**解释器**慢慢带，发现某条路天天堵（热点代码）就派 **JIT 编译器**铺成高速公路（机器码）；
- **类加载器** 像海关检疫：`.class` 文件入境前要验签、分舱（Bootstrap / Platform / App）；
- **GC（垃圾回收器）** 像环卫系统：没人引用的对象自动清走，你只管 `new`，不用手动 `free`；
- **JDK 模块**（`java.base`、`java.net`…）像标准化市政设施：水管、电网、公交接口都写进规范，换城市（换发行版）也能用。

你写的 Spring Boot、`mvn test`、大数据 Spark 作业，在服务器上真正跑的，几乎都是 **OpenJDK 系 JVM + 类库**——区别往往只是「谁打包、谁打安全补丁、谁收支持费」。

## 为什么重要

不懂 OpenJDK，下面这些面试题和线上现象很难讲透：

- **为什么 `java -version` 和 `javac -version` 可能不一致**——JDK 是工具链 + 运行时 + 类库的组合，不同供应商可能拆分打包
- **为什么改一个循环写法能快 10 倍**——解释执行 vs C1/C2 JIT、内联、逃逸分析在起作用
- **为什么 `-Xmx` 设很大但 RSS 涨得更猛**——堆、元空间、线程栈、JIT Code Cache、GC  remembered set 都会占原生内存
- **为什么 Java 9 后 `rt.jar` 没了**——**Jigsaw 模块化**把单体 JDK 拆成 `java.*` 模块图
- **为什么 LTS（17、21、25）这么重要**——OpenJDK 社区每六年一个长期支持节奏，企业生产环境跟的是这条时间线

## 核心概念

### 1. JDK、JRE、JVM 三层关系

| 层级 | 包含什么 | 类比 |
|------|----------|------|
| **JVM** | HotSpot 执行引擎：解释、JIT、GC、线程 | 发动机 |
| **JRE**（历史概念，Java 9+ 已弱化） | JVM + 核心类库 | 发动机 + 油箱 |
| **JDK** | JRE + 开发工具（`javac`、`javadoc`、`jlink`、`jcmd`…） | 整车 + 维修工具箱 |

现代说法：**装 JDK 就够用**；`java` 命令启动 JVM，`javac` 编译源码，`jar` / `jpackage` 打包分发。

### 2. 源码树：HotSpot 与模块

OpenJDK 源码按 **JEP 8283227** 描述的布局组织，核心两条线：

```
openjdk/jdk/
├── src/hotspot/          # C++：JVM 本体（解释器、JIT、GC、线程）
│   ├── share/            # 跨平台核心
│   ├── cpu/x86, aarch64/ # 架构相关
│   └── os/linux, windows/
├── src/java.base/        # java.lang、IO、集合、并发…
├── src/java.net/         # 网络
├── src/jdk.compiler/     # javac 编译器
└── make/                 # 构建系统（configure + make）
```

- **HotSpot** 是 Oracle 贡献、现为 OpenJDK 默认的 JVM 实现（另有 GraalVM、OpenJ9 等竞品，但 HotSpot 是「标准答案」）
- 每个 **`src/$MODULE`** 对应 `module-info.java` 里声明的一个 **JPMS 模块**

### 3. 类加载与双亲委派

类加载分 **Loading → Linking（验证、准备、解析）→ Initialization** 三阶段。默认 **AppClassLoader** 收到请求会先问 **Platform**，再问 **Bootstrap**（由 C++ 实现，加载 `java.base`）。

双亲委派的好处：**核心类不会被应用 jar 里的同名类顶替**（防止恶意 `java.lang.String`）。打破委派的场景：Tomcat 隔离 Web 应用、OSGi、部分框架热部署。

### 4. 执行引擎：解释 → C1 → C2

HotSpot 采用 **分层编译（Tiered Compilation）**：

```
字节码
  ▼
模板解释器（Template Interpreter）── 立即执行，收集 profiling
  ▼
C1（Client Compiler）── 快速 JIT，轻量优化
  ▼
C2（Server Compiler）── 深度优化：内联、逃逸分析、循环展开…
  ▼
去优化（Uncommon Trap）── 假设失败时回退到解释状态
```

| 编译层 | 典型开关 | 特点 |
|--------|----------|------|
| 解释 | 默认冷启动 | 零编译延迟 |
| C1 | `-XX:TieredStopAtLevel=1` | 快编译，适合短生命周期 |
| C2 | 默认 L4 | 峰值性能，编译耗时长 |

JDK 17+ 在部分平台引入 **JVMCI / Graal** 作为实验性 C2 替代；生产默认仍是 **C2**。

### 5. 垃圾回收器家族

OpenJDK HotSpot 提供多种 **CollectedHeap** 实现，按场景选用：

| 收集器 | 开关 | 适用场景 |
|--------|------|----------|
| **G1**（默认，JDK 9+） | `-XX:+UseG1GC` | 堆数百 MB～几十 GB，可设暂停目标 `-XX:MaxGCPauseMillis` |
| **ZGC** | `-XX:+UseZGC` | 超低延迟，TB 级堆（JDK 15+ 生产可用） |
| **Parallel** | `-XX:+UseParallelGC` | 吞吐优先，批处理 |
| **Serial** | `-XX:+UseSerialGC` | 单核、小堆、嵌入式 |
| **Shenandoah** | `-XX:+UseShenandoahGC` | 低延迟（Red Hat 主导，部分发行版自带） |

共同机制：**分代假设**——大部分对象朝生暮死；**安全点（Safepoint）**——GC 与 JIT 需要线程停在一致状态；**STW（Stop-The-World）** 阶段应尽量缩短。

### 6. JPMS 模块化（Java 9+）

`module-info.java` 声明依赖与导出：

```java
module com.example.app {
    requires java.base;
    requires java.net.http;
    exports com.example.api;
}
```

- **`jlink`** 可裁剪运行时，生成只含所需模块的自定义镜像（容器镜像从 300MB+ 瘦到几十 MB）
- **强封装**：JDK 内部包默认不可反射访问，`--add-opens` 是迁移旧库时的常见补丁

### 7. JFR、jcmd 与可观测性

OpenJDK 内置 **Java Flight Recorder（JFR）**：低开销采样 CPU、分配、锁、GC、方法热点。`jcmd <pid> JFR.start` 不需额外 agent。配合 **Mission Control** 或 **async-profiler**，是线上调 JVM 的「标准仪表盘」。

## 从源码到运行（零基础走读）

```java
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, OpenJDK");
    }
}
```

1. **`javac Hello.java`** → `Hello.class`（字节码，存在常量池、方法表、栈帧限制）
2. **`java Hello`** → 启动器解析 `JAVA_HOME`，加载 **libjvm.so**，创建 VM
3. **Bootstrap 类加载器** 加载 `java.base` 里的 `System`、`PrintStream`
4. **解释器** 执行 `main` 字节码；`println` 热点路径可能被 **C2 内联**
5. 字符串与临时对象在 **Eden** 分配；Minor GC 由 **G1** 或默认收集器回收

## 代码示例

### 示例 1：用 `jlink` 构建最小运行时

模块化应用打包成「只带必需模块」的镜像，是 OpenJDK 9+ 的标志性能力：

```bash
# 编译模块化应用
javac -d out --module-source-path src $(find src -name "*.java")

# 链接出自定义运行时（示例模块名 com.myapp）
jlink \
  --module-path out:$JAVA_HOME/jmods \
  --add-modules com.myapp \
  --launcher myapp=com.myapp/com.myapp.Main \
  --compress=2 \
  --no-header-files \
  --no-man-pages \
  --output build/runtime

# 运行
./build/runtime/bin/myapp
```

`module-info.java` 骨架：

```java
module com.myapp {
    requires java.base;

    exports com.myapp;
}
```

### 示例 2：观察 JIT 与 GC 行为

下面小程序故意制造分配与热点循环，配合 JVM 参数观察 OpenJDK 运行时决策：

```java
public class JvmPlayground {
    static volatile long sink;

    public static void main(String[] args) {
        // 热点：易被 C2 优化
        long sum = 0;
        for (int i = 0; i < 10_000_000; i++) {
            sum += i;
        }
        sink = sum;

        // 短生命周期对象：新生代回收
        for (int i = 0; i < 100_000; i++) {
            new byte[1024];
        }
        System.gc(); // 只是建议，真正策略由 GC 决定
        System.out.println("done, sum=" + sum);
    }
}
```

推荐运行命令（JDK 21+）：

```bash
java -XX:+PrintCompilation \
     -Xlog:gc*:stdout:time,level,tags \
     -XX:CompileCommand=print,JvmPlayground.main \
     JvmPlayground
```

你会看到：**C1/C2 编译日志**（哪段方法被编译）、**GC 日志**（Young/Old 区域回收）。去掉 `-XX:+PrintCompilation` 后加 `-XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining` 可进一步看内联决策（仅诊断环境使用）。

### 示例 3：用 `ProcessHandle` 读当前 OpenJDK 进程信息

纯 Java API，无需第三方库，展示 JDK 与操作系统交互的一层：

```java
import java.lang.management.ManagementFactory;
import java.lang.management.RuntimeMXBean;

public class WhichJvm {
    public static void main(String[] args) {
        RuntimeMXBean rt = ManagementFactory.getRuntimeMXBean();
        System.out.println("VM name:    " + rt.getVmName());
        System.out.println("VM vendor:  " + rt.getVmVendor());
        System.out.println("VM version: " + rt.getVmVersion());
        System.out.println("PID:        " + ProcessHandle.current().pid());
        System.out.println("Java home:  " + System.getProperty("java.home"));
    }
}
```

典型输出形如 `OpenJDK 64-Bit Server VM`、`Eclipse Adoptium`——说明二进制来自哪个 **发行版**，而规范实现仍源自 OpenJDK 源码树。

## 构建与参与（开发者向）

从零构建 OpenJDK（桌面 Linux/macOS 大致流程）：

```bash
# 克隆（体积大，建议浅克隆或 bundle）
git clone https://github.com/openjdk/jdk.git
cd jdk

# 配置（需 Xcode CLT / build-essential、boot JDK 17+）
bash configure --with-boot-jdk=$(/usr/libexec/java_home -v 21)

# 编译（机器核心数多时可 -j）
make images

# 产物在 build/*/images/jdk
build/*/images/jdk/bin/java -version
```

社区协作入口：

- **JEP**（JDK Enhancement Proposal）：新特性设计文档，如虚拟线程（JEP 444）、Record（JEP 395）
- **mailing lists** / **GitHub PR**：bug 修复与特性实现
- **jtreg** 测试：修改 HotSpot 或类库必须过回归套件

## 与周边生态的关系

| 项目 | 关系 |
|------|------|
| **Eclipse Temurin / Adoptium** | 社区 LTS 构建，免费生产使用 |
| **Oracle JDK** | 同一源码的商业支持分支 |
| **Android ART** | 运行 Dalvik/ART 字节码，类库部分与 OpenJDK 同源历史 |
| **Kotlin / Scala** | 编译到 JVM 字节码，运行时仍是 OpenJDK |
| **GraalVM** | 可选替代 JIT/AOT 栈，兼容 OpenJDK 类库 |
| **[[v8]]** | 不同语言栈；对比可理解「托管运行时 + GC + JIT」共性 |

## 常见误区

1. **「Java 慢」**——冷启动 + 解释阶段慢；预热后 JIT 代码接近 C++，瓶颈常在 IO、锁、分配率
2. **「OpenJDK 不能商用」**——可以；注意个别发行版的商标与补丁支持条款，不是许可证禁止商用
3. **`System.gc()` 一定触发 Full GC**——只是提示；`-XX:+DisableExplicitGC` 可忽略
4. **堆越大越好**——过大增加 GC 负担与暂停；需结合 G1/ZGC  регион与 `-XX:MaxGCPauseMillis` 调参
5. **所有 JDK 行为完全一致**——供应商 backport、默认 GC、时区数据可能略有差异；生产应锁定具体发行版与版本

## 学习路径建议

1. **会用**：安装 Temurin 21 LTS，写小程序，`javac` / `java` / `jar` 熟练
2. **会读**：`javap -c -v` 反汇编字节码；理解栈帧、常量池、 invokevirtual
3. **会调**：`jcmd`、`jstat`、`jmap`、JFR；读 GC 日志，设 `-Xms/-Xmx`
4. **会挖**：读 **《深入理解 Java 虚拟机》** + OpenJDK 源码 `src/hotspot/share/runtime`、`gc/g1`
5. **会跟**：每年跟 LTS 发布说明，浏览 [OpenJDK JEPs](https://openjdk.org/jeps/0)

## 小结

OpenJDK 不是某一个公司的私有产品，而是 **Java 生态的公共基础设施**：语言、字节码、API、HotSpot 实现都在这里汇合。零基础只需记住一条链：**源码 → javac → 字节码 → JVM（解释 + JIT + GC）→ 你的业务**。往下挖是 C++ 的 HotSpot 与百万行类库；往上用是 Spring、Kafka、Elasticsearch 整座大厦。把 OpenJDK 当成「会自我优化的操作系统进程」，学习曲线就会清晰很多。
