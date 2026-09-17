# 阅读VS Code插件

📕 [GitHub仓库](https://github.com/xiyi20/legado-vscode.git)

---
## 修改
基于[sunrishe/legado-vscode](https://github.com/sunrishe/legado-vscode.git)修改，新增状态栏摸鱼阅读、双向进度同步等功能。

## 功能

> 配合[阅读APP](https://github.com/LegadoTeam/legado.git)用来学习的阅读插件，并在阅读APP的WEB服务基础上，书架页面增加了暗黑模式，章节阅读页面增加 <kbd>W</kbd> <kbd>S</kbd> <kbd>A</kbd> <kbd>D</kbd> 进行翻页控制。
>
> 😎悄悄地告诉你，阅读界面打开`无限加载`食用更佳哦~

### 状态栏摸鱼阅读

在 VS Code 状态栏右下角直接阅读当前小说正文，无需打开面板，隐蔽性强：

- **状态栏正文显示**：小说正文按标点自动断句，逐行显示在状态栏，点击或按快捷键翻行
- **悬停操作面板**：鼠标悬停状态栏显示章节名、行进度（可点击跳转）、上一行/下一行按钮
- **行数跳转**：点击 tooltip 中的进度按钮（如 `3/120`），弹出输入框输入行数直接跳转
- **自动衔接**：章节首行继续上翻自动加载上一章末行，章节末行继续下翻自动加载下一章首行
- **双向进度同步**：状态栏翻行/翻章时面板自动跟随滚动；面板滚动时状态栏自动更新到对应行

#### 状态栏快捷键

| 快捷键 | 功能 |
|--------|------|
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>J</kbd> | 上一行 |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> | 下一行 |
| 鼠标点击状态栏 | 下一行 |

#### 状态栏配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `legado-vscode.statusBarReading` | `true` | 是否启用状态栏摸鱼阅读 |
| `legado-vscode.statusBarLineLength` | `30` | 状态栏每行显示的最大字符数（10-100），按标点自动断句 |

### 书架页面

点击基本设定下的状态栏，可以设置阅读APP的WEB服务访问地址。

### 快捷键

#### 书架页面

<kbd>R</kbd> 刷新页面

<kbd>X</kbd> 关闭页面

#### 阅读页面

<kbd>Q</kbd> 返回书架

<kbd>E</kbd> 打开/关闭章节列表

<kbd>R</kbd> 刷新页面

<kbd>X</kbd> 关闭页面

<kbd>W</kbd>或<kbd>↑</kbd>或<kbd>PgUp</kbd> 向上翻页

<kbd>S</kbd>或<kbd>↓</kbd>或<kbd>PgDn</kbd>或<kbd>空格</kbd> 向下翻页

<kbd>A</kbd>或<kbd>←</kbd> 上一章

<kbd>D</kbd>或<kbd>→</kbd> 下一章

## 使用帮助

1. 在阅读APP中打开`我的 > Web服务`启用Web服务
2. 电脑和手机处于同一局域网内
3. 在VS Code中搜索插件并安装
4. VS Code搜索命令`阅读APP Legado: 打开阅读APP书架`并执行
5. 点击`基本设定下的状态栏`，在弹框中输入阅读APP的WEB服务访问地址
6. 测试成功后自动配置，同步修改VS Code设置`legado-vscode.webServeUrl`阅读APP的WEB服务访问地址的配置信息
7. 页面自动刷新，配置生效

### 状态栏摸鱼阅读使用

1. 确保已配置阅读APP的WEB服务地址
2. 打开阅读APP书架，进入任意书籍的阅读页面
3. 状态栏右下角自动显示当前正文，进度随面板同步
4. 使用快捷键 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>J</kbd> / <kbd>K</kbd> 翻行，或鼠标点击状态栏
5. 悬停状态栏可查看章节名、进度和操作按钮
6. 点击进度按钮输入行数可快速跳转

### 启用暗黑模式

1. 打开阅读书架
2. 选择一本书籍进入阅读
3. 阅读页面单击，选择顶部的`设置`
4. 在`阅读主题`中选择暗黑主题
5. 书架和阅读页面同步切换至暗黑主题

### 快速关闭窗口

使用VS Code的`关闭编辑器`命令即可，对应的快捷键一般为<kbd>Ctrl</kbd> + <kbd>W</kbd>。

### 快速打开阅读书架

喜欢使用快捷键高效学习的童鞋，可以自行配置快捷键，一键直达，纵享丝滑。

## 命令列表

| 命令 | 说明 |
|------|------|
| `阅读APP Legado: 打开阅读APP书架` | 打开书架面板 |
| `阅读APP Legado: 关闭阅读APP书架` | 关闭书架面板 |
| `阅读APP Legado: 状态栏摸鱼：上一行` | 状态栏阅读上一行（首行自动接上一章末行） |
| `阅读APP Legado: 状态栏摸鱼：下一行` | 状态栏阅读下一行（末行自动接下一章首行） |
| `阅读APP Legado: 状态栏摸鱼：跳转到行` | 输入行数跳转到指定行 |

## 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `legado-vscode.panelTitle` | `阅读` | 面板Tab页标题 |
| `legado-vscode.webServeUrl` | `http://127.0.0.1:1122` | 阅读APP的WEB服务访问地址 |
| `legado-vscode.statusBarReading` | `true` | 是否启用状态栏摸鱼阅读 |
| `legado-vscode.statusBarLineLength` | `30` | 状态栏每行最大字符数（10-100） |
