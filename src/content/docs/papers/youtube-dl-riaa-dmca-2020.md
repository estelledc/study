---
title: YouTube-dl RIAA DMCA Takedown 事件
来源: https://github.com/github/dmca/blob/master/2020/10/2020-10-23-RIAA.md
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# YouTube-dl RIAA DMCA Takedown 事件

## 一、故事开场：一把万能钥匙被没收了

想象一下，你发明了一把万能开锁器，可以打开小区里所有住户的门。你用它在 README 里举例："看，我能打开张三家的门拿他的唱片，也能打开李四家的门拿他的电影。"

有一天，唱片公司找上门来，说你这把锁是用来偷东西的，要求物业（GitHub）把你的工具没收掉。

这就是 2020 年 10 月 YouTube-dl 遭遇的事情。

## 二、YouTube-dl 是什么？

YouTube-dl 是一个用 Python 写的命令行工具，功能很简单：给它一个视频网站的网址，它就把视频下载下来存到本地。

```bash
# 最基本的用法：下载一个 YouTube 视频
youtube-dl https://www.youtube.com/watch?v=dQw4w9WgXcQ

# 只提取音频（比如把 MV 变成 MP3）
youtube-dl -x --audio-format mp3 https://www.youtube.com/watch?v=dQw4w9WgXcQ

# 批量下载一个播放列表
youtube-dl -i -o '~/Videos/%(playlist)s/%(title)s.%(ext)s' \
  https://www.youtube.com/playlist?list=PLxyz123
```

这个项目从 2008 年开始维护，是开源社区里最有名的下载工具之一。它有超过十万个 fork（复刻版本），遍布 GitHub 上各个角落。

## 三、DMCA 是什么？

DMCA 全称是《数字千年版权法》（Digital Millennium Copyright Act），是美国 1998 年通过的一部法律。它有两个关键部分：

1. **版权侵权条款**：如果你未经许可复制、分发别人的作品，就是侵权。
2. **反规避条款（17 USC 1201）**：这是争议的核心 —— 即使你没复制作品，**制作或传播能绕过技术保护措施的工具本身**，也是违法的。

用一个类比来说：

- 版权侵权 = 你偷了邻居家的 CD
- 反规避违规 = 你造了一把能打开邻居防盗门的万能钥匙，哪怕你还没用它去偷任何东西

DMCA 第 1201 条打击的是那把"万能钥匙"。

## 四、RIAA 的攻击逻辑

RIAA（美国唱片业协会）在 2020 年 10 月 23 日向 GitHub 提交了一份 DMCA takedown notice。它的论证链条是这样的：

**第一步：YouTube 有技术保护措施**

YouTube 播放音乐视频时，并不是直接把原始视频文件发给你的浏览器。它使用了一种叫做"rolling cipher"（滚动密码）的技术来加密视频流。你可以把它理解成"每次刷新页面，门锁的密码就变一次"。

要拿到原始视频文件，必须先破解这个密码。

**第二步：YouTube-dl 就是在破解这个密码**

RIAA 指出，youtube-dl 的核心功能之一就是绕过 YouTube 的 rolling cipher，从而获取未经授权的音视频文件。

**第三步：youtube-dl 的文档本身就证明了意图**

RIAA 重点引用了 youtube-dl 的 README 文件中自带的示例用法。这些示例直接使用了受版权保护的音乐视频：

```python
# youtube-dl README 中的示例（被 RIAA 引用的内容）

# 示例 1：Icona Pop - I Love It (Warner Music Group 拥有)
youtube-dl --extract-audio --audio-format m4a \
  "https://www.youtube.com/watch?v=g3wpnzi0WZ8"

# 示例 2：Justin Timberlake - Tunnel Vision (Sony Music 拥有)
youtube-dl --extract-audio --audio-format m4a \
  "https://www.youtube.com/watch?v=RBWCORg2YTg"

# 示例 3：Taylor Swift - Shake It Off (Universal Music 拥有)
youtube-dl --extract-audio --audio-format m4a \
  "https://www.youtube.com/watch?v=e-ORhEE9VVg"
```

RIAA 认为：一个工具的官方文档直接教人如何未经授权复制受版权保护的作品，这本身就是违法的。

**第四步：引用德国法院判例**

RIAA 还附上了德国汉堡地区法院的一份判决。该判决认定 YouTube 的 rolling cipher 属于欧盟和德国法律下的"有效技术保护措施"，而绕过它的服务是非法的。RIAA 认为美国 17 USC 1201 条与欧盟相关规定"实质相同"。

## 五、核心法律概念拆解

### 5.1 17 USC 1201(a)(2) —— 禁止提供规避工具

这条规定说：任何人不得制造、进口、提供专门用于规避技术保护措施的工具或服务。

关键点是"**专门用于**"（primarily designed or produced for the purpose of）。RIAA 主张 youtube-dl 的主要目的就是绕过 YouTube 的保护措施。

### 5.2 17 USC 1201(b)(1) —— 禁止提供规避技术

这条针对的是保护"作品访问权"的技术。YouTube 的 rolling cipher 保护的就是"谁能访问视频文件"这个问题。

### 5.3 "Good Faith Belief"（善意信念）

DMCA 要求投诉方声明他们"善意相信"被举报的材料使用未经授权使用。这不是要求 100% 确定，而是一种诚实的信念声明。

被举报方如果认为自己没有侵权，可以提交 **counter-notification**（反通知）来申诉。

## 六、这件事的结果

GitHub 收到了这份 DMCA notice 之后，按照流程：

1. 移除了 youtube-dl 主仓库和大量 fork 的访问权限
2. 将 takedown notice 公开在了 github/dmca 仓库中（就是我们本文的来源）
3. 给 youtube-dl 的维护者发了通知，允许他们提交 counter-notification

youtube-dl 的维护者 Vincent A. Ruberto（用户名 rbrito）提交了反通知。随后双方进行了协商。最终 youtube-dl 项目以新的形态继续存在（后来出现了 yt-dlp 等分支项目）。

## 七、代码示例：理解 rolling cipher 的概念

YouTube 的 rolling cipher 不是一个公开的算法，但我们可以用一个简化的类比来理解它的思路：

```python
# 简化版的 "rolling cipher" 概念演示
# 注意：这只是一个教学用的简化模型，并非 YouTube 的真实实现

import hashlib
import time

def generate_video_key(video_id, timestamp):
    """
    模拟 YouTube 的 rolling cipher：
    每个视频密钥随时间变化，过期后无法使用旧密钥解密
    """
    # 将视频ID和时间戳混合生成动态密钥
    raw = f"{video_id}:{timestamp}"
    key = hashlib.sha256(raw.encode()).hexdigest()[:32]
    return key

def decrypt_video_stream(key, encrypted_chunk):
    """用当前有效的密钥解密视频数据块"""
    # XOR 解密（真实情况更复杂）
    decrypted = bytes(a ^ b for a, b in zip(
        encrypted_chunk,
        (key * (len(encrypted_chunk) // len(key) + 1))[:len(encrypted_chunk)].encode()
    ))
    return decrypted

# 使用示例
video_id = "dQw4w9WgXcQ"
timestamp = int(time.time())  # 当前时间戳作为密钥的一部分

current_key = generate_video_key(video_id, timestamp)
print(f"当前密钥: {current_key}")

# 如果有人试图用 5 分钟前的旧密钥解密，就会得到乱码
old_timestamp = int(time.time()) - 300  # 5 分钟前
old_key = generate_video_key(video_id, old_timestamp)
print(f"旧密钥:   {old_key}")
print(f"密钥不同:  {current_key != old_key}")
```

这个例子说明了 rolling cipher 的核心思想：**密钥随时间变化**。youtube-dl 要做的，就是找到一种方法预测或还原这个密钥。

## 八、代码示例：DMCA counter-notification 的结构

如果你收到 DMCA takedown notice，提交 counter-notification 时需要包含这些信息（基于 17 USC 512(g)(3)）：

```
# DMCA Counter-Notification 模板结构
# （以下为示意，实际使用需律师审核）

IDENTIFICATION OF REMOVED MATERIAL:
  被移除的材料位于: https://github.com/ytdl-org/youtube-dl
  材料被移除的日期: 2020-10-23

UNDER PENALTY OF PERJURY, I STATE THAT:
  1. 我具有善意信念，认为被移除的材料是被错误识别和/或
     误认侵权或违规使用的。

  2. youtube-dl 是一个合法工具，具有大量非侵权用途：
     - 下载自己创作的视频内容
     - 下载公共领域（public domain）的视频
     - 下载获得 Creative Commons 许可的内容
     - 下载获得作者明确授权的内容
     - 合理使用（fair use）场景下的学术研究和评论

  3. 我的地址和联系方式: [your info]

  4. 我同意在联邦地区法院接受管辖。

SIGNATURE: [your signature]
DATE: [date]
```

## 九、这件事为什么重要？

### 9.1 对开源社区的影响

youtube-dl 事件引发了关于"工具中立性"的大讨论。一个通用的下载工具，是否应该因为它被用来做侵权的事而被禁止？

类比：一把菜刀可以切菜也可以伤人，能不能因为有人用它伤人就没收菜刀的生产权？

### 9.2 反规避条款的扩张效应

DMCA 1201 条的争议在于：它不只是保护版权，而是**保护版权保护的技术手段本身**。这意味着：

- 即使你的使用是合法的（比如 fair use），
- 只要你绕过了技术保护措施，
- 就可能违反 1201 条。

这被很多法律学者认为是"过度扩张"的。

### 9.3 后续影响

youtube-dl 被下架后，社区迅速涌现了大量替代品：

| 项目 | 说明 |
|------|------|
| yt-dlp | youtube-dl 的最活跃分支，目前最流行的下载工具 |
| youtube-dl-gui | 图形界面版本 |
| various forks | GitHub 上超过十万个 fork 仍然存在 |

## 十、关键要点回顾

1. **DMCA 有两层保护**：版权侵权 + 反规避。youtube-dl 被打的是反规避这一层。

2. **rolling cipher** 是 YouTube 防止直接下载视频的技术措施，youtube-dl 的核心功能就是绕过它。

3. **README 里的示例**成了 RIAA 的关键证据 —— 工具文档直接展示了侵权用途。

4. **17 USC 1201** 打击的是"造钥匙的人"，不只是"偷东西的人"。

5. **开源社区的韧性**：一个项目被下架，社区可以在几天内产生出功能更强的替代品。

## 十一、延伸阅读

- 原始 DMCA notice：https://github.com/github/dmca/blob/master/2020/10/2020-10-23-RIAA.md
- DMCA 反规避条款的豁免申请：https://www.copyright.gov/section1201/
- yt-dlp 项目：https://github.com/yt-dlp/yt-dlp
- EFF 对 DMCA 1201 条的分析：https://www.eff.org/issues/copyright
