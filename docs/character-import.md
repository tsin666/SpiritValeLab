# SpiritVale 角色导入调查与安全契约

## 当前结论

当前安装版本无法从本机存档直接、安全、完整地导入角色为 BD。

- `AppData/LocalLow/Baikun/SpiritVale` 只有日志、角色肖像缓存和 Unity Analytics，没有职业、技能或装备存档。
- 角色肖像 PNG 没有嵌入 JSON 或文本元数据。
- PlayerPrefs 只有画质、按键、聊天、技能栏等客户端设置，没有角色构筑。
- 未发现 Steam App ID `3767850` 的本地 Cloud 存档。
- 游戏 UI 和静态代码没有 Export、Import 或 Build Code 功能。
- 登录后，`CharacterListCallback_T` / `LoadCharacter_T` 通过 FishNet RPC 下发完整 `CharacterData`。这不是面向网站的公开接口。

因此本项目不会通过抓包、进程内存读取、游戏注入、内部 ServerRpc、管理 API、游戏 MongoDB/Redis 或 Steam 票据来取得角色数据。

## 可映射的官方角色结构

静态结构中已确认的构筑字段包括：

- 职业与等级：`Archetypes`、`Level`、`JobLevel`、`Attributes`
- 技能：`SkillSystemData.Skills`、`Assigned`，条目含技能 ID 与等级
- 装备：`Equips`、`ActiveLoadout`、`LoadoutNormal`、`LoadoutSecondary`、`LoadoutHeavy`
- 装备实例：目录 ID、精炼、实际词条、卡片、潜能等
- 神器与宝石：槽位、目录 ID、精炼、词条、嵌入宝石
- 魔典：`Grimoires`

当前 BD 模型只保存最多 8 个技能和 12 件装备，尚不足以无损接收上述完整角色快照。

## 推荐导入流程

等待游戏提供官方的一次性构筑码或脱敏 JSON 后，网站应按以下流程接入：

1. 仅由用户主动选择文件或粘贴构筑码，不后台扫描游戏目录。
2. 在浏览器本地执行严格 schema 校验和目录 ID 对照。
3. 展示职业、等级、技能、三套武器、装备词条、卡片、神器和宝石预览。
4. 用户确认后只上传规范化的 BD 字段，并立即丢弃原始内容。
5. 强制移除账号 ID、角色/物品实例 UID、公会/玩家 ID、设备 ID、票据、会话、IP、货币、库存和行为历史。
6. 记录游戏 Build ID / 目录版本；无法识别的新版本 ID 标为待解析，不静默丢弃。

在官方导出出现前，可考虑“截图/OCR → 用户逐项确认”的辅助录入，但识别结果不能未经确认直接发布。
