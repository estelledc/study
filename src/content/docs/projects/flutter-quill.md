---
title: flutter-quill — Flutter 跨平台富文本编辑器
来源: 'https://github.com/singerdmx/flutter-quill'
日期: 2026-06-13
分类: 后端 API
子分类: 移动端
provenance: pipeline-v3
难度: 初级
---

## 是什么

**flutter-quill** 是 Flutter 生态里最常用的开源**富文本编辑器**（WYSIWYG：所见即所得）。日常类比：它像手机备忘录或 Notion 里那一整块「正文区 + 上方格式条」——你点 **B** 变粗体、下拉选标题、插图片，用户在 App 里排版；而你作为开发者，不必自己画几十个格式按钮、算光标偏移、维护选区状态，只要把 `QuillEditor` 和 `QuillSimpleToolbar` 拼起来，中间用同一个 `QuillController` 绑住就行。

底层数据格式叫 **Quill Delta**：文档不是存一整段 HTML，而是存一串 JSON 操作（插入文字、加粗、换行、嵌入图片等）。这和 Web 端著名的 [Quill.js](https://quilljs.com/) 同源；Flutter 版由 [singerdmx/flutter-quill](https://github.com/singerdmx/flutter-quill) 维护（GitHub 约 2.9k star），支持 **Android、iOS、Web、Windows、macOS、Linux**。

最小可用界面：

```dart
QuillSimpleToolbar(
  controller: _controller,
  config: const QuillSimpleToolbarConfig(),
),
Expanded(
  child: QuillEditor.basic(
    controller: _controller,
    config: const QuillEditorConfig(),
  ),
),
```

工具栏和编辑区像「遥控器和电视」——必须配对**同一个** `QuillController`，否则点加粗毫无反应。

## 为什么重要

做笔记 App、社区发帖、工单描述、邮件草稿、CMS 移动端，几乎都会遇到「用户要排版，不能只给 `<TextField>`」。自己从零实现会踩这些坑：

- **选区与格式**：光标在中间时加粗，只应作用选中文本；跨段落、跨 embed 时光标逻辑极繁。
- **跨平台输入法**：软键盘、物理键盘、Web 粘贴、桌面剪贴板行为不一致。
- **持久化格式**：存纯文本丢格式；存 HTML 再转回来结构对不齐；**Delta JSON 是官方推荐路径**。

flutter-quill 把这些打包成可定制组件，并有 `flutter_quill_extensions`（图片/视频 embed）、`flutter_quill_test`（测试辅助）等周边包。若团队 Web 端已在用 Quill/ReactQuill，Flutter 端格式互通成本最低。

## 核心要点

把 flutter-quill 想成四层：

1. **QuillController**：文档的「大脑」。持有 `Document`，响应编辑、暴露 `readOnly`、支持 `undo`/`redo`，必须在 `dispose()` 里释放。类比 Word 里那份文档的内存句柄。
2. **Document + Delta**：内容的真相来源。`document.toDelta()` 导出变更序列；`Document.fromJson(...)` 从 JSON 还原。推荐**数据库里存 Delta JSON**，而不是 HTML（往返转换会丢结构，官方 README 明确不推荐以 HTML 为主存储）。
3. **QuillSimpleToolbar / QuillEditor**：UI 层。Toolbar 配置哪些按钮出现（字号、颜色、列表、链接等）；Editor 负责渲染与输入。桌面端常配 `FocusNode` + `ScrollController`，点工具栏后把焦点拉回编辑区。
4. **Embed Blocks**：图片、视频、自定义卡片等非纯文本块。核心包只定义接口；图片/视频实现放在 `flutter_quill_extensions`。

Delta 长什么样（概念上）：

```json
[
  {"insert": "Hello "},
  {"insert": "World", "attributes": {"bold": true}},
  {"insert": "\n", "attributes": {"header": 1}}
]
```

每条 `insert` 是一段文字或 embed；`attributes` 是粗体、斜体、标题级别等。整篇文档就是 ops 数组——紧凑、可 diff、适合协作类场景扩展。

### 关键 API 速查

| API | 作用 |
|-----|------|
| `QuillController.basic()` | 创建空文档 |
| `document.toDelta().toJson()` | 导出 Delta JSON |
| `Document.fromJson(list)` | 从 JSON 恢复 |
| `document.toPlainText()` | 纯文本（搜索引用，勿当唯一存储） |
| `controller.readOnly = true` | 只读预览 |
| `controller.formatText(i, len, attr)` | 代码里改格式 |

## 安装与 App 壳配置

```yaml
# pubspec.yaml
dependencies:
  flutter_quill: ^11.0.0   # 以 pub.dev 当前稳定版为准
  flutter_localizations:
    sdk: flutter
```

```bash
flutter pub add flutter_quill
```

工具栏文案要跟随系统语言，需在 `MaterialApp` 注册本地化 delegate：

```dart
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

MaterialApp(
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    FlutterQuillLocalizations.delegate,
  ],
  // ...
);
```

依赖链还包括 `url_launcher`（打开链接）、`quill_native_bridge`（平台剪贴板/原生桥）、`flutter_keyboard_visibility_temp_fork`（键盘显隐）。Android 若要把编辑器内图片复制到系统剪贴板供其他 App 使用，需按 README 配置 `FileProvider`（可选）。

## 实践案例

### 案例 1：StatefulWidget 里搭完整编辑页（含存盘）

```dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';

class NoteEditorPage extends StatefulWidget {
  const NoteEditorPage({super.key});

  @override
  State<NoteEditorPage> createState() => _NoteEditorPageState();
}

class _NoteEditorPageState extends State<NoteEditorPage> {
  late final QuillController _controller;
  final FocusNode _focusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _controller = QuillController.basic();
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  String exportJson() =>
      jsonEncode(_controller.document.toDelta().toJson());

  void importJson(String json) {
    _controller.document =
        Document.fromJson(jsonDecode(json) as List<dynamic>);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('写笔记'),
        actions: [
          IconButton(
            icon: const Icon(Icons.save),
            onPressed: () {
              final saved = exportJson();
              // 写入 SQLite / SharedPreferences / 后端 API
              debugPrint(saved);
            },
          ),
        ],
      ),
      body: Column(
        children: [
          QuillSimpleToolbar(
            controller: _controller,
            config: const QuillSimpleToolbarConfig(),
          ),
          const Divider(height: 1),
          Expanded(
            child: QuillEditor(
              focusNode: _focusNode,
              scrollController: _scrollController,
              controller: _controller,
              config: const QuillEditorConfig(
                placeholder: '开始写点什么…',
                padding: EdgeInsets.all(16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

**要点**：

- `QuillController.basic()` 创建空文档；有草稿时用 `Document.fromJson` 恢复。
- 保存时用 `jsonEncode(document.toDelta().toJson())`，不要只用 `toPlainText()`（会丢粗体、标题等）。
- `readOnly` 可在预览模式设 `_controller.readOnly = true`，同一套 Widget 复用。
- 桌面端点工具栏后可在 `afterButtonPressed` 里 `focusNode.requestFocus()`，避免焦点留在按钮上。

### 案例 2：定制工具栏 + 只读预览

发帖页往往不需要全部按钮，只要粗体、列表、链接：

```dart
QuillSimpleToolbar(
  controller: _controller,
  config: QuillSimpleToolbarConfig(
    showAlignmentButtons: false,
    showBackgroundColorButton: false,
    showColorButton: false,
    showFontFamily: false,
    showFontSize: false,
    showStrikeThrough: false,
    showUnderLineButton: false,
    customButtons: [
      QuillToolbarCustomButtonOptions(
        icon: const Icon(Icons.preview),
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => PreviewPage(deltaJson: exportJson()),
            ),
          );
        },
      ),
    ],
  ),
),
```

预览页再建一个 controller，加载 JSON 并只读：

```dart
class PreviewPage extends StatefulWidget {
  const PreviewPage({super.key, required this.deltaJson});
  final String deltaJson;

  @override
  State<PreviewPage> createState() => _PreviewPageState();
}

class _PreviewPageState extends State<PreviewPage> {
  late final QuillController _preview;

  @override
  void initState() {
    super.initState();
    _preview = QuillController(
      document: Document.fromJson(
        jsonDecode(widget.deltaJson) as List<dynamic>,
      ),
      selection: const TextSelection.collapsed(offset: 0),
    );
    _preview.readOnly = true;
  }

  @override
  void dispose() {
    _preview.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('预览')),
      body: QuillEditor.basic(
        controller: _preview,
        config: const QuillEditorConfig(),
      ),
    );
  }
}
```

同一套 `QuillEditor`，编辑/预览只差 `readOnly` 和数据是否从 JSON 灌入。

### 案例 3：代码里插入内容 + 图片 embed

保存前自动加签名，或从模板灌入段落：

```dart
void appendSignature(QuillController controller) {
  final offset = controller.document.length - 1;
  controller.document.insert(offset, '\n—— 发自 MyApp\n');
  controller.updateSelection(
    TextSelection.collapsed(offset: controller.document.length - 1),
    ChangeSource.local,
  );
}

// 对选区加粗（无选区则对当前行无效，需先检查 selection）
void boldSelection(QuillController controller) {
  final sel = controller.selection;
  if (!sel.isValid || sel.isCollapsed) return;
  controller.formatText(
    sel.start,
    sel.end - sel.start,
    Attribute.bold,
  );
}
```

图片/视频需要 `flutter_quill_extensions`：

```yaml
dependencies:
  flutter_quill_extensions: ^11.0.0
```

```dart
import 'package:flutter_quill_extensions/flutter_quill_extensions.dart';

QuillSimpleToolbar(
  controller: _controller,
  config: QuillSimpleToolbarConfig(
    embedButtons: FlutterQuillEmbeds.toolbarButtons(),
  ),
),
Expanded(
  child: QuillEditor(
    controller: _controller,
    focusNode: _focusNode,
    scrollController: _scrollController,
    config: QuillEditorConfig(
      embedBuilders: kIsWeb
          ? FlutterQuillEmbeds.editorWebBuilders()
          : FlutterQuillEmbeds.editorBuilders(),
    ),
  ),
),
```

Web 还需配置 `webImagePickImpl`；Desktop 需 `filePickImpl`，否则图片按钮可能无反应。粘贴图片时可在 `QuillControllerConfig.clipboardConfig.onImagePaste` 里把字节存盘并返回 URL 字符串写入 Delta。

## 输入输出与格式转换

| 需求 | 推荐做法 |
|------|----------|
| 存数据库 | Delta JSON（`toDelta().toJson()`） |
| 搜纯文本 | `document.toPlainText()` 建索引，展示仍用 Delta |
| 分享 HTML | 用 `vsc_quill_delta_to_html` 等**导出时**再转，勿当主存储 |
| 导入 Markdown | `markdown_quill` 双向转换 |
| 导出 PDF | `flutter_quill_to_pdf` |
| HTML → Delta 迁移 | `flutter_quill_delta_from_html` 一次性转换后改存 Delta |

官方强调：**Delta → HTML → Delta 往返会丢信息**。迁移旧系统 HTML 可以一次性转成 Delta 入库，之后生命周期内都以 Delta 为准。

## 平台差异（零基础常踩）

- **Web**：图片 embed 需 `editorWebBuilders()` 和 `webImagePickImpl`；富文本粘贴目前 Web 支持有限（见 issue #1998、#2220）。
- **Desktop**：工具栏插图片需实现 `filePickImpl`，否则图片按钮不可用。
- **键盘**：依赖键盘可见性插件；真机调试比模拟器更能暴露软键盘顶起、滚动问题。
- **版本迁移**：大版本（如 10→11）有 [migration guide](https://github.com/singerdmx/flutter-quill/blob/master/doc/migration/10_to_11.md)，升级前先看 breaking changes。当前稳定线约 **v11.5.x**。

## 与同类方案怎么选

| 方案 | 特点 |
|------|------|
| **flutter-quill** | Delta 模型、模块化、社区最大、Quill.js 同源 |
| **fleather** | 基于 Parchment/Delta，偏轻量 |
| **super_editor** | 可定制性极强，适合自建文档产品，学习曲线更陡 |

若只要简单 Markdown 预览，可能 `flutter_markdown` + 纯文本编辑就够，不必上完整 WYSIWYG。

## 常见坑

1. **忘记 dispose controller** → 内存泄漏、热重载后行为异常。
2. **Toolbar 和 Editor 用了两个 controller** → 点工具栏无效。
3. **只存 plain text** → 用户排的版全丢。
4. **把 HTML 当主存储再 parse 回来** → 列表、embed、嵌套格式对不齐。
5. **没加 `FlutterQuillLocalizations.delegate`** → 工具栏 tooltip/文案异常。
6. **Web/Desktop 图片** → 忘了 platform hook，表现为按钮无反应或 embed 空白。

## 测试与扩展

- 自动化测试可看 [flutter_quill_test](https://pub.dev/packages/flutter_quill_test)，目前能力有限，复杂交互仍建议 widget 测试 + 真机手测。
- 自定义块（投票卡片、@用户、时间戳）：实现 [Custom Embed Blocks](https://github.com/singerdmx/flutter-quill/blob/master/doc/custom_embed_blocks.md) 里的 builder；官方 example 里有 `TimeStampEmbed` 可参考。
- 读源码前可看 [Code Introduction](https://github.com/singerdmx/flutter-quill/blob/master/doc/code_introduction.md) 和 YouTube Playlist。

## 小结

flutter-quill 把「富文本编辑」拆成 **Controller（状态）+ Delta（数据）+ Toolbar/Editor（UI）**。零基础路径：

1. `flutter pub add flutter_quill`，注册 `FlutterQuillLocalizations.delegate`。
2. `QuillController.basic()` + 默认工具栏 + `QuillEditor`，跑通输入。
3. 学会 **JSON 存盘/读盘**（`toDelta().toJson()` / `Document.fromJson`）。
4. 按需裁剪工具栏、只读预览、embed 与平台配置。

记住一句：**数据库里存 Delta JSON，HTML 只当导出格式**——这条能避开大部分生产事故。

## 延伸阅读

- 官方 README 与 [Sample Page 源码](https://github.com/singerdmx/flutter-quill/blob/master/example/lib/main.dart)
- [Quill Delta 格式说明](https://quilljs.com/docs/delta/)
- pub.dev：[flutter_quill](https://pub.dev/packages/flutter_quill) · [flutter_quill_extensions](https://pub.dev/packages/flutter_quill_extensions)
