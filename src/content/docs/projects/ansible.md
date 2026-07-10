---
title: Ansible — 无 agent 配置管理
来源: https://github.com/ansible/ansible
日期: 2026-05-29
分类: DevOps / 配置管理
难度: 中级
---

## 是什么

Ansible 是 **Michael DeHaan 在 2012 年用 Python 写的"通过 SSH 远程配置服务器"工具**。你在自己电脑上写一份 YAML，跑一行命令，它会同时连上几十台甚至几千台服务器，按你写的步骤去装软件、改配置文件、起服务。

日常类比：[[terraform]] 是**创建房子**——告诉云厂商"给我开 10 台 EC2、配 1 个 VPC、挂 5 个磁盘"，房子从无到有；Ansible 是**装修房子**——房子已经存在了（不管是 Terraform 创的、手开的、还是物理机），它负责"在每间房刷墙、装空调、布水电"。

最简单的体验，让两台机器都装上 nginx：

```bash
# inventory.ini
[web]
server1.example.com
server2.example.com

# playbook.yml
- hosts: web
  tasks:
    - name: install nginx
      apt: { name: nginx, state: present }

ansible-playbook -i inventory.ini playbook.yml
```

跑完，两台机器上都有 nginx。**不需要在目标机预装任何 agent**——只要 SSH 通、有 Python 解释器，Ansible 就能用。

## 为什么重要

不理解 Ansible 的设计哲学，下面这些事都没法解释：

- 为什么 2012 年它一出来就把 Puppet、Chef 抢走了一大批用户——别人都要在目标机装 agent + 跑守护进程，它只要 SSH
- 为什么 Red Hat 在 2015 年花 1.5 亿美元把它收购——这是企业 IT 自动化的入口，谁拿到谁就拿到了运维标准
- 为什么"基础设施即代码"（IaC）的下半段是它——[[terraform]] 管"机器从无到有"，Ansible 管"机器从空白到能用"
- 为什么一个 YAML 文件能同时操作物理机、虚拟机、云主机、容器——它把"远程操作"这层抽象做得足够薄

简单说：**它是过去 12 年配置管理领域最重要的一次"减法"**——拿掉 agent、拿掉私有 DSL，只留 SSH + YAML。

## 核心要点

Ansible 的核心模型可以拆成 **三层**：

1. **Inventory（机器清单）**：一个文件，列出你要管的所有机器，可以分组。最简单的是 `.ini` 格式：`[web]` 下放 web 服务器、`[db]` 下放数据库。生产环境通常用**动态 inventory**——一个脚本去 AWS / 阿里云 API 拉机器列表，自动分组。

2. **Playbook（任务剧本）**：一个 YAML 文件，描述"在哪些机器上、按什么顺序、做哪些事"。每个任务有名字、用哪个 module、传什么参数。Playbook 是**声明式**的——你写"我要 nginx 装着"，不是"运行 apt install nginx"，Ansible 会自己判断当前状态再决定要不要动。

3. **Module（模块）**：每个任务背后调用的"小工具"。`apt` 装 Debian 包、`yum` 装 RedHat 包、`copy` 拷文件、`template` 渲染 Jinja2 模板、`service` 起停服务，几千个内置 module。**Idempotency（幂等）**：同一个 playbook 跑 1 次和跑 100 次结果一致——module 内部会先检查状态再决定动不动。

简单说：**Inventory 是地址簿，Playbook 是剧本，Module 是演员，幂等性是导演的承诺**。

## 实践案例

### 案例 1：装 nginx + 改配置 + 重启

```yaml
- hosts: web
  become: yes
  tasks:
    - name: install nginx
      apt:
        name: nginx
        state: present

    - name: render nginx config from template
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      notify: restart nginx

  handlers:
    - name: restart nginx
      service:
        name: nginx
        state: restarted
```

**逐部分解释**：

- `become: yes` —— 用 sudo 提权，因为装包要 root
- `template` —— 把本地 `nginx.conf.j2` 渲染（替换 Jinja2 变量）后传到目标机
- `notify: restart nginx` —— 只有配置文件**真的变了**才触发 handler，没变就跳过
- `handlers` —— 一类特殊任务，本轮 playbook 里被 notify 多次也只跑一次

### 案例 2：动态 inventory 接 AWS

不写死 `server1.example.com`，让 Ansible 实时去 AWS API 拉机器列表：

```bash
ansible-playbook -i aws_ec2.yml playbook.yml
```

`aws_ec2.yml` 是个 plugin 配置，告诉 Ansible "去 us-east-1 拉所有打了 `tag:Role=web` 的实例当 web 组"。云上机器一变化，下次跑 playbook 自动跟上。

### 案例 3：和 [[terraform]] 配合的标准姿势

- Terraform 跑：开 5 台 EC2，输出它们的 IP 列表到 `terraform output -json`
- Ansible 跑：读这份 IP 列表当 inventory，进每台机器装 nginx + 部署应用

**边界很清楚**：Terraform 不擅长"进机器装东西"（它的 provisioner 只是兜底，社区不推荐用）；Ansible 不擅长"开机器"（它的 cloud module 能开但状态管理不如 Terraform）。**别混用**——一个管基础设施生命周期，一个管软件配置生命周期。

## 踩过的坑

1. **YAML 缩进 / 引号易错**：少一个空格、多一个 tab，整个 playbook 跑不通，错误信息还很难懂。新手第一周基本在和 YAML 搏斗。建议装 `yamllint` + 编辑器插件，写一行检查一行。

2. **跑大批机器超时**：默认 `forks=5`，意味着同时只在 5 台机器上跑。管 500 台机器时一轮要等很久。调到 `forks=50` 或更高（看本机带宽和 CPU），但**不要无脑往上加**——SSH 连接数有上限，太多反而更慢。

3. **动态 inventory 的坑**：动态脚本如果挂了或拉到不全，Ansible 不会报错，会"安静地少操作几台机器"。生产环境必须给动态 inventory 加缓存 + 报警，别让它成为隐藏的故障源。

4. **和 [[terraform]] 边界混淆**：见过有人用 Ansible 的 `ec2_instance` module 开机器、又用 Terraform 装软件，最后两边状态对不上谁也不知道哪边是真相。**铁律**：Terraform 管"从无到有"，Ansible 管"从空白到能用"。

5. **become 和 SSH key 的隐蔽问题**：`become: yes` 走的是 sudo，需要目标机的 sudoers 配置正确。SSH key 又走的是用户的 `.ssh/authorized_keys`。两套权限混在一起，新机器加进来时经常一边通一边不通，排查要分两层看。

## 适用 vs 不适用场景

**适用**：

- 配置管理（在已有机器上装软件 / 改配置 / 起服务）
- 应用部署（把代码 + 配置推到一批机器上跑起来）
- 一次性运维任务（"在所有 web 机器上跑这条命令"——`ansible web -m shell -a 'uptime'`）
- 混合环境（物理机 + 虚拟机 + 云主机一起管，只要 SSH 通就行）

**不适用**：

- 创建云资源（VPC / 安全组 / RDS 这种）→ 用 [[terraform]]，状态管理强很多
- 需要实时响应的场景（监控、自愈）→ Ansible 是"批量推一次"的模型，不是常驻 agent
- 大规模容器编排 → 用 [[kubernetes]]，Ansible 部署 k8s 集群可以，但管运行中的容器不合适
- Windows 大规模管理 → 能管，但 WinRM 比 SSH 麻烦得多，不如用 Windows 原生的 DSC

## 历史小故事（可跳过）

- **2012 年**：Michael DeHaan 写出 Ansible（之前他是 Puppet 早期员工，对 agent 模型不满意）
- **2013 年**：Ansible Inc. 成立，融资做商业化
- **2015 年**：Red Hat 以 1.5 亿美元收购，融入 RHEL 体系
- **2017 年**：推出 Ansible Tower（企业版 Web UI + RBAC + 调度）
- **2020 年**：Tower 的开源版本 AWX 全面开源
- **2024 年**：与 Red Hat OpenShift 深度集成，成为混合云自动化的标配

之后 10 年，几乎所有讲"批量配置服务器"的教程默认配图都是 Ansible。

## 学到什么

1. **减法比加法更难**——同时代的 Puppet / Chef 加 agent 加 DSL 加 master server，Ansible 全砍掉，反而赢了
2. **声明式 + 幂等**是配置管理的最低标准，不到这一层就是脚本不是工具
3. **YAML 是双刃剑**——人类可读，但缩进和类型坑也最多
4. **边界感**：Terraform 创建、Ansible 配置、Kubernetes 编排，三个工具各管一段，别试图让一个工具干完所有事

## 延伸阅读

- 官方仓库：[ansible/ansible](https://github.com/ansible/ansible)
- 官方文档：[Ansible Documentation](https://docs.ansible.com/)
- 入门教程：[Ansible Getting Started](https://docs.ansible.com/ansible/latest/getting_started/index.html)
- 动态清单：[Working with dynamic inventory](https://docs.ansible.com/ansible/latest/inventory_guide/intro_dynamic_inventory.html)
- [[terraform]] —— 和 Ansible 最常见的 IaC 分工对照

## 关联

- [[terraform]] —— 配套使用：Terraform 创建机器，Ansible 配置软件
- [[docker]] —— 容器化后 Ansible 用得少了，但部署 Docker 本身仍常用
- [[kubernetes]] —— k8s 集群初装常用 Ansible（kubespray 项目就是 ansible playbook）
- [[nginx]] —— Ansible playbook 最常见的部署对象之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
