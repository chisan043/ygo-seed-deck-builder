# Yu-Gi-Oh! Seed Deck Builder

本地运行的游戏王多规则环境卡组构筑原型，支持大师决斗、OCG、TCG 切换、热门构筑趋势、天梯榜、禁限表、卡组导出和本地缓存数据。

## 启动方式

### macOS

双击 `start-local-server.command` 使用本地缓存数据，启动快、离线也能用。

双击 `start-live-server.command` 使用实时刷新服务，页面会以 `?api=1` 打开，并通过本地 API 刷新趋势、天梯、构筑搜索和禁限表数据。

### Windows

双击 `start-local-server.bat` 使用本地缓存数据，需要已安装 Python 3。

双击 `start-live-server.bat` 使用实时刷新服务，需要已安装 Node.js。

## 桌面程序打包

项目已加入 Electron 壳。安装 Node.js 后执行：

```bash
npm install
```

开发运行：

```bash
npm start
```

默认优先打开实时刷新模式；如果检查到网络不可用或本地刷新服务启动失败，会自动切到离线缓存模式。

桌面客户端会通过本地刷新服务缓存卡牌资源：首次启动实时模式会先显示资源下载进度，优先下载热门构筑相关小卡图，这一层准备完成后才进入应用；剩余小图和详情大图会继续在后台下载，大图未命中时先用小卡图替代，后续打开会直接读取本地资源。

需要强制离线缓存模式：

```bash
npm run start:offline
```

打包：

```bash
npm run build:win
npm run build:mac
```

`npm run build:win` 会生成 Windows x64 免安装目录。需要 Windows 安装包时，在 Windows 机器上运行：

```bash
npm run build:win:installer
```

构建产物会输出到 `release/`。桌面版菜单里可以在“自动选择模式”“离线缓存模式”和“实时刷新模式”之间切换。

## 版本规则

修复 bug、样式微调和小范围优化时提升 patch 版本，例如 `0.1.0` 到 `0.1.1`。

添加新功能时提升 minor 版本，例如 `0.1.0` 到 `0.2.0`。

## 主要文件

- `index.html`：页面结构
- `styles.css`：界面样式
- `app.js`：前端逻辑
- `data/`：本地缓存数据
- `electron/`：桌面程序入口
- `tools/`：数据同步和实时刷新服务脚本
