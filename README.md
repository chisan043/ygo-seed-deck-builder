# Yu-Gi-Oh! Seed Deck Builder

本地运行的游戏王多规则环境卡组构筑原型，支持大师决斗、OCG、TCG 切换、热门构筑趋势、天梯榜、禁限表、卡组导出和本地缓存数据。

## 启动方式

### macOS

双击 `start-local-server.command` 使用本地缓存数据，启动快、离线也能用。

双击 `start-live-server.command` 使用实时刷新服务，页面会以 `?api=1` 打开，并通过本地 API 刷新趋势、天梯、构筑搜索和禁限表数据。

### Windows

双击 `start-local-server.bat` 使用本地缓存数据，需要已安装 Python 3。

双击 `start-live-server.bat` 使用实时刷新服务，需要已安装 Node.js。

## 主要文件

- `index.html`：页面结构
- `styles.css`：界面样式
- `app.js`：前端逻辑
- `data/`：本地缓存数据
- `tools/`：数据同步和实时刷新服务脚本
