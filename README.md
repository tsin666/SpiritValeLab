# SpiritVale Lab

SpiritVale 的双语资料库、职业/装备浏览、词条与套装搜索，以及玩家 BD 构筑与分享站。

## 已实现

- Nuxt 4 + Vue 3 SSR 前端，中英路由（中文默认，英文 `/en/...`）
- Node.js + Fastify API
- 647 件装备、24 套装、9 个副词条池、31 职业
- 从本机 `Formula.GetRequiredClass` 原生跳转表还原 21 条职业进阶边，并区分当前有/无 `ArchetypeConfig` 的职业
- 14 类共 2,209 条运行时记录：279 主动技能、111 被动、45 神器、129 宝石、327 卡牌、13 怪物模板、330 怪物、185 状态、23 武器配置及其关联数据
- 1,179 张从本机 SpiritVale 运行时资源解码的站内 PNG 图标
- 装备名称/描述/属性/词条全文搜索，以及职业、位置、类型、元素、等级、套装筛选
- 技能、神器、宝石、卡牌、怪物、状态、武器与关联配置的结构化属性、搜索和详情
- 玩家 BD 构筑器，MongoDB 持久化、Redis 列表缓存和唯一分享链接；不使用演示 BD 填充大厅
- 匿名唯一浏览、点赞切换及公开公式 `点赞 × 5 + 独立浏览` 的 BD 排名
- PM2 直接运行 Web、API 与 WSL Redis 守护

## 技术栈

- Web：Nuxt 4、Vue 3、`@nuxtjs/i18n`
- API：Fastify、Zod
- 数据：本机 Unity IL2CPP 运行时配置 + 本地化表
- 持久化：MongoDB
- 缓存：Redis
- 进程管理：PM2

## 安装与构建

```powershell
npm.cmd install
npm.cmd run build
```

## 使用 PM2 直接运行

默认连接：

- Windows MongoDB：`mongodb://127.0.0.1:27017/spiritvale_lab`
- Ubuntu/WSL Redis：`redis://127.0.0.1:6379`

PM2 会运行 `scripts/ensure-redis.mjs`，负责唤醒并监测 WSL 中的 Redis。MongoDB 应作为 Windows 服务运行。

```powershell
npm.cmd run pm2:start
npm.cmd run pm2:status
```

启动后访问：

- 中文站：http://127.0.0.1:3000
- 英文站：http://127.0.0.1:3000/en
- API 健康检查：http://127.0.0.1:4100/api/health

常用管理命令：

```powershell
npm.cmd run pm2:reload
npm.cmd run pm2:logs
npm.cmd run pm2:stop
```

覆盖连接配置：

```powershell
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/spiritvale_lab'
$env:REDIS_URL = 'redis://127.0.0.1:6379'
npm.cmd run pm2:reload
```

## 验证

```powershell
npm.cmd run verify:api
npm.cmd run verify:data
npm.cmd run build
npm.cmd run verify:runtime
```

`verify:runtime` 要求 PM2 服务已启动，会验证 MongoDB、Redis、中英 SSR 路由、装备词条搜索、套装和职业关联。

## 数据来源与边界

- [RUNTIME_CATALOG.md](packages/game-data/RUNTIME_CATALOG.md)：当前权威的运行时 schema、来源哈希、覆盖率和可复现提取说明
- [game-data-audit.md](docs/game-data-audit.md)：站点使用口径与完整性审计
- [character-import.md](docs/character-import.md)：角色导入调查、安全边界与官方导出接入契约
- [extract-runtime-catalog.py](packages/game-data/scripts/extract-runtime-catalog.py)：可重复执行的本机提取脚本

SpiritVale Lab 不臆造游戏字段。基础 `EquipConfig` 没有单件 rarity 字段，因此装备库不添加“暗金”等外部游戏概念；`unique` 仅按游戏自身布尔字段展示。无法从 IL2CPP 声明证明语义的原始整数/数组保留为原值并明确标注，不猜测命名。
