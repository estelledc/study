---
title: Pigeon (ROS) — 零基础入门笔记
来源: https://github.com/PigeonSensei/pigeon_ros_tutorial
日期: 2026-06-13
分类: 机器学习
子分类: robotics
provenance: pipeline-v3
---

# Pigeon (ROS) — 零基础入门笔记

## 什么是 ROS

ROS（Robot Operating System，机器人操作系统）听起来像个操作系统，但它其实不是。你可以把它理解成一个**机器人的"微信"**——不同的程序（节点）通过这个"微信"互相发消息、协作干活。

打个比方：你的机器人有一双眼睛（摄像头）、一双耳朵（麦克风）、一个大脑（计算单元）和四只手（电机）。如果没有 ROS，每个部件都要各自写一套通信代码，像每个人之间单独打电话。有了 ROS，每个部件只需"发消息"就行，像在同一个微信群里聊天——谁订阅了这个群，谁就能收到消息。

> 来源：[PigeonSensei/pigeon_ros_tutorial](https://github.com/PigeonSensei/pigeon_ros_tutorial) 是一套面向初学者的 ROS 编程教程，提供 C 风格和 C++ 风格的示例代码，覆盖了 ROS 开发中最核心的概念。

## 核心概念

### 1. 节点 (Node)

节点是 ROS 的基本工作单位。一个节点就是**一个独立的程序**。比如：

- `camera_node`：负责从摄像头读取图像
- `motor_node`：负责控制电机转动
- `navigation_node`：负责导航路径规划

每个节点各司其职，通过 ROS 网络互相通信。

### 2. 话题 (Topic) — 发布/订阅模式

话题是节点之间**发布和接收消息**的通道。

- **Publisher（发布者）**：往某个话题发消息，就像往微信群里发消息
- **Subscriber（订阅者）**：从某个话题收消息，就像加入微信群看消息

关键点：发布者和订阅者**互不认识**，它们只关心同一个话题名称。这叫"解耦"——你换了一个发布者，订阅者完全不用改代码。

### 3. 服务 (Service) — 请求/响应模式

话题是"持续广播"，服务是"一问一答"。

- 客户端发一个**请求**，服务端处理完返回**响应**

就像你给朋友发微信问"在吗"，对方回复"在"——这是一个完整的请求-响应周期。

### 4. 消息 (Message)

消息是节点之间传递的数据格式。比如：

- `std_msgs/String`：一段文本
- `geometry_msgs/Twist`：机器人的线速度和角速度

每个消息都有预定义的字段，确保发者和收者理解同一个格式。

## 第一个程序：发布消息

这是 `basic_publish_tutorial` 的示例，展示如何创建一个节点往话题发消息。

```python
#!/usr/bin/env python3
"""basic_publish_tutorial — 最简单的发布者"""

import rospy
from std_msgs.msg import String

def talker():
    # 1. 初始化节点，名字叫 "talker"
    rospy.init_node('talker', anonymous=True)

    # 2. 创建发布者：往 "chatter" 话题发消息，消息类型是 String
    pub = rospy.Publisher('chatter', String, queue_size=10)

    # 3. 设置发布频率：每秒发 10 条消息
    rate = rospy.Rate(10)

    # 4. 循环发布消息
    while not rospy.is_shutdown():
        hello_str = "hello pigeon %s" % rospy.get_time()
        pub.publish(hello_str)
        rospy.loginfo(hello_str)
        rate.sleep()

if __name__ == '__main__':
    try:
        talker()
    except rospy.ROSInterruptException:
        pass
```

**逐行理解：**

1. `rospy.init_node()`：给节点起个名字。匿名模式让每次启动有不同的 ID，适合跑多个相同节点。
2. `Publisher()`：告诉 ROS 你要往哪个话题发什么类型的消息。`queue_size=10` 表示如果接收者慢了，最多缓存 10 条。
3. `Rate(10)`：每秒循环 10 次。
4. `pub.publish()`：把消息发到话题上。

## 第二个程序：订阅消息

对应 `basic_subscribe_tutorial`，展示如何接收别人发的消息。

```python
#!/usr/bin/env python3
"""basic_subscribe_tutorial — 最简单的订阅者"""

import rospy
from std_msgs.msg import String

# 回调函数：收到消息时自动调用
def callback(data):
    rospy.loginfo("I heard: %s", data.data)

def listener():
    # 1. 初始化节点，名字叫 "listener"
    rospy.init_node('listener', anonymous=True)

    # 2. 创建订阅者：从 "chatter" 话题收 String 类型的消息
    #    每收到一条就调用 callback 函数
    rospy.Subscriber('chatter', String, callback)

    # 3. 进入阻塞循环，等待消息到达
    rospy.spin()

if __name__ == '__main__':
    listener()
```

**重点理解：**

- `callback` 函数是**回调**——你不会主动调用它，而是 ROS 收到消息时自动触发。就像你设置了一个监听器，微信一有新消息就弹窗。
- `rospy.spin()` 不是空转，它让节点保持在运行状态，持续监听订阅的话题。

## 运行时怎么看消息

启动两个终端：

```bash
# 终端 1：启动发布者
rosrun pigeon_tutorial basic_publish_tutorial

# 终端 2：启动订阅者
rosrun pigeon_tutorial basic_subscribe_tutorial
```

你还能用命令行工具直接看话题内容：

```bash
# 查看某个话题正在发的消息
rostopic echo /chatter

# 查看有哪些话题在工作
rostopic list

# 查看节点列表
rosnode list
```

## C++ 风格：类封装写法

教程还提供了 C++ 版本的 `basic_class_tutorial`，用面向对象的方式组织节点代码。核心思路相同，只是封装在类里：

```cpp
#include <ros/ros.h>
#include <std_msgs/String.h>
#include <sstream>

class Talker {
public:
    Talker() {
        // 创建发布者
        pub_ = n_.advertise<std_msgs::String>("chatter", 1000);
    }

    void talk() {
        ros::Rate loop_rate(10);
        int count = 0;
        while (ros::ok()) {
            std_msgs::String msg;
            std::stringstream ss;
            ss << "hello pigeon " << count;
            msg.data = ss.str();
            pub_.publish(msg);
            ROS_INFO("%s", msg.data.c_str());
            ros::spinOnce();
            loop_rate.sleep();
            ++count;
        }
    }

private:
    ros::NodeHandle n_;
    ros::Publisher pub_;
};

int main(int argc, char** argv) {
    ros::init(argc, argv, "talker");
    Talker talker;
    talker.talk();
    return 0;
}
```

## 教程覆盖的其他主题

| 模块 | 内容 |
|------|------|
| `basic_msg_tutorial` | 自定义消息类型的定义和使用 |
| `basic_parameta_tutorial` | 参数服务器，动态配置节点参数 |
| `basic_dynamic_reconfigure_tutorial` | 运行时动态调整参数，不用重启节点 |
| `basic_service_server_tutorial` | 服务服务端，处理请求-响应 |
| `basic_service_client_tutorial` | 服务客户端，发送请求并等待响应 |
| `basic_urdf_tutorial` | URDF 机器人描述格式 |
| `basic_tf_tutorial` | TF 坐标变换，管理机器人各部件的空间关系 |

## 总结

ROS 的哲学很简单：**每个程序做一件事，做好了，然后通过消息互相协作。** 话题（Topic）用于持续的数据流，服务（Service）用于请求-响应。掌握了发布和订阅，你就掌握了 ROS 的 80%。

Pigeon 教程（`PigeonSensei/pigeon_ros_tutorial`）的特点是把每个概念拆成最小可运行的例子，C 风格和 C++ 风格都有，非常适合零基础入门。
