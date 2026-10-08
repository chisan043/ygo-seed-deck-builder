// Shared by the browser and the data updater: one set of preferred names and artwork.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YGOTrendSupport = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
const trendNameMaps = {
  zh: {
    "Sacred Beast": "三幻魔",
    "Kewl Tune": "杀手旋律",
    "Dracotail": "星宿",
    "Enneacraft": "纠罪巧",
    "Radiant Typhoon": "绚岚",
    "Radiant Typhoon Zoodiac": "绚岚十二兽",
    "Elfnote": "耀圣",
    "Lunalight": "月光",
    "Toon": "卡通",
    "Light and Darkness Ritual": "光暗仪式",
    "Chaos Ritual": "混沌仪式",
    DoomZ: "终刻",
    Darklord: "堕天使",
    "Ancient Gear": "古代机械",
    HERO: "英雄",
    "Dark Magician Yummy": "黑魔导黯蜜",
    "Magistus Fairy Tail": "魔导兽童话",
    "Fairy Tail": "妖精传姬",
    "Thunder Dragon": "雷龙",
    Ecclesia: "艾克利西亚",
    Bystial: "深渊之兽",
    Magistus: "伟魔",
    Exosister: "驱魔姐妹",
    Dogmatika: "教导",
    "The Fallen & The Virtuous": "落胤与圣女",
    "Sphere Mode": "太阳神之翼神龙-球体形",
    "DMG": "黑魔术少女",
    "DMG Shining Sarc": "黑魔术少女光之黄金柜",
    "Shining Sarc": "光之黄金柜",
    "Shining Sarcophagus": "光之黄金柜",
    "Dragoon": "真红眼龙骑兵",
    "Fire King": "炎王",
    "Power Patron": "狱神",
    "Memento": "冥铭途",
    Mitsurugi: "巳剑",
    "Yummy": "黯蜜",
    "Yummy Engine": "黯蜜组件",
    "Snake-Eye Yummy": "蛇眼黯蜜",
    Maliss: "码丽丝",
    "White Forest": "白森林",
    Blitzclique: "雷盟",
    "Ryu-Ge": "龙华",
    Ryzeal: "莱泽奥尔",
    Mermail: "水精鳞",
    Atlantean: "海皇",
    "Goblin Biker": "百鬼罗刹",
    "Tenpai Dragon": "天杯龙",
    "Centur-Ion": "百夫长骑士",
    Fiendsmith: "刻魔",
    "Fiendsmith Control": "刻魔控制",
    Orcust: "自奏圣乐",
    "Orcust Engine": "自奏圣乐组件",
    Horus: "荷鲁斯",
    "Dragon Link": "龙链接",
    "Armed Dragon": "武装龙",
    "Magnet Warrior": "磁石战士",
    Artmage: "艺魔",
    Odion: "利希德",
    HEROs: "英雄",
    "Blue-Eyes": "青眼",
    "Dark Magician": "黑魔导",
    "Sky Striker": "闪刀姬",
    Branded: "烙印",
    Despia: "死狱乡",
    Tearlaments: "泪冠哀歌",
    Labrynth: "白银城",
    Swordsoul: "相剑",
    "Snake-Eye": "蛇眼",
    "Vanquish Soul": "对击斗魂",
    "Vanquish Soul K9": "对击斗魂K9",
    K9: "K9",
    Zoodiac: "十二兽",
  },
  ja: {
    "Kewl Tune": "キラーチューン",
    "Dracotail": "星辰",
    "Enneacraft": "糾罪巧",
    "Radiant Typhoon": "絢嵐",
    "Radiant Typhoon Zoodiac": "絢嵐十二獣",
    "Elfnote": "耀聖詩",
    "Lunalight": "月光",
    "Toon": "トゥーン",
    "Light and Darkness Ritual": "光と闇の竜儀式",
    "Chaos Ritual": "カオス儀式",
    DoomZ: "終刻",
    Darklord: "堕天使",
    "Ancient Gear": "古代の機械",
    HERO: "ヒーロー",
    "Dark Magician Yummy": "ブラック・マジシャン ヤミー",
    "Magistus Fairy Tail": "マギストス フェアリーテイル",
    "Fairy Tail": "妖精伝姫",
    Magistus: "マギストス",
    Exosister: "エクソシスター",
    "Fire King": "炎王",
    "Power Patron": "獄神",
    "Memento": "メメント",
    Mitsurugi: "巳剣",
    "Yummy": "ヤミー",
    "Yummy Engine": "ヤミーエンジン",
    "Snake-Eye Yummy": "スネークアイ ヤミー",
    Maliss: "Ｍ∀ＬＩＣＥ",
    "White Forest": "白き森",
    Blitzclique: "雷盟",
    "Ryu-Ge": "竜華",
    Ryzeal: "ライゼオル",
    Mermail: "水精鱗",
    Atlantean: "海皇",
    "Goblin Biker": "百鬼羅刹",
    "Tenpai Dragon": "天盃龍",
    "Centur-Ion": "センチュリオン",
    Fiendsmith: "デモンスミス",
    "Fiendsmith Control": "デモンスミス コントロール",
    Orcust: "オルフェゴール",
    "Orcust Engine": "オルフェゴールエンジン",
    Horus: "ホルス",
    "Dragon Link": "ドラゴンリンク",
    "Armed Dragon": "アームド・ドラゴン",
    "Magnet Warrior": "磁石の戦士",
    Artmage: "アートメイジ",
    Odion: "リシド",
    HEROs: "ヒーロー",
    "Blue-Eyes": "ブルーアイズ",
    "Dark Magician": "ブラック・マジシャン",
    "Sky Striker": "閃刀姫",
    Branded: "烙印",
    Despia: "デスピア",
    Tearlaments: "ティアラメンツ",
    Labrynth: "ラビュリンス",
    Swordsoul: "相剣",
    "Snake-Eye": "スネークアイ",
    "Vanquish Soul": "ヴァンキッシュ・ソウル",
    "Vanquish Soul K9": "ヴァンキッシュ・ソウル K9",
    K9: "K9",
    Zoodiac: "十二獣",
  },
};

const TREND_REPRESENTATIVE_CARD_IDS = {
  "Kewl Tune": 17209452,
  Branded: 44362883,
  "Sky Striker": 26077387,
  "Blue-Eyes": 89631139,
  "Dark Magician": 46986414,
  Toon: 27699122,
  Lunalight: 35618217,
  Dracotail: 33760966,
  Enneacraft: 92171126,
  "Radiant Typhoon": 25940932,
  "Radiant Typhoon Zoodiac": 25940932,
  Elfnote: 85976588,
  "Power Patron": 23829452,
  Memento: 54550967,
  DoomZ: 31010081,
  Mitsurugi: 13332685,
  Yummy: 86762958,
  Maliss: 69272449,
  "White Forest": 24143864,
  Despia: 62962630,
  Tearlaments: 92731385,
  Labrynth: 81497285,
  Swordsoul: 20001443,
  "Snake-Eye": 9674034,
  "Vanquish Soul": 29280200,
  "Vanquish Soul K9": 92248362,
  K9: 92248362,
  "Light and Darkness Ritual": 19652159,
  "Chaos Ritual": 54484652,
  Witchcrafter: 21522601,
  Unchained: 67680512,
};
  function key(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  }
  function entryFor(name, catalog) {
    const normalized = key(name);
    const entries = catalog?.entries || {};
    // Only remove a plural suffix when a known singular exists; never guess a new series.
    return entries[normalized] || entries[catalog?.aliases?.[normalized]]
      || (normalized.endsWith("s") ? entries[normalized.slice(0, -1)] : null) || null;
  }
  function components(name, catalog) {
    const words = String(name || "").replace(/[+／/]/g, " ").trim().split(/\s+/).filter(Boolean);
    const result = [];
    for (let index = 0; index < words.length;) {
      let found;
      for (let end = words.length; end > index; end--) {
        const entry = entryFor(words.slice(index, end).join(" "), catalog);
        if (entry) { found = { entry, end }; break; }
      }
      if (!found) return [];
      result.push(found.entry);
      index = found.end;
    }
    return result;
  }
  function labelFor(name, language, catalog) {
    if (language === "en") return name;
    const direct = entryFor(name, catalog);
    if (direct?.labels?.[language]) return direct.labels[language];
    const parts = components(name, catalog);
    if (parts.length && parts.every(entry => entry.labels?.[language])) {
      return parts.map(entry => entry.labels[language]).join(language === "zh" ? "" : " ");
    }
    return "";
  }
  function inferLabel(names) {
    const clean = [...new Set(names.filter(Boolean).map(name => String(name).normalize("NFKC")))];
    if (clean.length < 3) return "";
    const candidates = new Map();
    for (const name of clean) {
      const seen = new Set();
      for (const run of name.match(/[\u3400-\u9fff]+/gu) || []) {
        for (let length = 2; length <= Math.min(run.length, 12); length++) {
          for (let start = 0; start <= run.length - length; start++) seen.add(run.slice(start, start + length));
        }
      }
      for (const candidate of seen) candidates.set(candidate, (candidates.get(candidate) || 0) + 1);
    }
    // Require agreement across several distinct cards, including suffix families such as Resonator.
    return [...candidates].filter(([name, count]) => count >= Math.max(3, Math.ceil(clean.length * 0.6))
      && !["怪兽", "魔法", "陷阱", "召唤", "效果", "混沌"].includes(name))
      .sort((a, b) => b[0].length - a[0].length || b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]?.replace(/^[之的]|[之的]$/gu, "") || "";
  }
  return { names: trendNameMaps, representativeIds: TREND_REPRESENTATIVE_CARD_IDS, key, entryFor, components, labelFor, inferLabel };
});
