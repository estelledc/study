---
title: SELinux 2001 — 给每扇门都装上门卫，而不是给管理员一把万能钥匙
来源: 'Peter Loscocco & Stephen Smalley, "Integrating Flexible Support for Security Policies into the Linux Operating System", USENIX ATC 2001'
日期: 2026-06-06
分类: 操作系统
子分类: 内核与虚拟化
难度: 中级
---

## 是什么

SELinux（Security-Enhanced Linux）是 NSA 在 2001 年把**强制访问控制（MAC）**嵌入 Linux 内核的系统。日常类比：传统 Linux 像一栋楼里只有一个保安室、一把万能钥匙（root），拿到钥匙的人能进任何门；SELinux 则给每扇门加了单独的门卫，门卫手里有一本"谁能进哪扇门"的规则册，即使你是楼管，也只能进规则允许的地方。

传统 Linux 权限系统叫**自主访问控制（DAC）**：文件所有者自己决定谁能读写，root 超级用户可以绕过一切限制。这带来一个根本问题——一旦任何一个特权进程（比如 Apache、sshd）被黑客利用缓冲区溢出攻破，攻击者立刻获得该进程的全部权限，甚至能读 `/etc/shadow`、安装内核模块。

SELinux 的解法：在内核里插入**安全钩子**（LSM hooks），每次进程要访问文件、网络端口、其他进程时，先过一遍"安全服务器"查规则。规则是预先写好的策略文件，管理员说"Nginx 只能读 `/var/www/html`、只能绑定 80/443 端口"，哪怕 Nginx 被完全控制，攻击者也出不了这个沙箱。

## 为什么重要

不理解 SELinux，下面这些事都没法解释：

- 为什么在 Android 手机上，一个 App 被恶意代码注入后，仍然无法读取另一个 App 的数据——Android 4.3+ 默认开启 SELinux，App 都被限制在各自的 domain 里
- 为什么 Fedora/RHEL 的 SELinux 策略错了会让服务无法启动，而 `setenforce 0` 关掉后就好了——关掉的代价是整个 MAC 保护消失
- 为什么容器运行时（runc、containerd）会配合 SELinux/AppArmor 做额外隔离——内核级策略是容器安全的最后一道防线
- 为什么"最小特权原则"在理论上好讲，在 Linux 上实现却需要 SELinux 这样的机制——DAC + capabilities 组合仍然存在大量逃逸路径

## 核心要点

1. **Flask 架构：策略与执行分离**。SELinux 的核心设计思路来自 NSA 的 Flask（Flux Advanced Security Kernel）研究。Flask 把"谁能做什么"（安全服务器，Security Server）和"拦下来检查"（对象管理器，Object Manager）拆开。内核的每个子系统（文件系统、网络、进程）是对象管理器，在关键操作前调用 Security Server 查询是否允许。类比：快递员（Object Manager）拿包裹来，先打电话给调度中心（Security Server）问"这包裹能送吗"，调度中心查规则册回答，快递员执行结果。

2. **类型强制（Type Enforcement）：每个进程和文件都贴标签**。SELinux 给系统里的每个进程分配一个"域"（domain），给每个文件/资源分配一个"类型"（type）。策略规则写成 `allow httpd_t httpd_sys_content_t:file { read open };`，意思是"处于 httpd_t 域的进程，可以对 httpd_sys_content_t 类型的文件执行 read 和 open"。没写在规则里的，全部**默认拒绝**（deny-by-default）。

3. **AVC 缓存：高频决策不重复计算**。每次 read/write/connect 都去查安全服务器会很慢。SELinux 引入**访问向量缓存（Access Vector Cache，AVC）**：第一次查询结果缓存下来，后续相同的"domain + type + 操作"直接走缓存，命中率超 99%。论文测试数据：AVC 开启后，Web 服务器场景的额外性能开销低于 1-2%。

## 实践案例

### 案例 1：给 Nginx 装进沙箱

场景：你部署了一台 Web 服务器，想确保即使 Nginx 被攻破，攻击者也无法读取 `/etc/passwd`。

```bash
# 查看 Nginx 进程当前的 SELinux context（域）
ps -eZ | grep nginx
# 输出类似：system_u:system_r:httpd_t:s0   nginx: worker process

# 查看一个受保护文件的 SELinux context（类型）
ls -Z /etc/passwd
# 输出类似：system_u:object_r:passwd_file_t:s0 /etc/passwd

# 查看策略：httpd_t 域能不能读 passwd_file_t 类型？
sesearch --allow -s httpd_t -t passwd_file_t -c file
# 没有输出 = 没有 allow 规则 = 默认拒绝

# 手动模拟攻击者尝试读取
# runcon -t httpd_t -- cat /etc/passwd
# → Permission denied（AVC denial）
```

**逐部分解释**：
- `ps -eZ` 中的 `-Z` 显示 SELinux 安全上下文，格式是 `user:role:type:level`
- `httpd_t` 是 Nginx/Apache 进程的域，策略里只给了它读 `httpd_sys_content_t` 类型文件的权限
- `passwd_file_t` 不在允许列表里，所以被拒绝——这是 SELinux 沙箱的核心效果

### 案例 2：用 audit2allow 从错误日志半自动生成规则

场景：你部署了一个自定义服务，SELinux 策略不完整，服务启动失败，日志里有 AVC denied。

```bash
# Step 1: 切换到 permissive 模式（只记录不拒绝），让服务跑起来收集日志
setenforce 0

# Step 2: 启动服务，触发所有访问
systemctl start myapp

# Step 3: 查看 AVC denied 日志
ausearch -m AVC -ts recent | head -20
# 输出类似：
# type=AVC msg=audit(1717689600.123:456): avc: denied { read } for
#   pid=1234 comm="myapp" name="config.db"
#   scontext=system_u:system_r:myapp_t:s0
#   tcontext=system_u:object_r:var_t:s0 tclass=file permissive=1

# Step 4: 用 audit2allow 把日志转成策略模块
ausearch -m AVC -ts recent | audit2allow -M myapp_policy

# Step 5: 安装策略模块
semodule -i myapp_policy.pp

# Step 6: 回到 enforcing 模式
setenforce 1
```

**逐部分解释**：
- `permissive` 模式是调试利器：SELinux 继续记录"本该拒绝"的操作，但不真的拒绝，服务能正常运行
- `audit2allow` 读 AVC 日志，自动生成最小化的 allow 规则
- `-M` 把规则打包成可安装的策略模块（`.pp` 文件），`semodule -i` 热加载，无需重启

### 案例 3：Android 如何把 SELinux 策略编译进 ROM

场景：理解 Android 为什么每个 App 都被隔离在自己的"牢笼"里。

```bash
# Android 源码树里的 SELinux 策略片段（伪代码示意）
# system/sepolicy/private/app.te
type untrusted_app, domain;
allow untrusted_app app_data_file:dir { read write search };
# 允许 App 读写自己的数据目录（/data/data/<package>）

neverallow untrusted_app system_data_file:file write;
# 硬性禁止：普通 App 永远不能写系统数据文件
# neverallow 是编译期检查，策略文件编译不通过就无法生成 ROM

# 查看 App 进程在真机上的 context
adb shell ps -Z | grep com.example.myapp
# 输出类似：
# u:r:untrusted_app:s0:c512,c768  com.example.myapp
```

**逐部分解释**：
- Android 把每个 App 映射到 `untrusted_app` 域，同时用 Linux UID 隔离
- `neverallow` 是 SELinux 策略的"宪法条款"——即使厂商定制 ROM 也不能违反，否则编译失败
- `s0:c512,c768` 是 MLS 多级安全标签，用于 App 间的进一步隔离

## 踩过的坑

1. **`setenforce 0` 是饮鸩止渴**：遇到 AVC denied 就关掉 SELinux，问题"消失"了，但整个 MAC 保护也消失了。正确做法是用 `ausearch` + `audit2allow` 定向修复策略，或用 `chcon`/`restorecon` 修复文件的 context。

2. **文件 context 复制陷阱**：用 `cp` 复制文件时，新文件的 SELinux context 由目标目录的默认策略决定，不继承源文件的 context。把 `/home/user/app.conf` 复制到 `/etc/myapp/` 后，context 变成 `etc_t` 而非 `myapp_conf_t`，服务可能读不到。解决：`restorecon -Rv /etc/myapp/` 重置为策略定义的默认 context。

3. **domain 转换的隐式规则**：进程 fork 后子进程继承父进程的 domain，但执行 `exec()` 时，SELinux 的 `type_transition` 规则会自动切换 domain。`httpd_t` exec 了一个 CGI 脚本，脚本进程会变成 `httpd_sys_script_t`，不是 `httpd_t`。不知道这个机制会让调试变成谜。

4. **MLS level 标签导致的访问拒绝**：在启用了 MLS 的系统上，进程的安全级别（如 `s0`）必须匹配或高于文件的敏感度标签。从高级别进程 fork 的子进程无法降级写低级别文件，会产生直觉上意外的拒绝日志。

## 适用 vs 不适用场景

**适用**：
- 多租户服务器：把每个服务（数据库、Web 服务器、邮件服务）隔离在独立 domain，一个被攻破不影响其他
- 高安全等级系统：政府/金融/医疗场景需要满足 CC 评估、HIPAA/FedRAMP 合规要求
- 容器安全加固：配合 Docker/runc 给容器进程打 SELinux label，防止容器逃逸
- Android 设备：强制隔离 App 和系统服务，减少恶意 App 的横向移动能力

**不适用**：
- 快速原型/开发环境：策略配置耗时，且每次修改代码可能触发新的 AVC denied，严重拖慢迭代
- 策略工具链不支持的嵌入式设备：小内存设备可能无法承载完整策略数据库
- 替代方案：对于路径型场景（只需限制文件访问），AppArmor 比 SELinux 配置更简单；对于细粒度权限分解，Linux Capabilities 是轻量替代

## 历史小故事（可跳过）

- **1987-1991 年**：NSA 的 TRUSIX 工作组研究在 UNIX 里加 MAC，产出了若干技术报告和原型，奠定基础。
- **1992-1999 年**：NSA 与 SCC 合作开发 Flask 架构，先在 Fluke 微内核上实现，再移植到基于 Mach 的 DTOS（分布式可信操作系统）系统。Flask 的核心洞见：把策略决策（Security Server）和策略执行（Object Manager）彻底解耦。
- **2000 年 12 月 22 日**：NSA 以 GPL 开源发布第一版 SELinux 补丁，包含完整的内核补丁和示例策略。
- **2001 年 6 月**：在波士顿的 USENIX ATC 会议上发表本文，详述架构设计、LSM 钩子实现、AVC 性能数据。
- **2003 年 8 月**：SELinux 并入 Linux 2.6.0-test3 主线内核，结束了十年作为"外挂补丁"的历史。
- **2013-2014 年**：Android 4.3 引入 SELinux，Android 5.0 Lollipop 起所有设备默认 enforcing 模式，覆盖数十亿设备。

## 学到什么

1. **"默认拒绝"比"默认允许"安全得多**：SELinux 策略里没写的访问全部拒绝。这个原则——正面清单而非负面清单——是现代零信任架构的基础思路
2. **策略与机制分离才能演化**：Flask 架构允许替换安全策略而不改内核代码。这让 SELinux 能从最初的 Type Enforcement，逐步扩展到 RBAC 和 MLS，而内核代码几乎不动
3. **性能与安全的实际代价**：AVC 缓存把高频决策的开销压到 1-2%，说明安全机制不一定是高性能的对立面——关键在于缓存设计
4. **操作系统研究到工业落地**：从 Flask 1992 年研究原型，到 2003 年进 Linux 主线，再到 2013 年覆盖数十亿 Android 设备，整整 21 年的演化路径

## 延伸阅读

- 官方文档：[Red Hat SELinux User's and Administrator's Guide](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/using_selinux/index)（最完整的中文友好参考手册）
- 视频：[SELinux for Mere Mortals — Thomas Cameron](https://www.youtube.com/watch?v=_WOKRaM-HI4)（RHEL 工程师讲的入门演讲，45 分钟）
- Flask 原始论文：[The Flask Security Architecture: System Support for Diverse Security Policies](https://www.cs.cmu.edu/~./rwh/courses/595/papers/flask.pdf)（SELinux 的理论来源）
- [[flask]] —— Flask 架构是 SELinux 的直接前身，理解 Flask 就理解了 SELinux 的设计哲学
- [[mach-1986]] —— DTOS（FLASK 的第二个宿主）是 Mach 微内核的衍生版本

## 关联

- [[flask]] —— SELinux 实现了 Flask 强制访问控制架构，Flask 是它的理论基础
- [[mach-1986]] —— Flask 在迁移到 Linux 之前，先在 Mach 衍生的 DTOS 系统上实现过
- [[unix-1974]] —— SELinux 是对传统 Unix DAC（chmod/chown/root）的根本性补强
- [[mach-vm-1987]] —— Mach 的进程/端口隔离思路影响了 Flask 的对象管理器设计
- [[aes]] —— 同为 NSA 主导的安全标准，AES 管加密传输，SELinux 管运行时访问控制
- [[vodozemac]] —— 现代端对端加密库，与 SELinux 形成"传输层加密 + 运行时访问控制"的纵深防御组合
- [[containerd]] —— 容器运行时，在 Linux 上会与 SELinux 配合实现容器隔离的内核层保护

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capsicum-2010]] —— Capsicum: Practical Capabilities for UNIX

