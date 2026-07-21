# SpiritVale runtime catalog

`src/runtime-catalog.json` is a source-backed catalog extracted from the locally
installed SpiritVale Unity/IL2CPP build. It complements `src/catalog.json`, which
contains localization records but not the serialized gameplay values.

## Sources and method

The extractor reads these game files:

- `SpiritVale_Data/sharedassets0.assets`: serialized runtime configuration and sprites;
- `SpiritVale_Data/globalgamemanagers.assets`: MonoScript identities;
- `GameAssembly.dll` and `SpiritVale_Data/il2cpp_data/Metadata/global-metadata.dat`:
  stripped MonoBehaviour type-tree reconstruction;
- Addressables settings and catalog hash: build evidence.

UnityPy reads the Unity containers. TypeTreeGeneratorAPI reconstructs the stripped
MonoBehaviour layouts directly from the IL2CPP files. Enum names and numeric values
in `src/runtime-enums.json` were recovered from the same build as Cpp2IL
`diffable-cs` declarations. The catalog records the size, modification time, and
SHA-256 of every critical input, so an extraction can be compared with a later game
update without depending on a machine-specific absolute path.

## Verified coverage

| Runtime record | Parsed | Additional validation |
| --- | ---: | --- |
| `EquipConfig` | 647 / 647 | 647 unique IDs; 647 / 647 icon references decoded |
| `EquipSetConfig` | 24 / 24 | 75 / 75 member references resolved; 69 full-set stat entries |
| `EquipSubstatConfig` | 9 / 9 | 34 groups; 78 candidate stat entries |
| `ArchetypeConfig` | 31 / 31 | 24 / 24 configured icons decoded; 5 / 5 same-ID `NpcConfig` fallback icons decoded; Cardweaver and Merchant remain text fallbacks |
| Archetype preview relations | 56 | Every skill resolves to active or passive runtime config |
| `SkillConfig` | 279 / 279 | 241 configured icons decoded; 131 requirements and 293 status references resolved |
| `SkillPassiveConfig` | 111 / 111 | 42 configured icons decoded; 266 passive stat entries |
| `ArtifactSetConfig` | 45 / 45 | 180 / 180 part icons decoded; 258 stat entries across four source groups |
| `GemConfig` | 129 / 129 | 129 / 129 icon references decoded; 146 stat entries |
| `CardConfig` | 327 / 327 | 327 / 327 icon references decoded; 344 stat entries |
| `MonsterArchetypeConfig` | 13 / 13 | All 330 monster archetype pointers resolved |
| `MonsterConfig` | 330 / 330 | 736 skill and 2,173 typed loot references resolved |
| `StatusConfig` | 185 / 185 | 164 configured icons decoded; 311 passive stat entries |
| `WeaponConfig` | 23 / 23 | All records parsed |

Equipment values include 1,084 primary-stat entries and 1,398 secondary-stat
entries. Seventy-five items name a set, 172 name a substat pool, and 71 contain a
non-empty `Archetypes` restriction list.

The runtime/localization ID comparison is intentionally preserved per collection in
`meta.coverage.localizationComparison`. Important differences include:

- equipment exact overlap 642; runtime-only `Bot Hunter Utility`, `Drooping Angel`, `Drooping Dragon`,
  `Drooping Skeleton`, `Drooping Wraith`;
- equipment localization-only `Arrowpierced Shield`, `Round Shield`;
- skills and artifacts match exactly;
- runtime passives add `BotHunter` and `DoubleAttack`;
- runtime cards contain 327 IDs while localization contains 264;
- runtime status adds `LauncherPoison`;
- gems contain 122 exact overlaps plus separately reported runtime-only and
  localization-only IDs.

These differences are reported as source facts and are not silently reconciled.

## Skills and passives

`skills` contains every serialized active `SkillConfig`. Each record includes the
localized identity and source icon; maximum and PvP levels; exact weapon/stance
requirements; prerequisite skill IDs and levels; projectile, damage, element,
target, cast, indicator, range, and movement classifications; all serialized
behavior flags; asset-reference path IDs; and every serialized scaled value as
`base`, `perLevel`, `string`, and `string2`.

Events retain their target ID and `SkillEventType`. Applied and self-applied statuses
retain duration, chance, and stack base/growth values. Cure, consume, and drain
arrays retain their full `ScaledValue`. All 131 prerequisite references resolve to
active or passive configs, and all 293 explicit status references resolve to
`statuses`.

`skillPassives` contains all 111 `SkillPassiveConfig` records with the same base
requirements plus complete `StatValue` entries. Each stat preserves enum name and
number, value and growth, event and event value, condition and condition value,
chance, trigger, and target. `previewedByArchetypes` is only populated from the 56
serialized `ArchetypeConfig.PreviewSkills` relationships; it is not presented as a
complete class ownership list.

Computed getters such as `BaseSkillConfig.AutocastLv` are omitted because they are
not serialized data.

## Artifacts and gems

`artifacts` maps the 45 `ArtifactSetConfig` objects. The four independent stat lists
remain available as `fullSet`, `perPiece`, `perRefine`, and `individual`; `stats` is
an indexed search view that adds only the originating list name. Artifacts have no
configured main `BaseConfig.Sprite`. Their 180 serialized part Sprite references all
decode and are exposed through the index-aligned `parts` view alongside the parallel
description list. No artifact-slot name is assigned to a part because the config
does not serialize a per-part `ArtifactSlot` value.

`gems` maps all 129 `GemConfig` objects with drop chance, complete stats, localized
and runtime affix text, boss flag, and source icon. All 129 references resolve to two
shared source Sprites, which are intentionally deduplicated on disk. The computed
`GemConfig.IsObtainable` getter is omitted.

## Cards

`cards` maps all 327 `CardConfig` records, including exact `EquipClass`, stats,
affix, `Unique`, boss flag, drop chance, and icon. The committed localization table
contains only 264 matching card IDs; the 63 runtime-only IDs remain in the catalog
with source English text and are enumerated in coverage rather than discarded.
`CardConfig.IsObtainable` is a computed getter and is not emitted.

## Monsters and loot

`monsterArchetypes` contains the 13 shared stat templates with STR/VIT/AGI/DEX/INT/LUK,
DEF/MDEF, spawn multiplier, exact speed ranks, ranged flag, and knockback flag.
Every `monsters[].archetypeId` is resolved from its serialized pointer.

All 330 `MonsterConfig` records include the Addressables prefab GUID, attack timing,
race, element, size raw value, level, hostility/boss flags, skills with level/chance/
cast time/cooldown/health and status conditions, artifact slots, material ID, essence
rate, and every typed loot list. All 736 skill references resolve. Equipment,
artifact, card, and gem drops resolve 1,385/1,385, 245/245, 270/270, and 273/273.
Material, consumable, and cosmetic drops retain their declared IDs/chances/counts,
but this extraction does not relabel them as another config kind.

The IL2CPP type-tree backend omitted the generic Addressables
`AssetReferenceT<GameObject> PrefabRef` field. The extractor restores exactly the
three serialized members declared by that class (`m_AssetGUID`, `m_SubObjectName`,
`m_SubObjectType`) and requires UnityPy to consume each object's complete byte range.
This corrected layout parses all 330 objects. Two records serialize size value `0`,
outside the declared `Size` enum (`Small=1`, `Medium=2`, `Large=3`); their numeric
value is retained and their label is `null`.

`MonsterConfig.HasArtifact` and `HasCard` are computed getters. Instead of executing
or guessing them, the catalog exposes the underlying nullable loot entries.

## Statuses

`statuses` maps all 185 `StatusConfig` objects with source icon and effect/audio
references, category, damage values, element, level/stack limits, cooldown,
dispelling/duration flags, exclusivity, passive stats, status flags, nested status
applications, and events. All seven nested status IDs resolve. Twenty-one source
records explicitly have no Sprite; no placeholder is assigned.

## Equipment fields

Each `equipment` record exposes source values suitable for database ingestion and
faceted search:

- identity/localization: `id`, `slug`, `name`, `displayName`, `description`;
- art: `icon`, `iconSource`, `spriteId`;
- classification: `type` + `typeValue`, `element` + `elementValue`;
- stats: `primaryStats`, `secondaryStats`, and the combined `stats` search view;
- item data: `slots`, `setId`, `substatPoolId`, `unique`, `characterBound`,
  `levelRequired`, `materialId`, and `dropChance`;
- class restriction: `allowedArchetypes`, `allowedArchetypeValues`, and
  `hasArchetypeRestriction`;
- provenance: `sourcePathId`.

The `stats` array is a lossless derived view of the two source arrays and adds only
`source: "primary" | "secondary"`. A stat retains its runtime name, enum name and
number, scaled base/per-level values, event, condition, chance, trigger, and target.

`slots` is exported verbatim from `EquipConfig.Slots`. It is not renamed to a body
location and is not conflated with the separate `EquipSlot` enum. Likewise, an empty
`allowedArchetypes` array means that the serialized list is empty; the extractor does
not add a class based on an item name.

The IL2CPP declaration only identifies `Slots` as an `int`; no serialized enum,
annotation, or index-bearing field proves whether it counts sockets, cards, or
another capacity. Its semantic label therefore remains unset in
`meta.sourceBoundaries.equipmentSlots`. Wear locations must be derived separately
from the exact `EquipType`; they are not stored in `Slots`.

`ArchetypeConfig.Attributes` is declared only as `Int32[]` and every record currently
contains six values. Although the game also has six core attribute stat types, no
serialized index enum or field declaration proves the array's ordering. The catalog
keeps the original positional array and deliberately leaves
`meta.sourceBoundaries.archetypeAttributes.indexNames` as `null`.

## Rarity boundary

The runtime `EquipConfig` declaration has no rarity field. Therefore individual
equipment records do not receive an inferred rarity. The real `ItemRarity` enum is
retained under `enums` and `meta.rarityModel` as runtime evidence, while
`baseEquipmentField` is explicitly `null` and coverage reports zero base rarity
fields. `unique` remains the source boolean `EquipConfig.Unique`; it is not renamed
or reinterpreted as a rarity.

## Sets and substat pools

`equipmentSets[].fullSet` contains the exact `EquipSetConfig.FullSet` stat list and
`equipmentIds` contains resolved member IDs. All member pointers agree with the
corresponding equipment `setId`.

`substatPools` uses each `EquipSubstatConfig` object name as its source ID. Candidate
stats remain separated into their serialized group order. Equipment links to a pool
only through `substatPoolId`; the extractor does not claim that every candidate is
present on a specific item.

## Images

`apps/web/public/game-assets/runtime-icons` contains 1,179 deduplicated PNGs referenced
by equipment, archetypes, active/passive skills, artifact parts, gems, cards,
monsters, statuses, and the five audited same-ID profession `NpcConfig` fallbacks.
All 1,179 source Sprite objects decoded without an error. The original
`ArchetypeConfig.Sprite` and `iconSource` remain null for those profession records;
their fallback fields retain both the `NpcConfig` and Sprite path IDs.
Exports preserve transparency and aspect ratio and are capped at 256 pixels on the
longest side for the web. `iconSource` retains source/export dimensions, Sprite name,
and Unity path ID. Shared Sprite references point to one file rather than producing
duplicate images. A direct null icon always reflects a null source pointer; the five
strict fallbacks never replace `icon` or `iconSource`. Cardweaver and Merchant remain
text fallbacks because their only audited candidates were semantic aliases.

## Reproduction

From the repository root in PowerShell:

```powershell
python -m pip install UnityPy TypeTreeGeneratorAPI
python packages/game-data/scripts/extract-runtime-catalog.py `
  --game-dir 'C:\Program Files (x86)\Steam\steamapps\common\SpiritVale'
```

Useful options:

- `--no-assets` validates every Sprite and regenerates JSON without writing PNGs;
- `--asset-max-size 0` preserves original Sprite dimensions;
- `--output`, `--asset-dir`, and `--public-prefix` support another repository layout.

The command fails on unknown closed enums, unresolved source pointers, duplicate
runtime IDs, non-Sprite icon pointers, or type-tree decode errors. Values known to
exist outside a declared enum (currently two monster `Size=0` records) retain their
raw number and a null label and are listed in coverage. This keeps a game update from
quietly producing plausible-looking but incorrect data.
