---
title: "Serverless Computing: Evolution and Future"
来源: https://arxiv.org/abs/2301.00002
日期: 2026-06-13
分类: 其他
子分类: systems-dist
provenance: pipeline-v3
---

# Serverless Computing: Evolution and Future

## 一、日常类比：从开饭店到用电

你小时候一定用过电。

按开关，灯就亮了。你不需要知道发电厂在哪里，不需要知道发电用的是什么煤，更不需要自己建一个发电厂。你只关心"有灯"这件事。

Serverless Computing 的理念一模一样：**你只写代码，运行环境自动给你搭好。**

传统做法是什么？你要买服务器、装操作系统、配网络、装运行时（Node.js / Python）、部署代码、监控性能、扩缩容——整套流程下来，业务还没开始，运维成本就已经很高了。

Serverless 把这一切都"藏"起来了。你上传函数代码，云平台帮你处理 everything else。

## 二、为什么需要 Serverless

### 2.1 传统部署的痛苦

想象你在开发一个网站。用户每天的行为有高峰和低谷：

- 白天高峰期：每秒 1000 个请求
- 深夜低谷期：每秒 10 个请求

传统方式下，你必须按高峰配置服务器。这就好比你开餐厅，按"春节除夕"的客人数量买桌子——平时大部分桌子都空着，但你仍然要付租金。

### 2.2 容器化的中间态

后来出现了 Docker 和 Kubernetes。它们解决了"环境一致性"问题——代码在哪里都能跑。但管理 Kubernetes 集群本身成了一个复杂的工程活：你要管节点、管网络、管负载均衡、管滚动更新。

Serverless 是下一步：**连节点和集群都不用管了。**

## 三、核心概念

### 3.1 函数即服务（FaaS）

FaaS 是 Serverless 的核心。你写一个"函数"（一段代码），把它上传到云平台。当特定事件发生（比如 HTTP 请求、文件上传、定时任务）时，云平台自动运行你的函数。

**关键特征：**

- **事件驱动**：不是永远运行，而是被"触发"才执行
- **按次计费**：执行 1 秒收 1 秒的钱，不执行不收钱
- **自动扩缩**：1 个请求和 100 万个请求，平台自动处理

```python
# AWS Lambda 示例：一个简单的 HTTP 请求处理函数
import json
import os
import boto3

# 初始化 DynamoDB 客户端
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Visitors')

def lambda_handler(event, context):
    """
    这个函数被 AWS Lambda 自动调用。
    event 包含 HTTP 请求信息。
    context 包含运行时的元数据。
    """
    visitor_id = event.get('requestContext', {}).get('requestId', 'unknown')

    # 记录访问
    table.put_item(
        Item={
            'visitorId': visitor_id,
            'timestamp': int(time.time()),
            'ipAddress': event.get('headers', {}).get('x-forwarded-for', 'N/A')
        }
    )

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': json.dumps({
            'message': 'Visitor recorded',
            'visitorId': visitor_id
        })
    }
```

### 3.2 BaaS（Backend as a Service）

BaaS 是 Serverless 的"另一半"。它提供现成的后端能力：数据库、认证、存储、消息队列。你不需要自己部署这些服务。

比如：用户登录时，传统做法是你自己写认证系统、维护用户数据库、处理密码加密。用 BaaS（如 Firebase Auth 或 AWS Cognito），几行代码搞定。

### 3.3 冷启动（Cold Start）

这是 Serverless 最著名的"坑"。

想象你叫了一个外卖。如果骑手就在你附近，10 分钟到。但如果骑手在 20 公里外，可能要 40 分钟。

Serverless 中，当你很久没调用某个函数时，云平台会把它"收走"。下次调用时，需要重新启动环境——这个过程叫**冷启动**，可能耗时几百毫秒到几秒。

```python
# 冷启动 vs 热执行的示意

# 第一次调用（冷启动）：
# 1. 云平台分配容器 -> 2. 加载运行时环境 -> 3. 执行你的函数
# 总耗时：~1200ms

# 后续调用（热执行）：
# 1. 复用已有容器 -> 2. 执行你的函数
# 总耗时：~15ms

# AWS Lambda 中的"预热"技巧：
# 设置定时任务每隔几分钟调用一次函数，
# 保持容器"热"的状态，减少冷启动延迟。

import time

# 这个"预热函数"定期被调用来保持其他函数的活跃
def warm_up_function(event, context):
    """
    这个函数本身不做任何事情，
    只是被定时触发，保持 Lambda 运行环境的热状态。
    """
    return {
        'statusCode': 200,
        'body': 'Warm-up complete'
    }
```

### 3.4 事件总线（Event Bus）

Serverless 应用通常由多个函数组成。它们怎么"聊天"？答案：**事件总线。**

就像餐厅里的传菜员：厨房做好菜，把菜放到传菜窗口（事件），服务员（另一个函数）看到菜好了，就端给客人。

```python
# 事件总线驱动的 Serverless 工作流
# 用户上传图片 -> 触发图像处理函数 -> 触发通知函数

import json
import boto3

# 模拟事件总线（AWS EventBridge / SNS）
event_bridge = boto3.client('events')

def image_upload_handler(event, context):
    """
    触发条件：S3 存储桶有新文件上传
    """
    # 从事件中获取上传的文件信息
    records = event.get('Records', [])
    for record in records:
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']

        # 发布事件到事件总线
        event_bridge.put_events(
            Entries=[
                {
                    'Source': 'myapp.imageUpload',
                    'DetailType': 'Image Uploaded',
                    'Detail': json.dumps({
                        'bucket': bucket,
                        'key': key,
                        'timestamp': time.time()
                    }),
                    'EventBusName': 'myapp-events'
                }
            ]
        )

    return {'statusCode': 200}


def image_resize_handler(event, context):
    """
    触发条件：事件总线收到 'Image Uploaded' 事件
    """
    detail = json.loads(event['Detail'])
    bucket = detail['bucket']
    key = detail['key']

    # 下载原图 -> 压缩 -> 上传缩略图
    s3 = boto3.client('s3')
    # ... 图像处理逻辑（实际场景用 Pillow 或 AWS Rekognition）...

    # 发布另一个事件，通知"缩略图已生成"
    event_bridge.put_events(
        Entries=[{
            'Source': 'myapp.imageResized',
            'DetailType': 'Thumbnail Generated',
            'Detail': json.dumps({'key': key}),
            'EventBusName': 'myapp-events'
        }]
    )

    return {'statusCode': 200}


def notify_user_handler(event, context):
    """
    触发条件：事件总线收到 'Thumbnail Generated' 事件
    """
    detail = json.loads(event['Detail'])
    # 发送通知（邮件、短信、Push）
    print(f"通知用户: 缩略图已生成 - {detail['key']}")
    return {'statusCode': 200}
```

## 四、Serverless 的演进历程

### 4.1 第一阶段：Web 服务器时代（1990s）

你买一台物理服务器，装上 Apache/Nginx，自己写 CGI 脚本。

- 优点：完全掌控
- 缺点：运维繁重，扩缩容困难

### 4.2 第二阶段：虚拟主机和 VPS（2000s）

你租一台虚拟机（EC2）。操作系统和软件自己装，但不用管物理硬件。

- 优点：比买物理服务器简单
- 缺点：仍然要管操作系统、部署、扩缩容

### 4.3 第三阶段：容器化（2010s）

Docker 出现。你把应用打包成容器，Kubernetes 帮你调度。

- 优点：环境一致，跨平台
- 缺点：K8s 复杂度爆炸，运维门槛高

### 4.4 第四阶段：Serverless（2020s）

FaaS 成熟。你只管写函数代码，平台处理一切。

- 优点：零运维、按次计费、自动扩缩
- 缺点：冷启动、vendor lock-in、复杂应用适配难

### 4.5 演进时间线

| 时期 | 模式 | 你管理什么 | 平台管理什么 |
|---|---|---|---|
| 1990s | 物理服务器 | 全部 | 电力、空调 |
| 2000s | VPS / 云主机 | OS、中间件、应用 | 硬件、虚拟化 |
| 2010s | 容器（K8s） | 应用、配置 | 节点、编排 |
| 2020s | Serverless / FaaS | 代码函数 | 全部运行环境 |

## 五、代码示例

### 示例 2：Serverless API Gateway + Lambda

这是最常见的 Serverless 应用模式：**API 网关接收 HTTP 请求，触发 Lambda 函数。**

```python
# API Gateway 路由 + Lambda 函数
# 一个完整的用户 CRUD API（用伪代码示意 Serverless 架构）

from typing import Dict, Any
import json

# ========== API 路由层 ==========

ROUTES = {}

def route(method: str, path: str):
    """装饰器：注册路由"""
    def decorator(func):
        key = f"{method} {path}"
        ROUTES[key] = func
        return func
    return decorator


# ========== 业务函数层 ==========

@route("GET", "/users")
def list_users(event: Dict[str, Any], context: Any) -> Dict:
    """列出所有用户"""
    users = get_all_users_from_dynamodb()
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({'users': users})
    }


@route("POST", "/users")
def create_user(event: Dict[str, Any], context: Any) -> Dict:
    """创建新用户"""
    body = json.loads(event['body'])
    username = body.get('username')
    email = body.get('email')

    if not username or not email:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Username and email required'})
        }

    user_id = save_user_to_dynamodb(username, email)
    return {
        'statusCode': 201,
        'body': json.dumps({'userId': user_id, 'username': username})
    }


@route("GET", "/users/{id}")
def get_user(event: Dict[str, Any], context: Any) -> Dict:
    """获取单个用户"""
    user_id = event['pathParameters']['id']
    user = get_user_from_dynamodb(user_id)

    if not user:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': 'User not found'})
        }

    return {
        'statusCode': 200,
        'body': json.dumps({'user': user})
    }


# ========== 路由分发器（API Gateway 转发逻辑） ==========

def api_gateway_handler(event: Dict[str, Any], context: Any) -> Dict:
    """
    API Gateway 的事件入口，
    根据 HTTP 方法和路径分发到对应的函数。
    """
    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')

    route_key = f"{method} {path}"
    handler = ROUTES.get(route_key)

    if handler:
        return handler(event, context)
    else:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': 'Not Found'})
        }


# ========== 异步事件处理示例 ==========

def on_user_created_async(event: Dict[str, Any], context: Any) -> None:
    """
    用户创建后异步执行：
    - 发送欢迎邮件
    - 更新搜索索引
    - 推送消息到队列
    """
    user_id = event.get('userId')
    username = event.get('username')

    # 发送欢迎邮件（通过 SNS）
    send_welcome_email(username)

    # 更新搜索索引
    update_search_index(user_id)

    # 记录审计日志
    log_audit_event('user.created', {'userId': user_id})


def process_payment_event(event: Dict[str, Any], context: Any) -> Dict:
    """
    支付事件处理函数。
    由事件总线触发，处理异步支付逻辑。
    """
    payment = json.loads(event['body'])
    amount = payment['amount']
    user_id = payment['userId']

    # 调用外部支付 API
    charge_result = process_with_stripe(amount, user_id)

    if charge_result.success:
        # 发送成功通知
        send_notification(user_id, 'Payment successful')
        return {'statusCode': 200, 'body': 'Payment processed'}
    else:
        return {
            'statusCode': 402,
            'body': json.dumps({'error': 'Payment failed'})
        }
```

### 示例 3：Serverless 数据管道

Serverless 也常用于数据处理管道：接收 -> 转换 -> 存储。

```python
# Serverless 数据管道示例
# 模拟 IoT 设备数据流：接收 -> 清洗 -> 聚合 -> 存储

import json
import time
import hashlib
from typing import List, Dict, Any

# ===== 阶段 1：数据接收 =====

def iot_data_ingestor(event: Dict[str, Any], context: Any) -> Dict:
    """
    接收 IoT 设备上报的温度数据。
    触发条件：HTTP POST 请求到 API Gateway。
    """
    records = json.loads(event['body']).get('records', [])
    processed = []

    for record in records:
        device_id = record.get('deviceId')
        temperature = record.get('temperature')
        timestamp = record.get('timestamp', int(time.time()))

        # 生成唯一 ID（去重用）
        record_id = hashlib.md5(
            f"{device_id}:{timestamp}".encode()
        ).hexdigest()

        processed.append({
            'recordId': record_id,
            'deviceId': device_id,
            'temperature': temperature,
            'timestamp': timestamp
        })

    # 发布到事件总线，供下游消费
    publish_batch_events('iot.temperature', processed)

    return {
        'statusCode': 202,
        'body': json.dumps({
            'received': len(processed),
            'message': 'Data ingested and queued'
        })
    }


# ===== 阶段 2：数据清洗 =====

def data_cleaner(event: Dict[str, Any], context: Any) -> Dict:
    """
    清洗 IoT 数据：过滤异常值、填充缺失字段。
    触发条件：消费事件总线中的 'iot.temperature' 事件。
    """
    entries = event.get('entries', [])
    cleaned = []
    outliers = 0

    for entry in entries:
        temp = entry['temperature']

        # 过滤不合理值（温度传感器坏了可能报 -999）
        if temp < -50 or temp > 150:
            outliers += 1
            continue

        # 填充默认值
        if 'deviceName' not in entry:
            entry['deviceName'] = get_device_name(entry['deviceId'])

        cleaned.append(entry)

    # 异常值告警
    if outliers > 0:
        send_alert(f"Detected {outliers} outlier readings")

    # 继续传递给下一阶段
    publish_batch_events('iot.cleaned', cleaned)

    return {
        'statusCode': 200,
        'body': json.dumps({
            'input': len(entries),
            'output': len(cleaned),
            'dropped': outliers
        })
    }


# ===== 阶段 3：数据聚合 =====

def data_aggregator(event: Dict[str, Any], context: Any) -> Dict:
    """
    聚合 IoT 数据：按设备计算平均值、最大值、最小值。
    触发条件：消费 'iot.cleaned' 事件。
    """
    records = event.get('entries', [])

    # 按设备分组
    grouped: Dict[str, List[float]] = {}
    for record in records:
        device_id = record['deviceId']
        temp = record['temperature']

        if device_id not in grouped:
            grouped[device_id] = []
        grouped[device_id].append(temp)

    # 计算统计值
    aggregated = []
    for device_id, temps in grouped.items():
        aggregated.append({
            'deviceId': device_id,
            'count': len(temps),
            'avg': sum(temps) / len(temps),
            'min': min(temps),
            'max': max(temps),
            'windowEnd': int(time.time())
        })

    # 写入时序数据库
    save_to_timeseries(aggregated)

    return {
        'statusCode': 200,
        'body': json.dumps({
            'devices_aggregated': len(aggregated),
            'records': aggregated
        })
    }
```

## 六、Serverless 的优缺点

### 优点

1. **成本效率**：不用就免费，特别适合流量波动大的应用
2. **零运维**：不用管服务器、操作系统、补丁
3. **自动弹性**：从 0 到 100 万并发，平台自动处理
4. **快速迭代**：改一行代码，秒级部署上线

### 缺点

1. **冷启动**：函数久不执行会被"回收"，下次调用有延迟
2. **Vendor Lock-in**：代码和架构深度绑定特定云平台
3. **调试困难**：运行环境不透明，日志分散
4. **执行限制**：通常有超时限制（如 15 分钟），不适合长任务

## 七、未来趋势

### 7.1 Serverless 与容器融合

像 AWS Fargate、Google Cloud Run 这样的事件驱动容器服务，正在模糊"Serverless"和"容器"的边界。

### 7.2 AI 推理的 Serverless 化

大模型推理正在走向 Serverless——你只需要传一个 prompt，云端自动调度 GPU 资源。这正是 Serverless 理念在 AI 时代的自然延伸。

### 7.3 边缘 Serverless

函数不再只跑在数据中心，而是跑在离用户更近的边缘节点（CDN 节点、基站）。延迟更低，带宽更省。

## 八、总结

Serverless 不是"没有服务器"，而是"你不用管服务器"。它的演进从物理服务器到容器，最终目标是让开发者只关注业务逻辑。

学习路径建议：

1. 先理解 FaaS 的基本概念：事件触发、按需运行
2. 写一个 Lambda 函数试试：比如"收到邮件就记录日志"
3. 学 API Gateway：把函数变成 HTTP API
4. 理解事件总线：学会把多个函数串成工作流
5. 关注冷启动问题：用预热或容器提供模式优化

Serverless 不是万能的——对于长时间运行的任务、高频调用的核心服务，传统方式可能更合适。但它的"按需、免运维"理念，正在成为云原生时代的重要范式。

## 九、思考题

1. 如果一个电商网站在"双十一"流量是平时的 100 倍，Serverless 相比传统 K8s 方案有什么优势？
2. Serverless 的"冷启动"问题在什么场景下最不能接受？（医疗系统？游戏？实时通讯？）
3. 如果 AI 推理服务全部 Serverless 化，会对开发者生态产生什么影响？

这些问题没有标准答案，但能帮你建立对 Serverless 的直觉判断。
