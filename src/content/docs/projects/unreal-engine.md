---
title: Unreal Engine 零基础入门笔记
来源: https://github.com/EpicGames/UnrealEngine
日期: 2026-06-13
分类: 其他
子分类: game-engines-and-graphics
provenance: pipeline-v3
---

# Unreal Engine 零基础入门笔记

## 一、什么是 Unreal Engine？

**类比**：Unreal Engine（UE，虚幻引擎）就像一套"乐高工业级套装"。

你不需要从零开始烧制每一块砖（写底层图形代码），而是拿到已经造好的墙、窗、门（渲染管线、物理系统、音频框架），直接拼出你想要的房子（游戏或交互式应用）。

UE 由 Epic Games 开发，免费使用——只有当你的产品收入超过 100 万美元时，才需要支付超出门槛部分的 5% 分成。

## 二、核心概念

### 2.1 场景（World / Level）

想象一个舞台：演员（角色）、道具（物品）、灯光（光源）、摄像机（玩家视角）都在这个舞台上演出。UE 里叫它 **Level**。

### 2.2 蓝图（Blueprints）

UE 最大的特色：**不用写代码也能做游戏逻辑**。蓝图是一种可视化脚本系统——你用连线的方式把事件和动作连接起来，就像画流程图。

```
[玩家按下空格] --> [检查是否在地面] --> [是：播放跳跃动画]
                                    --> [否：什么都不做]
```

### 2.3 C++ 与蓝图的协作

UE 支持两种开发方式：
- **蓝图**：适合快速原型、关卡设计、策划人员使用
- **C++**：适合高性能需求、复杂系统、核心玩法逻辑

两者可以混用：C++ 写好核心类，蓝图继承并扩展。

### 2.4 游戏引擎的生命周期

每个 UE 项目都有一个"导演"——**GameInstance** 和 **GameMode**：

| 概念 | 类比 |
|------|------|
| GameInstance | 整个剧组的制片人，贯穿游戏始终 |
| GameMode | 当前这集剧本的规则制定者 |
| GameState | 当前所有玩家的实时状态快照 |
| PlayerController | 每个玩家的遥控器 |
| Pawn / Character | 屏幕上你能操作的角色 |

## 三、C++ 代码示例

### 示例 1：创建一个自定义角色

这是 UE 中最基础的实体。下面的代码定义了一个叫 `MyCharacter` 的角色，它继承自 UE 内置的 `ACharacter` 类。

```cpp
// MyCharacter.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MyCharacter.generated.h"

UCLASS()
class MYGAME_API AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyCharacter();

protected:
    virtual void BeginPlay() override;

public:
    // 移动速度（每秒多少厘米）
    UPROPERTY(EditAnywhere, Category = "Movement")
    float MoveSpeed;

    // 跳跃力度
    UPROPERTY(EditAnywhere, Category = "Movement")
    float JumpForce;

    // 每帧调用：更新角色状态
    virtual void Tick(float DeltaTime) override;

    // 绑定键盘输入：WASD 移动
    void MoveForward(float Value);
    void MoveRight(float Value);

    // 绑定鼠标输入：旋转视角
    void LookUp(float Value);
    void TurnAtRaw(float Value);
};
```

```cpp
// MyCharacter.cpp
#include "MyCharacter.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"

AMyCharacter::AMyCharacter()
{
    // 设置默认移动速度为 300 厘米/秒
    MoveSpeed = 300.0f;
    JumpForce = 400.0f;

    // 创建相机弹簧臂（第三人称视角的关键组件）
    // 类比：给你的角色装一根"隐形手臂"，手臂末端挂着相机
    SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArm->SetupAttachment(GetRootComponent());
    SpringArm->TargetArmLength = 300.0f;  // 手臂长度 300cm
    SpringArm->bUsePawnControlRotation = true;  // 手臂跟随鼠标旋转

    // 创建相机，挂在弹簧臂末端
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SpringArm, USpringArmComponent::SocketName);

    // 禁用重力翻滚（角色不会像保龄球一样滚来滚去）
    GetCharacterMovement()->bOrientRotationToMovement = false;

    // 设置跳跃力度
    GetCharacterMovement()->JumpZVelocity = JumpForce;
    GetCharacterMovement()->GravityScale = 0.8f;  // 0.8 倍重力，跳得更高更慢
}

void AMyCharacter::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Log, TEXT("MyCharacter 已出生！世界开始了。"));
}

void AMyCharacter::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    // 每帧都在这里更新角色状态
    // 比如：检查角色是否站在地面上
    if (GetCharacterMovement()->IsMovingOnGround())
    {
        // 可以在这里添加地面逻辑，比如加速、滑行等
    }
}

void AMyCharacter::MoveForward(float Value)
{
    // 类比：朝角色面对的方向推一把
    if (Value != 0.0f && Controller)
    {
        FRotator Rotation = Controller->GetControlRotation();
        FRotator YawRotation(0, Rotation.Yaw, 0);
        FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
        AddMovementInput(Direction, Value * MoveSpeed);
    }
}

void AMyCharacter::MoveRight(float Value)
{
    // 类比：朝角色的左右两侧横向移动
    if (Value != 0.0f && Controller)
    {
        FRotator Rotation = Controller->GetControlRotation();
        FRotator YawRotation(0, Rotation.Yaw, 0);
        FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);
        AddMovementInput(Direction, Value * MoveSpeed);
    }
}

void AMyCharacter::LookUp(float Value)
{
    // 类比：上下移动鼠标来控制"抬头低头"
    AddControllerPitchInput(Value);
}

void AMyCharacter::TurnAtRaw(float Value)
{
    // 类比：左右移动鼠标来控制"左转右转"
    AddControllerYawInput(Value);
}
```

**关键注解**：
- `UCLASS()` 宏告诉 UE 的反射系统："这个类要参与引擎的序列化、蓝图继承和编辑器显示"
- `UPROPERTY(EditAnywhere)` 让变量在编辑器面板中可见并可编辑——这是 UE 数据驱动设计的核心
- `CreateDefaultSubobject` 是 UE 的对象创建方式，不同于普通 `new`，它能被引擎正确序列化

### 示例 2：一个简单的互动道具（Pickup Item）

```cpp
// PickupItem.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "PickupItem.generated.h"

UCLASS()
class MYGAME_API APickupItem : public AActor
{
    GENERATED_BODY()

public:
    APickupItem();

protected:
    virtual void BeginPlay() override;

    // 碰撞检测回调：当有东西进入碰撞范围时触发
    UFUNCTION()
    void OnSphereOverlap(class UPrimitiveComponent* OverlappedComp,
                         class AActor* OtherActor,
                         class UPrimitiveComponent* OtherComp,
                         int32 OtherBodyIndex,
                         bool bFromSweep,
                         const FHitResult& SweepResult);

public:
    // 网格体：道具在场景中看起来的样子
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UStaticMeshComponent> Mesh;

    // 碰撞体：检测玩家是否碰到道具
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<USphereComponent> CollisionSphere;

    // 旋转速度（让道具悬浮旋转）
    UPROPERTY(EditAnywhere, Category = "Appearance")
    float RotationSpeed;

    // 每帧更新：让道具转起来
    virtual void Tick(float DeltaTime) override;
};
```

```cpp
// PickupItem.cpp
#include "PickupItem.h"
#include "Characters/MyCharacter.h"  // 引用我们的角色类
#include "Engine/World.h"

APickupItem::APickupItem()
{
    PrimaryActorTick.bCanEverTick = true;

    // 根组件：场景中的碰撞球体
    CollisionSphere = CreateDefaultSubobject<USphereComponent>(TEXT("CollisionSphere"));
    RootComponent = CollisionSphere;
    CollisionSphere->InitSphereRadius(40.0f);
    CollisionSphere->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    CollisionSphere->SetCollisionProfileName(TEXT("Item"));

    // 注册碰撞回调
    CollisionSphere->OnComponentBeginOverlap.AddDynamic(this, &APickupItem::OnSphereOverlap);

    // 视觉网格体（可以用任意 3D 模型）
    Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
    Mesh->SetupAttachment(RootComponent);

    RotationSpeed = 90.0f;  // 每秒旋转 90 度
}

void APickupItem::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Log, TEXT("道具 %s 已出现在世界中"), *GetName());
}

void APickupItem::OnSphereOverlap(UPrimitiveComponent* OverlappedComp,
                                   AActor* OtherActor,
                                   UPrimitiveComponent* OtherComp,
                                   int32 OtherBodyIndex,
                                   bool bFromSweep,
                                   const FHitResult& SweepResult)
{
    // 只处理玩家角色碰到的情况
    if (OtherActor && OtherActor != this)
    {
        AMyCharacter* Character = Cast<AMyCharacter>(OtherActor);
        if (Character)
        {
            UE_LOG(LogTemp, Warning, TEXT("玩家拾取了道具！"));
            // 销毁道具（从世界中移除）
            Destroy();
        }
    }
}

void APickupItem::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    // 让道具绕 Y 轴缓慢旋转
    if (GetWorld())
    {
        float Yaw = FMath::Fmod(RotationSpeed * GetWorld()->GetDeltaSeconds(), 360.0f);
        AddActorLocalYaw(Yaw);
    }
}
```

**这个示例展示了 UE 的几个重要模式**：
1. **组件化架构**：Actor 本身只是一个容器，真正的功能由 SphereComponent 和 StaticMeshComponent 提供
2. **委托回调（Delegate）**：`OnComponentBeginOverlap.AddDynamic` 是 UE 的事件系统，类似 JavaScript 的 `addEventListener`
3. **类型安全转换**：`Cast<AMyCharacter>()` 是 UE 的运行时类型检查，比 C++ 的 `dynamic_cast` 更安全

## 四、蓝图的直观理解

如果你不想写 C++，同样的逻辑可以用蓝图实现。下面是伪代码式的蓝图描述：

```
事件：BeginPlay
  └─ 每帧执行 Tick
       └─ 获取 DeltaSeconds
       └─ Yaw = Yaw + (RotationSpeed * DeltaSeconds)
       └─ 旋转 Actor

事件：OnComponentBeginOverlap (CollisionSphere)
  ├─ 检查 OtherActor 是不是 MyCharacter 类型？
  │    ├─ 是 → 打印日志 "玩家拾取了道具！"
  │    │        → 销毁自身
  │    └─ 否 → 忽略
  └─ 结束
```

蓝图的连线本质上是**数据流图**：事件是输入，节点是处理逻辑，输出连到下一个节点。

## 五、学习路径建议

| 阶段 | 内容 | 预计时间 |
|------|------|----------|
| 第 1 周 | 安装 UE5，熟悉编辑器界面，拖动几个方块到场景中 | 5-10 小时 |
| 第 2-3 周 | 学习蓝图基础：变量、事件、函数、分支、循环 | 10-15 小时 |
| 第 4-6 周 | 做一个简单的第三人称模板项目，理解角色控制 | 15-20 小时 |
| 第 7-10 周 | 学习 C++ 基础，尝试把蓝图逻辑迁移到 C++ | 20-30 小时 |
| 持续 | 跟着官方文档和 YouTube 教程深入特定方向（AI、网络、VR 等） | — |

## 六、关键资源

- **官方文档**：https://docs.unrealengine.com/
- **GitHub 仓库**：https://github.com/EpicGames/UnrealEngine
- **官方学习中心**：https://learn.unrealengine.com/
- **C++ API 参考**：https://dev.epicgames.com/documentation/zh-cn/unreal-engine/unreal-engine-cpp-reference

## 七、总结要点

1. UE 是**组件化**的：Actor 是容器，组件是功能模块
2. UE 是**数据驱动**的：`UPROPERTY` 让 C++ 变量在编辑器中可见
3. UE 支持**双轨开发**：蓝图（可视化）和 C++（高性能）可以互相继承
4. UE 的事件系统基于**委托（Delegates）**，类似发布-订阅模式
5. 零基础起步建议**从蓝图开始**，建立直觉后再学 C++
