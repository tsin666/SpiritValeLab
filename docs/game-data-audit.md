# SpiritVale 本机游戏数据与美术审计

审计日期：2026-07-21（Asia/Shanghai）

## 结论

SpiritVale Lab 当前以本机 Unity IL2CPP 运行时配置为结构化属性的权威来源，并以 Unity 本地化表补齐中英文名称和说明。运行时目录完整公开 14 类共 2,209 条记录，其中九类核心实体共 2,084 条；1,179 个唯一 Sprite 引用全部成功解码为站内 PNG。所有已建模的套装成员、技能前置/状态、怪物技能和掉落引用均无悬空项。

`catalog.json` 的 7,218 表示源本地化表条目数，不等于归一化实体数；旧精选美术清单的 34 张 PNG 也不等于完整运行时图标数。站点和 API 应使用下表的运行时口径。

## 运行时目录

- 数据：`packages/game-data/src/runtime-catalog.json`
- 精确枚举：`packages/game-data/src/runtime-enums.json`
- 提取脚本：`packages/game-data/scripts/extract-runtime-catalog.py`
- 字段与来源证据：`packages/game-data/RUNTIME_CATALOG.md`
- 图标：`apps/web/public/game-assets/runtime-icons/`

| 类型 | 运行时数量 | 主要可验证字段 |
| --- | ---: | --- |
| 装备 | 647 | 主/次属性、词条池、套装、类型、元素、职业限制、等级、图标 |
| 套装 | 24 | 75 个成员引用、69 条完整套装属性 |
| 副词条池 | 9 | 34 组、78 条候选属性 |
| 职业 | 31 | 等级上限、预览技能、起始/展示物品、倍率、图标 |
| 职业预览技能关系 | 56 | 职业到主动/被动技能的预览关系与配置类型 |
| 主动技能 | 279 | 成长值、前置、武器/姿态、施法/伤害/目标、状态、事件、图标 |
| 被动技能 | 111 | 前置、武器/姿态、266 条被动属性、图标 |
| 神器 | 45 | 完整/逐件/精炼/独立属性、180 个部件与图标 |
| 宝石 | 129 | 146 条属性、词缀、Boss 标记、掉率、图标 |
| 卡牌 | 327 | 344 条属性、装备类别、词缀、唯一/Boss 标记、图标 |
| 怪物模板 | 13 | 六维属性倍率、防御、生成倍率、速度、远程/击退标记 |
| 怪物 | 330 | 模板、种族/元素/体型/等级、技能、掉落、神器槽、图标 |
| 状态 | 185 | 分类、伤害、层数、冷却、被动属性、嵌套状态、事件、图标 |
| 武器配置 | 23 | 攻击间隔、投射物、职业限制、属性成长与动作时间 |

九类核心实体计数为装备、职业、主动、被动、神器、宝石、卡牌、怪物和状态之和：2,084。加上 24 套装、9 副词条池、56 职业预览关系、13 怪物模板和 23 武器配置后，14 类运行时集合合计 2,209 条。API 健康接口分别报告集合数、完整记录数和各类数量。

## 引用与美术完整性

- 1,179 / 1,179 唯一 Sprite 引用成功解码并导出；其中 5 个是与职业同 ID 的 `NpcConfig.Sprite` 严格备用图标。
- 647 / 647 件装备的图标引用可解析。
- 24 / 24 套装、75 / 75 成员引用可解析。
- 131 条技能前置、293 条技能到状态引用均无悬空项。
- 736 条怪物到技能引用均可解析。
- 怪物装备/神器/卡牌/宝石掉落引用分别为 1,385 / 245 / 270 / 273，全部解析。
- 所有 API 使用的图标都是 `/game-assets/runtime-icons/...` 站内路径，不依赖提取机器的绝对路径或远程素材。
- 31 个 `ArchetypeConfig` 中有 24 个直接职业图标。Artificer、Blacksmith、Craftsman、Gemsmith、Stylist 的备用图标来自同 ID `NpcConfig`，且单独保留来源；Cardweaver 与 Merchant 没有严格同 ID 来源，继续使用文字占位，不借用语义相近图标。

## 语义边界

1. `EquipConfig` 没有 `ItemRarity` 字段。`ItemRarity` enum 仅作为运行时证据保留，不能据此给单件装备臆造稀有度；`unique` 保持游戏原始布尔语义。
2. `EquipConfig.Slots` 只有 `int` 声明，不能与独立 `EquipSlot` enum 混同。API 将原值保留为 `runtimeSlots`；便于筛选的穿戴位置由精确 `EquipType` 映射，并以 `fieldSources.slot = "type-derived"` 标注。
3. `ArchetypeConfig.Attributes` 只有 `Int32[6]` 声明，未找到可证明索引语义的 enum。目录保留六个原始值，不猜测属性名。
4. 计算属性（例如部分 `IsObtainable` / `HasArtifact`）在序列化源没有值时不写入推断结果。
5. 空 `allowedArchetypes` 是运行时明确的无职业限制，不应显示成“数据缺失”。
6. 装备只通过 `substatPoolId` 关联随机词条池。池内条目在 API/UI 中称为“可出现词条”，不能宣称为该件装备已经固定拥有的词条。
7. `ArchetypeConfig.PreviewSkills` 仅是职业预览技能，不是完整职业技能归属表；构筑样本中引用的技能必须单独展示。

## 本地化层

`packages/game-data/src/catalog.json` 来自本机 Unity 本地化表，源条目数为 7,218。它为运行时记录提供 `name.zh/en`、`description.zh/en` 等文字；当运行时和本地化 ID 集合不完全一致时，目录在 meta 中记录逐类差异，不静默伪造记录。

玩家创建的 BD 标题、简介、步骤和标签保持投稿原文。站点不再内置或展示演示 BD；首页和 BD 大厅只显示 MongoDB 中真实发布的玩家构筑。界面、路由、SEO 和游戏本地化字段均支持中文与英文。

## 职业进阶关系

`ArchetypeConfig` 本身没有基础/进阶字段。职业进阶来自当前安装版本 `GameAssembly.dll` 的原生 `Formula.GetRequiredClass` 跳转表（RVA `0x947430`，跳转表 RVA `0x94747C`），并记录在 `packages/game-data/src/archetype-lineage.json`。

转职所需职业等级 50 则来自独立的 `Formula.RequiredAdvanceJobLevel` 静态初始化；数据模型分别记录两条来源，避免把等级常量误归到进阶跳转表。

- 原生表包含 21 条基础职业 → 进阶职业边。
- 当前 31 条 `ArchetypeConfig` 中可落到具体详情的进阶职业有 16 个。
- `Nightshade`、`Spellblade`、`BladeMaster`、`Mechanist`、`Alchemist` 存在于原生职业枚举/跳转表，但当前版本没有对应 `ArchetypeConfig`；页面必须标记为“当前配置未收录”，不能补造技能、图标或描述。
- `Weaver` 以及值 100–106 的生活/服务职业不在 `GetRequiredClass` 基础职业映射中，不推断不存在的前置职业。

## 玩家角色导入边界

本机没有公开的角色存档或官方构筑导出格式。角色详情由登录后的游戏服务器通过 FishNet RPC 下发，因此网站不会抓包、读取游戏进程内存、调用内部管理接口或读取 Steam 登录票据。完整调查和安全导入契约见 `docs/character-import.md`。

## 验收口径

重新提取或更新游戏后必须通过：

1. JSON 解析、每类数量和 ID/slug 唯一性断言；
2. Sprite 引用与导出文件双向存在性检查；
3. 套装、技能、状态、怪物技能和掉落的交叉引用检查；
4. API 类型检查、注入测试和生产构建；
5. PM2 下 MongoDB/Redis 健康检查与中英 SSR smoke；
6. 浏览器完成装备词条搜索、套装筛选、资料详情和用户 BD 发布/持久化全流程。
