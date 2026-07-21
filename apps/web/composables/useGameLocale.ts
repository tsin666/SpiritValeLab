import type { LocalizedText } from '~/composables/useApi'

export function useGameLocale() {
  const { locale, t, te } = useI18n()
  const gameLocale = computed<'zh' | 'en'>(() => locale.value.startsWith('en') ? 'en' : 'zh')

  const labelAliases: Record<string, Record<string, string>> = {
    slots: {
      mainhand: 'mainHand', offhand: 'offHand', head: 'head', chest: 'chest', hands: 'hands', legs: 'legs', feet: 'feet',
      accessory: 'accessory', eyewear: 'eyewear', back: 'back', classitem: 'classItem'
    },
    types: {
      head: 'head', back: 'back', grimoire: 'grimoire', accessory: 'accessory', eyewear: 'eyewear', chest: 'chest',
      feet: 'feet', legs: 'legs', wand: 'wand', dagger: 'dagger', shield: 'shield', sword: 'sword', mace: 'mace',
      axe: 'axe', spear: 'spear', bow: 'bow', book: 'book', scythe: 'scythe', pistol: 'pistol', rifle: 'rifle',
      shotgun: 'shotgun', twinblade: 'twinblade', instrument: 'instrument', katar: 'katar', gatlinggun: 'gatlingGun',
      launcher: 'launcher'
    },
    elements: {
      neutral: 'neutral', holy: 'holy', shadow: 'shadow', wind: 'wind', undead: 'undead', water: 'water', fire: 'fire', earth: 'earth'
    },
    categories: {
      weapon: 'weapon', offhand: 'offHand', armor: 'armor', accessory: 'accessory', classitem: 'classItem', utility: 'utility', other: 'other'
    },
    stats: {
      def: 'def', mdef: 'mdef', atk: 'atk', matk: 'matk', grantskill: 'grantSkill', weightlimit: 'weightLimit',
      skilldamage: 'skillDamage', hpmult: 'hpMult', mpmult: 'mpMult', block: 'block', range: 'range', movespd: 'moveSpd',
      atkspd: 'atkSpd', castspd: 'castSpd', mpregenmult: 'mpRegenMult', hpregenmult: 'hpRegenMult',
      doubleattack: 'doubleAttack', flee: 'flee', skillcooldown: 'skillCooldown', autocastattack: 'autocastAttack',
      autocasthit: 'autocastHit', critdamage: 'critDamage', damageelement: 'damageElement', atkmult: 'atkMult', crit: 'crit',
      matkperstr: 'matkPerStr', matkmult: 'matkMult', int: 'int', str: 'str', healing: 'healing', elementresist: 'elementResist',
      dex: 'dex', vit: 'vit', damagetoelement: 'damageToElement', damagefromelement: 'damageFromElement', skilllevel: 'skillLevel',
      chain: 'chain', defpierce: 'defPierce', leech: 'leech', allstats: 'allStats', damageranged: 'damageRanged', agi: 'agi',
      mp: 'mp', skillarea: 'skillArea', statusimmune: 'statusImmune', healingreceived: 'healingReceived', hp: 'hp', luk: 'luk',
      skillcasttime: 'skillCastTime', buffduration: 'buffDuration'
    }
  }

  function humanize(value?: string | null) {
    if (!value) return ''
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, letter => letter.toUpperCase())
  }

  function gameLabel(group: keyof typeof labelAliases, value?: string | null) {
    if (!value) return ''
    const normalized = value.replace(/[^a-z0-9]/gi, '').toLowerCase()
    const alias = labelAliases[group]?.[normalized]
    const key = alias ? `game.${group}.${alias}` : ''
    return key && te(key) ? t(key) : humanize(value)
  }

  function gameText(value?: string | LocalizedText | null, fallback = '') {
    if (!value) return fallback
    if (typeof value === 'string') return value || fallback
    return value[gameLocale.value] || value.zh || value.en || fallback
  }

  function difficultyText(value?: string | null) {
    if (!value) return ''
    const key: Record<string, string> = {
      '入门': 'builder.beginner', beginner: 'builder.beginner',
      '进阶': 'builder.intermediate', intermediate: 'builder.intermediate',
      '专家': 'builder.expert', expert: 'builder.expert'
    }
    return key[value.toLowerCase()] ? t(key[value.toLowerCase()]) : value
  }

  const slotText = (value?: string | null) => gameLabel('slots', value)
  const typeText = (value?: string | null) => gameLabel('types', value)
  const elementText = (value?: string | null) => gameLabel('elements', value)
  const categoryText = (value?: string | null) => gameLabel('categories', value)
  const statText = (value?: string | null) => gameLabel('stats', value)

  return { gameLocale, gameText, difficultyText, humanize, gameLabel, slotText, typeText, elementText, categoryText, statText }
}
