#!/usr/bin/env python3
"""Extract the SpiritVale runtime gameplay catalog from local Unity assets.

The game ships IL2CPP metadata and stripped MonoBehaviour type trees. UnityPy reads
the containers while TypeTreeGeneratorAPI reconstructs the serialized layouts from
GameAssembly.dll and global-metadata.dat. The committed runtime-enums.json contains
the exact enum declarations recovered from the same build with Cpp2IL.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import UnityPy
    from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
except ImportError as exc:  # pragma: no cover - dependency check for operators
    raise SystemExit(
        "Missing extractor dependencies. Install UnityPy and TypeTreeGeneratorAPI "
        "into the active Python environment."
    ) from exc


SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SCRIPT_DIR.parent
REPO_ROOT = PACKAGE_DIR.parent.parent
DEFAULT_GAME_ROOT = Path(r"C:\Program Files (x86)\Steam\steamapps\common\SpiritVale")
DEFAULT_OUTPUT = PACKAGE_DIR / "src" / "runtime-catalog.json"
DEFAULT_ENUMS = PACKAGE_DIR / "src" / "runtime-enums.json"
DEFAULT_ASSET_DIR = REPO_ROOT / "apps" / "web" / "public" / "game-assets" / "runtime-icons"
DEFAULT_PUBLIC_PREFIX = "/game-assets/runtime-icons"

CONFIG_CLASSES = (
    "EquipConfig",
    "EquipSetConfig",
    "EquipSubstatConfig",
    "ArchetypeConfig",
    "SkillConfig",
    "SkillPassiveConfig",
    "ArtifactSetConfig",
    "GemConfig",
    "CardConfig",
    "MonsterConfig",
    "MonsterArchetypeConfig",
    "StatusConfig",
    "WeaponConfig",
    "NpcConfig",
)

ARCHETYPE_NPC_ICON_FALLBACK_IDS = frozenset(
    {
        "Artificer",
        "Blacksmith",
        "Craftsman",
        "Gemsmith",
        "Stylist",
    }
)

ACTIVE_SKILL_SCALED_FIELDS = (
    "Damage",
    "DamageFlat",
    "DamageMax",
    "DamageSacrifice",
    "SelfDamageMax",
    "DamageReflect",
    "Hits",
    "Chains",
    "CastTime",
    "Cooldown",
    "Delay",
    "Cost",
    "CostMax",
    "Area",
    "Velocity",
    "Duration",
    "Knockback",
    "Pull",
    "Wall",
    "Instances",
    "MaxInstances",
    "HitLimit",
    "CastReady",
    "ComboReady",
    "ComboFinisher",
    "Summon",
    "Leech",
    "LeechMp",
    "Revive",
    "Clone",
    "Backslide",
    "SpellCopy",
    "FixedRange",
    "Mount",
    "Charges",
    "Threat",
    "RecoverMpMax",
)

ACTIVE_SKILL_BOOLEAN_FIELDS = (
    "DisableCopy",
    "CanCastGround",
    "EffectCenterOnSelf",
    "EffectAttached",
    "EffectInstanceDestroyImmediate",
    "SfxCastUseDelay",
    "OnCompleteUseDelay",
    "Attached",
    "Teleport",
    "Bond",
    "Piercing",
    "TriggerHit",
    "TriggerAutocast",
    "TriggerMultistrike",
    "Hybrid",
    "IgnoreBlock",
    "IgnoreFlee",
    "IgnoreDefence",
    "CanCrit",
    "WeaponSwap",
    "HeavySwap",
    "CloneCast",
    "StatusPerClone",
    "ConsumeClones",
    "IgnoreSilence",
    "IgnoreReflect",
    "FixedCastTime",
    "SingleTarget",
    "ProjectileLerp",
    "ProjectileZone",
)

ACTIVE_SKILL_ASSET_FIELDS = (
    "SfxCast",
    "SfxLoop",
    "SfxHit",
    "SfxComplete",
    "EffectCast",
    "EffectInstance",
    "EffectComplete",
    "EffectHit",
    "EffectBolt",
    "AnimCast",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", type=Path, default=DEFAULT_GAME_ROOT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--enums", type=Path, default=DEFAULT_ENUMS)
    parser.add_argument("--localized-catalog", type=Path, default=PACKAGE_DIR / "src" / "catalog.json")
    parser.add_argument("--asset-dir", type=Path, default=DEFAULT_ASSET_DIR)
    parser.add_argument("--public-prefix", default=DEFAULT_PUBLIC_PREFIX)
    parser.add_argument(
        "--asset-max-size",
        type=int,
        default=256,
        help="Maximum width/height for exported PNGs; use 0 to preserve source size.",
    )
    parser.add_argument("--no-assets", action="store_true", help="Decode and validate sprites without writing PNGs.")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def utc_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug or "sprite"


def enum_map(enums: dict[str, Any], name: str) -> dict[int, str]:
    values = enums["enums"][name]
    return {int(entry["value"]): str(entry["name"]) for entry in values}


def enum_name(enums: dict[str, Any], name: str, value: int) -> str:
    mapping = enum_map(enums, name)
    if value not in mapping:
        raise ValueError(f"Unknown {name} value {value}; enum evidence and runtime data disagree")
    return mapping[value]


def enum_name_or_none(enums: dict[str, Any], name: str, value: int) -> str | None:
    return enum_map(enums, name).get(value)


def enum_value(enums: dict[str, Any], name: str, label: str) -> int | None:
    for value, candidate in enum_map(enums, name).items():
        if candidate == label:
            return value
    return None


def localized_indexes(path: Path) -> tuple[dict[str, dict[str, dict[str, Any]]], dict[str, Any]]:
    if not path.exists():
        return {}, {}
    catalog = json.loads(path.read_text(encoding="utf-8"))
    indexes: dict[str, dict[str, dict[str, Any]]] = {}
    for section in (
        "equips",
        "archetypes",
        "skills",
        "skillPassives",
        "artifacts",
        "gems",
        "cards",
        "monsters",
        "statuses",
    ):
        indexes[section] = {str(item["id"]): item for item in catalog.get(section, [])}
    return indexes, catalog.get("meta", {})


def localized_value(item: dict[str, Any] | None, key: str, fallback: str) -> dict[str, str]:
    value = item.get(key) if item else None
    if isinstance(value, dict):
        return {str(locale): str(text) for locale, text in value.items() if text not in (None, "")}
    if isinstance(value, str) and value:
        return {"en": value}
    return {"en": fallback} if fallback else {}


def ptr_path_id(value: Any) -> int:
    if not isinstance(value, dict):
        return 0
    return int(value.get("m_PathID", 0) or 0)


def scaled_value(value: dict[str, Any] | None) -> dict[str, Any]:
    value = value or {}
    return {
        "base": value.get("Value", 0.0),
        "perLevel": value.get("ValueLv", 0.0),
        "string": value.get("ValueStr", ""),
        "string2": value.get("ValueStr2", ""),
    }


def lower_camel(value: str) -> str:
    return value[:1].lower() + value[1:] if value else value


def asset_reference(value: Any) -> dict[str, int] | None:
    if not isinstance(value, dict):
        return None
    file_id = int(value.get("m_FileID", 0) or 0)
    path_id = int(value.get("m_PathID", 0) or 0)
    if not file_id and not path_id:
        return None
    return {"sourceFileId": file_id, "sourcePathId": path_id}


def skill_status(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(value.get("Id", "")),
        "duration": {"base": value.get("Duration", 0.0), "perLevel": value.get("DurationLv", 0.0)},
        "chance": {"base": value.get("Chance", 0.0), "perLevel": value.get("ChanceLv", 0.0)},
        "stacks": {"base": int(value.get("Stacks", 0)), "perLevel": int(value.get("StacksLv", 0))},
    }


def skill_base_fields(
    obj: Any,
    data: dict[str, Any],
    localized: dict[str, Any] | None,
    sprites: dict[int, dict[str, Any]],
    enums: dict[str, Any],
    config_kind: str,
) -> dict[str, Any]:
    skill_id = str(data["Id"])
    icon, icon_source = icon_fields(data.get("Sprite"), sprites)
    weapon_values = [int(value) for value in data.get("WeaponTypes", [])]
    stance_values = [int(value) for value in data.get("StanceTypes", [])]
    runtime_description = str(data.get("Description", ""))
    return {
        "id": skill_id,
        "slug": str(localized.get("slug")) if localized and localized.get("slug") else slugify(skill_id),
        "name": localized_value(localized, "name", str(data.get("DisplayName", skill_id))),
        "displayName": str(data.get("DisplayName", skill_id)),
        "description": localized_value(localized, "description", runtime_description),
        "runtimeDescription": runtime_description,
        "description2": str(data.get("Description2", "")),
        "configKind": config_kind,
        "spriteId": str(data.get("SpriteId", "")),
        "icon": icon,
        "iconSource": icon_source,
        "maxLevel": int(data.get("MaxLv", 0)),
        "pvpMaxLevel": int(data.get("PvpMaxLv", 0)),
        "weaponTypes": [enum_name(enums, "EquipType", value) for value in weapon_values],
        "weaponTypeValues": weapon_values,
        "stanceTypes": [enum_name(enums, "StanceType", value) for value in stance_values],
        "stanceTypeValues": stance_values,
        "requirements": [
            {"skillId": str(value.get("Id", "")), "level": int(value.get("Level", 0))}
            for value in data.get("Requirements", [])
        ],
        "previewedByArchetypes": [],
        "sourcePathId": int(obj.path_id),
    }


def base_config_fields(
    obj: Any,
    data: dict[str, Any],
    localized: dict[str, Any] | None,
    sprites: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    config_id = str(data["Id"])
    runtime_description = str(data.get("Description", ""))
    icon, icon_source = icon_fields(data.get("Sprite"), sprites)
    return {
        "id": config_id,
        "slug": str(localized.get("slug")) if localized and localized.get("slug") else slugify(config_id),
        "name": localized_value(localized, "name", str(data.get("DisplayName", config_id))),
        "displayName": str(data.get("DisplayName", config_id)),
        "description": localized_value(localized, "description", runtime_description),
        "runtimeDescription": runtime_description,
        "description2": str(data.get("Description2", "")),
        "spriteId": str(data.get("SpriteId", "")),
        "icon": icon,
        "iconSource": icon_source,
        "sourcePathId": int(obj.path_id),
    }


def loot_entry(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(value.get("Id", "")),
        "dropChance": value.get("DropChance", 0.0),
        "count": int(value.get("Count", 0)),
    }


def localization_comparison(runtime_ids: set[str], localized_ids: set[str]) -> dict[str, Any]:
    return {
        "runtimeIds": len(runtime_ids),
        "localizedIds": len(localized_ids),
        "exactIdOverlap": len(runtime_ids & localized_ids),
        "runtimeOnlyIds": sorted(runtime_ids - localized_ids),
        "localizedOnlyIds": sorted(localized_ids - runtime_ids),
    }


def stat_value(value: dict[str, Any], enums: dict[str, Any]) -> dict[str, Any]:
    stat_type = int(value.get("Type", -1))
    event_type = int(value.get("EventType", 0))
    condition_type = int(value.get("ConditionType", 0))
    trigger_type = int(value.get("TriggerType", 0))
    target_type = int(value.get("Target", 0))
    return {
        "name": value.get("Name", ""),
        "type": enum_name(enums, "StatType", stat_type),
        "typeValue": stat_type,
        "value": scaled_value(value.get("Value")),
        "eventType": enum_name(enums, "SkillEventType", event_type),
        "eventTypeValue": event_type,
        "eventValue": value.get("EventValue", ""),
        "conditionType": enum_name(enums, "SkillConditionType", condition_type),
        "conditionTypeValue": condition_type,
        "conditionValue": value.get("ConditionValue", ""),
        "chance": value.get("Chance", 0.0),
        "triggerType": enum_name(enums, "SkillTriggerType", trigger_type),
        "triggerTypeValue": trigger_type,
        "target": enum_name(enums, "TargetType", target_type),
        "targetValue": target_type,
    }


def script_classes(environment: Any) -> dict[int, str]:
    classes: dict[int, str] = {}
    for obj in environment.objects:
        if obj.type.name != "MonoScript":
            continue
        script = obj.read()
        classes[int(obj.path_id)] = str(script.m_ClassName)
    return classes


def group_configs(environment: Any, classes: dict[int, str]) -> dict[str, list[Any]]:
    grouped: dict[str, list[Any]] = defaultdict(list)
    for obj in environment.objects:
        if obj.type.name != "MonoBehaviour" or obj.assets_file.name != "sharedassets0.assets":
            continue
        raw = obj.get_raw_data()
        if len(raw) < 28:
            continue
        # Serialized MonoBehaviour header: GameObject PPtr, enabled byte + padding,
        # then the MonoScript PPtr. This is the layout used by this Unity 6000 build.
        script_path_id = struct.unpack_from("<q", raw, 20)[0]
        class_name = classes.get(int(script_path_id))
        if class_name in CONFIG_CLASSES:
            grouped[class_name].append(obj)
    for values in grouped.values():
        values.sort(key=lambda obj: int(obj.path_id))
    return grouped


def parse_group(grouped: dict[str, list[Any]], class_name: str) -> list[tuple[Any, dict[str, Any]]]:
    parsed: list[tuple[Any, dict[str, Any]]] = []
    for obj in grouped.get(class_name, []):
        parsed.append((obj, obj.read_typetree()))
    return parsed


def monster_config_nodes(generator: Any) -> list[dict[str, Any]]:
    """Patch the one generic Addressables field omitted by the IL2CPP node generator.

    AssetStudio's IL2CPP backend reconstructs every MonsterConfig field except
    AssetReferenceT<GameObject> PrefabRef. Addressables serializes that class as its
    three declared strings. Inserting the declaration restores alignment; all 330
    objects are subsequently guarded by UnityPy's full-byte read check.
    """

    nodes = json.loads(generator.get_nodes_as_json("Assembly-CSharp.dll", "MonsterConfig"))
    insert_at = next(
        index
        for index, node in enumerate(nodes)
        if node["m_Level"] == 1 and node["m_Name"] == "Archetype"
    )

    def string_nodes(name: str) -> list[dict[str, Any]]:
        return [
            {"m_Type": "string", "m_Name": name, "m_Level": 2, "m_MetaFlag": 0},
            {"m_Type": "Array", "m_Name": "Array", "m_Level": 3, "m_MetaFlag": 16384},
            {"m_Type": "int", "m_Name": "size", "m_Level": 4, "m_MetaFlag": 0},
            {"m_Type": "char", "m_Name": "data", "m_Level": 4, "m_MetaFlag": 0},
        ]

    prefab_nodes: list[dict[str, Any]] = [
        {"m_Type": "AssetReferenceT<GameObject>", "m_Name": "PrefabRef", "m_Level": 1, "m_MetaFlag": 0}
    ]
    for field in ("m_AssetGUID", "m_SubObjectName", "m_SubObjectType"):
        prefab_nodes.extend(string_nodes(field))
    nodes[insert_at:insert_at] = prefab_nodes
    return nodes


def parse_monster_group(grouped: dict[str, list[Any]], generator: Any) -> list[tuple[Any, dict[str, Any]]]:
    nodes = monster_config_nodes(generator)
    return [(obj, obj.read_typetree(nodes=nodes)) for obj in grouped.get("MonsterConfig", [])]


def collect_sprite_ref(refs: dict[int, dict[str, Any]], pointer: Any, category: str, item_id: str) -> None:
    path_id = ptr_path_id(pointer)
    if not path_id:
        return
    record = refs.setdefault(path_id, {"categories": set(), "itemIds": []})
    record["categories"].add(category)
    record["itemIds"].append(item_id)


def export_sprites(
    assets_file: Any,
    refs: dict[int, dict[str, Any]],
    output_dir: Path,
    public_prefix: str,
    max_size: int,
    write_assets: bool,
) -> dict[int, dict[str, Any]]:
    if write_assets:
        output_dir.mkdir(parents=True, exist_ok=True)
    exported: dict[int, dict[str, Any]] = {}
    for path_id in sorted(refs):
        sprite_obj = assets_file.objects[path_id]
        if sprite_obj.type.name != "Sprite":
            raise TypeError(f"Path ID {path_id} is {sprite_obj.type.name}, expected Sprite")
        sprite = sprite_obj.read()
        source_image = sprite.image.convert("RGBA")
        image = source_image.copy()
        if max_size > 0 and (image.width > max_size or image.height > max_size):
            from PIL import Image

            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        filename = f"sprite-{path_id}-{slugify(str(sprite.m_Name))}.png"
        if write_assets:
            image.save(output_dir / filename, format="PNG", optimize=True)
        exported[path_id] = {
            "publicPath": f"{public_prefix.rstrip('/')}/{filename}",
            "sourcePathId": path_id,
            "sourceName": str(sprite.m_Name),
            "sourceWidth": source_image.width,
            "sourceHeight": source_image.height,
            "width": image.width,
            "height": image.height,
            "categories": sorted(refs[path_id]["categories"]),
            "referencedBy": sorted(set(refs[path_id]["itemIds"])),
        }
    return exported


def icon_fields(pointer: Any, sprites: dict[int, dict[str, Any]]) -> tuple[str | None, dict[str, Any] | None]:
    path_id = ptr_path_id(pointer)
    if not path_id:
        return None, None
    sprite = sprites[path_id]
    source = {key: value for key, value in sprite.items() if key not in ("categories", "referencedBy")}
    return str(sprite["publicPath"]), source


def source_file(path: Path, logical_path: str, include_hash: bool = True) -> dict[str, Any]:
    result = {
        "path": logical_path,
        "size": path.stat().st_size,
        "lastModifiedUtc": utc_mtime(path),
    }
    if include_hash:
        result["sha256"] = sha256_file(path)
    return result


def main() -> int:
    args = parse_args()
    game_root = args.game_dir.resolve()
    if game_root.name.endswith("_Data"):
        data_dir = game_root
        game_root = data_dir.parent
    else:
        data_dir = game_root / "SpiritVale_Data"

    sharedassets = data_dir / "sharedassets0.assets"
    global_scripts = data_dir / "globalgamemanagers.assets"
    game_assembly = game_root / "GameAssembly.dll"
    metadata = data_dir / "il2cpp_data" / "Metadata" / "global-metadata.dat"
    addressables_settings = data_dir / "StreamingAssets" / "aa" / "settings.json"
    addressables_hash = data_dir / "StreamingAssets" / "aa" / "catalog.hash"
    required = (sharedassets, global_scripts, game_assembly, metadata, args.enums)
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit("Missing required source files:\n" + "\n".join(missing))

    enums = json.loads(args.enums.read_text(encoding="utf-8"))
    localization, localization_meta = localized_indexes(args.localized_catalog)

    environment = UnityPy.load(str(sharedassets), str(global_scripts))
    shared_file = next(
        obj.assets_file
        for obj in environment.objects
        if obj.assets_file.name == "sharedassets0.assets"
    )
    unity_version = str(shared_file.unity_version)
    generator = TypeTreeGenerator(unity_version, "AssetStudio")
    generator.load_local_game(str(game_root))
    environment.typetree_generator = generator

    classes = script_classes(environment)
    grouped = group_configs(environment, classes)
    parsed = {
        name: parse_group(grouped, name)
        for name in CONFIG_CLASSES
        if name != "MonsterConfig"
    }
    parsed["MonsterConfig"] = parse_monster_group(grouped, generator)

    equipment_raw = parsed["EquipConfig"]
    sets_raw = parsed["EquipSetConfig"]
    substats_raw = parsed["EquipSubstatConfig"]
    archetypes_raw = parsed["ArchetypeConfig"]
    active_skills_raw = parsed["SkillConfig"]
    passive_skills_raw = parsed["SkillPassiveConfig"]
    artifacts_raw = parsed["ArtifactSetConfig"]
    gems_raw = parsed["GemConfig"]
    cards_raw = parsed["CardConfig"]
    monsters_raw = parsed["MonsterConfig"]
    monster_archetypes_raw = parsed["MonsterArchetypeConfig"]
    statuses_raw = parsed["StatusConfig"]
    weapons_raw = parsed["WeaponConfig"]
    npcs_raw = parsed["NpcConfig"]

    archetype_raw_by_id = {str(data["Id"]): (obj, data) for obj, data in archetypes_raw}
    if len(archetype_raw_by_id) != len(archetypes_raw):
        raise ValueError("ArchetypeConfig IDs are not unique")
    npc_raw_by_id = {str(data["Id"]): (obj, data) for obj, data in npcs_raw}
    if len(npc_raw_by_id) != len(npcs_raw):
        raise ValueError("NpcConfig IDs are not unique")

    archetype_npc_icon_fallbacks: dict[str, tuple[Any, dict[str, Any]]] = {}
    for archetype_id in sorted(ARCHETYPE_NPC_ICON_FALLBACK_IDS):
        archetype_entry = archetype_raw_by_id.get(archetype_id)
        if not archetype_entry:
            raise ValueError(f"Missing ArchetypeConfig {archetype_id} required by the NPC icon fallback audit")
        if ptr_path_id(archetype_entry[1].get("Sprite")):
            raise ValueError(f"ArchetypeConfig {archetype_id} now has a direct Sprite; remove its NPC icon fallback")
        npc_entry = npc_raw_by_id.get(archetype_id)
        if not npc_entry:
            raise ValueError(f"Missing same-ID NpcConfig {archetype_id} required by the icon fallback audit")
        if not ptr_path_id(npc_entry[1].get("Sprite")):
            raise ValueError(f"Same-ID NpcConfig {archetype_id} has no Sprite")
        archetype_npc_icon_fallbacks[archetype_id] = npc_entry

    equipment_by_path = {int(obj.path_id): data for obj, data in equipment_raw}
    equipment_ids = {str(data["Id"]) for _, data in equipment_raw}
    if len(equipment_ids) != len(equipment_raw):
        raise ValueError("EquipConfig IDs are not unique")

    sprite_refs: dict[int, dict[str, Any]] = {}
    for _, data in equipment_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "equipment", str(data["Id"]))
    for _, data in sets_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "equipment-set", str(data["Id"]))
    for _, data in archetypes_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "archetype", str(data["Id"]))
    for archetype_id, (_, data) in archetype_npc_icon_fallbacks.items():
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "archetype-npc-fallback", archetype_id)
    for _, data in active_skills_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "skill-active", str(data["Id"]))
    for _, data in passive_skills_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "skill-passive", str(data["Id"]))
    for _, data in artifacts_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "artifact", str(data["Id"]))
        for index, pointer in enumerate(data.get("Sprites", [])):
            collect_sprite_ref(sprite_refs, pointer, "artifact-part", f'{data["Id"]}#{index + 1}')
    for _, data in gems_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "gem", str(data["Id"]))
    for _, data in cards_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "card", str(data["Id"]))
    for _, data in monsters_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "monster", str(data["Id"]))
    for _, data in statuses_raw:
        collect_sprite_ref(sprite_refs, data.get("Sprite"), "status", str(data["Id"]))

    sprites = export_sprites(
        shared_file,
        sprite_refs,
        args.asset_dir,
        args.public_prefix,
        args.asset_max_size,
        not args.no_assets,
    )

    equipment: list[dict[str, Any]] = []
    for obj, data in equipment_raw:
        item_id = str(data["Id"])
        localized = localization.get("equips", {}).get(item_id)
        icon, icon_source = icon_fields(data.get("Sprite"), sprites)
        primary = [stat_value(value, enums) for value in data.get("PrimaryStats", [])]
        secondary = [stat_value(value, enums) for value in data.get("SecondaryStats", [])]
        archetype_values = [int(value) for value in data.get("Archetypes", [])]
        runtime_description = str(data.get("Description", ""))
        type_value = int(data["Type"])
        element_value = int(data["Element"])
        equipment.append(
            {
                "id": item_id,
                "slug": str(localized.get("slug")) if localized and localized.get("slug") else slugify(item_id),
                "name": localized_value(localized, "name", str(data.get("DisplayName", item_id))),
                "displayName": str(data.get("DisplayName", item_id)),
                "description": localized_value(localized, "description", runtime_description),
                "runtimeDescription": runtime_description,
                "description2": str(data.get("Description2", "")),
                "spriteId": str(data.get("SpriteId", "")),
                "icon": icon,
                "iconSource": icon_source,
                "dropChance": data.get("DropChance", 0.0),
                "type": enum_name(enums, "EquipType", type_value),
                "typeValue": type_value,
                "primaryStats": primary,
                "secondaryStats": secondary,
                "stats": [
                    *({"source": "primary", **value} for value in primary),
                    *({"source": "secondary", **value} for value in secondary),
                ],
                "slots": int(data.get("Slots", 0)),
                "setId": str(data.get("Set", "")) or None,
                "element": enum_name(enums, "Element", element_value),
                "elementValue": element_value,
                "substatPoolId": str(data.get("Substats", "")) or None,
                "unique": bool(data.get("Unique", False)),
                "characterBound": bool(data.get("CharacterBound", False)),
                "levelRequired": int(data.get("LevelRequired", 0)),
                "allowedArchetypes": [enum_name(enums, "Archetype", value) for value in archetype_values],
                "allowedArchetypeValues": archetype_values,
                "hasArchetypeRestriction": bool(archetype_values),
                "materialId": str(data.get("MaterialId", "")) or None,
                "sourcePathId": int(obj.path_id),
            }
        )
    equipment.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    equipment_sets: list[dict[str, Any]] = []
    member_ref_count = 0
    for obj, data in sets_raw:
        set_id = str(data["Id"])
        localized = None
        icon, icon_source = icon_fields(data.get("Sprite"), sprites)
        member_ids: list[str] = []
        for pointer in data.get("Equips", []):
            member_ref_count += 1
            path_id = ptr_path_id(pointer)
            if path_id not in equipment_by_path:
                raise ValueError(f"EquipSetConfig {set_id} points to missing EquipConfig {path_id}")
            item_id = str(equipment_by_path[path_id]["Id"])
            if str(equipment_by_path[path_id].get("Set", "")) != set_id:
                raise ValueError(f"Set membership disagrees for {item_id}")
            member_ids.append(item_id)
        equipment_sets.append(
            {
                "id": set_id,
                "slug": slugify(set_id),
                "name": localized_value(localized, "name", str(data.get("DisplayName", set_id))),
                "displayName": str(data.get("DisplayName", set_id)),
                "description": localized_value(localized, "description", str(data.get("Description", ""))),
                "runtimeDescription": str(data.get("Description", "")),
                "description2": str(data.get("Description2", "")),
                "spriteId": str(data.get("SpriteId", "")),
                "icon": icon,
                "iconSource": icon_source,
                "fullSet": [stat_value(value, enums) for value in data.get("FullSet", [])],
                "equipmentIds": member_ids,
                "sourcePathId": int(obj.path_id),
            }
        )
    equipment_sets.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    substat_pools: list[dict[str, Any]] = []
    for obj, data in substats_raw:
        pool_id = str(data.get("m_Name", ""))
        substat_pools.append(
            {
                "id": pool_id,
                "groups": [
                    {
                        "index": index,
                        "stats": [stat_value(value, enums) for value in group.get("Stats", [])],
                    }
                    for index, group in enumerate(data.get("Stats", []))
                ],
                "sourcePathId": int(obj.path_id),
            }
        )
    substat_pools.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    active_skill_ids = {str(data["Id"]) for _, data in active_skills_raw}
    passive_skill_ids = {str(data["Id"]) for _, data in passive_skills_raw}
    if len(active_skill_ids) != len(active_skills_raw):
        raise ValueError("SkillConfig IDs are not unique")
    if len(passive_skill_ids) != len(passive_skills_raw):
        raise ValueError("SkillPassiveConfig IDs are not unique")
    duplicate_skill_ids = active_skill_ids & passive_skill_ids
    if duplicate_skill_ids:
        raise ValueError(f"Active/passive skill IDs overlap: {sorted(duplicate_skill_ids)}")
    skill_kind_by_id = {
        **{skill_id: "active" for skill_id in active_skill_ids},
        **{skill_id: "passive" for skill_id in passive_skill_ids},
    }
    archetypes: list[dict[str, Any]] = []
    relations: list[dict[str, str]] = []
    for obj, data in archetypes_raw:
        archetype_id = str(data["Id"])
        localized = localization.get("archetypes", {}).get(archetype_id)
        icon, icon_source = icon_fields(data.get("Sprite"), sprites)
        fallback_icon: str | None = None
        fallback_icon_source: dict[str, Any] | None = None
        fallback_icon_basis: str | None = None
        npc_fallback = archetype_npc_icon_fallbacks.get(archetype_id)
        if npc_fallback:
            npc_obj, npc_data = npc_fallback
            fallback_icon, sprite_source = icon_fields(npc_data.get("Sprite"), sprites)
            fallback_icon_source = {
                **(sprite_source or {}),
                "configClass": "NpcConfig",
                "configId": str(npc_data["Id"]),
                "configSourcePathId": int(npc_obj.path_id),
                "spriteId": str(npc_data.get("SpriteId", "")),
            }
            fallback_icon_basis = "npc-config-same-id"
        starter_ids: list[str] = []
        display_ids: list[str] = []
        for field, destination in (("StarterItems", starter_ids), ("DisplayItems", display_ids)):
            for pointer in data.get(field, []):
                path_id = ptr_path_id(pointer)
                if path_id not in equipment_by_path:
                    raise ValueError(f"ArchetypeConfig {archetype_id} points to missing EquipConfig {path_id}")
                destination.append(str(equipment_by_path[path_id]["Id"]))
        preview_skills = [str(value) for value in data.get("PreviewSkills", [])]
        for skill_id in preview_skills:
            if skill_id in active_skill_ids:
                config_kind = "active"
            elif skill_id in passive_skill_ids:
                config_kind = "passive"
            else:
                raise ValueError(f"ArchetypeConfig {archetype_id} preview skill {skill_id} is unresolved")
            relations.append({"archetypeId": archetype_id, "skillId": skill_id, "kind": "preview", "configKind": config_kind})
        color = data.get("Color", {})
        runtime_description = str(data.get("Description", ""))
        archetypes.append(
            {
                "id": archetype_id,
                "slug": str(localized.get("slug")) if localized and localized.get("slug") else slugify(archetype_id),
                "name": localized_value(localized, "name", str(data.get("DisplayName", archetype_id))),
                "displayName": str(data.get("DisplayName", archetype_id)),
                "description": localized_value(localized, "description", runtime_description),
                "runtimeDescription": runtime_description,
                "description2": str(data.get("Description2", "")),
                "spriteId": str(data.get("SpriteId", "")),
                "icon": icon,
                "iconSource": icon_source,
                "fallbackIcon": fallback_icon,
                "fallbackIconSource": fallback_icon_source,
                "fallbackIconBasis": fallback_icon_basis,
                "archetypeValue": enum_value(enums, "Archetype", archetype_id),
                "isUnlocked": bool(data.get("IsUnlocked", False)),
                "color": {key: color.get(key, 0.0) for key in ("r", "g", "b", "a")},
                "maxJobLevel": int(data.get("MaxJobLevel", 0)),
                "starterItemIds": starter_ids,
                "displayItemIds": display_ids,
                "previewSkills": preview_skills,
                "attributes": [int(value) for value in data.get("Attributes", [])],
                "appearance": {
                    "hair": int(data.get("Hair", -1)),
                    "hairColor": int(data.get("HairColor", -1)),
                    "brows": int(data.get("Brows", -1)),
                    "eyes": int(data.get("Eyes", -1)),
                    "beard": int(data.get("Beard", -1)),
                    "mouth": int(data.get("Mouth", -1)),
                },
                "healthMultiplier": data.get("HealthMult", 0.0),
                "sourcePathId": int(obj.path_id),
            }
        )
    archetypes.sort(key=lambda item: (item["id"].casefold(), item["id"]))
    relations.sort(key=lambda item: (item["archetypeId"].casefold(), item["skillId"].casefold()))

    previewed_by: dict[str, list[str]] = defaultdict(list)
    for relation in relations:
        previewed_by[relation["skillId"]].append(relation["archetypeId"])

    skills: list[dict[str, Any]] = []
    unresolved_skill_requirements: set[str] = set()
    for obj, data in active_skills_raw:
        skill_id = str(data["Id"])
        localized = localization.get("skills", {}).get(skill_id)
        record = skill_base_fields(obj, data, localized, sprites, enums, "active")
        record["previewedByArchetypes"] = sorted(previewed_by.get(skill_id, []))
        for requirement in record["requirements"]:
            required_id = requirement["skillId"]
            requirement["resolvedConfigKind"] = skill_kind_by_id.get(required_id)
            if required_id and required_id not in skill_kind_by_id:
                unresolved_skill_requirements.add(required_id)
        projectile_value = int(data.get("Projectile", -1))
        damage_type_value = int(data.get("DamageType", 0))
        element_value = int(data.get("Element", 0))
        target_value = int(data.get("TargetType", 0))
        cast_type_value = int(data.get("CastType", 0))
        cast_indicator_value = int(data.get("CastIndicator", 0))
        leap_type_value = int(data.get("LeapType", 0))
        exclusive_type_value = int(data.get("ExclusiveType", 0))
        record.update(
            {
                "assetReferences": {
                    lower_camel(field): asset_reference(data.get(field))
                    for field in ACTIVE_SKILL_ASSET_FIELDS
                },
                "effectRemoveDelay": data.get("EffectRemoveDelay", 0.0),
                "projectile": enum_name(enums, "ECProjectileType", projectile_value),
                "projectileValue": projectile_value,
                "projectileShots": int(data.get("ProjectileShots", 0)),
                "damageDelay": data.get("DamageDelay", 0.0),
                "damageType": enum_name(enums, "DamageType", damage_type_value),
                "damageTypeValue": damage_type_value,
                "element": enum_name(enums, "Element", element_value),
                "elementValue": element_value,
                "targetType": enum_name(enums, "TargetType", target_value),
                "targetTypeValue": target_value,
                "castType": enum_name(enums, "CastType", cast_type_value),
                "castTypeValue": cast_type_value,
                "castIndicator": enum_name(enums, "CastIndicatorShape", cast_indicator_value),
                "castIndicatorValue": cast_indicator_value,
                "range": data.get("Range", 0.0),
                "leapType": enum_name(enums, "LeapType", leap_type_value),
                "leapTypeValue": leap_type_value,
                "exclusiveType": enum_name(enums, "SkillCategory", exclusive_type_value),
                "exclusiveTypeValue": exclusive_type_value,
                "autocastMultiplier": data.get("AutocastMult", 0.0),
                "minimumHealth": data.get("MinimumHealth", 0.0),
                "minimumMana": data.get("MinimumMana", 0.0),
                "toggleStillTime": data.get("ToggleStillTime", 0.0),
                "flags": {
                    lower_camel(field): bool(data.get(field, False))
                    for field in ACTIVE_SKILL_BOOLEAN_FIELDS
                },
                "scaledValues": {
                    lower_camel(field): scaled_value(data.get(field))
                    for field in ACTIVE_SKILL_SCALED_FIELDS
                },
                "events": [
                    {
                        "id": str(value.get("Id", "")),
                        "type": enum_name(enums, "SkillEventType", int(value.get("Type", 0))),
                        "typeValue": int(value.get("Type", 0)),
                    }
                    for value in data.get("Events", [])
                ],
                "statusEffects": [skill_status(value) for value in data.get("StatusEffects", [])],
                "selfStatusEffects": [skill_status(value) for value in data.get("SelfStatusEffects", [])],
                "curedStatusEffects": [scaled_value(value) for value in data.get("CuredStatusEffects", [])],
                "consumedStatusEffects": [scaled_value(value) for value in data.get("ConsumeStatusEffects", [])],
                "drainedStatusEffects": [scaled_value(value) for value in data.get("DrainStatusEffects", [])],
            }
        )
        skills.append(record)
    skills.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    skill_passives: list[dict[str, Any]] = []
    for obj, data in passive_skills_raw:
        skill_id = str(data["Id"])
        localized = localization.get("skillPassives", {}).get(skill_id)
        record = skill_base_fields(obj, data, localized, sprites, enums, "passive")
        record["previewedByArchetypes"] = sorted(previewed_by.get(skill_id, []))
        for requirement in record["requirements"]:
            required_id = requirement["skillId"]
            requirement["resolvedConfigKind"] = skill_kind_by_id.get(required_id)
            if required_id and required_id not in skill_kind_by_id:
                unresolved_skill_requirements.add(required_id)
        passives = [stat_value(value, enums) for value in data.get("Passives", [])]
        record["passives"] = passives
        record["stats"] = passives
        skill_passives.append(record)
    skill_passives.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    artifacts: list[dict[str, Any]] = []
    for obj, data in artifacts_raw:
        artifact_id = str(data["Id"])
        localized = localization.get("artifacts", {}).get(artifact_id)
        record = base_config_fields(obj, data, localized, sprites)
        source_sprites = list(data.get("Sprites", []))
        source_descriptions = [str(value) for value in data.get("Descriptions", [])]
        parts: list[dict[str, Any]] = []
        for index in range(max(len(source_sprites), len(source_descriptions))):
            pointer = source_sprites[index] if index < len(source_sprites) else None
            icon, icon_source = icon_fields(pointer, sprites) if pointer else (None, None)
            runtime_description = source_descriptions[index] if index < len(source_descriptions) else ""
            parts.append(
                {
                    "index": index,
                    "description": localized_value(localized, f"description_{index + 1}", runtime_description),
                    "runtimeDescription": runtime_description,
                    "icon": icon,
                    "iconSource": icon_source,
                }
            )
        full_set = [stat_value(value, enums) for value in data.get("FullSet", [])]
        per_piece = [stat_value(value, enums) for value in data.get("PerPiece", [])]
        per_refine = [stat_value(value, enums) for value in data.get("PerRefine", [])]
        individual = [stat_value(value, enums) for value in data.get("Individual", [])]
        record.update(
            {
                "fullSet": full_set,
                "perPiece": per_piece,
                "perRefine": per_refine,
                "individual": individual,
                "stats": [
                    *({"source": "full-set", **value} for value in full_set),
                    *({"source": "per-piece", **value} for value in per_piece),
                    *({"source": "per-refine", **value} for value in per_refine),
                    *({"source": "individual", **value} for value in individual),
                ],
                "parts": parts,
                "materialId": str(data.get("MaterialId", "")) or None,
            }
        )
        artifacts.append(record)
    artifacts.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    gems: list[dict[str, Any]] = []
    for obj, data in gems_raw:
        gem_id = str(data["Id"])
        localized = localization.get("gems", {}).get(gem_id)
        record = base_config_fields(obj, data, localized, sprites)
        runtime_affix = str(data.get("Affix", ""))
        record.update(
            {
                "dropChance": data.get("DropChance", 0.0),
                "stats": [stat_value(value, enums) for value in data.get("Stats", [])],
                "affix": localized_value(localized, "affix", runtime_affix),
                "runtimeAffix": runtime_affix,
                "isBoss": bool(data.get("IsBoss", False)),
            }
        )
        gems.append(record)
    gems.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    cards: list[dict[str, Any]] = []
    for obj, data in cards_raw:
        card_id = str(data["Id"])
        localized = localization.get("cards", {}).get(card_id)
        record = base_config_fields(obj, data, localized, sprites)
        equip_class_value = int(data.get("EquipClass", 0))
        runtime_affix = str(data.get("Affix", ""))
        record.update(
            {
                "dropChance": data.get("DropChance", 0.0),
                "equipClass": enum_name(enums, "EquipClass", equip_class_value),
                "equipClassValue": equip_class_value,
                "stats": [stat_value(value, enums) for value in data.get("Stats", [])],
                "affix": localized_value(localized, "affix", runtime_affix),
                "runtimeAffix": runtime_affix,
                "unique": bool(data.get("Unique", False)),
                "isBoss": bool(data.get("IsBoss", False)),
            }
        )
        cards.append(record)
    cards.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    statuses: list[dict[str, Any]] = []
    for obj, data in statuses_raw:
        status_id = str(data["Id"])
        localized = localization.get("statuses", {}).get(status_id)
        record = base_config_fields(obj, data, localized, sprites)
        category_value = int(data.get("Category", 0))
        element_value = int(data.get("Element", 0))
        passives = [stat_value(value, enums) for value in data.get("Passives", [])]
        flag_values = [int(value) for value in data.get("Flags", [])]
        record.update(
            {
                "assetReferences": {
                    lower_camel(field): asset_reference(data.get(field))
                    for field in ("Sfx", "EffectDisplay", "EffectApply", "EffectRemove")
                },
                "category": enum_name(enums, "StatusCategory", category_value),
                "categoryValue": category_value,
                "damage": data.get("Damage", 0.0),
                "damagePercent": data.get("DamagePerc", 0.0),
                "element": enum_name(enums, "Element", element_value),
                "elementValue": element_value,
                "maxLevel": int(data.get("MaxLv", 0)),
                "maxStacks": int(data.get("MaxStacks", 0)),
                "cooldown": data.get("Cooldown", 0.0),
                "disableDispell": bool(data.get("DisableDispell", False)),
                "fixedDuration": bool(data.get("FixedDuration", False)),
                "exclusive": str(data.get("Exclusive", "")) or None,
                "passives": passives,
                "stats": passives,
                "flags": [enum_name(enums, "StatusEffectFlag", value) for value in flag_values],
                "flagValues": flag_values,
                "statusEffects": [skill_status(value) for value in data.get("StatusEffects", [])],
                "events": [
                    {
                        "id": str(value.get("Id", "")),
                        "type": enum_name(enums, "SkillEventType", int(value.get("Type", 0))),
                        "typeValue": int(value.get("Type", 0)),
                    }
                    for value in data.get("Events", [])
                ],
            }
        )
        statuses.append(record)
    statuses.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    monster_archetypes: list[dict[str, Any]] = []
    monster_archetype_by_path: dict[int, dict[str, Any]] = {}
    for obj, data in monster_archetypes_raw:
        archetype_id = str(data["Id"])
        move_speed_value = int(data.get("MoveSpeed", 0))
        attack_speed_value = int(data.get("AttackSpeed", 0))
        record = {
            **base_config_fields(obj, data, None, sprites),
            "attributes": {
                "str": data.get("Str", 0.0),
                "vit": data.get("Vit", 0.0),
                "agi": data.get("Agi", 0.0),
                "dex": data.get("Dex", 0.0),
                "int": data.get("Int", 0.0),
                "luk": data.get("Luk", 0.0),
                "def": data.get("Def", 0.0),
                "mdef": data.get("Mdef", 0.0),
            },
            "spawn": data.get("Spawn", 0.0),
            "moveSpeed": enum_name(enums, "Speed", move_speed_value),
            "moveSpeedValue": move_speed_value,
            "attackSpeed": enum_name(enums, "Speed", attack_speed_value),
            "attackSpeedValue": attack_speed_value,
            "ranged": bool(data.get("Ranged", False)),
            "noKnockback": bool(data.get("NoKnockback", False)),
        }
        monster_archetypes.append(record)
        monster_archetype_by_path[int(obj.path_id)] = record
    monster_archetypes.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    monsters: list[dict[str, Any]] = []
    for obj, data in monsters_raw:
        monster_id = str(data["Id"])
        localized = localization.get("monsters", {}).get(monster_id)
        record = base_config_fields(obj, data, localized, sprites)
        archetype_path_id = ptr_path_id(data.get("Archetype"))
        if archetype_path_id not in monster_archetype_by_path:
            raise ValueError(f"MonsterConfig {monster_id} points to missing MonsterArchetypeConfig {archetype_path_id}")
        race_value = int(data.get("Race", 0))
        element_value = int(data.get("Element", 0))
        size_value = int(data.get("Size", 0))
        artifact_slots = [int(value) for value in data.get("ArtifactSlots", [])]
        artifact_drop = loot_entry(data.get("Artifact", {}))
        card_drop = loot_entry(data.get("Card", {}))
        if not artifact_drop["id"]:
            artifact_drop = None
        if not card_drop["id"]:
            card_drop = None
        prefab = data.get("PrefabRef", {})
        record.update(
            {
                "prefabReference": {
                    "assetGuid": str(prefab.get("m_AssetGUID", "")),
                    "subObjectName": str(prefab.get("m_SubObjectName", "")),
                    "subObjectType": str(prefab.get("m_SubObjectType", "")),
                },
                "archetypeId": monster_archetype_by_path[archetype_path_id]["id"],
                "archetypeSourcePathId": archetype_path_id,
                "attackAnimationTimes": list(data.get("AttackAnimationTimes", [])),
                "race": enum_name(enums, "Race", race_value),
                "raceValue": race_value,
                "element": enum_name(enums, "Element", element_value),
                "elementValue": element_value,
                "size": enum_name_or_none(enums, "Size", size_value),
                "sizeValue": size_value,
                "level": int(data.get("Level", 0)),
                "isHostile": bool(data.get("IsHostile", False)),
                "isBoss": bool(data.get("IsBoss", False)),
                "skills": [
                    {
                        "skillId": str(value.get("Id", "")),
                        "level": int(value.get("Level", 0)),
                        "chance": value.get("Chance", 0.0),
                        "castTime": value.get("CastTime", 0.0),
                        "cooldown": value.get("Cooldown", 0.0),
                        "targetHealthCondition": value.get("TargetHealthCondition", 0.0),
                        "targetStatus": str(value.get("TargetStatus", "")) or None,
                        "castType": enum_name(enums, "CastType", int(value.get("CastType", 0))),
                        "castTypeValue": int(value.get("CastType", 0)),
                        "resolvedConfigKind": skill_kind_by_id.get(str(value.get("Id", ""))),
                    }
                    for value in data.get("Skills", [])
                ],
                "drops": {
                    "equipment": [loot_entry(value) for value in data.get("EquipDrops", [])],
                    "materials": [loot_entry(value) for value in data.get("MaterialDrops", [])],
                    "consumables": [loot_entry(value) for value in data.get("ConsumableDrops", [])],
                    "artifact": artifact_drop,
                    "card": card_drop,
                    "gems": [loot_entry(value) for value in data.get("GemDrops", [])],
                    "cosmetics": [loot_entry(value) for value in data.get("CosmeticDrops", [])],
                },
                "artifactSlots": [enum_name(enums, "ArtifactSlot", value) for value in artifact_slots],
                "artifactSlotValues": artifact_slots,
                "materialId": str(data.get("MaterialId", "")) or None,
                "essenceDropRate": data.get("EssenceDropRate", 0.0),
            }
        )
        monsters.append(record)
    monsters.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    weapons: list[dict[str, Any]] = []
    for obj, data in weapons_raw:
        weapon_id = str(data.get("m_Name", data.get("DisplayName", "")))
        archetype_values = [int(value) for value in data.get("Archetypes", [])]
        weapons.append(
            {
                "id": weapon_id,
                "displayName": str(data.get("DisplayName", weapon_id)),
                "attackDelay": data.get("AttackDelay", 0.0),
                "projectileValue": int(data.get("Projectile", -1)),
                "allowedArchetypes": [enum_name(enums, "Archetype", value) for value in archetype_values],
                "allowedArchetypeValues": archetype_values,
                "statScalings": list(data.get("StatScalings", [])),
                "attackAnimationTimes": list(data.get("AttackAnimationTimes", [])),
                "sourcePathId": int(obj.path_id),
            }
        )
    weapons.sort(key=lambda item: (item["id"].casefold(), item["id"]))

    runtime_ids_by_section = {
        "equipment": equipment_ids,
        "skills": {item["id"] for item in skills},
        "skillPassives": {item["id"] for item in skill_passives},
        "artifacts": {item["id"] for item in artifacts},
        "gems": {item["id"] for item in gems},
        "cards": {item["id"] for item in cards},
        "monsters": {item["id"] for item in monsters},
        "statuses": {item["id"] for item in statuses},
    }
    source_counts_by_section = {
        "equipment": len(equipment_raw),
        "skills": len(active_skills_raw),
        "skillPassives": len(passive_skills_raw),
        "artifacts": len(artifacts_raw),
        "gems": len(gems_raw),
        "cards": len(cards_raw),
        "monsters": len(monsters_raw),
        "statuses": len(statuses_raw),
    }
    for section, ids in runtime_ids_by_section.items():
        if len(ids) != source_counts_by_section[section]:
            raise ValueError(f"{section} runtime IDs are not unique")

    localized_section_names = {
        "equipment": "equips",
        "skills": "skills",
        "skillPassives": "skillPassives",
        "artifacts": "artifacts",
        "gems": "gems",
        "cards": "cards",
        "monsters": "monsters",
        "statuses": "statuses",
    }
    localization_coverage = {
        section: localization_comparison(ids, set(localization.get(localized_section_names[section], {})))
        for section, ids in runtime_ids_by_section.items()
    }

    equipment_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in equipment_raw]
    archetype_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in archetypes_raw]
    archetype_fallback_icon_refs = [
        ptr_path_id(data.get("Sprite"))
        for _, data in archetype_npc_icon_fallbacks.values()
    ]
    active_skill_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in active_skills_raw]
    passive_skill_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in passive_skills_raw]
    artifact_main_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in artifacts_raw]
    artifact_part_icon_refs = [ptr_path_id(pointer) for _, data in artifacts_raw for pointer in data.get("Sprites", [])]
    gem_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in gems_raw]
    card_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in cards_raw]
    monster_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in monsters_raw]
    status_icon_refs = [ptr_path_id(data.get("Sprite")) for _, data in statuses_raw]

    status_ids = runtime_ids_by_section["statuses"]
    skill_status_refs = [
        status["id"]
        for skill in skills
        for field in ("statusEffects", "selfStatusEffects")
        for status in skill[field]
        if status["id"]
    ]
    nested_status_refs = [
        status["id"]
        for parent in statuses
        for status in parent["statusEffects"]
        if status["id"]
    ]
    monster_skill_refs = [skill["skillId"] for monster in monsters for skill in monster["skills"] if skill["skillId"]]
    equipment_drop_refs = [drop["id"] for monster in monsters for drop in monster["drops"]["equipment"] if drop["id"]]
    artifact_drop_refs = [monster["drops"]["artifact"]["id"] for monster in monsters if monster["drops"]["artifact"]]
    card_drop_refs = [monster["drops"]["card"]["id"] for monster in monsters if monster["drops"]["card"]]
    gem_drop_refs = [drop["id"] for monster in monsters for drop in monster["drops"]["gems"] if drop["id"]]
    addressable_settings_data = json.loads(addressables_settings.read_text(encoding="utf-8")) if addressables_settings.exists() else {}

    source_files = [
        source_file(sharedassets, "SpiritVale_Data/sharedassets0.assets"),
        source_file(global_scripts, "SpiritVale_Data/globalgamemanagers.assets"),
        source_file(game_assembly, "GameAssembly.dll"),
        source_file(metadata, "SpiritVale_Data/il2cpp_data/Metadata/global-metadata.dat"),
    ]
    if addressables_settings.exists():
        source_files.append(source_file(addressables_settings, "SpiritVale_Data/StreamingAssets/aa/settings.json"))
    if addressables_hash.exists():
        source_files.append(source_file(addressables_hash, "SpiritVale_Data/StreamingAssets/aa/catalog.hash"))

    result = {
        "meta": {
            "schemaVersion": 2,
            "game": "SpiritVale",
            "steamAppId": (game_root / "steam_appid.txt").read_text(encoding="utf-8").strip() if (game_root / "steam_appid.txt").exists() else None,
            "gameVersion": None,
            "unityVersion": unity_version,
            "addressablesVersion": addressable_settings_data.get("m_AddressablesVersion"),
            "addressablesSettingsHash": addressable_settings_data.get("m_SettingsHash"),
            "addressablesCatalogHash": addressables_hash.read_text(encoding="utf-8").strip() if addressables_hash.exists() else None,
            "source": "Local Unity IL2CPP runtime configuration",
            "sourceFiles": source_files,
            "enumEvidence": enums.get("meta", {}),
            "localizedCatalogEvidence": localization_meta,
            "rarityModel": {
                "baseEquipmentField": None,
                "itemRarityEnum": enums["enums"].get("ItemRarity", []),
                "note": "EquipConfig has no ItemRarity field; this base catalog does not assign rarity.",
            },
            "sourceBoundaries": {
                "equipmentSlots": {
                    "serializedType": "int",
                    "meaning": None,
                    "note": "EquipConfig declares Slots as an int and no serialized enum or field annotation establishes its semantics.",
                },
                "archetypeAttributes": {
                    "serializedType": "Int32[6]",
                    "indexNames": None,
                    "note": "ArchetypeConfig declares only an integer array; no serialized index enum was found, so values remain positional.",
                },
                "computedProperties": {
                    "omitted": ["BaseSkillConfig.AutocastLv", "GemConfig.IsObtainable", "CardConfig.IsObtainable", "MonsterConfig.HasArtifact", "MonsterConfig.HasCard"],
                    "note": "These are runtime getters, not serialized source fields.",
                },
                "artifactParts": {
                    "slotNames": None,
                    "note": "ArtifactSetConfig serializes parallel Sprites and Descriptions lists but no per-entry ArtifactSlot value.",
                },
                "monsterConfigTypeTree": {
                    "patchedField": "AssetReferenceT<GameObject> PrefabRef",
                    "serializedMembers": ["m_AssetGUID", "m_SubObjectName", "m_SubObjectType"],
                    "note": "The IL2CPP generator omitted this generic Addressables field; its three declared serialized strings were inserted before full-byte validation.",
                },
            },
            "coverage": {
                "equipment": {
                    "objects": len(equipment_raw),
                    "parsed": len(equipment),
                    "uniqueIds": len(equipment_ids),
                    "iconReferences": sum(bool(value) for value in equipment_icon_refs),
                    "iconReferencesDecoded": sum(value in sprites for value in equipment_icon_refs if value),
                    "uniqueSpriteReferences": len(set(equipment_icon_refs) - {0}),
                    "primaryStatItems": sum(bool(item["primaryStats"]) for item in equipment),
                    "primaryStatEntries": sum(len(item["primaryStats"]) for item in equipment),
                    "secondaryStatItems": sum(bool(item["secondaryStats"]) for item in equipment),
                    "secondaryStatEntries": sum(len(item["secondaryStats"]) for item in equipment),
                    "setMembershipItems": sum(bool(item["setId"]) for item in equipment),
                    "substatPoolItems": sum(bool(item["substatPoolId"]) for item in equipment),
                    "archetypeRestrictedItems": sum(item["hasArchetypeRestriction"] for item in equipment),
                    "rarityFieldItems": 0,
                },
                "equipmentSets": {
                    "objects": len(sets_raw),
                    "parsed": len(equipment_sets),
                    "memberReferences": member_ref_count,
                    "memberReferencesResolved": member_ref_count,
                    "fullSetStatEntries": sum(len(item["fullSet"]) for item in equipment_sets),
                },
                "substatPools": {
                    "objects": len(substats_raw),
                    "parsed": len(substat_pools),
                    "groups": sum(len(item["groups"]) for item in substat_pools),
                    "statEntries": sum(len(group["stats"]) for item in substat_pools for group in item["groups"]),
                },
                "archetypes": {
                    "objects": len(archetypes_raw),
                    "parsed": len(archetypes),
                    "iconReferences": sum(bool(value) for value in archetype_icon_refs),
                    "iconReferencesDecoded": sum(value in sprites for value in archetype_icon_refs if value),
                    "explicitNullIcons": sum(not value for value in archetype_icon_refs),
                    "fallbackIconReferences": len(archetype_fallback_icon_refs),
                    "fallbackIconReferencesDecoded": sum(value in sprites for value in archetype_fallback_icon_refs),
                    "fallbackIconsByBasis": {"npc-config-same-id": len(archetype_npc_icon_fallbacks)},
                    "previewSkillRelations": len(relations),
                },
                "skills": {
                    "objects": len(active_skills_raw),
                    "parsed": len(skills),
                    "uniqueIds": len(active_skill_ids),
                    "iconReferences": sum(bool(value) for value in active_skill_icon_refs),
                    "iconReferencesDecoded": sum(value in sprites for value in active_skill_icon_refs if value),
                    "explicitNullIcons": sum(not value for value in active_skill_icon_refs),
                    "requirements": sum(len(item["requirements"]) for item in skills),
                    "unresolvedRequirementIds": sorted(unresolved_skill_requirements),
                    "events": sum(len(item["events"]) for item in skills),
                    "statusReferences": len(skill_status_refs),
                    "statusReferencesResolved": sum(value in status_ids for value in skill_status_refs),
                    "unresolvedStatusIds": sorted(set(skill_status_refs) - status_ids),
                },
                "skillPassives": {
                    "objects": len(passive_skills_raw),
                    "parsed": len(skill_passives),
                    "uniqueIds": len(passive_skill_ids),
                    "iconReferences": sum(bool(value) for value in passive_skill_icon_refs),
                    "iconReferencesDecoded": sum(value in sprites for value in passive_skill_icon_refs if value),
                    "explicitNullIcons": sum(not value for value in passive_skill_icon_refs),
                    "requirements": sum(len(item["requirements"]) for item in skill_passives),
                    "passiveStatEntries": sum(len(item["passives"]) for item in skill_passives),
                },
                "artifacts": {
                    "objects": len(artifacts_raw),
                    "parsed": len(artifacts),
                    "mainIconReferences": sum(bool(value) for value in artifact_main_icon_refs),
                    "partIconReferences": sum(bool(value) for value in artifact_part_icon_refs),
                    "partIconReferencesDecoded": sum(value in sprites for value in artifact_part_icon_refs if value),
                    "parts": sum(len(item["parts"]) for item in artifacts),
                    "fullSetStatEntries": sum(len(item["fullSet"]) for item in artifacts),
                    "perPieceStatEntries": sum(len(item["perPiece"]) for item in artifacts),
                    "perRefineStatEntries": sum(len(item["perRefine"]) for item in artifacts),
                    "individualStatEntries": sum(len(item["individual"]) for item in artifacts),
                },
                "gems": {
                    "objects": len(gems_raw),
                    "parsed": len(gems),
                    "iconReferences": sum(bool(value) for value in gem_icon_refs),
                    "iconReferencesDecoded": sum(value in sprites for value in gem_icon_refs if value),
                    "statEntries": sum(len(item["stats"]) for item in gems),
                    "bossItems": sum(item["isBoss"] for item in gems),
                },
                "cards": {
                    "objects": len(cards_raw),
                    "parsed": len(cards),
                    "iconReferences": sum(bool(value) for value in card_icon_refs),
                    "iconReferencesDecoded": sum(value in sprites for value in card_icon_refs if value),
                    "statEntries": sum(len(item["stats"]) for item in cards),
                    "uniqueItems": sum(item["unique"] for item in cards),
                    "bossItems": sum(item["isBoss"] for item in cards),
                },
                "monsterArchetypes": {
                    "objects": len(monster_archetypes_raw),
                    "parsed": len(monster_archetypes),
                    "referencesFromMonsters": len(monsters),
                    "referencesResolved": sum(monster["archetypeId"] in {item["id"] for item in monster_archetypes} for monster in monsters),
                },
                "monsters": {
                    "objects": len(monsters_raw),
                    "parsed": len(monsters),
                    "iconReferences": sum(bool(value) for value in monster_icon_refs),
                    "iconReferencesDecoded": sum(value in sprites for value in monster_icon_refs if value),
                    "explicitNullIcons": sum(not value for value in monster_icon_refs),
                    "valuesOutsideSizeEnum": sorted({monster["sizeValue"] for monster in monsters if monster["size"] is None}),
                    "recordsOutsideSizeEnum": [monster["id"] for monster in monsters if monster["size"] is None],
                    "skillReferences": len(monster_skill_refs),
                    "skillReferencesResolved": sum(value in skill_kind_by_id for value in monster_skill_refs),
                    "unresolvedSkillIds": sorted(set(monster_skill_refs) - set(skill_kind_by_id)),
                    "equipmentDropReferences": len(equipment_drop_refs),
                    "equipmentDropReferencesResolved": sum(value in equipment_ids for value in equipment_drop_refs),
                    "unresolvedEquipmentDropIds": sorted(set(equipment_drop_refs) - equipment_ids),
                    "artifactDropReferences": len(artifact_drop_refs),
                    "artifactDropReferencesResolved": sum(value in runtime_ids_by_section["artifacts"] for value in artifact_drop_refs),
                    "unresolvedArtifactDropIds": sorted(set(artifact_drop_refs) - runtime_ids_by_section["artifacts"]),
                    "cardDropReferences": len(card_drop_refs),
                    "cardDropReferencesResolved": sum(value in runtime_ids_by_section["cards"] for value in card_drop_refs),
                    "unresolvedCardDropIds": sorted(set(card_drop_refs) - runtime_ids_by_section["cards"]),
                    "gemDropReferences": len(gem_drop_refs),
                    "gemDropReferencesResolved": sum(value in runtime_ids_by_section["gems"] for value in gem_drop_refs),
                    "unresolvedGemDropIds": sorted(set(gem_drop_refs) - runtime_ids_by_section["gems"]),
                },
                "statuses": {
                    "objects": len(statuses_raw),
                    "parsed": len(statuses),
                    "iconReferences": sum(bool(value) for value in status_icon_refs),
                    "iconReferencesDecoded": sum(value in sprites for value in status_icon_refs if value),
                    "explicitNullIcons": sum(not value for value in status_icon_refs),
                    "passiveStatEntries": sum(len(item["passives"]) for item in statuses),
                    "flagEntries": sum(len(item["flags"]) for item in statuses),
                    "nestedStatusReferences": len(nested_status_refs),
                    "nestedStatusReferencesResolved": sum(value in status_ids for value in nested_status_refs),
                    "unresolvedNestedStatusIds": sorted(set(nested_status_refs) - status_ids),
                    "events": sum(len(item["events"]) for item in statuses),
                },
                "weapons": {"objects": len(weapons_raw), "parsed": len(weapons)},
                "localizationComparison": localization_coverage,
                "sprites": {
                    "uniqueReferences": len(sprite_refs),
                    "decoded": len(sprites),
                    "exported": 0 if args.no_assets else len(sprites),
                    "maxExportDimension": args.asset_max_size,
                },
            },
        },
        "enums": enums["enums"],
        "equipment": equipment,
        "equipmentSets": equipment_sets,
        "substatPools": substat_pools,
        "archetypes": archetypes,
        "archetypeSkillRelations": relations,
        "skills": skills,
        "skillPassives": skill_passives,
        "artifacts": artifacts,
        "gems": gems,
        "cards": cards,
        "monsterArchetypes": monster_archetypes,
        "monsters": monsters,
        "statuses": statuses,
        "weapons": weapons,
        "sprites": {str(path_id): value for path_id, value in sorted(sprites.items())},
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["meta"]["coverage"], ensure_ascii=False, indent=2))
    print(f"Wrote {args.output}")
    if not args.no_assets:
        print(f"Wrote {len(sprites)} PNGs to {args.asset_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
