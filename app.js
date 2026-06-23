const API_BASE = "https://db.ygoprodeck.com/api/v7";
const CAN_USE_LOCAL_API = ["http:", "https:"].includes(location.protocol)
  && new URLSearchParams(location.search).get("api") === "1";
const IS_STATIC_FILE = location.protocol === "file:";
const CARDINFO_URL = CAN_USE_LOCAL_API ? "/api/cardinfo" : `${API_BASE}/cardinfo.php?misc=yes`;
const ALIAS_DATA_URL = "data/multilang-aliases.json";
const ALIAS_SEARCH_URL = "data/multilang-search-index.json";
const MASTER_DUEL_LOCALE_URL = "data/master-duel-search-index.json";
const LOCALE_SUBSET_URL = "/api/card-locales";
const OFFICIAL_LOCALE_SUBSET_URL = "/api/official-card-locales";
const MASTER_DUEL_LOCALE_SUBSET_URL = "/api/master-duel-card-locales";
const PACK_SUBSET_URL = "/api/card-packs";
const LIMIT_REGULATION_API = "/api/limit-regulation";
const TREND_COLORS = ["#0b7767", "#c88a2c", "#2f6f9f", "#8b5a9d", "#6f8d3d", "#b65c4a", "#4b6f83", "#8d7b43", "#a84d73", "#507b54"];
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
const GENERIC_REPRESENTATIVE_NAME_PARTS = [
  "maxx c",
  "ash blossom",
  "infinite impermanence",
  "effect veiler",
  "droll lock bird",
  "ghost belle",
  "ghost mourner",
  "ghost ogre",
  "nibiru",
  "dimension shifter",
  "called by the grave",
  "crossout designator",
  "forbidden droplet",
  "super polymerization",
  "harpie's feather duster",
  "raigeki",
  "pot of prosperity",
  "pot of desires",
];
const VALID_STYLES = new Set(["competitive", "ai"]);
const VALID_FORMATS = new Set(["tcg", "ocg", "md"]);
const LIMIT_DISPLAY_ORDER = ["semi-limited", "limited", "forbidden"];
const OFFLINE_SCRIPT_VERSION = "20260623-weekly-builds";
const PUBLIC_DECK_SEARCH_LIMIT = 240;
const RECENT_PUBLIC_DECK_DAYS = 7;
const IMAGE_PRELOAD_BATCH_SIZE = 120;
const storedStyle = localStorage.getItem("deckBuilderActiveStyle");
const storedFormat = localStorage.getItem("deckBuilderActiveFormat");
const storedPage = localStorage.getItem("deckBuilderActivePage");

const state = {
  allCards: [],
  aliasData: null,
  aliasSearchData: null,
  masterDuelLocaleData: null,
  masterDuelLocaleById: new Map(),
  inferredArchetypeLocales: { zh: {} },
  untranslatedDeckNames: new Set(),
  masterDuelLocaleFullIds: new Set(),
  localeIds: new Set(),
  localeById: new Map(),
  packIds: new Set(),
  packRowsById: new Map(),
  cardByAnyId: new Map(),
  limitPanelCards: {},
  metaSamples: window.YGO_META_SAMPLES || { samples: [] },
  metaRefreshState: null,
  lastDeckSearchCache: null,
  forceDeckSearchRefresh: false,
  formatTrends: {},
  formatPowerRankings: {},
  limitRegulations: {},
  searchIndex: [],
  lastDeck: null,
  currentSeed: null,
  activeSearchArchetype: "",
  activeSearchLabel: "",
  deckVariants: [],
  activeStyle: VALID_STYLES.has(storedStyle) ? storedStyle : "competitive",
  activeFormat: VALID_FORMATS.has(storedFormat) ? storedFormat : "md",
  activePage: storedPage === "banlist" ? "banlist" : "builder",
  activeLimitFilter: "all",
  activeLimitView: localStorage.getItem("deckBuilderLimitView") === "cards" ? "cards" : "list",
  activeDeckView: localStorage.getItem("deckBuilderDeckView") === "cards" ? "cards" : "list",
  selectedLimitCardId: null,
  activeVariantId: null,
  selectedDetail: null,
  viewMode: "empty",
  language: localStorage.getItem("deckBuilderLanguage") || "zh",
};

let masterDuelLocalePromise = null;
const offlineScriptPromises = new Map();
let imagePreloadTimer = null;
let lastImagePreloadKey = "";

function ensureOfflineScript(src, globalName) {
  if (!src || (globalName && window[globalName])) return Promise.resolve();
  if (offlineScriptPromises.has(src)) return offlineScriptPromises.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${src}?v=${OFFLINE_SCRIPT_VERSION}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`offline cache missing: ${src}`));
    document.head.appendChild(script);
  });
  offlineScriptPromises.set(src, promise);
  return promise;
}

const stapleMain = [
  ["Ash Blossom & Joyous Spring", 3, "stapleAsh"],
  ["Infinite Impermanence", 3, "stapleImperm"],
  ["Effect Veiler", 2, "stapleVeiler"],
  ["Nibiru, the Primal Being", 1, "stapleNibiru"],
  ["Called by the Grave", 1, "stapleCalledBy"],
  ["Crossout Designator", 1, "stapleCrossout"],
  ["Triple Tactics Talent", 2, "stapleTalent"],
  ["Harpie's Feather Duster", 1, "stapleDuster"],
  ["Lightning Storm", 2, "stapleStorm"],
  ["Forbidden Droplet", 2, "stapleDroplet"],
];

const extraStaples = [
  ["S:P Little Knight", 1, "extraLittleKnight"],
  ["I:P Masquerena", 1, "extraMasquerena"],
  ["Knightmare Phoenix", 1, "extraPhoenix"],
  ["Knightmare Unicorn", 1, "extraUnicorn"],
  ["Accesscode Talker", 1, "extraAccesscode"],
  ["Underworld Goddess of the Closed World", 1, "extraGoddess"],
];

const aiProfiles = [
  {
    id: "ai-balanced",
    titleKey: "aiProfileBalanced",
    descKey: "aiProfileBalancedDesc",
    engineSize: 30,
    samplePickLimit: 18,
    staplePool: "balanced",
  },
  {
    id: "ai-engine",
    titleKey: "aiProfileEngine",
    descKey: "aiProfileEngineDesc",
    engineSize: 34,
    samplePickLimit: 22,
    staplePool: "lean",
  },
  {
    id: "ai-going-second",
    titleKey: "aiProfileGoingSecond",
    descKey: "aiProfileGoingSecondDesc",
    engineSize: 26,
    samplePickLimit: 14,
    staplePool: "goingSecond",
  },
  {
    id: "ai-control",
    titleKey: "aiProfileControl",
    descKey: "aiProfileControlDesc",
    engineSize: 27,
    samplePickLimit: 14,
    staplePool: "control",
  },
  {
    id: "ai-hybrid",
    titleKey: "aiProfileHybrid",
    descKey: "aiProfileHybridDesc",
    engineSize: 31,
    samplePickLimit: 16,
    staplePool: "hybrid",
  },
];

const aiStaplePools = {
  balanced: stapleMain,
  lean: [
    ["Ash Blossom & Joyous Spring", 3, "stapleAsh"],
    ["Infinite Impermanence", 2, "stapleImperm"],
    ["Called by the Grave", 1, "stapleCalledBy"],
    ["Crossout Designator", 1, "stapleCrossout"],
  ],
  goingSecond: [
    ["Forbidden Droplet", 3, "stapleDroplet"],
    ["Lightning Storm", 3, "stapleStorm"],
    ["Evenly Matched", 3, "reasonGenericFill"],
    ["Dark Ruler No More", 2, "reasonGenericFill"],
    ["Harpie's Feather Duster", 1, "stapleDuster"],
    ["Raigeki", 1, "reasonGenericFill"],
    ["Infinite Impermanence", 2, "stapleImperm"],
  ],
  control: [
    ["Ash Blossom & Joyous Spring", 3, "stapleAsh"],
    ["Infinite Impermanence", 3, "stapleImperm"],
    ["Effect Veiler", 3, "stapleVeiler"],
    ["Nibiru, the Primal Being", 2, "stapleNibiru"],
    ["Called by the Grave", 1, "stapleCalledBy"],
    ["Crossout Designator", 1, "stapleCrossout"],
    ["Triple Tactics Talent", 2, "stapleTalent"],
  ],
  hybrid: [
    ["Ash Blossom & Joyous Spring", 2, "stapleAsh"],
    ["Infinite Impermanence", 2, "stapleImperm"],
    ["Forbidden Droplet", 2, "stapleDroplet"],
    ["Lightning Storm", 2, "stapleStorm"],
    ["Triple Tactics Talent", 2, "stapleTalent"],
    ["Called by the Grave", 1, "stapleCalledBy"],
  ],
};

const i18n = {
  zh: {
    appEyebrow: "多源卡表原型",
    appTitle: "种子卡构筑器",
    languageLabel: "语言",
    inputLabel: "输入任意游戏王卡名",
    generateButton: "生成卡组",
    styleCompetitive: "赛事样本优先",
    styleAi: "AI推荐构筑",
    formatLabel: "环境",
    formatTcg: "TCG",
    formatOcg: "OCG",
    formatMd: "大师决斗",
    pageBuilder: "构筑器",
    pageBanlist: "禁限表",
    variantCompetitiveDesc: "真实样本优先",
    variantAiDesc: "AI按种子卡生成",
    publicDeckDesc: "公开构筑",
    aiDeckDesc: "AI推荐",
    fallbackDeckDesc: "系统生成",
    buildListTitle: "构筑列表",
    buildListPageTitle: "{name} 构筑列表",
    chooseBuildTitle: "选择一套构筑",
    backToBuildList: "返回构筑列表",
    emptyTitle: "选择一张卡开始",
    emptyBody: "系统会从系列、文本、类型和常见泛用位生成一套 40+15 的初稿。",
    recommendationEyebrow: "推荐",
    pendingTitle: "待生成",
    mainShort: "主卡",
    extraShort: "额外",
    synergyShort: "协同",
    mainDeck: "主卡组",
    extraDeck: "额外卡组",
    samplePanelTitle: "赛事样本依据",
    samplePanelEmpty: "生成后显示命中的上位卡表。",
    handPanelTitle: "起手模拟",
    handPanelEmpty: "生成后进行 5000 次五卡起手模拟。",
    trustPanelTitle: "数据可信度",
    trustFormat: "规则环境",
    trustSource: "数据来源",
    trustUpdated: "样本更新时间",
    trustBanlist: "禁限表",
    trustLegality: "合法性",
    trustLegalOk: "当前卡表合法",
    trustLegalIssues: "{count} 个投入问题",
    trustTranslation: "翻译覆盖",
    trustTranslationValue: "{translated}/{total} 张有当前语言名称",
    trustCache: "缓存状态",
    trustCacheValue: "构筑 {deckCache} · 禁限表 {limitCache}",
    trustUnknown: "暂无",
    comparisonPanelTitle: "构筑差异对比",
    comparisonCore: "高共识卡",
    comparisonFlex: "分歧卡位",
    comparisonEngines: "常见组件",
    comparisonEmpty: "选择或搜索多套构筑后显示差异。",
    comparisonRate: "{rate}% · {count}/{total} 套",
    searchChoiceTitle: "你想按哪种方式搜索？",
    searchChoiceDeck: "按主题构筑：{name}",
    searchChoiceCard: "按单卡种子：{name}",
    searchChoiceHint: "这个词既能匹配主题，也能匹配单卡。选择后会继续生成。",
    refreshDataButton: "刷新数据",
    refreshDataDone: "已请求刷新数据，缓存会在后台更新。",
    exportText: "复制卡表",
    exportYdk: "复制 YDK",
    exportYdke: "复制 YDKE",
    exportMd: "复制 MD 文本",
    exportDone: "已复制导出内容",
    exportToast: "已复制：{type}",
    exportTypeText: "卡表",
    exportTypeYdk: "YDK",
    exportTypeYdke: "YDKE",
    exportTypeMd: "MD 文本",
    aiBadge: "AI生成",
    resourceGateEyebrow: "客户端资源准备",
    resourceGateTitle: "正在下载卡牌资源",
    resourceGateText: "首次启动会先下载热门构筑小卡图。完成后即可使用，剩余小图和大图会继续在后台下载。",
    resourceSmallReady: "热门构筑小卡图已就绪，正在进入客户端。",
    resourceFullPending: "大图等待中",
    resourceFullBackground: "大图后台下载 {percent}%",
    resourceError: "资源下载遇到网络问题，可以先继续使用，缺失图片会在打开时重试。",
    resourceContinue: "继续使用",
    resourceCached: "缓存",
    resourceDownloaded: "下载",
    resourceFailed: "失败",
    trendPanelTitle: "热门上分构筑",
    trendPanelTitleWindow: "近 {days} 天热门上分构筑",
    trendLoading: "加载中",
    trendReady: "{format} · {count} 套样本",
    trendEmpty: "暂无数据",
    trendMeta: "数据源：{sources}。按近 {days} 天上位/上分卡表汇总；饼图显示前 {shown} 套热门构筑，共 {chartCount} 套。",
    trendLadderTitle: "天梯榜",
    trendLadderHint: "按 Power 分层",
    limitPanelTitle: "最新禁限表",
    limitLoading: "加载中",
    limitReady: "{format} · {date}",
    limitUpdated: "禁限表日期：{date}。数据源：Dawnbrand 当前禁限表。",
    limitEmpty: "暂无禁限表数据。",
    limitAll: "全部",
    limitCardName: "卡名",
    limitCardType: "类型",
    limitStatusLabel: "状态",
    limitAllowedCount: "可放",
    limitCountAllowed: "{count} 张",
    limitSummary: "共 {total} 张：禁止 {forbidden}，限制 {limited}，准限制 {semi}。",
    limitViewList: "列表",
    limitViewCards: "卡图",
    limitDetailTitle: "卡牌信息",
    limitDetailEmpty: "从禁限表里选择一张卡查看完整效果和收录信息。",
    detailEmptyTitle: "点一张卡查看效果",
    detailEmptyBody: "主卡组和额外卡组里的每张卡都能查看完整效果文与字段信息。",
    starterRate: "初动率",
    interactionRate: "互动率",
    brickRate: "卡手率",
    copyButton: "复制",
    initialNotice: "这个 MVP 使用公开卡牌数据和启发式评分生成构筑。下一步接入真实上位卡组样本后，强度评分会更可靠。",
    notFound: "没有找到这张卡。可以输入英文、中文、日文或常用简称；如果是很新的外号，需要先补进别名表。",
    apiError: "YGOPRODeck API 暂时无法访问。",
    genericError: "生成失败，请稍后重试。",
    formatNotAvailable: "这张卡暂不属于 {format} 可用卡池，请切换环境或换一张种子卡。",
    formatForbidden: "这张卡在 {format} 当前禁限表中是禁止卡，不能作为合法构筑的种子卡。",
    noCards: "没有可推荐的卡。",
    noDesc: "暂无效果文本。",
    officialLocaleMissing: "官方中文未收录",
    statusIdle: "等待输入",
    statusLoading: "拉取数据",
    statusDone: "已生成",
    statusError: "出错",
    statusCopied: "已复制",
    deckTitle: "{name} 推荐构筑",
    aiDeckTitle: "{name} {profile}",
    notice: "{style}初稿。{source} 当前强度分是启发式估计，尚未接入真实赛事样本和起手模拟。",
    aiNotice: "AI推荐构筑：{profile}。根据种子卡、系列字段、效果文本、近期赛事共现、泛用互动位和 5000 次起手模拟生成。",
    sourceArchetype: "已识别为 {archetype} 轴。",
    sourceFallback: "没有明确系列字段，已改用卡名和效果文本做相似匹配。",
    sampleSummary: "命中 {count} 套多源真实卡表样本，优先采用赛事与近期构筑共现频率。",
    sampleUpdated: "样本刷新时间：{time}。",
    selectedPublicDeck: "当前选择：{title}。作者：{creator}。来源：{source}。",
    sampleDeckTypeOnly: "数据源只提供主题名，已用作者、赛事和组件信息区分每套构筑。",
    sampleEngines: "组件：{engines}",
    sampleNotes: "备注：{notes}",
    sampleNone: "暂未命中本地赛事样本，已回退到组件库与启发式协同。",
    aiEvidenceLine: "AI 方案：{profile}。",
    aiEvidenceFactors: "组建依据：种子卡效果、系列字段、近期共现样本、禁限表可投入数、泛用互动位与起手模拟。",
    aiEvidenceSamples: "参考了 {count} 条相近真实样本，但没有直接照抄某一套。",
    aiEvidenceNoSamples: "没有足够近似的真实样本，因此以卡池信息和启发式协同生成。",
    publicDeckSummary: "{format} 环境找到 {count} 套真实样本构筑，并附带 {aiCount} 套 AI 推荐构筑。默认展示近 7 天全部命中构筑；近 7 天为空时再用历史公开构筑兜底。",
    aiOnlySummary: "{format} 环境没有找到包含这张卡的近期赛事或公开构筑，已生成 {aiCount} 套 AI 推荐构筑。",
    publicDeckEmpty: "没有从公开构筑接口找到包含这张卡的列表，已显示 AI 推荐构筑。",
    sampleLine: "{title}，{placement}，{event}",
    handDetail: "5000 次五卡起手：至少 1 张初动 {starterHits} 次，至少 1 张互动 {interactionHits} 次，两者都有 {bothHits} 次。",
    seedCard: "种子卡",
    focusedCard: "当前卡牌",
    mainImageNote: "卡图来自 YGOPRODeck；当前公开源不提供稳定的中/日文卡图，卡名与效果文会按所选语言显示。",
    cardSetsTitle: "收录卡包",
    cardSetsEmpty: "暂无公开卡包信息。",
    cardSetsLoading: "正在加载卡包信息。",
    cardSetsMore: "另有 {count} 条收录记录未显示。",
    banTcg: "TCG",
    banOcg: "OCG",
    banGoat: "GOAT",
    banMd: "MD",
    banBanned: "禁止",
    banLimited: "限制",
    banSemiLimited: "准限制",
    styleNameCompetitive: "竞技版",
    styleNameAi: "AI推荐构筑",
    formatNameTcg: "TCG",
    formatNameOcg: "OCG",
    formatNameMd: "大师决斗",
    aiProfileBalanced: "AI 标准稳定",
    aiProfileBalancedDesc: "稳定展开 + 泛用互动",
    aiProfileEngine: "AI 主题浓度",
    aiProfileEngineDesc: "更高本家/同轴浓度，优先检索与展开",
    aiProfileGoingSecond: "AI 后攻突破",
    aiProfileGoingSecondDesc: "主打解场、突破终端和后攻抢节奏",
    aiProfileControl: "AI 控制干扰",
    aiProfileControlDesc: "提高手坑、无效和资源战密度",
    aiProfileHybrid: "AI 混轴探索",
    aiProfileHybridDesc: "按种族、属性和效果词寻找跨轴组件",
    reasonSeed: "种子卡，围绕它展开构筑。",
    reasonSameArchetype: "同属 {archetype} 系列。",
    reasonRace: "能服务 {race} 轴。",
    reasonAttribute: "与 {attribute} 属性相关。",
    reasonStarter: "文本包含检索、特召或补牌能力。",
    reasonGenericSynergy: "与种子卡存在文本或类型协同。",
    reasonGenericFill: "补足泛用稳定性或后攻突破位。",
    reasonSameAxis: "补齐同轴可用牌。",
    reasonExtraAxis: "额外卡组同轴选择。",
    reasonSampleMain: "来自真实上位样本的高频主卡。",
    reasonSampleExtra: "来自真实上位样本的高频额外卡。",
    stapleAsh: "泛用手坑，压制检索、堆墓和从卡组特召。",
    stapleImperm: "低门槛无效，先后手都能用。",
    stapleVeiler: "补充怪兽效果无效位。",
    stapleNibiru: "面对展开卡组的高上限反制。",
    stapleCalledBy: "保护初动，也能反制墓地效果。",
    stapleCrossout: "保护关键展开，适合竞技构筑。",
    stapleTalent: "被互动后补牌、看手或抢怪。",
    stapleDuster: "后攻清理魔陷。",
    stapleStorm: "后攻解场位，兼顾怪兽和魔陷。",
    stapleDroplet: "突破终端和保护斩杀。",
    extraLittleKnight: "通用 Link-2 干扰。",
    extraMasquerena: "把场面转化成对手回合互动。",
    extraPhoenix: "通用魔陷处理。",
    extraUnicorn: "通用弹回解场。",
    extraAccesscode: "常见终结和斩杀点。",
    extraGoddess: "处理难解大怪。",
  },
  ja: {
    appEyebrow: "複数ソースのデッキ試作",
    appTitle: "シードカード デッキビルダー",
    languageLabel: "言語",
    inputLabel: "遊戯王カード名を入力",
    generateButton: "デッキ生成",
    styleCompetitive: "大会サンプル優先",
    styleAi: "AIおすすめ構築",
    formatLabel: "環境",
    formatTcg: "TCG",
    formatOcg: "OCG",
    formatMd: "マスターデュエル",
    pageBuilder: "ビルダー",
    pageBanlist: "制限リスト",
    variantCompetitiveDesc: "大会サンプル優先",
    variantAiDesc: "AIがシードから生成",
    publicDeckDesc: "公開構築",
    aiDeckDesc: "AIおすすめ",
    fallbackDeckDesc: "生成案",
    buildListTitle: "構築リスト",
    buildListPageTitle: "{name} 構築リスト",
    chooseBuildTitle: "構築を選択",
    backToBuildList: "構築リストへ戻る",
    emptyTitle: "カードを1枚選んで開始",
    emptyBody: "テーマ、テキスト、種類、汎用枠から40+15枚の初稿を生成します。",
    recommendationEyebrow: "おすすめ",
    pendingTitle: "未生成",
    mainShort: "メイン",
    extraShort: "EX",
    synergyShort: "相性",
    mainDeck: "メインデッキ",
    extraDeck: "エクストラデッキ",
    samplePanelTitle: "大会サンプル根拠",
    samplePanelEmpty: "生成後、該当した上位デッキを表示します。",
    handPanelTitle: "初手シミュレーション",
    handPanelEmpty: "生成後、5枚初手を5000回シミュレーションします。",
    trustPanelTitle: "データ信頼度",
    trustFormat: "環境",
    trustSource: "データソース",
    trustUpdated: "サンプル更新",
    trustBanlist: "制限リスト",
    trustLegality: "合法性",
    trustLegalOk: "現在のリストで合法",
    trustLegalIssues: "{count} 件の投入数問題",
    trustTranslation: "翻訳カバー",
    trustTranslationValue: "{translated}/{total} 枚が現在言語名あり",
    trustCache: "キャッシュ",
    trustCacheValue: "構築 {deckCache} · 制限 {limitCache}",
    trustUnknown: "不明",
    comparisonPanelTitle: "構築差分比較",
    comparisonCore: "高採用カード",
    comparisonFlex: "可変枠",
    comparisonEngines: "採用エンジン",
    comparisonEmpty: "複数の構築を検索または選択すると差分を表示します。",
    comparisonRate: "{rate}% · {count}/{total} 件",
    searchChoiceTitle: "どちらで検索しますか？",
    searchChoiceDeck: "テーマ構築：{name}",
    searchChoiceCard: "単体カード：{name}",
    searchChoiceHint: "この語はテーマとカードの両方に一致します。選ぶと続けて生成します。",
    refreshDataButton: "データ更新",
    refreshDataDone: "データ更新をリクエストしました。キャッシュはバックグラウンドで更新されます。",
    exportText: "リストをコピー",
    exportYdk: "YDKをコピー",
    exportYdke: "YDKEをコピー",
    exportMd: "MDテキストをコピー",
    exportDone: "エクスポート内容をコピーしました",
    exportToast: "コピーしました：{type}",
    exportTypeText: "リスト",
    exportTypeYdk: "YDK",
    exportTypeYdke: "YDKE",
    exportTypeMd: "MDテキスト",
    aiBadge: "AI生成",
    resourceGateEyebrow: "クライアント資源の準備",
    resourceGateTitle: "カード画像をダウンロード中",
    resourceGateText: "初回起動では人気デッキの小さいカード画像を先に保存します。完了後に使用でき、残りの画像はバックグラウンドで続けて保存します。",
    resourceSmallReady: "人気デッキの小さい画像の準備が完了しました。クライアントへ移動します。",
    resourceFullPending: "大きい画像は待機中",
    resourceFullBackground: "大きい画像をバックグラウンド保存中 {percent}%",
    resourceError: "資源のダウンロードでネットワーク問題が発生しました。不足画像は表示時に再試行します。",
    resourceContinue: "続ける",
    resourceCached: "キャッシュ",
    resourceDownloaded: "保存",
    resourceFailed: "失敗",
    trendPanelTitle: "人気ランク上げ構築",
    trendPanelTitleWindow: "直近{days}日の人気ランク上げ構築",
    trendLoading: "読み込み中",
    trendReady: "{format} · {count} 件",
    trendEmpty: "データなし",
    trendMeta: "ソース：{sources}。直近{days}日の上位・ランク向けリストから集計。円グラフは上位{shown}テーマ、計{chartCount}件を表示。",
    trendLadderTitle: "ティアランキング",
    trendLadderHint: "Power順",
    limitPanelTitle: "最新リミットレギュレーション",
    limitLoading: "読み込み中",
    limitReady: "{format} · {date}",
    limitUpdated: "リミットレギュレーション日付：{date}。データソース：Dawnbrand current limit regulation。",
    limitEmpty: "リミットレギュレーションデータがありません。",
    limitAll: "すべて",
    limitCardName: "カード名",
    limitCardType: "種類",
    limitStatusLabel: "状態",
    limitAllowedCount: "投入可",
    limitCountAllowed: "{count} 枚",
    limitSummary: "合計 {total} 枚：禁止 {forbidden}、制限 {limited}、準制限 {semi}。",
    limitViewList: "リスト",
    limitViewCards: "画像",
    limitDetailTitle: "カード情報",
    limitDetailEmpty: "リストからカードを選ぶと、テキストと収録情報を表示します。",
    detailEmptyTitle: "カードを選ぶと効果を表示",
    detailEmptyBody: "メイン・エクストラの各カードから、完全なテキストと情報を確認できます。",
    starterRate: "初動率",
    interactionRate: "妨害率",
    brickRate: "事故率",
    copyButton: "コピー",
    initialNotice: "このMVPは公開カードデータとヒューリスティックで構築を生成します。次の段階で大会上位デッキと初手シミュレーションを接続します。",
    notFound: "カードが見つかりません。英語・中国語・日本語・通称で検索できます。新しい通称は別名表への追加が必要です。",
    apiError: "YGOPRODeck API に接続できません。",
    genericError: "生成に失敗しました。後でもう一度試してください。",
    formatNotAvailable: "このカードは {format} の使用可能カードプールにありません。環境を切り替えるか、別のシードカードを選んでください。",
    formatForbidden: "このカードは {format} の現行リミットレギュレーションで禁止カードのため、合法構築のシードにはできません。",
    noCards: "おすすめできるカードがありません。",
    noDesc: "カードテキストがありません。",
    officialLocaleMissing: "公式日本語未収録",
    statusIdle: "待機中",
    statusLoading: "データ取得中",
    statusDone: "生成済み",
    statusError: "エラー",
    statusCopied: "コピー済み",
    deckTitle: "{name} おすすめ構築",
    aiDeckTitle: "{name} {profile}",
    notice: "{style}の初稿です。{source} 強度スコアは暫定評価で、まだ大会データと初手シミュレーションは未接続です。",
    aiNotice: "AIおすすめ構築：{profile}。シードカード、テーマ、効果テキスト、近期大会の共起、汎用妨害枠、5000回の初手シミュレーションから生成します。",
    sourceArchetype: "{archetype} 軸として認識しました。",
    sourceFallback: "明確なテーマ情報がないため、カード名とテキストの類似性で補完しました。",
    sampleSummary: "複数ソースの実デッキサンプル {count} 件に一致。大会リストと最近の構築の共起頻度を優先しました。",
    sampleUpdated: "サンプル更新：{time}。",
    selectedPublicDeck: "選択中：{title}。作者：{creator}。出典：{source}。",
    sampleDeckTypeOnly: "データ元はテーマ名のみ提供しているため、作者・大会・エンジン情報で各リストを区別しています。",
    sampleEngines: "エンジン：{engines}",
    sampleNotes: "メモ：{notes}",
    sampleNone: "ローカル大会サンプルには未一致のため、コンポーネントとヒューリスティックで補完しました。",
    aiEvidenceLine: "AI案：{profile}。",
    aiEvidenceFactors: "構築根拠：シードカードの効果、テーマ情報、近期サンプルの共起、制限リスト、汎用妨害枠、初手シミュレーション。",
    aiEvidenceSamples: "近い実デッキサンプル {count} 件を参考にしましたが、特定の1リストをコピーしていません。",
    aiEvidenceNoSamples: "十分近い実デッキサンプルがないため、カードプールとヒューリスティックで生成しました。",
    publicDeckSummary: "{format} 環境で実データ構築が {count} 件見つかり、AIおすすめ構築を {aiCount} 件追加しました。直近7日間の一致構築をすべて表示し、該当がない場合だけ過去の公開構築を補助として使います。",
    aiOnlySummary: "{format} 環境ではこのカードを含む近期大会・公開構築が見つからなかったため、AIおすすめ構築を {aiCount} 件生成しました。",
    publicDeckEmpty: "公開構築APIでは該当リストが見つからなかったため、AIおすすめ構築を表示しています。",
    sampleLine: "{title}、{placement}、{event}",
    handDetail: "5枚初手5000回：初動あり {starterHits} 回、妨害あり {interactionHits} 回、両方あり {bothHits} 回。",
    seedCard: "シードカード",
    focusedCard: "選択中のカード",
    mainImageNote: "カード画像はYGOPRODeck由来です。安定した中/日文カード画像ソースがないため、カード名と効果文を選択言語で表示します。",
    cardSetsTitle: "収録パック",
    cardSetsEmpty: "公開パック情報はありません。",
    cardSetsLoading: "パック情報を読み込み中です。",
    cardSetsMore: "ほか {count} 件の収録記録があります。",
    banTcg: "TCG",
    banOcg: "OCG",
    banGoat: "GOAT",
    banMd: "MD",
    banBanned: "禁止",
    banLimited: "制限",
    banSemiLimited: "準制限",
    styleNameCompetitive: "競技向け",
    styleNameAi: "AIおすすめ構築",
    formatNameTcg: "TCG",
    formatNameOcg: "OCG",
    formatNameMd: "マスターデュエル",
    aiProfileBalanced: "AI 標準安定",
    aiProfileBalancedDesc: "安定展開 + 汎用妨害",
    aiProfileEngine: "AI テーマ濃度",
    aiProfileEngineDesc: "テーマ内カードとサーチ・展開を厚く採用",
    aiProfileGoingSecond: "AI 後攻突破",
    aiProfileGoingSecondDesc: "盤面処理、制圧突破、後攻テンポを重視",
    aiProfileControl: "AI コントロール妨害",
    aiProfileControlDesc: "手札誘発、無効、リソース戦の密度を上げる",
    aiProfileHybrid: "AI 混合軸探索",
    aiProfileHybridDesc: "種族、属性、効果語から別軸のパーツを探す",
    reasonSeed: "シードカード。このカードを中心に構築します。",
    reasonSameArchetype: "{archetype} テーマのカードです。",
    reasonRace: "{race} 軸を支援できます。",
    reasonAttribute: "{attribute} 属性と関連します。",
    reasonStarter: "サーチ、特殊召喚、ドローに関わるテキストを持ちます。",
    reasonGenericSynergy: "シードカードとテキストまたは種類で相性があります。",
    reasonGenericFill: "安定性または後攻突破力を補います。",
    reasonSameAxis: "同じ軸の候補として補完します。",
    reasonExtraAxis: "エクストラデッキの同軸候補です。",
    reasonSampleMain: "実際の上位サンプルで採用率の高いメインカードです。",
    reasonSampleExtra: "実際の上位サンプルで採用率の高いエクストラカードです。",
    stapleAsh: "汎用手札誘発。サーチ、墓地送り、デッキからの特殊召喚を止めます。",
    stapleImperm: "先攻後攻どちらでも使いやすい無効札です。",
    stapleVeiler: "モンスター効果無効の追加枠です。",
    stapleNibiru: "大量展開への高打点な返し札です。",
    stapleCalledBy: "初動を守り、墓地効果にも触れます。",
    stapleCrossout: "重要な展開を守る競技向けの枠です。",
    stapleTalent: "妨害を受けた後のドロー、ハンデス、奪取に使えます。",
    stapleDuster: "後攻で魔法・罠を一掃します。",
    stapleStorm: "後攻の盤面突破札です。",
    stapleDroplet: "制圧盤面を突破し、キルを通しやすくします。",
    extraLittleKnight: "汎用Link-2の妨害役です。",
    extraMasquerena: "盤面を相手ターンの干渉へ変換します。",
    extraPhoenix: "汎用の魔法・罠除去です。",
    extraUnicorn: "汎用のバウンス除去です。",
    extraAccesscode: "フィニッシュとワンキルに使いやすいカードです。",
    extraGoddess: "処理しにくい大型モンスターへの回答です。",
  },
  en: {
    appEyebrow: "Multi-source deck prototype",
    appTitle: "Seed Deck Builder",
    languageLabel: "Language",
    inputLabel: "Enter any Yu-Gi-Oh! card name",
    generateButton: "Build Deck",
    styleCompetitive: "Tournament First",
    styleAi: "AI Recommended",
    formatLabel: "Format",
    formatTcg: "TCG",
    formatOcg: "OCG",
    formatMd: "Master Duel",
    pageBuilder: "Builder",
    pageBanlist: "Banlist",
    variantCompetitiveDesc: "Evidence first",
    variantAiDesc: "AI built from the seed",
    publicDeckDesc: "Public build",
    aiDeckDesc: "AI recommendation",
    fallbackDeckDesc: "Generated",
    buildListTitle: "Build List",
    buildListPageTitle: "{name} Build List",
    chooseBuildTitle: "Choose a Build",
    backToBuildList: "Back to Build List",
    emptyTitle: "Choose a card to begin",
    emptyBody: "The system drafts a 40+15 list from archetype, text, type, and staple slots.",
    recommendationEyebrow: "Recommendation",
    pendingTitle: "Pending",
    mainShort: "Main",
    extraShort: "Extra",
    synergyShort: "Synergy",
    mainDeck: "Main Deck",
    extraDeck: "Extra Deck",
    samplePanelTitle: "Tournament Evidence",
    samplePanelEmpty: "Matched topping decklists appear after generation.",
    handPanelTitle: "Opening Hand Sim",
    handPanelEmpty: "Runs 5000 simulated five-card opening hands after generation.",
    trustPanelTitle: "Data Confidence",
    trustFormat: "Format",
    trustSource: "Source",
    trustUpdated: "Sample Updated",
    trustBanlist: "Banlist",
    trustLegality: "Legality",
    trustLegalOk: "Legal under current list",
    trustLegalIssues: "{count} copy issues",
    trustTranslation: "Translation Coverage",
    trustTranslationValue: "{translated}/{total} cards have current-language names",
    trustCache: "Cache",
    trustCacheValue: "Deck {deckCache} · Banlist {limitCache}",
    trustUnknown: "Unknown",
    comparisonPanelTitle: "Build Difference",
    comparisonCore: "High-Consensus Cards",
    comparisonFlex: "Flex Slots",
    comparisonEngines: "Common Engines",
    comparisonEmpty: "Search or choose multiple builds to compare differences.",
    comparisonRate: "{rate}% · {count}/{total} lists",
    searchChoiceTitle: "How should this search run?",
    searchChoiceDeck: "Theme build: {name}",
    searchChoiceCard: "Single-card seed: {name}",
    searchChoiceHint: "This query matches both a theme and a card. Choose one to continue.",
    refreshDataButton: "Refresh Data",
    refreshDataDone: "Refresh requested. Cached data will update in the background.",
    exportText: "Copy List",
    exportYdk: "Copy YDK",
    exportYdke: "Copy YDKE",
    exportMd: "Copy MD Text",
    exportDone: "Export copied",
    exportToast: "Copied: {type}",
    exportTypeText: "deck list",
    exportTypeYdk: "YDK",
    exportTypeYdke: "YDKE",
    exportTypeMd: "MD text",
    aiBadge: "AI generated",
    resourceGateEyebrow: "Client Resource Prep",
    resourceGateTitle: "Downloading Card Assets",
    resourceGateText: "First launch downloads small images for popular decks before use. Remaining small and large images continue in the background.",
    resourceSmallReady: "Popular-deck small images are ready. Entering the client.",
    resourceFullPending: "Large images pending",
    resourceFullBackground: "Large images downloading in background {percent}%",
    resourceError: "Asset download hit a network issue. You can continue; missing images will retry when opened.",
    resourceContinue: "Continue",
    resourceCached: "cached",
    resourceDownloaded: "downloaded",
    resourceFailed: "failed",
    trendPanelTitle: "Popular Climb Decks",
    trendPanelTitleWindow: "Popular Climb Decks: Last {days} Days",
    trendLoading: "Loading",
    trendReady: "{format} · {count} samples",
    trendEmpty: "No data",
    trendMeta: "Sources: {sources}. Aggregated from the last {days} days; the pie shows the top {shown} decks, {chartCount} samples total.",
    trendLadderTitle: "Ladder",
    trendLadderHint: "Power rankings",
    limitPanelTitle: "Latest Forbidden & Limited List",
    limitLoading: "Loading",
    limitReady: "{format} · {date}",
    limitUpdated: "List date: {date}. Source: Dawnbrand current limit regulation.",
    limitEmpty: "No limit regulation data.",
    limitAll: "All",
    limitCardName: "Card",
    limitCardType: "Type",
    limitStatusLabel: "Status",
    limitAllowedCount: "Allowed",
    limitCountAllowed: "{count}",
    limitSummary: "{total} cards: {forbidden} forbidden, {limited} limited, {semi} semi-limited.",
    limitViewList: "List",
    limitViewCards: "Images",
    limitDetailTitle: "Card Info",
    limitDetailEmpty: "Choose a card from the banlist to view full text and release info.",
    detailEmptyTitle: "Click a card to view effects",
    detailEmptyBody: "Every Main and Extra Deck card can show full effect text and card fields.",
    starterRate: "Starter",
    interactionRate: "Interaction",
    brickRate: "Brick",
    copyButton: "Copy",
    initialNotice: "This MVP uses public card data and heuristic scoring. Tournament deck samples will make the strength score more reliable.",
    notFound: "Card not found. You can search English, Chinese, Japanese, or common nicknames; very new aliases need to be added first.",
    apiError: "YGOPRODeck API is unavailable right now.",
    genericError: "Generation failed. Please try again later.",
    formatNotAvailable: "This card is not currently in the {format} card pool. Switch formats or choose another seed card.",
    formatForbidden: "This card is Forbidden in the current {format} list, so it cannot seed a legal build.",
    noCards: "No recommendable cards.",
    noDesc: "No effect text.",
    officialLocaleMissing: "Official locale unavailable",
    statusIdle: "Idle",
    statusLoading: "Loading",
    statusDone: "Generated",
    statusError: "Error",
    statusCopied: "Copied",
    deckTitle: "{name} Recommended Build",
    aiDeckTitle: "{name} {profile}",
    notice: "{style} draft. {source} Strength is still heuristic and does not yet use tournament samples or opening-hand simulation.",
    aiNotice: "AI recommended build: {profile}. Generated from the seed card, archetype, effect text, recent tournament co-occurrence, staple interaction slots, and 5000 opening-hand simulations.",
    sourceArchetype: "Detected the {archetype} axis.",
    sourceFallback: "No clear archetype field, so name and effect-text similarity were used.",
    sampleSummary: "Matched {count} real decklist samples across sources and prioritized tournament plus recent deck co-occurrence.",
    sampleUpdated: "Samples refreshed: {time}.",
    selectedPublicDeck: "Selected: {title}. Creator: {creator}. Source: {source}.",
    sampleDeckTypeOnly: "The source provides the deck-type label, so author, event, and engine details are used to distinguish each list.",
    sampleEngines: "Engines: {engines}",
    sampleNotes: "Notes: {notes}",
    sampleNone: "No local tournament samples matched, so component packages and heuristic synergy were used.",
    aiEvidenceLine: "AI plan: {profile}.",
    aiEvidenceFactors: "Signals: seed-card text, archetype fields, recent co-occurrence samples, current copy limits, staple interaction slots, and opening-hand simulation.",
    aiEvidenceSamples: "Referenced {count} nearby real samples without copying a single list.",
    aiEvidenceNoSamples: "No close real sample was available, so the list was generated from card-pool data and heuristic synergy.",
    publicDeckSummary: "Found {count} real sample builds for {format} and added {aiCount} AI recommended builds. All matched builds from the last 7 days are shown by default; older public builds are fallback data.",
    aiOnlySummary: "No recent tournament or public build was found for this card in {format}, so {aiCount} AI recommended builds were generated.",
    publicDeckEmpty: "No public decklist was found for this card, so the AI recommended build is shown.",
    sampleLine: "{title}, {placement}, {event}",
    handDetail: "5000 five-card hands: starter in {starterHits}, interaction in {interactionHits}, both in {bothHits}.",
    seedCard: "Seed card",
    focusedCard: "Focused card",
    mainImageNote: "Card images come from YGOPRODeck. The current public source does not provide stable Chinese/Japanese card images, so names and effect text are localized instead.",
    cardSetsTitle: "Released In",
    cardSetsEmpty: "No public set information.",
    cardSetsLoading: "Loading pack information.",
    cardSetsMore: "{count} more release records hidden.",
    banTcg: "TCG",
    banOcg: "OCG",
    banGoat: "GOAT",
    banMd: "MD",
    banBanned: "Banned",
    banLimited: "Limited",
    banSemiLimited: "Semi-Limited",
    styleNameCompetitive: "Competitive",
    styleNameAi: "AI Recommended",
    formatNameTcg: "TCG",
    formatNameOcg: "OCG",
    formatNameMd: "Master Duel",
    aiProfileBalanced: "AI Stable Core",
    aiProfileBalancedDesc: "Stable engine plus generic interaction",
    aiProfileEngine: "AI Engine Heavy",
    aiProfileEngineDesc: "Higher archetype density with search and extension first",
    aiProfileGoingSecond: "AI Going Second",
    aiProfileGoingSecondDesc: "Board breaking, end-board answers, and tempo swings",
    aiProfileControl: "AI Control",
    aiProfileControlDesc: "Higher hand-trap, negation, and grind-game density",
    aiProfileHybrid: "AI Hybrid Explore",
    aiProfileHybridDesc: "Cross-engine pieces from race, attribute, and effect-text overlap",
    reasonSeed: "Seed card. The build is centered around it.",
    reasonSameArchetype: "Same {archetype} archetype.",
    reasonRace: "Supports the {race} axis.",
    reasonAttribute: "Related to the {attribute} attribute.",
    reasonStarter: "Its text includes search, Special Summon, or draw utility.",
    reasonGenericSynergy: "Text or type synergy with the seed card.",
    reasonGenericFill: "Adds generic consistency or going-second pressure.",
    reasonSameAxis: "Fills out the same axis.",
    reasonExtraAxis: "Extra Deck option for the same axis.",
    reasonSampleMain: "High-frequency Main Deck card from real topping samples.",
    reasonSampleExtra: "High-frequency Extra Deck card from real topping samples.",
    stapleAsh: "Generic hand trap that stops searching, sending, and Deck summons.",
    stapleImperm: "Low-friction negation that works going first or second.",
    stapleVeiler: "Additional monster-effect negation.",
    stapleNibiru: "High-impact answer to heavy combo turns.",
    stapleCalledBy: "Protects starters and answers graveyard effects.",
    stapleCrossout: "Protects key lines in competitive builds.",
    stapleTalent: "Converts interruption into draw, hand knowledge, or monster steal.",
    stapleDuster: "Backrow clear for going second.",
    stapleStorm: "Flexible going-second board breaker.",
    stapleDroplet: "Breaks established boards and helps push lethal.",
    extraLittleKnight: "Generic Link-2 interruption.",
    extraMasquerena: "Turns board presence into opponent-turn interaction.",
    extraPhoenix: "Generic backrow removal.",
    extraUnicorn: "Generic spin removal.",
    extraAccesscode: "Common finisher and lethal push.",
    extraGoddess: "Answer to hard-to-remove boss monsters.",
  },
};

const fieldMaps = {
  zh: {
    type: {
      "Normal Monster": "通常怪兽",
      "Effect Monster": "效果怪兽",
      "Flip Effect Monster": "反转效果怪兽",
      "Tuner Monster": "调整怪兽",
      "Spirit Monster": "灵魂怪兽",
      "Union Effect Monster": "同盟效果怪兽",
      "Gemini Monster": "二重怪兽",
      "Ritual Monster": "仪式怪兽",
      "Fusion Monster": "融合怪兽",
      "Synchro Monster": "同调怪兽",
      "XYZ Monster": "超量怪兽",
      "Xyz Monster": "超量怪兽",
      "Pendulum Effect Monster": "灵摆效果怪兽",
      "Pendulum Normal Monster": "通常灵摆怪兽",
      "Pendulum Tuner Effect Monster": "调整灵摆效果怪兽",
      "Link Monster": "连接怪兽",
      "Spell Card": "魔法卡",
      "Trap Card": "陷阱卡",
      "Normal Spell": "通常魔法",
      "Quick-Play Spell": "速攻魔法",
      "Continuous Spell": "永续魔法",
      "Equip Spell": "装备魔法",
      "Field Spell": "场地魔法",
      "Counter Trap": "反击陷阱",
      "Normal Trap": "通常陷阱",
      "Continuous Trap": "永续陷阱",
    },
    race: {
      Warrior: "战士族",
      Spellcaster: "魔法师族",
      Dragon: "龙族",
      Zombie: "不死族",
      Machine: "机械族",
      Beast: "兽族",
      "Beast-Warrior": "兽战士族",
      Fiend: "恶魔族",
      Fairy: "天使族",
      Dinosaur: "恐龙族",
      Reptile: "爬虫类族",
      Fish: "鱼族",
      "Sea Serpent": "海龙族",
      SeaSerpent: "海龙族",
      Aqua: "水族",
      Pyro: "炎族",
      Thunder: "雷族",
      Rock: "岩石族",
      Plant: "植物族",
      Insect: "昆虫族",
      Psychic: "念动力族",
      Wyrm: "幻龙族",
      Cyberse: "电子界族",
      DivineBeast: "幻神兽族",
      Normal: "通常",
      "Quick-Play": "速攻",
      QuickPlay: "速攻",
      Continuous: "永续",
      Equip: "装备",
      Field: "场地",
      Counter: "反击",
    },
    attribute: {
      DARK: "暗",
      LIGHT: "光",
      EARTH: "地",
      WATER: "水",
      FIRE: "炎",
      WIND: "风",
      DIVINE: "神",
    },
    archetype: {
      "Kewl Tune": "杀手旋律",
      "Sky Striker": "闪刀姬",
      "Blue-Eyes": "青眼",
      "Dark Magician": "黑魔导",
      "HERO": "英雄",
      "Kashtira": "怒刹帝利",
      "Dracotail": "星宿",
      "Enneacraft": "纠罪巧",
      "Radiant Typhoon": "绚岚",
      "Elfnote": "耀圣",
      "Power Patron": "狱神",
      "Memento": "冥铭途",
      "DoomZ": "终刻",
      "Yummy": "黯蜜",
      "Branded": "烙印",
      "Despia": "死狱乡",
      "Tearlaments": "泪冠哀歌",
      "Labrynth": "白银城",
      "Swordsoul": "相剑",
      "Snake-Eye": "蛇眼",
      "Fairy Tail": "妖精传姬",
      "Thunder Dragon": "雷龙",
      Ecclesia: "艾克利西亚",
      Bystial: "深渊之兽",
      Magistus: "伟魔",
      Exosister: "驱魔姐妹",
      Zoodiac: "十二兽",
      "Vanquish Soul": "对击斗魂",
      "Vanquish Soul K9": "对击斗魂K9",
      K9: "K9",
      Dogmatika: "教导",
    },
  },
  ja: {
    type: {
      "Normal Monster": "通常モンスター",
      "Effect Monster": "効果モンスター",
      "Flip Effect Monster": "リバース効果モンスター",
      "Tuner Monster": "チューナーモンスター",
      "Spirit Monster": "スピリットモンスター",
      "Union Effect Monster": "ユニオン効果モンスター",
      "Gemini Monster": "デュアルモンスター",
      "Ritual Monster": "儀式モンスター",
      "Fusion Monster": "融合モンスター",
      "Synchro Monster": "シンクロモンスター",
      "XYZ Monster": "エクシーズモンスター",
      "Xyz Monster": "エクシーズモンスター",
      "Pendulum Effect Monster": "ペンデュラム効果モンスター",
      "Pendulum Normal Monster": "通常ペンデュラムモンスター",
      "Pendulum Tuner Effect Monster": "チューナーペンデュラム効果モンスター",
      "Link Monster": "リンクモンスター",
      "Spell Card": "魔法カード",
      "Trap Card": "罠カード",
      "Normal Spell": "通常魔法",
      "Quick-Play Spell": "速攻魔法",
      "Continuous Spell": "永続魔法",
      "Equip Spell": "装備魔法",
      "Field Spell": "フィールド魔法",
      "Counter Trap": "カウンター罠",
      "Normal Trap": "通常罠",
      "Continuous Trap": "永続罠",
    },
    race: {
      Warrior: "戦士族",
      Spellcaster: "魔法使い族",
      Dragon: "ドラゴン族",
      Zombie: "アンデット族",
      Machine: "機械族",
      Beast: "獣族",
      "Beast-Warrior": "獣戦士族",
      Fiend: "悪魔族",
      Fairy: "天使族",
      Dinosaur: "恐竜族",
      Reptile: "爬虫類族",
      Fish: "魚族",
      "Sea Serpent": "海竜族",
      SeaSerpent: "海竜族",
      Aqua: "水族",
      Pyro: "炎族",
      Thunder: "雷族",
      Rock: "岩石族",
      Plant: "植物族",
      Insect: "昆虫族",
      Psychic: "サイキック族",
      Wyrm: "幻竜族",
      Cyberse: "サイバース族",
      DivineBeast: "幻神獣族",
      Normal: "通常",
      "Quick-Play": "速攻",
      QuickPlay: "速攻",
      Continuous: "永続",
      Equip: "装備",
      Field: "フィールド",
      Counter: "カウンター",
    },
    attribute: {
      DARK: "闇",
      LIGHT: "光",
      EARTH: "地",
      WATER: "水",
      FIRE: "炎",
      WIND: "風",
      DIVINE: "神",
    },
    archetype: {
      "Kewl Tune": "キラーチューン",
      "Sky Striker": "閃刀姫",
      "Blue-Eyes": "ブルーアイズ",
      "Dark Magician": "ブラック・マジシャン",
      "HERO": "HERO",
      "Kashtira": "クシャトリラ",
      "Dracotail": "星辰",
      "Enneacraft": "糾罪巧",
      "Radiant Typhoon": "絢嵐",
      "Elfnote": "耀聖詩",
      "Power Patron": "獄神",
      "Memento": "メメント",
      "DoomZ": "終刻",
      "Yummy": "ヤミー",
      "Branded": "烙印",
      "Despia": "デスピア",
      "Tearlaments": "ティアラメンツ",
      "Labrynth": "ラビュリンス",
      "Swordsoul": "相剣",
      "Snake-Eye": "スネークアイ",
      "Fairy Tail": "妖精伝姫",
      Magistus: "マギストス",
      Exosister: "エクソシスター",
      Zoodiac: "十二獣",
      "Vanquish Soul": "ヴァンキッシュ・ソウル",
      "Vanquish Soul K9": "ヴァンキッシュ・ソウル K9",
      K9: "K9",
    },
  },
};

const trendNameMaps = {
  zh: {
    "Kewl Tune": "杀手旋律",
    "Dracotail": "星宿",
    "Enneacraft": "纠罪巧",
    "Radiant Typhoon": "绚岚",
    "Elfnote": "耀圣",
    "Lunalight": "月光",
    "Toon": "卡通",
    "Light and Darkness Ritual": "光暗仪式",
    "Chaos Ritual": "混沌仪式",
    DoomZ: "终刻",
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
    Maliss: "码丽丝",
    "White Forest": "白森林",
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
    "Elfnote": "耀聖詩",
    "Lunalight": "月光",
    "Toon": "トゥーン",
    "Light and Darkness Ritual": "光と闇の竜儀式",
    "Chaos Ritual": "カオス儀式",
    DoomZ: "終刻",
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
    Maliss: "M∀LICE",
    "White Forest": "白き森",
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

const trendSourceMaps = {
  zh: {
    "Master Duel Meta Top Decks": "MDM 上分构筑",
    "Yu-Gi-Oh! Meta OCG Top Decks": "Yu-Gi-Oh! Meta OCG 上位构筑",
    "Road of the King OCG Breakdown": "Road of the King OCG 环境统计",
    "Konami Neuron Popular Decks Ranking": "Konami Neuron 热门构筑排行",
    "YGOPRODeck Tournament Meta": "YGOPRODeck 赛事上位",
  },
  ja: {
    "Master Duel Meta Top Decks": "MDM ランク構築",
    "Yu-Gi-Oh! Meta OCG Top Decks": "Yu-Gi-Oh! Meta OCG 上位構築",
    "Road of the King OCG Breakdown": "Road of the King OCG 環境集計",
    "Konami Neuron Popular Decks Ranking": "Konami Neuron 人気構築ランキング",
    "YGOPRODeck Tournament Meta": "YGOPRODeck 大会上位",
  },
};

const deckSearchAliases = {
  "黑魔导": "Dark Magician",
  "ブラックマジシャン": "Dark Magician",
  "ブラック・マジシャン": "Dark Magician",
  "青眼": "Blue-Eyes",
  "青眼白龙": "Blue-Eyes",
  "ブルーアイズ": "Blue-Eyes",
  "蓝眼": "Blue-Eyes",
  "闪刀": "Sky Striker",
  "闪刀姬": "Sky Striker",
  "閃刀姫": "Sky Striker",
  "烙印": "Branded",
  "杀手旋律": "Kewl Tune",
  "殺手旋律": "Kewl Tune",
  "キラーチューン": "Kewl Tune",
  "星宿": "Dracotail",
  "纠罪巧": "Enneacraft",
  "糾罪巧": "Enneacraft",
  "九艺": "Enneacraft",
  "绚岚": "Radiant Typhoon",
  "绚岚十二兽": "Radiant Typhoon Zoodiac",
  "絢嵐十二獸": "Radiant Typhoon Zoodiac",
  "十二兽": "Zoodiac",
  "十二獸": "Zoodiac",
  "耀圣": "Elfnote",
  "耀聖": "Elfnote",
  "狱神": "Power Patron",
  "獄神": "Power Patron",
  "冥铭途": "Memento",
  "冥銘途": "Memento",
  "终刻": "DoomZ",
  "終刻": "DoomZ",
  "黯蜜": "Yummy",
  "码丽丝": "Maliss",
  "碼麗絲": "Maliss",
  "卡通": "Toon",
  "月光": "Lunalight",
  "驱魔姐妹": "Exosister",
  "驅魔姐妹": "Exosister",
  "光暗仪式": "Light and Darkness Ritual",
  "混沌仪式": "Chaos Ritual",
  "对击斗魂": "Vanquish Soul",
  "對擊鬥魂": "Vanquish Soul",
  "对击斗魂K9": "Vanquish Soul K9",
  "對擊鬥魂K9": "Vanquish Soul K9",
  "黑魔术少女光之黄金柜": "DMG Shining Sarc",
  "黑魔術少女光之黃金櫃": "DMG Shining Sarc",
  "光之黄金柜": "Shining Sarc",
  "光之黃金櫃": "Shining Sarc",
  "真红眼龙骑兵": "Dragoon",
  "真紅眼龍騎兵": "Dragoon",
};

const starterHints = [
  "search",
  "add 1",
  "special summon",
  "normal summon",
  "send",
  "from your deck",
  "from the deck",
  "draw",
];

const stopWords = new Set([
  "the",
  "of",
  "and",
  "a",
  "an",
  "to",
  "in",
  "on",
  "with",
  "from",
  "card",
  "dragon",
  "warrior",
  "spell",
  "trap",
  "monster",
]);

const els = {
  builderPage: document.querySelector("#builderPage"),
  banlistPage: document.querySelector("#banlistPage"),
  formatMenu: document.querySelector("#formatMenu"),
  formatCurrentLogo: document.querySelector("#formatCurrentLogo"),
  formatCurrentLabel: document.querySelector("#formatCurrentLabel"),
  pageTabs: document.querySelector("#pageTabs"),
  form: document.querySelector("#deckForm"),
  input: document.querySelector("#cardInput"),
  searchChoicePanel: document.querySelector("#searchChoicePanel"),
  language: document.querySelector("#languageSelect"),
  status: document.querySelector("#apiStatus"),
  toast: document.querySelector("#toast"),
  seedEmpty: document.querySelector("#seedEmpty"),
  seedCard: document.querySelector("#seedCard"),
  deckTitle: document.querySelector("#deckTitle"),
  scoreBoard: document.querySelector("#scoreBoard"),
  mainCount: document.querySelector("#mainCount"),
  extraCount: document.querySelector("#extraCount"),
  scoreValue: document.querySelector("#scoreValue"),
  notice: document.querySelector("#notice"),
  backToBuildList: document.querySelector("#backToBuildList"),
  trustPanel: document.querySelector("#trustPanel"),
  trustContent: document.querySelector("#trustContent"),
  refreshDataButton: document.querySelector("#refreshDataButton"),
  variantSection: document.querySelector("#variantSection"),
  variantTabs: document.querySelector("#variantTabs"),
  comparisonPanel: document.querySelector("#comparisonPanel"),
  comparisonContent: document.querySelector("#comparisonContent"),
  trendStatus: document.querySelector("#trendStatus"),
  trendTitle: document.querySelector("#trendTitle"),
  trendDonut: document.querySelector("#trendDonut"),
  trendList: document.querySelector("#trendList"),
  trendLadderList: document.querySelector("#trendLadderList"),
  trendMeta: document.querySelector("#trendMeta"),
  banlistTitle: document.querySelector("#banlistTitle"),
  limitStatus: document.querySelector("#limitStatus"),
  limitFilterTabs: document.querySelector("#limitFilterTabs"),
  limitViewTabs: document.querySelector("#limitViewTabs"),
  limitDetail: document.querySelector("#limitDetail"),
  limitRows: document.querySelector("#limitRows"),
  limitMeta: document.querySelector("#limitMeta"),
  detailInsights: document.querySelector("#detailInsights"),
  sampleEvidence: document.querySelector("#sampleEvidence"),
  handStats: document.querySelector("#handStats"),
  handDetail: document.querySelector("#handDetail"),
  deckColumns: document.querySelector("#deckColumns"),
  deckViewTabs: document.querySelector("#deckViewTabs"),
  mainDeck: document.querySelector("#mainDeck"),
  extraDeck: document.querySelector("#extraDeck"),
  copyMain: document.querySelector("#copyMain"),
  copyExtra: document.querySelector("#copyExtra"),
  exportText: document.querySelector("#exportText"),
  exportYdk: document.querySelector("#exportYdk"),
  exportYdke: document.querySelector("#exportYdke"),
  exportMd: document.querySelector("#exportMd"),
  rowTemplate: document.querySelector("#deckRowTemplate"),
  resourceGate: document.querySelector("#resourceGate"),
  resourceGateText: document.querySelector("#resourceGateText"),
  resourceSmallBar: document.querySelector("#resourceSmallBar"),
  resourceSmallPercent: document.querySelector("#resourceSmallPercent"),
  resourceSmallDetail: document.querySelector("#resourceSmallDetail"),
  resourceFullBar: document.querySelector("#resourceFullBar"),
  resourceFullPercent: document.querySelector("#resourceFullPercent"),
  resourceFullDetail: document.querySelector("#resourceFullDetail"),
  resourceContinueButton: document.querySelector("#resourceContinueButton"),
};
const formatLogoSources = {
  md: "assets/format-logos/master-duel.png",
  ocg: "assets/format-logos/ocg.png",
  tcg: "assets/format-logos/tcg.png",
};

els.language.value = state.language;
let hasCheckedStyle = false;
for (const input of document.querySelectorAll('input[name="style"]')) {
  input.checked = input.value === state.activeStyle;
  hasCheckedStyle ||= input.checked;
}
if (!hasCheckedStyle) {
  document.querySelector('input[name="style"][value="competitive"]').checked = true;
  state.activeStyle = "competitive";
}
function setActiveStyle(style) {
  if (!VALID_STYLES.has(style)) return;
  state.activeStyle = style;
  localStorage.setItem("deckBuilderActiveStyle", style);
  document.querySelectorAll('input[name="style"]').forEach((input) => {
    input.checked = input.value === style;
  });
}
let hasCheckedFormat = false;
for (const input of document.querySelectorAll('input[name="format"]')) {
  input.checked = input.value === state.activeFormat;
  hasCheckedFormat ||= input.checked;
}
if (!hasCheckedFormat) {
  document.querySelector('input[name="format"][value="md"]').checked = true;
  state.activeFormat = "md";
}
applyLanguage();
syncFormatMenu();
setActivePage(state.activePage, { persist: false });
bootstrapResourceCacheGate();
renderTrendPanel();
ensureMasterDuelLocaleData().then(() => {
  renderTrendPanel();
  if (state.activePage === "banlist" && state.limitPanelCards[state.activeFormat]) renderLimitPanel();
});
loadFormatTrends(state.activeFormat);
if (state.activePage === "banlist") loadLimitPanel(state.activeFormat);
loadMetaSamplesFromServer(false);
setInterval(() => loadMetaSamplesFromServer(false), 30 * 60 * 1000);

els.pageTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button) return;
  setActivePage(button.dataset.page);
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = els.input.value.trim();
  if (!query) return;

  const preferredStyle = document.querySelector('input[name="style"]:checked').value;
  const preferredFormat = document.querySelector('input[name="format"]:checked').value;
  state.activeFormat = VALID_FORMATS.has(preferredFormat) ? preferredFormat : "md";
  await runSearch(query, preferredStyle, "auto");
});

async function runSearch(query, preferredStyle, mode = "auto") {
  setBusy(true, "loading");
  clearError();
  clearSearchChoices();

  try {
    await loadAllCards();
    await loadLimitRegulation(state.activeFormat);
    await loadMetaSamplesFromServer(false);
    const deckQuery = resolveDeckSearchQuery(query);
    const seed = findBestCard(query);

    if (mode === "auto" && shouldShowSearchChoices(deckQuery, seed, query)) {
      renderSearchChoices(query, deckQuery, seed, preferredStyle);
      setStatus("idle");
      return;
    }

    if (mode !== "card" && deckQuery) {
      await loadBuildsForArchetype(deckQuery.name, deckQuery.label, preferredStyle);
      setStatus("done");
      return;
    }

    if (!seed) {
      throw new Error(t("notFound"));
    }

    if (!isCardInFormat(seed, state.activeFormat)) {
      throw new Error(format(t("formatNotAvailable"), { format: activeFormatName() }));
    }
    if (copyLimit(seed) === 0) {
      throw new Error(format(t("formatForbidden"), { format: activeFormatName() }));
    }
    await ensureLocaleDataForCards([seed]);
    const publicDecks = await searchPublicDecksForSeed(seed);
    const decks = buildDeckChoices(seed, preferredStyle, publicDecks);
    await ensureLocaleDataForDecks(decks);
    state.deckVariants = decks;
    state.activeStyle = preferredStyle;
    localStorage.setItem("deckBuilderActiveStyle", state.activeStyle);
    localStorage.setItem("deckBuilderActiveFormat", state.activeFormat);
    state.activeSearchArchetype = "";
    state.activeSearchLabel = "";
    state.activeVariantId = null;
    state.lastDeck = null;
    state.currentSeed = seed;
    state.selectedDetail = { cardId: seed.id, section: "seed" };
    state.viewMode = "list";
    renderFocusCard(seed, reason("reasonSeed"));
    renderBuildListView(seed);
    setStatus("done");
  } catch (error) {
    showError(error.message || t("genericError"));
    setStatus("error");
  } finally {
    state.forceDeckSearchRefresh = false;
    setBusy(false);
  }
}

function shouldShowSearchChoices(deckQuery, seed, query) {
  if (!deckQuery || !seed) return false;
  const compactQuery = compactNormalize(query);
  const compactSeedName = compactNormalize(localizedCard(seed).name || seed.name);
  const compactEnglishName = compactNormalize(seed.name);
  const compactDeckName = compactNormalize(deckQuery.label || deckQuery.name);
  if (!compactQuery) return false;
  if (compactQuery === compactSeedName || compactQuery === compactEnglishName) {
    return compactDeckName !== compactQuery;
  }
  return true;
}

function renderSearchChoices(query, deckQuery, seed, preferredStyle) {
  const seedName = localizedCard(seed).name;
  els.searchChoicePanel.innerHTML = `
    <strong>${escapeHtml(t("searchChoiceTitle"))}</strong>
    <span>${escapeHtml(t("searchChoiceHint"))}</span>
    <div class="search-choice-actions">
      <button type="button" data-search-mode="deck" data-query="${escapeHtml(query)}">${escapeHtml(format(t("searchChoiceDeck"), { name: deckQuery.label || deckQuery.name }))}</button>
      <button type="button" data-search-mode="card" data-query="${escapeHtml(query)}">${escapeHtml(format(t("searchChoiceCard"), { name: seedName }))}</button>
    </div>
  `;
  els.searchChoicePanel.dataset.preferredStyle = preferredStyle;
  els.searchChoicePanel.classList.remove("hidden");
}

function clearSearchChoices() {
  els.searchChoicePanel.classList.add("hidden");
  els.searchChoicePanel.replaceChildren();
}

els.copyMain.addEventListener("click", () => copyDeckSection("main"));
els.copyExtra.addEventListener("click", () => copyDeckSection("extra"));
els.exportText.addEventListener("click", () => copyDeckExport("text"));
els.exportYdk.addEventListener("click", () => copyDeckExport("ydk"));
els.exportYdke.addEventListener("click", () => copyDeckExport("ydke"));
els.exportMd.addEventListener("click", () => copyDeckExport("md"));
els.searchChoicePanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-search-mode]");
  if (!button) return;
  const preferredStyle = document.querySelector('input[name="style"]:checked').value;
  runSearch(button.dataset.query || els.input.value.trim(), preferredStyle, button.dataset.searchMode);
});
els.refreshDataButton.addEventListener("click", () => refreshVisibleData());
els.backToBuildList.addEventListener("click", () => {
  const seed = state.currentSeed || state.deckVariants[0]?.seed || state.lastDeck?.seed;
  if (!seed) return;
  state.viewMode = "list";
  state.lastDeck = null;
  state.activeVariantId = null;
  state.selectedDetail = { cardId: seed.id, section: "seed" };
  renderFocusCard(seed, reason("reasonSeed"));
  renderBuildListView(seed);
});
els.variantTabs.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-variant-id]");
  if (!button) return;
  state.activeVariantId = button.dataset.variantId;
  state.activeStyle = button.dataset.style || state.activeStyle;
  if (button.dataset.style) localStorage.setItem("deckBuilderActiveStyle", state.activeStyle);
  state.lastDeck = activeDeck();
  state.currentSeed = state.lastDeck.seed;
  state.selectedDetail = { cardId: state.lastDeck.seed.id, section: "seed" };
  state.viewMode = "detail";
  await ensureLocaleDataForDecks([state.lastDeck]);
  renderDeck(state.lastDeck);
  renderFocusCard(state.lastDeck.seed, reason("reasonSeed"));
});
els.mainDeck.addEventListener("click", (event) => selectDeckRow(event, "main"));
els.extraDeck.addEventListener("click", (event) => selectDeckRow(event, "extra"));
els.mainDeck.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") selectDeckRow(event, "main");
});
els.extraDeck.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") selectDeckRow(event, "extra");
});
els.deckViewTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-deck-view]");
  if (!button) return;
  state.activeDeckView = button.dataset.deckView === "cards" ? "cards" : "list";
  localStorage.setItem("deckBuilderDeckView", state.activeDeckView);
  if (state.lastDeck) renderDeck(state.lastDeck);
});
function handleTrendSelect(event) {
  const button = event.target.closest("[data-trend-name]");
  if (!button) return false;
  setActiveStyle("competitive");
  loadBuildsForArchetype(button.dataset.trendName, button.dataset.trendLabel || button.dataset.trendName, "competitive");
  return true;
}

els.trendList.addEventListener("click", handleTrendSelect);
els.trendLadderList.addEventListener("click", handleTrendSelect);
els.trendDonut.addEventListener("click", (event) => {
  const target = event.target.closest("[data-trend-name]");
  const name = target?.dataset.trendName || els.trendDonut.dataset.trendName;
  const label = target?.dataset.trendLabel || localizeTrendName(name);
  if (!name) return;
  setActiveStyle("competitive");
  loadBuildsForArchetype(name, label, "competitive");
});
els.limitFilterTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-limit-filter]");
  if (!button) return;
  state.activeLimitFilter = button.dataset.limitFilter || "all";
  renderLimitPanel();
});
els.limitViewTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-limit-view]");
  if (!button) return;
  state.activeLimitView = button.dataset.limitView === "cards" ? "cards" : "list";
  localStorage.setItem("deckBuilderLimitView", state.activeLimitView);
  renderLimitPanel();
});
els.limitRows.addEventListener("click", (event) => {
  const item = event.target.closest("[data-limit-card-id]");
  if (!item) return;
  selectLimitCard(item.dataset.limitCardId);
});
els.limitRows.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const item = event.target.closest("[data-limit-card-id]");
  if (!item) return;
  event.preventDefault();
  selectLimitCard(item.dataset.limitCardId);
});
els.language.addEventListener("change", () => {
  state.language = els.language.value;
  localStorage.setItem("deckBuilderLanguage", state.language);
  if (state.activeSearchArchetype) state.activeSearchLabel = localizeTrendName(state.activeSearchArchetype);
  applyLanguage();
  syncFormatMenu();
  renderTrendPanel();
  renderLimitPanel();
  if (state.viewMode === "list" && (state.currentSeed || state.deckVariants[0]?.seed)) {
    renderFocusCard(state.currentSeed || state.deckVariants[0].seed, reason("reasonSeed"));
    renderBuildListView(state.currentSeed || state.deckVariants[0].seed);
  } else if (state.lastDeck) {
    state.lastDeck = activeDeck();
    renderDeck(state.lastDeck);
    const selected = findSelectedDetail();
    if (selected) renderFocusCard(selected.card, selected.reason);
  }
});
for (const input of document.querySelectorAll('input[name="format"]')) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    state.activeFormat = VALID_FORMATS.has(input.value) ? input.value : "md";
    localStorage.setItem("deckBuilderActiveFormat", state.activeFormat);
    syncFormatMenu();
    if (els.formatMenu) els.formatMenu.open = false;
    renderTrendPanel();
    loadFormatTrends(state.activeFormat);
    if (state.activePage === "banlist") loadLimitPanel(state.activeFormat);
    if (state.activePage === "builder" && state.viewMode !== "empty" && els.input.value.trim()) {
      els.form.requestSubmit();
    }
  });
}

function setActivePage(page, options = {}) {
  const nextPage = page === "banlist" ? "banlist" : "builder";
  state.activePage = nextPage;
  if (options.persist !== false) localStorage.setItem("deckBuilderActivePage", nextPage);

  els.builderPage.classList.toggle("hidden", nextPage !== "builder");
  els.banlistPage.classList.toggle("hidden", nextPage !== "banlist");
  els.pageTabs.querySelectorAll("[data-page]").forEach((button) => {
    const isActive = button.dataset.page === nextPage;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  if (nextPage === "banlist") {
    renderLimitPanel();
    if (!state.limitPanelCards[state.activeFormat]) loadLimitPanel(state.activeFormat);
  }
}

function syncFormatMenu() {
  const key = VALID_FORMATS.has(state.activeFormat) ? state.activeFormat : "md";
  if (els.formatCurrentLabel) els.formatCurrentLabel.textContent = activeFormatName();
  if (els.formatCurrentLogo) {
    els.formatCurrentLogo.src = formatLogoSources[key];
    els.formatCurrentLogo.className = `format-logo format-logo-${key}`;
  }
}

async function loadAllCards() {
  if (state.allCards.length && state.searchIndex.length) return;

  const aliasPromise = fetchAliasSearchData();
  const masterDuelLocalePromise = ensureMasterDuelLocaleData();
  const cardPromise = CAN_USE_LOCAL_API
    ? fetch(CARDINFO_URL)
    : ensureOfflineScript("data/cardinfo-cache.js", "YGO_CARDINFO_CACHE").then(() => ({
      ok: Boolean(window.YGO_CARDINFO_CACHE),
      json: async () => window.YGO_CARDINFO_CACHE || { data: [] },
    }));
  const [cardResult, aliasResult, masterDuelLocaleResult] = await Promise.allSettled([
    cardPromise,
    aliasPromise,
    masterDuelLocalePromise,
  ]);

  if (cardResult.status === "rejected" || !cardResult.value.ok) {
    throw new Error(t("apiError"));
  }

  const payload = await cardResult.value.json();
  state.allCards = payload.data || [];

  if (aliasResult.status === "fulfilled") {
    state.aliasSearchData = aliasResult.value;
  } else {
    state.aliasSearchData = { entries: [] };
  }

  if (masterDuelLocaleResult.status !== "fulfilled") {
    state.masterDuelLocaleData = { cards: {}, searchEntries: [], archetypes: {} };
    state.masterDuelLocaleById = new Map();
  }

  state.cardByAnyId = buildCardIdMap(state.allCards);
  state.inferredArchetypeLocales = buildInferredArchetypeLocales(state.allCards, state.masterDuelLocaleData, state.aliasSearchData);
  state.searchIndex = buildSearchIndex(state.allCards, state.aliasSearchData, state.masterDuelLocaleData);
}

async function loadLimitRegulation(targetFormat = state.activeFormat, options = {}) {
  if (!options.forceRefresh && state.limitRegulations[targetFormat]) return state.limitRegulations[targetFormat];
  if (!VALID_FORMATS.has(targetFormat)) return null;

  if (!CAN_USE_LOCAL_API) await ensureOfflineScript("data/limit-regulations-cache.js", "YGO_LIMIT_REGULATIONS");
  if (!CAN_USE_LOCAL_API && window.YGO_LIMIT_REGULATIONS?.formats?.[targetFormat]) {
    const payload = window.YGO_LIMIT_REGULATIONS.formats[targetFormat];
    state.limitRegulations[targetFormat] = {
      date: payload.date || "",
      regulation: payload.regulation || {},
      cachedAt: payload.cachedAt || window.YGO_LIMIT_REGULATIONS.generatedAt || "",
      stale: Boolean(payload.stale),
    };
    return state.limitRegulations[targetFormat];
  }

  try {
    const refresh = options.forceRefresh ? "&refresh=1" : "";
    const response = await fetch(`${LIMIT_REGULATION_API}?format=${encodeURIComponent(targetFormat)}${refresh}`, {
      cache: options.forceRefresh ? "no-store" : "default",
    });
    if (!response.ok) throw new Error(`limit regulation ${response.status}`);
    const payload = await response.json();
    state.limitRegulations[targetFormat] = {
      date: payload.date || "",
      regulation: payload.regulation || {},
      cachedAt: payload.cachedAt || "",
      stale: Boolean(payload.stale),
    };
  } catch {
    state.limitRegulations[targetFormat] = { date: "", regulation: null };
  }

  return state.limitRegulations[targetFormat];
}

function buildCardIdMap(cards) {
  const map = new Map();
  for (const card of cards) {
    map.set(Number(card.id), card);
    for (const image of card.card_images || []) {
      if (image.id) map.set(Number(image.id), card);
    }
    for (const info of card.misc_info || []) {
      if (info.konami_id) map.set(Number(info.konami_id), card);
    }
  }
  return map;
}

function buildLocaleMap(aliasData) {
  const map = new Map();
  for (const entry of aliasData.entries || []) {
    map.set(Number(entry.id), entry.texts || {});
  }
  return map;
}

function buildMasterDuelLocaleMap(localeData) {
  const map = new Map();
  for (const [id, entry] of Object.entries(localeData?.cards || {})) {
    map.set(Number(id), entry || {});
  }
  return map;
}

function buildInferredArchetypeLocales(cards, localeData, aliasData = {}) {
  const buckets = {};
  const aliasById = new Map((aliasData.entries || []).map((entry) => [Number(entry.id), entry]));
  const addCandidate = (archetype, label) => {
    if (!archetype || !label) return;
    const normalizedLabel = compactNormalize(label);
    if (!normalizedLabel || normalizedLabel.length < 2 || normalizedLabel.length > 18) return;
    const bucket = buckets[archetype] || (buckets[archetype] = new Map());
    bucket.set(label, (bucket.get(label) || 0) + 1);
  };

  for (const card of cards || []) {
    if (!card?.archetype) continue;
    const locale = localeData?.cards?.[String(card.id)] || {};
    const alias = aliasById.get(Number(card.id)) || {};
    const officialNames = [
      locale["zh-CN"]?.name,
      locale["zh-TW"]?.name,
      alias.texts?.["zh-CN"]?.name,
      alias.texts?.["zh-TW"]?.name,
      ...(alias.names || [])
        .filter((name) => ["zh-CN", "zh-TW", "md-zh-CN", "md-zh-TW"].includes(name.lang))
        .map((name) => name.name),
    ]
      .map((name) => decodeEntities(name || ""))
      .filter(Boolean);

    for (const officialName of officialNames) {
      for (const label of inferArchetypeLabelsFromOfficialName(officialName)) {
        addCandidate(card.archetype, label);
      }
    }
  }

  const zh = {};
  for (const [archetype, labels] of Object.entries(buckets)) {
    const best = [...labels.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
    if (!best || best[1] < 2) continue;
    if (state.masterDuelLocaleData?.archetypes?.["zh-CN"]?.[archetype]) continue;
    if (fieldMaps.zh?.archetype?.[archetype] || trendNameMaps.zh?.[archetype]) continue;
    zh[archetype] = best[0];
  }

  return { zh };
}

function inferArchetypeLabelFromOfficialName(name) {
  return inferArchetypeLabelsFromOfficialName(name)[0] || "";
}

function inferArchetypeLabelsFromOfficialName(name) {
  const text = compactSpaces(name)
    .replace(/^[『「“"]+/, "")
    .replace(/[』」”"]+$/g, "");
  if (!text) return [];
  const parts = text
    .split(/[・･－—–\-:：·\s「『“"（(]/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = [parts[0], parts.at(-1), text]
    .filter(Boolean)
    .map((label) => label
      .replace(/[①②③④⑤⑥⑦⑧⑨⑩].*$/u, "")
      .replace(/的?$/, (match, offset, source) => (source.length <= 3 ? match : ""))
      .trim())
    .filter(Boolean);
  return [...new Set(candidates)];
}

async function fetchAliasData() {
  if (!CAN_USE_LOCAL_API) await ensureOfflineScript("data/multilang-aliases.js", "YGO_MULTILANG_ALIASES");
  if (window.YGO_MULTILANG_ALIASES) return window.YGO_MULTILANG_ALIASES;
  const response = await fetch(ALIAS_DATA_URL);
  if (!response.ok) return { entries: [] };
  return response.json();
}

async function fetchAliasSearchData() {
  if (!CAN_USE_LOCAL_API) await ensureOfflineScript("data/multilang-search-index.js", "YGO_MULTILANG_SEARCH_INDEX");
  if (window.YGO_MULTILANG_SEARCH_INDEX) return window.YGO_MULTILANG_SEARCH_INDEX;
  const response = await fetch(ALIAS_SEARCH_URL);
  if (!response.ok) return { entries: [] };
  return response.json();
}

async function ensureMasterDuelLocaleData() {
  if (state.masterDuelLocaleData) return state.masterDuelLocaleData;
  if (!masterDuelLocalePromise) {
    masterDuelLocalePromise = fetchMasterDuelLocaleData()
      .then((payload) => {
        state.masterDuelLocaleData = payload;
        state.masterDuelLocaleById = buildMasterDuelLocaleMap(payload);
        return payload;
      })
      .catch(() => {
        state.masterDuelLocaleData = { cards: {}, searchEntries: [], archetypes: {} };
        state.masterDuelLocaleById = new Map();
        return state.masterDuelLocaleData;
      });
  }
  return masterDuelLocalePromise;
}

async function fetchMasterDuelLocaleData() {
  if (!CAN_USE_LOCAL_API) await ensureOfflineScript("data/master-duel-search-index.js", "YGO_MASTER_DUEL_SEARCH_INDEX");
  if (window.YGO_MASTER_DUEL_SEARCH_INDEX) return window.YGO_MASTER_DUEL_SEARCH_INDEX;
  const response = await fetch(MASTER_DUEL_LOCALE_URL);
  if (!response.ok) return { cards: {}, searchEntries: [], archetypes: {} };
  return response.json();
}

async function fetchFullMasterDuelLocaleData(ids = []) {
  if (!CAN_USE_LOCAL_API) await ensureOfflineScript("data/master-duel-locales-cache.js", "YGO_MASTER_DUEL_LOCALES");
  if (window.YGO_MASTER_DUEL_LOCALES) {
    const wanted = new Set((ids || []).map(Number).filter(Boolean));
    return {
      entries: Object.entries(window.YGO_MASTER_DUEL_LOCALES.cards || {})
        .filter(([id]) => !wanted.size || wanted.has(Number(id)))
        .map(([id, texts]) => ({ id: Number(id), texts })),
    };
  }
  const response = await fetch("data/master-duel-locales.json");
  if (!response.ok) return { entries: [] };
  const payload = await response.json();
  return {
    entries: Object.entries(payload.cards || {})
      .filter(([id]) => !ids.length || ids.includes(Number(id)))
      .map(([id, texts]) => ({ id: Number(id), texts })),
  };
}

async function ensureLocaleDataForDecks(decks) {
  const cards = [];
  for (const deck of decks || []) {
    if (deck?.seed) cards.push(deck.seed);
    for (const item of deck?.main || []) cards.push(item.card);
    for (const item of deck?.extra || []) cards.push(item.card);
    for (const engine of deck?.sourceSample?.engines || []) {
      const card = byName(engine);
      if (card) cards.push(card);
    }
  }
  return Promise.all([
    ensureLocaleDataForCards(cards),
    ensurePackDataForCards(cards),
  ]);
}

async function ensureLocaleDataForCards(cards) {
  if (state.language === "zh" && state.activeFormat === "md") {
    await ensureMasterDuelLocaleDataForCards(cards);
    return;
  }
  if (state.activeFormat !== "md") {
    await ensureOfficialLocaleDataForCards(cards);
    return;
  }
  if (state.language === "en") return;
  const missingIds = [
    ...new Set((cards || []).map((card) => Number(card?.id)).filter((id) => id && !state.localeIds.has(localeCacheKey(id)))),
  ];
  if (!missingIds.length) return;

  try {
    const data = CAN_USE_LOCAL_API
      ? await fetchLocaleSubset(missingIds)
      : await fetchAliasData();
    for (const entry of data.entries || []) {
      state.localeById.set(Number(entry.id), entry.texts || {});
      state.localeIds.add(localeCacheKey(entry.id));
    }
  } catch {
    for (const id of missingIds) state.localeIds.add(localeCacheKey(id));
  }
}

async function ensureOfficialLocaleDataForCards(cards) {
  const locale = konamiLocaleForLanguage();
  const langKey = localeTextKey();
  if (!locale || !langKey) return;
  const missingIds = [
    ...new Set((cards || []).map((card) => Number(card?.id)).filter((id) => id && !state.localeIds.has(localeCacheKey(id)))),
  ];
  if (!missingIds.length) return;

  try {
    const data = await fetchOfficialLocaleSubset(missingIds, locale);
    for (const entry of data.entries || []) {
      const id = Number(entry.id);
      const existing = state.localeById.get(id) || {};
      state.localeById.set(id, { ...existing, ...(entry.texts || {}) });
      state.localeIds.add(localeCacheKey(id));
    }
    if (data.source) {
      for (const id of missingIds) state.localeIds.add(localeCacheKey(id));
    }
  } catch {
    for (const id of missingIds) state.localeIds.add(localeCacheKey(id));
  }
}

async function ensureMasterDuelLocaleDataForCards(cards) {
  await ensureMasterDuelLocaleData();
  const missingIds = [
    ...new Set((cards || []).map((card) => Number(card?.id)).filter((id) => id && !state.masterDuelLocaleFullIds.has(id))),
  ];
  if (!missingIds.length) return;

  try {
    const data = ["http:", "https:"].includes(location.protocol)
      ? await fetchMasterDuelLocaleSubset(missingIds)
      : await fetchFullMasterDuelLocaleData(missingIds);
    const aliasFallbackIds = [];
    for (const entry of data.entries || []) {
      const id = Number(entry.id);
      mergeMasterDuelLocaleEntry(id, entry.texts || {});
      if (state.language !== "en" && !entry.texts?.[localeTextKey()]?.name) aliasFallbackIds.push(id);
      state.masterDuelLocaleFullIds.add(id);
    }
    if (aliasFallbackIds.length) {
      const fallbackData = await fetchLocaleSubset([...new Set(aliasFallbackIds)]);
      for (const entry of fallbackData.entries || []) {
        const id = Number(entry.id);
        const existing = state.localeById.get(id) || {};
        state.localeById.set(id, { ...existing, ...(entry.texts || {}) });
      }
    }
  } catch {
    for (const id of missingIds) state.masterDuelLocaleFullIds.add(id);
  }
}

function mergeMasterDuelLocaleEntry(id, texts) {
  const existing = state.masterDuelLocaleById.get(Number(id)) || {};
  state.masterDuelLocaleById.set(Number(id), {
    ...existing,
    ...texts,
    "zh-CN": {
      ...(existing["zh-CN"] || {}),
      ...(texts["zh-CN"] || {}),
    },
    "zh-TW": {
      ...(existing["zh-TW"] || {}),
      ...(texts["zh-TW"] || {}),
    },
  });
}

async function fetchMasterDuelLocaleSubset(ids) {
  const response = await fetch(`${MASTER_DUEL_LOCALE_SUBSET_URL}?ids=${encodeURIComponent(ids.join(","))}`);
  if (!response.ok) return { entries: [] };
  return response.json();
}

async function fetchLocaleSubset(ids) {
  if (!CAN_USE_LOCAL_API && window.YGO_MULTILANG_ALIASES) {
    const wanted = new Set((ids || []).map(Number).filter(Boolean));
    return {
      entries: (window.YGO_MULTILANG_ALIASES.entries || []).filter((entry) => wanted.has(Number(entry.id))),
    };
  }
  const response = await fetch(`${LOCALE_SUBSET_URL}?ids=${encodeURIComponent(ids.join(","))}`);
  if (!response.ok) return { entries: [] };
  return response.json();
}

async function fetchOfficialLocaleSubset(ids, locale) {
  if (!CAN_USE_LOCAL_API) return fetchLocaleSubset(ids);
  const response = await fetch(`${OFFICIAL_LOCALE_SUBSET_URL}?locale=${encodeURIComponent(locale)}&ids=${encodeURIComponent(ids.join(","))}`);
  if (!response.ok) return { entries: [] };
  return response.json();
}

function localeCacheKey(id) {
  return `${state.activeFormat}:${konamiLocaleForLanguage() || state.language}:${Number(id)}`;
}

function localeTextKey() {
  if (state.language === "zh") return "zh-CN";
  if (state.language === "ja") return "ja-JP";
  if (state.language === "en") return "en";
  return "";
}

function konamiLocaleForLanguage() {
  if (state.language === "zh") return "cn";
  if (state.language === "ja") return "ja";
  if (state.language === "en") return "en";
  return "";
}

async function ensurePackDataForCards(cards) {
  const missingIds = [
    ...new Set((cards || []).map((card) => Number(card?.id)).filter((id) => id && !state.packIds.has(id))),
  ];
  if (!missingIds.length) return;

  if (!CAN_USE_LOCAL_API) await ensureOfflineScript("data/pack-index-cache.js", "YGO_PACK_INDEX");
  if (!CAN_USE_LOCAL_API && window.YGO_PACK_INDEX?.cards) {
    for (const id of missingIds) {
      state.packRowsById.set(id, window.YGO_PACK_INDEX.cards[id] || {});
      state.packIds.add(id);
    }
    return;
  }

  try {
    const response = await fetch(`${PACK_SUBSET_URL}?ids=${encodeURIComponent(missingIds.join(","))}`);
    if (!response.ok) throw new Error("pack subset response");
    const payload = await response.json();
    for (const entry of payload.entries || []) {
      const id = Number(entry.id);
      state.packRowsById.set(id, entry.packs || {});
      state.packIds.add(id);
    }
  } catch {
    for (const id of missingIds) state.packIds.add(id);
  }
}

async function loadMetaSamplesFromServer(forceRefresh) {
  if (!CAN_USE_LOCAL_API) return false;
  try {
    if (forceRefresh) {
      await fetch("/api/refresh-meta", { cache: "no-store" });
    }
    const response = await fetch("/api/meta-samples", { cache: forceRefresh ? "no-store" : "default" });
    if (!response.ok) return false;
    const payload = await response.json();
    if (Array.isArray(payload.samples)) {
      state.metaSamples = payload;
      state.metaRefreshState = payload.refreshState || null;
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function loadFormatTrendsFromLocalCache(formatKey) {
  await ensureOfflineScript("data/deck-search-cache.js", "YGO_DECK_SEARCH_CACHE");
  await ensureOfflineScript("data/power-rankings-cache.js", "YGO_POWER_RANKINGS_CACHE");
  state.formatTrends[formatKey] = buildLocalFormatTrends(formatKey);
  state.formatPowerRankings[formatKey] = localPowerRankingsForFormat(formatKey) || buildLocalPowerRankings(formatKey, state.formatTrends[formatKey]);
  if (state.activeFormat === formatKey) renderTrendPanel();
  return true;
}

async function loadFormatTrends(targetFormat = state.activeFormat, options = {}) {
  const formatKey = VALID_FORMATS.has(targetFormat) ? targetFormat : "tcg";
  if (!CAN_USE_LOCAL_API) {
    return loadFormatTrendsFromLocalCache(formatKey);
  }
  if (!options.forceRefresh && state.formatTrends[formatKey] && state.formatPowerRankings[formatKey]) {
    if (state.activeFormat === formatKey) renderTrendPanel();
    return true;
  }
  try {
    els.trendStatus.textContent = t("trendLoading");
    const refresh = options.forceRefresh ? "&refresh=1" : "";
    const [trendResult, powerResult] = await Promise.allSettled([
      fetch(`/api/format-trends?format=${encodeURIComponent(formatKey)}${refresh}`, { cache: options.forceRefresh ? "no-store" : "default" }),
      fetch(`/api/power-rankings?format=${encodeURIComponent(formatKey)}${refresh}`, { cache: options.forceRefresh ? "no-store" : "default" }),
    ]);
    if (trendResult.status !== "fulfilled" || !trendResult.value.ok) throw new Error("trend response");
    const payload = await trendResult.value.json();
    state.formatTrends[formatKey] = payload;
    if (powerResult.status === "fulfilled" && powerResult.value.ok) {
      state.formatPowerRankings[formatKey] = await powerResult.value.json();
    } else {
      state.formatPowerRankings[formatKey] = { format: formatKey, groups: [] };
    }
    if (state.activeFormat === formatKey) renderTrendPanel();
    return true;
  } catch {
    await loadFormatTrendsFromLocalCache(formatKey);
    return false;
  }
}

function renderTrendPanel() {
  const data = state.formatTrends[state.activeFormat];
  const items = (data?.items || []).filter((item) => Number(item.count) > 0).slice(0, 10);
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const windowDays = Number(data?.windowDays || (state.activeFormat === "md" ? 14 : 30));
  if (els.trendTitle) els.trendTitle.textContent = format(t("trendPanelTitleWindow"), { days: windowDays });

  if (!items.length || !total) {
    els.trendStatus.textContent = data ? t("trendEmpty") : t("trendLoading");
    els.trendDonut.classList.remove("has-pie");
    els.trendDonut.style.background = "#e9efea";
    els.trendDonut.dataset.trendName = "";
    els.trendDonut.innerHTML = `<span>${escapeHtml(t("trendEmpty"))}</span>`;
    els.trendList.innerHTML = "";
    els.trendLadderList.innerHTML = `<div class="ladder-empty">${escapeHtml(t("trendEmpty"))}</div>`;
    els.trendMeta.textContent = "";
    return;
  }

  els.trendDonut.classList.add("has-pie");
  els.trendDonut.style.background = "transparent";
  els.trendDonut.dataset.trendName = items[0]?.name || "";
  els.trendDonut.innerHTML = renderTrendImagePie(items, total);
  els.trendStatus.textContent = format(t("trendReady"), { format: activeFormatName(), count: Number(data?.sourceTotal || total) });
  els.trendList.innerHTML = items.map((item, index) => {
    const share = Math.round((Number(item.count || 0) / total) * 100);
    const name = localizeTrendName(item.name);
    return `
      <button class="trend-row" type="button" title="${escapeHtml(name)}" data-trend-name="${escapeHtml(item.name)}" data-trend-label="${escapeHtml(name)}">
        <span class="trend-swatch" style="background:${TREND_COLORS[index % TREND_COLORS.length]}"></span>
        <span class="trend-name">${escapeHtml(name)}</span>
        <span class="trend-value">${share}% · ${escapeHtml(String(item.count))}</span>
      </button>
    `;
  }).join("");
  els.trendLadderList.innerHTML = renderPowerRankings(state.formatPowerRankings[state.activeFormat]);
  els.trendMeta.textContent = format(t("trendMeta"), {
    sources: (data.sources || []).map(localizeTrendSource).join(" / ") || "--",
    days: windowDays,
    shown: items.length,
    chartCount: total,
  });
  scheduleVisibleImagePreload({
    trendItems: items,
    powerRankings: state.formatPowerRankings[state.activeFormat],
  });
}

function renderPowerRankings(data) {
  const groups = (data?.groups || []).filter((group) => /^tier\s+[123]$/i.test(String(group.tier || group.label || "")) && (group.items || []).length);
  if (!groups.length) return `<div class="ladder-empty">${escapeHtml(t("trendEmpty"))}</div>`;
  return groups.map((group) => `
    <section class="power-tier">
      <header>
        <strong>${escapeHtml(localizePowerTier(group.tier || group.label))}</strong>
        <span>${escapeHtml(group.description || "")}</span>
      </header>
      <div class="power-tier-list">
        ${(group.items || []).map((item) => renderPowerRankingItem(item)).join("")}
      </div>
    </section>
  `).join("");
}

function renderPowerRankingItem(item) {
  const rawName = item.name || item.label || "";
  const displayName = localizePowerRankingName(item);
  const searchName = rawName.replace(/\s+Engine$/i, "");
  const image = item.image || trendRepresentativeImage(searchName);
  const power = Number(item.power || 0);
  const powerText = Number.isFinite(power) && power > 0 ? power.toFixed(power % 1 ? 1 : 0) : "--";
  return `
    <button class="power-row" type="button" title="${escapeHtml(displayName)}" data-trend-name="${escapeHtml(searchName)}" data-trend-label="${escapeHtml(displayName)}">
      ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />` : `<span class="power-row-image-fallback"></span>`}
      <span class="power-row-main">
        <span class="power-row-name">${escapeHtml(displayName)}</span>
        <span class="power-row-kind">${escapeHtml(item.kind === "engine" ? powerEngineLabel() : activeFormatName())}</span>
      </span>
      <span class="power-row-score">Power <b>${escapeHtml(powerText)}</b></span>
    </button>
  `;
}

function localizePowerTier(tier) {
  const key = String(tier || "");
  return key.toUpperCase();
}

function localizePowerRankingName(item) {
  const name = String(item.name || item.label || "").replace(/\s+Engine$/i, "");
  const base = localizeTrendName(name);
  if (item.kind !== "engine") return base;
  if (state.language === "zh") return `${base}组件`;
  if (state.language === "ja") return `${base}エンジン`;
  return `${base} Engine`;
}

function powerEngineLabel() {
  if (state.language === "zh") return "组件";
  if (state.language === "ja") return "エンジン";
  return "Engine";
}

function renderTrendLadder(items, total) {
  return items.map((item, index) => {
    const count = Number(item.count || 0);
    const share = Math.round((count / total) * 100);
    const name = localizeTrendName(item.name);
    const color = TREND_COLORS[index % TREND_COLORS.length];
    const rankClass = index < 3 ? "is-top" : "";
    return `
      <button class="ladder-row ${rankClass}" type="button" title="${escapeHtml(name)}" data-trend-name="${escapeHtml(item.name)}" data-trend-label="${escapeHtml(name)}">
        <span class="ladder-rank">${index + 1}</span>
        <span class="ladder-main">
          <span class="ladder-name">${escapeHtml(name)}</span>
          <span class="ladder-bar" aria-hidden="true"><span style="width:${share}%; background:${color}"></span></span>
        </span>
        <span class="ladder-score">${share}%<small>${escapeHtml(String(count))}</small></span>
      </button>
    `;
  }).join("");
}

function renderTrendImagePie(items, total) {
  let cursor = 0;
  const defs = [];
  const layers = [];
  const center = 50;
  const radius = 49;
  const windowDays = Number(state.formatTrends[state.activeFormat]?.windowDays || (state.activeFormat === "md" ? 14 : 30));
  const title = format(t("trendPanelTitleWindow"), { days: windowDays });

  items.forEach((item, index) => {
    const amount = Number(item.count || 0);
    const startAngle = cursor;
    const endAngle = cursor + (amount / total) * 360;
    cursor = endAngle;

    const color = TREND_COLORS[index % TREND_COLORS.length];
    const clipId = `trend-slice-${state.activeFormat}-${index}`;
    const imageUrl = trendRepresentativeImage(item.name);
    const label = localizeTrendName(item.name);
    const share = Math.round((amount / total) * 100);
    const path = pieSlicePath(center, center, radius, startAngle, endAngle);

    defs.push(`<clipPath id="${clipId}"><path d="${path}"></path></clipPath>`);

    layers.push(`
      <g
        class="trend-pie-segment"
        data-trend-name="${escapeHtml(item.name)}"
        data-trend-label="${escapeHtml(label)}"
        tabindex="0"
        role="button"
      >
        <rect class="trend-pie-fallback" width="100" height="100" fill="${escapeHtml(color)}" clip-path="url(#${clipId})"></rect>
        ${imageUrl ? `<image class="trend-pie-art" href="${escapeHtml(imageUrl)}" x="-20" y="-20" width="140" height="140" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"></image>` : ""}
        <path class="trend-pie-tint" d="${path}" fill="${escapeHtml(color)}"></path>
        <path class="trend-pie-border" d="${path}"></path>
        <path class="trend-pie-hit" d="${path}" fill="transparent"></path>
        <title>${escapeHtml(label)} ${share}%</title>
      </g>
    `);
  });

  return `
    <svg class="trend-pie" viewBox="0 0 100 100" aria-label="${escapeHtml(title)}">
      <defs>${defs.join("")}</defs>
      ${layers.join("")}
      <circle class="trend-pie-ring" cx="50" cy="50" r="49"></circle>
    </svg>
  `;
}

function pieSlicePath(cx, cy, radius, startAngle, endAngle) {
  const span = endAngle - startAngle;
  if (span >= 359.99) {
    return [
      `M ${cx - radius} ${cy}`,
      `A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy}`,
      `A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy}`,
      "Z",
    ].join(" ");
  }

  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = span <= 180 ? 0 : 1;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(angleInRadians)).toFixed(3)),
    y: Number((cy + radius * Math.sin(angleInRadians)).toFixed(3)),
  };
}

function trendRepresentativeImage(name) {
  const card = findTrendRepresentativeCard(name);
  const image = card?.card_images?.[0];
  if (image?.image_url_cropped) return localCardImageUrl(image.id || card.id, "cropped", image.image_url_cropped);
  if (image?.image_url) return localCardImageUrl(image.id || card.id, "cropped", image.image_url);

  const fallbackId = TREND_REPRESENTATIVE_CARD_IDS[name];
  return fallbackId
    ? localCardImageUrl(fallbackId, "cropped", `https://images.ygoprodeck.com/images/cards_cropped/${fallbackId}.jpg`)
    : "";
}

function findTrendRepresentativeCard(name) {
  const mappedId = TREND_REPRESENTATIVE_CARD_IDS[name];
  if (mappedId && state.cardByAnyId.has(mappedId)) return state.cardByAnyId.get(mappedId);

  const normalizedName = normalize(name);
  return state.allCards.find((card) => {
    const cardName = normalize(card.name);
    const cardArchetype = normalize(card.archetype || "");
    return cardArchetype === normalizedName || cardName === normalizedName || cardName.includes(normalizedName);
  });
}

async function loadLimitPanel(targetFormat = state.activeFormat) {
  const formatKey = VALID_FORMATS.has(targetFormat) ? targetFormat : "md";
  els.limitStatus.textContent = t("limitLoading");
  els.limitRows.innerHTML = "";
  els.limitMeta.textContent = "";

  try {
    await loadAllCards();
    await loadLimitRegulation(formatKey);
    state.limitPanelCards[formatKey] = buildLimitPanelData(formatKey);
    if (state.activeFormat === formatKey) {
      await ensureLocaleDataForCards(limitPanelAllCards(formatKey));
      renderLimitPanel();
    }
  } catch {
    state.limitPanelCards[formatKey] = null;
    if (state.activeFormat === formatKey) renderLimitPanel();
  }
}

function renderLimitPanel() {
  const data = state.limitPanelCards[state.activeFormat];
  const regulation = state.limitRegulations[state.activeFormat];
  const displayDate = formatDate(regulation?.date || "");
  const formatName = activeFormatName();

  if (els.banlistTitle) {
    els.banlistTitle.textContent = `${formatName} ${t("limitPanelTitle")}`;
  }

  if (!data) {
    els.limitStatus.textContent = displayDate ? format(t("limitReady"), { format: activeFormatName(), date: displayDate }) : t("limitLoading");
    els.limitRows.innerHTML = "";
    els.limitMeta.textContent = t("limitEmpty");
    return;
  }

  const counts = limitPanelCounts(data);
  const rows = limitPanelRows(data);
  const filteredRows = state.activeLimitFilter === "all" ? rows : rows.filter((row) => row.status === state.activeLimitFilter);
  if (!filteredRows.some((row) => Number(row.card.id) === Number(state.selectedLimitCardId))) {
    state.selectedLimitCardId = filteredRows[0]?.card.id || null;
  }

  els.limitStatus.textContent = format(t("limitReady"), {
    format: formatName,
    date: displayDate || "--",
  });
  els.limitRows.classList.toggle("limit-card-grid", state.activeLimitView === "cards");
  els.limitRows.closest(".limit-list-shell")?.classList.toggle("card-mode", state.activeLimitView === "cards");
  els.limitRows.innerHTML = filteredRows.map((row) => (
    state.activeLimitView === "cards" ? renderLimitCardTile(row) : renderLimitRow(row)
  )).join("") || `<p class="limit-empty">${escapeHtml(t("limitEmpty"))}</p>`;
  els.limitMeta.textContent = `${format(t("limitUpdated"), { date: displayDate || "--" })} ${format(t("limitSummary"), {
    total: rows.length,
    forbidden: counts.forbidden,
    limited: counts.limited,
    semi: counts["semi-limited"],
  })}`;
  renderLimitFilterTabs(counts, rows.length);
  renderLimitViewTabs();
  renderLimitDetail(filteredRows.find((row) => Number(row.card.id) === Number(state.selectedLimitCardId)));
}

function renderLimitFilterTabs(counts, total) {
  els.limitFilterTabs.querySelectorAll("[data-limit-filter]").forEach((button) => {
    const filter = button.dataset.limitFilter || "all";
    const count = filter === "all" ? total : counts[filter] || 0;
    const label = t(filter === "all" ? "limitAll" : limitStatusLabelKey(filter));
    button.classList.toggle("active", filter === state.activeLimitFilter);
    button.textContent = `${label} ${count}`;
  });
}

function renderLimitRow({ card, status, limit }) {
  const localized = localizedCard(card);
  const type = card.type ? localizeType(card.type) : "";
  const race = card.race ? localizeRace(card.race) : "";
  const attribute = card.attribute ? localizeAttribute(card.attribute) : "";
  const subline = [type, race, attribute].filter(Boolean).join(" · ");
  const statusLabel = t(limitStatusLabelKey(status));
  const isActive = Number(card.id) === Number(state.selectedLimitCardId);
  return `
    <article class="limit-row${isActive ? " active" : ""}" data-limit-card-id="${escapeHtml(card.id)}" role="button" tabindex="0">
      <div class="limit-card-name">
        <strong>${escapeHtml(localized.name)}</strong>
        <small>${escapeHtml(card.archetype ? localizeArchetype(card.archetype) : "")}</small>
      </div>
      <div class="limit-card-type">${escapeHtml(subline || type || "-")}</div>
      <div><span class="ban-badge ban-${status.replace(/[^a-z]+/g, "-")}">${escapeHtml(statusLabel)}</span></div>
      <div class="limit-copy-count">${escapeHtml(format(t("limitCountAllowed"), { count: limit }))}</div>
    </article>
  `;
}

function renderLimitCardTile({ card, status, limit }) {
  const localized = localizedCard(card);
  const type = card.type ? localizeType(card.type) : "";
  const statusLabel = t(limitStatusLabelKey(status));
  const isActive = Number(card.id) === Number(state.selectedLimitCardId);
  return `
    <article class="limit-card-tile${isActive ? " active" : ""}" data-limit-card-id="${escapeHtml(card.id)}" role="button" tabindex="0">
      <div class="limit-image-frame">
        <img src="${cardImage(card, true)}" alt="${escapeHtml(localized.name)}" loading="lazy" />
        ${renderLimitCountBadge(status, limit, statusLabel)}
      </div>
      <div>
        <strong>${escapeHtml(localized.name)}</strong>
        <span>${escapeHtml(type || "-")}</span>
      </div>
      <footer>
        <span class="ban-badge ban-${status.replace(/[^a-z]+/g, "-")}">${escapeHtml(statusLabel)}</span>
        <small>${escapeHtml(format(t("limitCountAllowed"), { count: limit }))}</small>
      </footer>
    </article>
  `;
}

function renderLimitViewTabs() {
  els.limitViewTabs.querySelectorAll("[data-limit-view]").forEach((button) => {
    const view = button.dataset.limitView === "cards" ? "cards" : "list";
    button.classList.toggle("active", view === state.activeLimitView);
    button.textContent = t(view === "cards" ? "limitViewCards" : "limitViewList");
  });
}

function renderLimitDetail(row) {
  if (!row) {
    els.limitDetail.innerHTML = `<p>${escapeHtml(t("limitDetailEmpty"))}</p>`;
    return;
  }

  const { card, status, limit } = row;
  const localized = localizedCard(card);
  const statusLabel = t(limitStatusLabelKey(status));
  const fields = [
    card.type ? localizeType(card.type) : "",
    card.archetype ? localizeArchetype(card.archetype) : "",
    card.race ? localizeRace(card.race) : "",
    card.attribute ? localizeAttribute(card.attribute) : "",
  ].filter(Boolean);

  els.limitDetail.innerHTML = `
    <div class="limit-detail-card">
      <div class="limit-image-frame">
        ${largeCardImageMarkup(card, localized.name, "loading=\"lazy\"")}
        ${renderLimitCountBadge(status, limit, statusLabel)}
      </div>
      <div>
        <p class="eyebrow">${escapeHtml(t("limitDetailTitle"))}</p>
        <h3>${escapeHtml(localized.name)}</h3>
        <div class="seed-meta">
          ${fields.map((field) => `<span>${escapeHtml(field)}</span>`).join("")}
          <span class="ban-badge ban-${status.replace(/[^a-z]+/g, "-")}">${escapeHtml(`${statusLabel} · ${format(t("limitCountAllowed"), { count: limit })}`)}</span>
        </div>
        <p class="seed-desc">${escapeHtml(localized.desc || t("noDesc"))}</p>
        ${renderCardSets(card)}
      </div>
    </div>
  `;
  upgradeLargeCardImages(els.limitDetail);

  if (card.id && !state.packIds.has(Number(card.id))) {
    ensurePackDataForCards([card]).then(() => {
      if (Number(state.selectedLimitCardId) === Number(card.id)) renderLimitPanel();
    });
  }
}

function renderLimitCountBadge(status, limit, label) {
  const normalizedStatus = status.replace(/[^a-z]+/g, "-");
  const forbiddenClass = status === "forbidden" ? " is-forbidden" : "";
  const content = status === "forbidden" ? "" : String(limit);
  return `<span class="limit-count-badge ban-${normalizedStatus}${forbiddenClass}" aria-label="${escapeHtml(label)}">${escapeHtml(content)}</span>`;
}

function selectLimitCard(cardId) {
  const id = Number(cardId);
  if (!Number.isFinite(id)) return;
  state.selectedLimitCardId = id;
  renderLimitPanel();
}

function buildLimitPanelData(targetFormat = state.activeFormat) {
  const regulation = state.limitRegulations[targetFormat]?.regulation;
  if (!regulation) return null;
  const grouped = {
    forbidden: [],
    limited: [],
    "semi-limited": [],
  };
  const seen = {
    forbidden: new Set(),
    limited: new Set(),
    "semi-limited": new Set(),
  };

  for (const [id, limit] of Object.entries(regulation)) {
    const status = limit === 0 ? "forbidden" : limit === 1 ? "limited" : limit === 2 ? "semi-limited" : "";
    if (!status) continue;
    const card = state.cardByAnyId.get(Number(id));
    if (!card || seen[status].has(Number(card.id))) continue;
    grouped[status].push(card);
    seen[status].add(Number(card.id));
  }

  for (const status of Object.keys(grouped)) {
    grouped[status].sort((a, b) => localizedCard(a).name.localeCompare(localizedCard(b).name, document.documentElement.lang || undefined));
  }

  return grouped;
}

function limitPanelAllCards(formatKey = state.activeFormat) {
  const data = state.limitPanelCards[formatKey];
  if (!data) return [];
  return LIMIT_DISPLAY_ORDER.flatMap((status) => data[status] || []);
}

function limitPanelRows(data) {
  return LIMIT_DISPLAY_ORDER.flatMap((status) => {
    const limit = { forbidden: 0, limited: 1, "semi-limited": 2 }[status];
    return (data[status] || []).map((card) => ({ card, status, limit }));
  });
}

function limitPanelCounts(data) {
  return {
    forbidden: data.forbidden?.length || 0,
    limited: data.limited?.length || 0,
    "semi-limited": data["semi-limited"]?.length || 0,
  };
}

function limitStatusLabelKey(status) {
  return {
    forbidden: "banBanned",
    limited: "banLimited",
    "semi-limited": "banSemiLimited",
  }[status] || "limitAll";
}

function buildSearchIndex(cards, aliasData, masterDuelLocaleData) {
  const cardsById = new Map(cards.map((card) => [Number(card.id), card]));
  const index = [];

  for (const card of cards) {
    addSearchEntry(index, card, card.name, "english", 100);
    if (card.archetype) addSearchEntry(index, card, card.archetype, "archetype", 24);
  }

  for (const entry of aliasData.entries || []) {
    const card = cardsById.get(Number(entry.id));
    if (!card) continue;

    for (const alias of entry.names || []) {
      if (isLegacyChineseAliasSuppressed(alias, card, masterDuelLocaleData)) continue;
      const weight = alias.lang === "alias" ? 180 : 150;
      addSearchEntry(index, card, alias.name, alias.lang, weight);
    }
  }

  for (const entry of masterDuelLocaleData?.searchEntries || []) {
    const card = cardsById.get(Number(entry.id));
    if (!card) continue;

    for (const alias of entry.names || []) {
      const weight = alias.lang === "md-en" ? 110 : 190;
      addSearchEntry(index, card, alias.name, alias.lang, weight);
    }
  }

  return index;
}

function isLegacyChineseAliasSuppressed(alias, card, masterDuelLocaleData) {
  if (!alias?.name || !String(alias.lang || "").startsWith("zh")) return false;
  const official = masterDuelLocaleData?.cards?.[String(card.id)];
  const officialNames = [
    official?.["zh-CN"]?.name,
    official?.["zh-TW"]?.name,
  ].filter(Boolean).map(compactNormalize);
  if (!officialNames.length) return false;
  return !officialNames.includes(compactNormalize(alias.name));
}

function addSearchEntry(index, card, label, source, weight) {
  const text = normalize(label);
  const compact = compactNormalize(label);
  if (!text && !compact) return;

  index.push({
    card,
    label,
    source,
    weight,
    text,
    compact,
  });
}

function findBestCard(query) {
  const normalizedQuery = normalize(query);
  const compactQuery = compactNormalize(query);
  if (!normalizedQuery && !compactQuery) return null;
  const scores = new Map();

  for (const entry of state.searchIndex) {
    let score = 0;

    if (entry.text === normalizedQuery || entry.compact === compactQuery) score += 1000;
    if (entry.text.startsWith(normalizedQuery) || entry.compact.startsWith(compactQuery)) score += 420;
    if (entry.text.includes(normalizedQuery) || entry.compact.includes(compactQuery)) score += 260;
    score += sharedTokenScore(entry.text, normalizedQuery);

    if (score <= 0) continue;

    const current = scores.get(entry.card.id) || { card: entry.card, score: 0, label: entry.label, source: entry.source };
    const weightedScore = score + entry.weight;
    if (weightedScore > current.score) {
      scores.set(entry.card.id, {
        card: entry.card,
        score: weightedScore,
        label: entry.label,
        source: entry.source,
      });
    }
  }

  const scored = [...scores.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.card.name.localeCompare(b.card.name);
    })
    .slice(0, 8);

  return scored[0]?.card || null;
}

function resolveDeckSearchQuery(query) {
  const compactQuery = compactNormalize(query);
  const normalizedQuery = normalize(query);
  if (!compactQuery && !normalizedQuery) return null;

  const candidates = new Map();
  const addCandidate = (label, name) => {
    if (!label || !name) return;
    candidates.set(compactNormalize(label), name);
    candidates.set(normalize(label), name);
  };

  for (const [label, name] of Object.entries(deckSearchAliases)) addCandidate(label, name);
  if (state.activeFormat === "md") {
    for (const [name, label] of Object.entries(state.masterDuelLocaleData?.archetypes?.["zh-CN"] || {})) {
      addCandidate(name, name);
      addCandidate(label, name);
    }
    for (const [name, label] of Object.entries(state.inferredArchetypeLocales?.zh || {})) {
      addCandidate(name, name);
      addCandidate(label, name);
    }
  } else {
    for (const [name, label] of Object.entries(fieldMaps.zh?.archetype || {})) {
      addCandidate(name, name);
      addCandidate(label, name);
    }
  }
  for (const [name, label] of Object.entries(fieldMaps.ja?.archetype || {})) {
    addCandidate(name, name);
    addCandidate(label, name);
  }
  for (const [lang, map] of Object.entries(trendNameMaps)) {
    if (state.activeFormat === "md" && lang === "zh") continue;
    for (const [name, label] of Object.entries(map)) {
      addCandidate(name, name);
      addCandidate(label, name);
    }
  }
  for (const trend of state.formatTrends[state.activeFormat]?.items || []) {
    addCandidate(trend.name, trend.name);
    addCandidate(localizeTrendName(trend.name), trend.name);
  }
  for (const card of state.allCards || []) {
    if (card.archetype) addCandidate(card.archetype, card.archetype);
  }

  const exact = candidates.get(compactQuery) || candidates.get(normalizedQuery);
  if (!exact) return null;
  return {
    name: exact,
    label: localizeTrendName(exact),
  };
}

async function searchPublicDecksForSeed(seed) {
  if (!CAN_USE_LOCAL_API) {
    await ensureOfflineScript("data/deck-search-cache.js", "YGO_DECK_SEARCH_CACHE");
    const samples = localSearchDecksByCard(seed, PUBLIC_DECK_SEARCH_LIMIT);
    state.lastDeckSearchCache = {
      cache: samples.length ? "offline" : "offline-empty",
      stale: true,
      cachedAt: offlineCacheGeneratedAt(),
      generatedAt: offlineCacheGeneratedAt(),
      cacheVersion: "offline-static",
    };
    return samples;
  }
  try {
    const refresh = state.forceDeckSearchRefresh ? "&refresh=1" : "";
    const response = await fetch(`/api/deck-search?cardId=${encodeURIComponent(seed.id)}&cardName=${encodeURIComponent(seed.name)}&cardArchetype=${encodeURIComponent(seed.archetype || "")}&format=${encodeURIComponent(state.activeFormat)}&limit=${PUBLIC_DECK_SEARCH_LIMIT}${refresh}`, {
      cache: state.forceDeckSearchRefresh ? "no-store" : "default",
    });
    if (!response.ok) return [];
    const payload = await response.json();
    state.lastDeckSearchCache = deckSearchCacheInfo(payload);
    return Array.isArray(payload.samples) ? payload.samples : [];
  } catch {
    return [];
  }
}

async function searchPublicDecksForArchetype(name) {
  if (!CAN_USE_LOCAL_API) {
    await ensureOfflineScript("data/deck-search-cache.js", "YGO_DECK_SEARCH_CACHE");
    const samples = localSearchDecksByArchetype(name, PUBLIC_DECK_SEARCH_LIMIT);
    state.lastDeckSearchCache = {
      cache: samples.length ? "offline" : "offline-empty",
      stale: true,
      cachedAt: offlineCacheGeneratedAt(),
      generatedAt: offlineCacheGeneratedAt(),
      cacheVersion: "offline-static",
    };
    return samples;
  }
  try {
    const refresh = state.forceDeckSearchRefresh ? "&refresh=1" : "";
    const response = await fetch(`/api/archetype-deck-search?name=${encodeURIComponent(name)}&format=${encodeURIComponent(state.activeFormat)}&limit=${PUBLIC_DECK_SEARCH_LIMIT}${refresh}`, {
      cache: state.forceDeckSearchRefresh ? "no-store" : "default",
    });
    if (!response.ok) return [];
    const payload = await response.json();
    state.lastDeckSearchCache = deckSearchCacheInfo(payload);
    return Array.isArray(payload.samples) ? payload.samples : [];
  } catch {
    return [];
  }
}

function deckSearchCacheInfo(payload) {
  return {
    cache: payload?.cache || "",
    stale: Boolean(payload?.stale),
    cachedAt: payload?.cachedAt || "",
    generatedAt: payload?.generatedAt || "",
    cacheVersion: payload?.cacheVersion || "",
  };
}

function offlineCacheGeneratedAt() {
  return window.YGO_DECK_SEARCH_CACHE?.generatedAt
    || state.metaSamples?.generatedAt
    || window.YGO_LIMIT_REGULATIONS?.generatedAt
    || "";
}

function localDeckCacheEntries() {
  return window.YGO_DECK_SEARCH_CACHE?.entries || [];
}

function localPowerRankingsForFormat(format = state.activeFormat) {
  const payload = window.YGO_POWER_RANKINGS_CACHE?.formats?.[format];
  if (!payload?.groups?.length) return null;
  return {
    ...payload,
    format,
    generatedAt: payload.generatedAt || window.YGO_POWER_RANKINGS_CACHE.generatedAt || offlineCacheGeneratedAt() || "",
    offline: true,
  };
}

function localDeckSamplesForFormat(format = state.activeFormat) {
  const samples = [];
  for (const entry of localDeckCacheEntries()) {
    if (entry.descriptor?.format && entry.descriptor.format !== format) continue;
    for (const sample of entry.samples || []) samples.push({ ...sample, format: sample.format || format, sourceRank: 0 });
  }
  for (const sample of state.metaSamples?.samples || []) {
    if (localSampleFormat(sample) === format) samples.push({ ...sample, format, sourceRank: 1 });
  }
  return uniqueLocalDeckSamples(samples).sort(compareLocalDeckFreshness);
}

function localSearchDecksByCard(seed, limit = 48) {
  const cardId = Number(seed?.id || 0);
  if (!cardId) return [];
  const ids = new Set([cardId]);
  for (const image of seed?.card_images || []) if (image.id) ids.add(Number(image.id));
  const cached = [];
  for (const entry of localDeckCacheEntries()) {
    const descriptor = entry.descriptor || {};
    if (descriptor.format !== state.activeFormat) continue;
    if (descriptor.type === "card" && Number(descriptor.cardId) === cardId) {
      for (const sample of entry.samples || []) cached.push({ ...sample, format: state.activeFormat, sourceRank: 0 });
    }
  }
  const scanned = localDeckSamplesForFormat(state.activeFormat)
    .filter((sample) => localSampleContainsAnyCard(sample, ids))
    .map((sample) => ({ ...sample, sourceRank: sample.sourceRank ?? 1 }));
  return uniqueLocalDeckSamples([...cached, ...scanned]).sort(compareLocalDeckFreshness).slice(0, limit);
}

function localSearchDecksByArchetype(name, limit = 48) {
  const requested = compactSpaces(name);
  const canonical = deckSearchAliases[requested] || requested;
  const needle = normalizeLocalDeckName(canonical);
  if (!needle) return [];
  const cached = [];
  for (const entry of localDeckCacheEntries()) {
    const descriptor = entry.descriptor || {};
    if (descriptor.format !== state.activeFormat || descriptor.type !== "archetype") continue;
    if (normalizeLocalDeckName(descriptor.name) === needle) {
      for (const sample of entry.samples || []) cached.push({ ...sample, format: state.activeFormat, sourceRank: 0 });
    }
  }
  const scanned = localDeckSamplesForFormat(state.activeFormat)
    .filter((sample) => {
      const haystack = normalizeLocalDeckName(`${sample.title || ""} ${(sample.archetypes || []).join(" ")} ${sample.tournament || ""} ${sample.metaText || ""}`);
      return haystack.includes(needle) || needle.includes(haystack);
    })
    .map((sample) => ({ ...sample, sourceRank: sample.sourceRank ?? 1 }));
  return uniqueLocalDeckSamples([...cached, ...scanned]).sort(compareLocalDeckFreshness).slice(0, limit);
}

function buildLocalFormatTrends(format = state.activeFormat) {
  const windowDays = format === "md" ? 14 : 30;
  const samples = localDeckSamplesForFormat(format).filter((sample) => localAgeDays(sample.date || sample.created || sample.updated) <= windowDays);
  const byName = new Map();
  for (const sample of samples) {
    const name = cleanLocalTrendName(sample.archetypes?.[0] || sample.title || "");
    if (!name) continue;
    const current = byName.get(name) || { name, count: 0, sources: [] };
    current.count += 1;
    const source = sample.source || (format === "md" ? "Master Duel Meta Top Decks" : "YGOPRODeck Tournament Meta");
    if (source && !current.sources.includes(source)) current.sources.push(source);
    byName.set(name, current);
  }
  const items = [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10);
  const chartTotal = items.reduce((sum, item) => sum + item.count, 0);
  const sources = [...new Set(samples.map((sample) => sample.source).filter(Boolean))];
  return {
    format,
    generatedAt: offlineCacheGeneratedAt() || new Date().toISOString(),
    windowDays,
    total: chartTotal,
    chartTotal,
    sourceTotal: samples.length,
    sources: sources.length ? sources : [format === "md" ? "Master Duel Meta Top Decks" : "YGOPRODeck Tournament Meta"],
    items,
    offline: true,
  };
}

function buildLocalPowerRankings(format, trends) {
  const total = Number(trends?.chartTotal || trends?.total || 1);
  const items = (trends?.items || []).map((item, index) => {
    const share = total ? Number(item.count || 0) / total : 0;
    return {
      name: item.name,
      label: item.name,
      power: Number((share * 45 + Math.max(0, 8 - index) * 0.45).toFixed(1)),
      url: "",
      image: "",
      kind: "deck",
    };
  });
  const groups = [
    { tier: "Tier 1", label: "TIER 1", description: "Power >= 12", items: items.filter((item) => item.power >= 12) },
    { tier: "Tier 2", label: "TIER 2", description: "Power 7-12", items: items.filter((item) => item.power >= 7 && item.power < 12) },
    { tier: "Tier 3", label: "TIER 3", description: "Power <7", items: items.filter((item) => item.power > 0 && item.power < 7) },
  ].filter((group) => group.items.length);
  return {
    format,
    generatedAt: trends?.generatedAt || offlineCacheGeneratedAt() || new Date().toISOString(),
    source: "Offline cached topping samples power estimate",
    sourceUrl: "",
    estimated: true,
    offline: true,
    groups,
  };
}

function localSampleContainsAnyCard(sample, ids) {
  const cards = [...(sample.mainIds || []), ...(sample.extraIds || []), ...(sample.sideIds || [])].map(Number);
  return cards.some((id) => ids.has(id));
}

function localSampleFormat(sample) {
  const text = `${sample.format || ""} ${sample.categoryUrl || ""} ${sample.source || ""} ${sample.tournament || ""} ${sample.title || ""}`.toLowerCase();
  if (text.includes("master duel") || /\bmd\b/.test(text)) return "md";
  if (text.includes("ocg")) return "ocg";
  return "tcg";
}

function uniqueLocalDeckSamples(samples) {
  const seen = new Set();
  const unique = [];
  for (const sample of samples || []) {
    const key = sample.id ? `id:${sample.id}` : `${sample.title}|${sample.creator}|${(sample.mainIds || []).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(sample);
  }
  return unique;
}

function compareLocalDeckFreshness(a, b) {
  if ((a.sourceRank ?? 1) !== (b.sourceRank ?? 1)) return (a.sourceRank ?? 1) - (b.sourceRank ?? 1);
  const ageA = localAgeDays(a.date || a.created || a.updated);
  const ageB = localAgeDays(b.date || b.created || b.updated);
  if (ageA !== ageB) return ageA - ageB;
  if (Number(b.views || 0) !== Number(a.views || 0)) return Number(b.views || 0) - Number(a.views || 0);
  return String(a.title || "").localeCompare(String(b.title || ""));
}

function localAgeDays(value) {
  const text = String(value || "").trim();
  if (!text) return 999999;
  const relative = text.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    if (unit === "day") return amount;
    if (unit === "week") return amount * 7;
    if (unit === "month") return amount * 30;
    if (unit === "year") return amount * 365;
  }
  const time = Date.parse(text.replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1"));
  if (!Number.isFinite(time)) return 999999;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}

function cleanLocalTrendName(name) {
  return compactSpaces(decodeEntities(name || ""))
    .replace(/\s+Deck$/i, "")
    .replace(/\s+Engine$/i, "")
    .replace(/\s+Control$/i, " Control")
    .trim();
}

function normalizeLocalDeckName(value) {
  return decodeEntities(value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/["“”]/g, "")
    .replace(/[^a-z0-9'+& -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadBuildsForArchetype(archetype, label = localizeTrendName(archetype), preferredStyle = state.activeStyle) {
  if (!archetype) return;
  setBusy(true, "loading");
  clearError();

  try {
    await loadAllCards();
    await loadLimitRegulation(state.activeFormat);
    await loadMetaSamplesFromServer(false);
    const publicDecks = await searchPublicDecksForArchetype(archetype);
    const seed = representativeSeedForArchetype(archetype, publicDecks);
    if (!seed) throw new Error(t("notFound"));

    const workingSeed = { ...seed, archetype };
    await ensureLocaleDataForCards([workingSeed]);
    const decks = buildDeckChoices(workingSeed, preferredStyle, publicDecks, archetype);
    await ensureLocaleDataForDecks(decks);

    state.deckVariants = decks;
    state.activeStyle = preferredStyle;
    state.activeSearchArchetype = archetype;
    state.activeSearchLabel = label;
    localStorage.setItem("deckBuilderActiveStyle", state.activeStyle);
    localStorage.setItem("deckBuilderActiveFormat", state.activeFormat);
    state.activeVariantId = null;
    state.lastDeck = null;
    state.currentSeed = workingSeed;
    state.selectedDetail = { cardId: workingSeed.id, section: "seed" };
    state.viewMode = "list";
    els.input.value = label;
    renderFocusCard(workingSeed, reason("reasonSeed"));
    renderBuildListView(workingSeed);
    setStatus("done");
  } catch (error) {
    showError(error.message || t("genericError"));
    setStatus("error");
  } finally {
    state.forceDeckSearchRefresh = false;
    setBusy(false);
  }
}

async function refreshVisibleData() {
  state.forceDeckSearchRefresh = true;
  delete state.limitRegulations[state.activeFormat];
  delete state.formatTrends[state.activeFormat];
  showToast(t("refreshDataDone"));
  await Promise.allSettled([
    loadMetaSamplesFromServer(true),
    loadFormatTrends(state.activeFormat, { forceRefresh: true }),
    state.activePage === "banlist"
      ? loadLimitRegulation(state.activeFormat, { forceRefresh: true }).then(() => loadLimitPanel(state.activeFormat))
      : loadLimitRegulation(state.activeFormat, { forceRefresh: true }),
  ]);

  const query = els.input.value.trim();
  if (state.activePage === "builder" && query && state.viewMode !== "empty") {
    const preferredStyle = document.querySelector('input[name="style"]:checked').value;
    await runSearch(query, preferredStyle, state.activeSearchArchetype ? "deck" : "auto");
  } else {
    renderTrustPanel(state.lastDeck);
  }
}

function representativeSeedForArchetype(archetype, samples = []) {
  const normalizedArchetype = normalize(archetype);
  const components = deckNameComponents(archetype);
  const frequency = new Map();
  const sampleIds = [];

  for (const sample of samples || []) {
    const ids = [...(sample.mainIds || []), ...(sample.extraIds || [])];
    for (const rawId of ids) {
      const id = Number(rawId);
      if (!Number.isFinite(id)) continue;
      sampleIds.push(id);
      frequency.set(id, (frequency.get(id) || 0) + 1);
    }
  }

  const mapped = trendRepresentativeCandidate(archetype, components);
  if (mapped) return mapped;

  const exact = state.allCards.find((card) => (
    normalize(card.name) === normalizedArchetype
    && canUseRepresentativeCard(card)
    && !isGenericRepresentativeCard(card)
  ));
  if (exact) return exact;

  const directArchetypeCard = bestRepresentativeFromCards(
    state.allCards.filter((card) => card.archetype === archetype),
    archetype,
    components,
    frequency,
  );
  if (directArchetypeCard) return directArchetypeCard;

  const sampleThemeCard = bestRepresentativeFromCards(
    sampleIds.map((id) => state.cardByAnyId.get(id)),
    archetype,
    components,
    frequency,
  );
  if (sampleThemeCard) return sampleThemeCard;

  const componentCard = bestRepresentativeFromCards(
    state.allCards.filter((card) => components.includes(card.archetype)),
    archetype,
    components,
    frequency,
  );
  if (componentCard) return componentCard;

  const nonGenericSampleCard = bestRepresentativeFromCards(
    sampleIds.map((id) => state.cardByAnyId.get(id)),
    archetype,
    components,
    frequency,
    { allowLooseMatch: true },
  );
  if (nonGenericSampleCard) return nonGenericSampleCard;

  const anySampleCard = bestRepresentativeFromCards(
    sampleIds.map((id) => state.cardByAnyId.get(id)),
    archetype,
    components,
    frequency,
    { allowGeneric: true, allowLooseMatch: true },
  );
  if (anySampleCard) return anySampleCard;

  return findBestCard(archetype);
}

function trendRepresentativeCandidate(archetype, components = []) {
  const names = [archetype, ...components];
  for (const name of names) {
    const cardId = TREND_REPRESENTATIVE_CARD_IDS[name];
    const card = cardId ? state.cardByAnyId.get(cardId) : null;
    if (canUseRepresentativeCard(card)) return card;
  }
  return null;
}

function bestRepresentativeFromCards(cards, archetype, components = [], frequency = new Map(), options = {}) {
  const normalizedArchetype = normalize(archetype);
  const normalizedComponents = components.map((component) => normalize(component)).filter(Boolean);
  const candidates = cards
    .filter((card) => canUseRepresentativeCard(card))
    .map((card) => {
      const cardName = normalize(card.name);
      const cardArchetype = normalize(card.archetype || "");
      const matchesTheme = (
        cardArchetype === normalizedArchetype
        || cardName.includes(normalizedArchetype)
        || normalizedComponents.some((component) => cardArchetype === component || cardName.includes(component))
      );

      if (!matchesTheme && !options.allowLooseMatch) return null;
      if (!options.allowGeneric && isGenericRepresentativeCard(card)) return null;

      return {
        card,
        score: representativeCardScore(card, archetype, components, frequency, matchesTheme),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.card.name.localeCompare(b.card.name);
    });

  return candidates[0]?.card || null;
}

function representativeCardScore(card, archetype, components = [], frequency = new Map(), matchesTheme = false) {
  let score = (frequency.get(card.id) || 0) * 20;
  const name = normalize(card.name);
  const desc = normalize(card.desc || "");
  const cardArchetype = card.archetype || "";

  if (cardArchetype === archetype) score += 900;
  if (components.includes(cardArchetype)) score += 720;
  if (name.includes(normalize(archetype))) score += 360;
  if (components.some((component) => name.includes(normalize(component)))) score += 240;
  if (matchesTheme) score += 180;
  if (starterHints.some((hint) => desc.includes(hint))) score += 70;
  if (isExtraDeck(card)) score -= 40;
  if (isGenericRepresentativeCard(card)) score -= 900;

  return score;
}

function canUseRepresentativeCard(card) {
  return Boolean(
    card
    && isCardInFormat(card, state.activeFormat)
    && copyLimit(card) !== 0
    && !isSkillOrToken(card)
  );
}

function isGenericRepresentativeCard(card) {
  const name = normalize(card?.name || "");
  return GENERIC_REPRESENTATIVE_NAME_PARTS.some((part) => name.includes(part));
}

function buildDeckChoices(seed, preferredStyle, publicSamples, forcedArchetype = "") {
  const recentSamples = publicSamples.filter((sample) => publicSampleAgeDays(sample) <= RECENT_PUBLIC_DECK_DAYS);
  const candidateSamples = recentSamples.length ? recentSamples : publicSamples;
  const publicDecks = candidateSamples
    .map((sample, index) => buildDeckFromPublicSample(seed, sample, index, forcedArchetype))
    .filter(Boolean);
  const aiDecks = buildAiDecks(seed, publicSamples, forcedArchetype);

  if (preferredStyle === "ai") return [...aiDecks, ...publicDecks];
  return publicDecks.length ? [...publicDecks, ...aiDecks] : aiDecks;
}

function publicSampleAgeDays(sample) {
  if (Number.isFinite(Number(sample?.ageDays))) return Number(sample.ageDays);
  const value = sample?.date || sample?.created || sample?.updated || "";
  if (!value) return 999999;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 999999;
  return Math.max(0, (Date.now() - parsed) / 86400000);
}

function buildAiDecks(seed, publicSamples = [], forcedArchetype = "") {
  return aiProfiles.map((profile) => {
    const deck = buildDeck(seed, "ai", profile, publicSamples, forcedArchetype);
    return {
      ...deck,
      variantId: profile.id,
      variantKind: "ai",
      variantTitle: "",
      variantDescKey: profile.descKey,
      aiProfile: profile,
    };
  });
}

function buildDeckFromPublicSample(seed, sample, index, forcedArchetype = "") {
  const main = deckRowsFromIds(sample.mainIds || [], reason("reasonSampleMain"));
  const extra = deckRowsFromIds(sample.extraIds || [], reason("reasonSampleExtra"));
  if (countCards(main) < 20) return null;

  const archetype = forcedArchetype || seed.archetype || sample.archetypes?.[0] || inferNameFamily(seed.name);
  const deck = {
    seed,
    style: "public",
    format: state.activeFormat,
    archetype,
    variantId: `public-${sample.id || index}`,
    variantKind: "public",
    variantTitle: sample.title || `Deck ${index + 1}`,
    variantDescKey: "publicDeckDesc",
    main: normalizeDeck(main, 60),
    extra: normalizeDeck(extra, 15),
    score: Math.min(99, estimateScore(main, extra, seed, archetype) + Math.min(8, Math.round((sample.views || 0) / 500))),
    sampleContext: { samples: [{ sample, score: 1000 }], mainPicks: [], extraPicks: [] },
    handSimulation: null,
    sourceSample: sample,
  };
  deck.handSimulation = simulateOpeningHands(deck);
  return deck;
}

function deckRowsFromIds(ids, reasonValue) {
  const rows = [];
  const byId = new Map();
  for (const rawId of ids) {
    const card = state.cardByAnyId.get(Number(rawId));
    if (!card || isBanned(card) || isSkillOrToken(card) || !isCardInFormat(card)) continue;
    const record = byId.get(card.id) || { card, qty: 0, reason: reasonValue };
    record.qty = Math.min(copyLimit(card), record.qty + 1);
    byId.set(card.id, record);
  }
  for (const record of byId.values()) rows.push(record);
  return rows;
}

function activeDeck() {
  return state.deckVariants.find((deck) => deck.variantId === state.activeVariantId) || state.deckVariants[0] || state.lastDeck;
}

function selectDeckRow(event, section) {
  const row = event.target.closest("[data-card-id]");
  if (!row || !state.lastDeck) return;
  event.preventDefault();
  const cardId = Number(row.dataset.cardId);
  const item = state.lastDeck[section].find((entry) => entry.card.id === cardId);
  if (!item) return;
  state.selectedDetail = { cardId, section };
  renderFocusCard(item.card, item.reason);
  markSelectedRows(cardId);
}

function findSelectedDetail() {
  if (!state.selectedDetail || !state.lastDeck) return null;
  if (state.selectedDetail.section === "seed") {
    return { card: state.lastDeck.seed, reason: reason("reasonSeed") };
  }
  const item = state.lastDeck[state.selectedDetail.section]?.find((entry) => entry.card.id === state.selectedDetail.cardId);
  return item ? { card: item.card, reason: item.reason } : null;
}

function buildDeck(seed, style, profile = null, publicSamples = [], forcedArchetype = "") {
  const main = [];
  const extra = [];
  const seedIsExtra = isExtraDeck(seed);
  const archetype = forcedArchetype || seed.archetype || inferNameFamily(seed.name);
  const tokens = getSeedTokens(seed, archetype);
  const sampleContext = buildSampleContext(seed, archetype, tokens, style, publicSamples);
  const engineTarget = targetMainEngineSize(style, profile);

  addCard(seedIsExtra ? extra : main, seed, seedIsExtra ? 1 : desiredCoreQty(seed), reason("reasonSeed"));

  const candidates = scoreCandidates(seed, archetype, tokens, style, profile);
  const mainCandidates = candidates.filter(({ card }) => !isExtraDeck(card) && card.id !== seed.id);
  const extraCandidates = candidates.filter(({ card }) => isExtraDeck(card) && card.id !== seed.id);
  const mainSamplePicks = profile?.samplePickLimit == null ? sampleContext.mainPicks : sampleContext.mainPicks.slice(0, profile.samplePickLimit);

  for (const item of mainSamplePicks) {
    if (countCards(main) >= engineTarget) break;
    if (item.card.id !== seed.id) addCard(main, item.card, item.qty, item.reason);
  }

  for (const item of mainCandidates) {
    if (countCards(main) >= engineTarget) break;
    addCard(main, item.card, item.qty, item.reason);
  }

  for (const [name, qty, reason] of mainStaplesForProfile(profile)) {
    if (countCards(main) >= 40) break;
    const card = byName(name);
    if (card) addCard(main, card, qty, reason);
  }

  for (const item of mainCandidates.slice(engineTarget)) {
    if (countCards(main) >= 40) break;
    addCard(main, item.card, 1, item.reason);
  }

  fillMainDeck(main, seed, archetype, tokens, profile);
  if (style === "ai") balanceAiMainDeck(main, seed, archetype, candidates, sampleContext, profile);

  for (const item of sampleContext.extraPicks) {
    if (countCards(extra) >= 15) break;
    if (item.card.id !== seed.id) addCard(extra, item.card, item.qty, item.reason);
  }

  for (const item of extraCandidates) {
    if (countCards(extra) >= 15) break;
    addCard(extra, item.card, 1, item.reason);
  }

  if (!seedIsExtra) {
    for (const [name, qty, reason] of extraStaples) {
      if (countCards(extra) >= 15) break;
      const card = byName(name);
      if (card) addCard(extra, card, qty, reason);
    }
  }

  fillExtraDeck(extra, seed, archetype, tokens);

  const deck = {
    seed,
    style,
    format: state.activeFormat,
    archetype,
    variantId: `generated-${style}`,
    variantKind: style === "ai" ? "ai" : "generated",
    variantTitle: t(`style${capitalize(style)}`),
    variantDescKey: profile?.descKey || `variant${capitalize(style)}Desc`,
    aiProfile: profile,
    main: normalizeDeck(main, 40),
    extra: normalizeDeck(extra, 15),
    score: estimateScore(main, extra, seed, archetype),
    sampleContext,
    handSimulation: null,
  };

  deck.handSimulation = simulateOpeningHands(deck);
  return deck;
}

function buildSampleContext(seed, archetype, tokens, style, publicSamples = []) {
  const sampleTokens = getSampleMatchTokens(seed, archetype);
  const liveSamples = (publicSamples || [])
    .filter((sample) => Array.isArray(sample.mainIds) && sample.mainIds.length)
    .map((sample, index) => ({ sample, score: 1200 - index * 8 }));
  const localSamples = (state.metaSamples.samples || [])
    .filter((sample) => sampleMatchesActiveFormat(sample))
    .map((sample) => ({ sample, score: scoreSample(sample, seed, archetype, sampleTokens) }))
    .filter((item) => item.score >= 160)
    .sort((a, b) => b.score - a.score);
  const samples = mergeSampleContexts([...liveSamples, ...localSamples]).slice(0, 12);

  return {
    samples,
    mainPicks: aggregateSampleCards(samples, "mainIds", reason("reasonSampleMain"), style),
    extraPicks: aggregateSampleCards(samples, "extraIds", reason("reasonSampleExtra"), style),
  };
}

function mergeSampleContexts(samples) {
  const seen = new Set();
  const merged = [];
  for (const item of samples) {
    const sample = item.sample || {};
    const key = sample.id || sample.url || `${sample.title}|${sample.creator}|${sample.date}|${(sample.mainIds || []).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort((a, b) => b.score - a.score);
}

function sampleMatchesActiveFormat(sample) {
  const text = normalize(`${sample.format || ""} ${sample.source || ""} ${sample.categoryUrl || ""}`);
  if (state.activeFormat === "ocg") return text.includes("ocg");
  if (state.activeFormat === "md") return text.includes("master duel") || text === "md";
  return !text.includes("ocg") && !text.includes("master duel") && text !== "md";
}

function scoreSample(sample, seed, archetype, tokens) {
  const allIds = [...(sample.mainIds || []), ...(sample.extraIds || [])];
  const resolvedIds = new Set(allIds.map((id) => state.cardByAnyId.get(Number(id))?.id || Number(id)));
  let score = resolvedIds.has(seed.id) ? 650 : 0;
  const sampleText = normalize(`${sample.title} ${(sample.archetypes || []).join(" ")} ${sample.metaText || ""}`);
  const archetypeText = normalize(archetype || "");

  if (archetypeText && sampleText.includes(archetypeText)) score += 360;
  for (const token of tokens) {
    if (sampleText.includes(token)) score += 42;
  }

  return score;
}

function aggregateSampleCards(samples, field, reasonValue, style) {
  const stats = new Map();
  for (const { sample, score } of samples) {
    const counts = new Map();
    for (const rawId of sample[field] || []) {
      const card = state.cardByAnyId.get(Number(rawId));
      if (!card || isBanned(card) || isSkillOrToken(card) || !isCardInFormat(card)) continue;
      counts.set(card.id, (counts.get(card.id) || 0) + 1);
    }

    const weight = 1 + Math.min(2.2, score / 420) + sampleWeight(sample);
    for (const [cardId, qty] of counts) {
      const card = state.cardByAnyId.get(Number(cardId));
      const record = stats.get(card.id) || { card, weighted: 0, copies: [], seen: 0 };
      record.weighted += weight * qty;
      record.copies.push(qty);
      record.seen += 1;
      stats.set(card.id, record);
    }
  }

  return [...stats.values()]
    .map((record) => {
      const qty = Math.round(record.weighted / Math.max(1, record.seen * 2.2));
      return {
        card: record.card,
        qty: Math.max(1, Math.min(copyLimit(record.card), qty || modeQty(record.copies))),
        reason: reasonValue,
        score: record.weighted + record.seen * 16,
      };
    })
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
}

function sampleWeight(sample) {
  let weight = 0;
  const placement = normalize(sample.placement || "");
  if (placement.includes("winner")) weight += 1.5;
  if (placement.includes("runner up")) weight += 1.1;
  if (placement.includes("top 4")) weight += 0.8;
  if (placement.includes("top 8")) weight += 0.5;
  if (sample.views > 800) weight += 0.4;
  return weight;
}

function modeQty(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 1;
}

function simulateOpeningHands(deck, iterations = 5000) {
  const pool = [];
  const starterIds = new Set();
  const interactionIds = new Set();

  for (const item of deck.main) {
    for (let i = 0; i < item.qty; i += 1) pool.push(item.card.id);
    if (isStarterCard(item.card, deck)) starterIds.add(item.card.id);
    if (isInteractionCard(item.card)) interactionIds.add(item.card.id);
  }

  let starterHits = 0;
  let interactionHits = 0;
  let bothHits = 0;
  let brickHits = 0;

  for (let i = 0; i < iterations; i += 1) {
    const hand = drawHand(pool, 5);
    const hasStarter = hand.some((id) => starterIds.has(id));
    const hasInteraction = hand.some((id) => interactionIds.has(id));
    if (hasStarter) starterHits += 1;
    if (hasInteraction) interactionHits += 1;
    if (hasStarter && hasInteraction) bothHits += 1;
    if (!hasStarter) brickHits += 1;
  }

  return {
    iterations,
    starterHits,
    interactionHits,
    bothHits,
    brickHits,
    starterRate: starterHits / iterations,
    interactionRate: interactionHits / iterations,
    brickRate: brickHits / iterations,
    starterCount: starterIds.size,
    interactionCount: interactionIds.size,
  };
}

function drawHand(pool, size) {
  const copy = [...pool];
  const hand = [];
  for (let i = 0; i < size && copy.length; i += 1) {
    const index = Math.floor(Math.random() * copy.length);
    hand.push(copy[index]);
    copy.splice(index, 1);
  }
  return hand;
}

function isStarterCard(card, deck) {
  const desc = normalize(card.desc || "");
  const name = normalize(card.name);
  const archetype = normalize(deck.archetype || "");
  if (card.id === deck.seed.id) return true;
  if (card.archetype && deck.archetype && card.archetype === deck.archetype) {
    return starterHints.some((hint) => desc.includes(hint)) || name.includes(archetype);
  }
  if (!deck.archetype) return starterHints.some((hint) => desc.includes(hint)) && !isInteractionCard(card);
  return false;
}

function isInteractionCard(card) {
  const name = normalize(card.name);
  const desc = normalize(card.desc || "");
  const known = [
    "ash blossom",
    "infinite impermanence",
    "effect veiler",
    "nibiru",
    "called by the grave",
    "droll lock bird",
    "psy framegear gamma",
    "ghost belle",
    "ghost mourner",
    "crossout designator",
    "dimension shifter",
    "maxx c",
  ];
  return known.some((term) => name.includes(term)) || desc.includes("negate") || desc.includes("destroy all") || desc.includes("banish");
}

function scoreCandidates(seed, archetype, tokens, style, profile = null) {
  return state.allCards
    .map((card) => {
      if (isBanned(card)) return null;
      if (isSkillOrToken(card)) return null;
      if (!isCardInFormat(card)) return null;
      if (card.name === seed.name) return null;

      const desc = normalize(card.desc || "");
      const name = normalize(card.name);
      let score = 0;
      const reasons = [];

      if (archetype && card.archetype === archetype) {
        score += profile?.id === "ai-engine" ? 165 : 125;
        reasons.push(reason("reasonSameArchetype", { archetype }));
      }

      if (isMainDeckMonster(card)) score += profile?.id === "ai-engine" ? 34 : 22;
      if (isSpellOrTrapCard(card) && profile?.id === "ai-engine") score -= 18;

      for (const token of tokens) {
        if (name.includes(token)) score += profile?.id === "ai-hybrid" ? 30 : 22;
        if (desc.includes(token)) score += profile?.id === "ai-hybrid" ? 28 : 18;
      }

      const seedHasMonsterFields = isMainDeckMonster(seed) || isExtraDeck(seed);
      if (seedHasMonsterFields && seed.race && desc.includes(normalize(seed.race))) {
        score += 12;
        reasons.push(reason("reasonRace", { race: seed.race }));
      }

      if (seedHasMonsterFields && seed.attribute && desc.includes(normalize(seed.attribute))) {
        score += 10;
        reasons.push(reason("reasonAttribute", { attribute: seed.attribute }));
      }

      if (starterHints.some((hint) => desc.includes(hint))) {
        score += 18;
        reasons.push(reason("reasonStarter"));
      }

      if (sameCardKind(seed, card)) score += 6;
      score += aiProfileCandidateBonus(card, seed, archetype, tokens, profile);
      if (score < 18) return null;

      return {
        card,
        score,
        qty: desiredQty(card, score, style, profile),
        reason: reasons[0] || reason("reasonGenericSynergy"),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
}

function aiProfileCandidateBonus(card, seed, archetype, tokens, profile) {
  if (!profile) return 0;
  const desc = normalize(card.desc || "");
  const sameAxis = archetype && card.archetype === archetype;
  const starter = starterHints.some((hint) => desc.includes(hint));
  const interaction = isInteractionCard(card);
  const breaker = isBoardBreakerCard(card);
  const seedHasMonsterFields = isMainDeckMonster(seed) || isExtraDeck(seed);
  const sharedRace = seedHasMonsterFields && seed.race && desc.includes(normalize(seed.race));
  const sharedAttribute = seedHasMonsterFields && seed.attribute && desc.includes(normalize(seed.attribute));

  if (profile.id === "ai-balanced") {
    return (starter ? 14 : 0) + (interaction ? 10 : 0) + (breaker ? 8 : 0);
  }

  if (profile.id === "ai-engine") {
    return (sameAxis ? 38 : 0) + (starter ? 28 : 0) + (sharedRace ? 10 : 0) + (sharedAttribute ? 8 : 0) - (interaction && !sameAxis ? 12 : 0);
  }

  if (profile.id === "ai-going-second") {
    return (breaker ? 72 : 0) + (interaction ? 20 : 0) + (desc.includes("damage") || desc.includes("atk") ? 10 : 0);
  }

  if (profile.id === "ai-control") {
    return (interaction ? 62 : 0) + (card.type?.includes("Trap") ? 20 : 0) + (desc.includes("quick effect") ? 14 : 0) + (starter ? 5 : 0);
  }

  if (profile.id === "ai-hybrid") {
    const crossAxis = !sameAxis && tokenHit(card, tokens);
    return (crossAxis ? 46 : 0) + (sharedRace ? 24 : 0) + (sharedAttribute ? 20 : 0) + (sameCardKind(seed, card) ? 12 : 0) - (sameAxis ? 10 : 0);
  }

  return 0;
}

function isBoardBreakerCard(card) {
  const name = normalize(card.name);
  const desc = normalize(card.desc || "");
  const known = [
    "forbidden droplet",
    "lightning storm",
    "evenly matched",
    "dark ruler no more",
    "harpie feather duster",
    "raigeki",
    "kaiju",
    "lava golem",
    "sphere mode",
  ];
  return known.some((term) => name.includes(term)) || desc.includes("destroy all") || desc.includes("banish all") || desc.includes("send all");
}

function mainStaplesForProfile(profile) {
  if (!profile) return stapleMain;
  return aiStaplePools[profile.staplePool] || stapleMain;
}

function fillMainDeck(deck, seed, archetype, tokens, profile = null) {
  const fallbackNames = [
    "Pot of Prosperity",
    "Pot of Extravagance",
    "Terraforming",
    "Monster Reborn",
    "Called by the Grave",
    "Dark Ruler No More",
    "Evenly Matched",
  ];

  if (profile?.id === "ai-going-second") fallbackNames.unshift("Raigeki", "Harpie's Feather Duster", "Forbidden Droplet");
  if (profile?.id === "ai-control") fallbackNames.unshift("Infinite Impermanence", "Effect Veiler", "Solemn Judgment");

  for (const name of fallbackNames) {
    if (countCards(deck) >= 40) break;
    const card = byName(name);
    if (card) addCard(deck, card, 1, reason("reasonGenericFill"));
  }

  const targetMonsterCount = aiTargetMonsterCount(profile);
  const softPool = state.allCards
    .filter((card) => !isExtraDeck(card) && !isBanned(card) && !isSkillOrToken(card) && isCardInFormat(card))
    .filter((card) => (archetype && card.archetype === archetype) || tokenHit(card, tokens))
    .sort((a, b) => aiFillPriority(b, seed, archetype, tokens, profile) - aiFillPriority(a, seed, archetype, tokens, profile))
    .slice(0, 120);

  for (const card of softPool.filter(isMainDeckMonster)) {
    if (countCards(deck) >= 40 || mainMonsterCount(deck) >= targetMonsterCount) break;
    if (card.id !== seed.id) addCard(deck, card, 1, reason(card.archetype === archetype ? "reasonSameArchetype" : "reasonGenericSynergy", { archetype }));
  }

  for (const card of softPool) {
    if (countCards(deck) >= 40) break;
    if (!isMainDeckMonster(card) && themeSpellTrapCount(deck, archetype, seed) >= themeSpellTrapCap(profile)) continue;
    if (card.id !== seed.id) addCard(deck, card, 1, reason("reasonSameAxis"));
  }
}

function balanceAiMainDeck(deck, seed, archetype, candidates, sampleContext, profile = null) {
  const targetMonsterCount = aiTargetMonsterCount(profile);
  const monsterPool = [
    ...sampleContext.mainPicks,
    ...candidates,
    ...fallbackMonsterPicks(seed, archetype, profile),
  ]
    .filter((item) => isMainDeckMonster(item.card) && item.card.id !== seed.id)
    .sort((a, b) => {
      const aSample = sampleContext.mainPicks.some((item) => item.card.id === a.card.id) ? 120 : 0;
      const bSample = sampleContext.mainPicks.some((item) => item.card.id === b.card.id) ? 120 : 0;
      return (bSample + (b.score || 0)) - (aSample + (a.score || 0));
    });

  let index = 0;
  while (mainMonsterCount(deck) < targetMonsterCount && index < monsterPool.length) {
    const item = monsterPool[index];
    index += 1;
    if (!item || remainingCopies(item.card, deck) <= 0) continue;

    if (countCards(deck) >= 40 && !removeOneMainDeckSpellTrap(deck, seed)) break;
    addCard(deck, item.card, 1, item.reason || reason("reasonSampleMain"));
  }

  const monsterCount = mainMonsterCount(deck);
  if (monsterCount >= targetMonsterCount) return;

  const fallbackMonsters = fallbackMonsterPicks(seed, archetype, profile)
    .map((item) => item.card);

  for (const card of fallbackMonsters) {
    if (mainMonsterCount(deck) >= targetMonsterCount) break;
    if (remainingCopies(card, deck) <= 0) continue;
    if (countCards(deck) >= 40 && !removeOneMainDeckSpellTrap(deck, seed)) break;
    addCard(deck, card, 1, reason(card.archetype === archetype ? "reasonSameArchetype" : "reasonGenericFill", { archetype }));
  }
}

function aiTargetMonsterCount(profile = null) {
  if (profile?.id === "ai-engine") return 16;
  if (profile?.id === "ai-going-second" || profile?.id === "ai-control") return 12;
  return 14;
}

function aiFillPriority(card, seed, archetype, tokens, profile = null) {
  let score = 0;
  const desc = normalize(card.desc || "");
  if (isMainDeckMonster(card)) score += 120;
  if (card.archetype === archetype) score += 45;
  if (tokenHit(card, tokens)) score += 35;
  if (starterHints.some((hint) => desc.includes(hint))) score += 28;
  if (isInteractionCard(card)) score += 20;
  if (profile?.id === "ai-engine" && isSpellOrTrapCard(card) && !starterHints.some((hint) => desc.includes(hint))) score -= 45;
  if (isSpellOrTrapCard(card) && !isInteractionCard(card) && !starterHints.some((hint) => desc.includes(hint))) score -= 22;
  if (card.id === seed.id) score -= 200;
  return score;
}

function themeSpellTrapCap(profile = null) {
  if (profile?.id === "ai-engine") return 14;
  if (profile?.id === "ai-going-second" || profile?.id === "ai-control") return 10;
  return 12;
}

function themeSpellTrapCount(deck, archetype, seed) {
  return deck.reduce((sum, item) => {
    if (!isSpellOrTrapCard(item.card)) return sum;
    if (item.card.id === seed.id) return sum + item.qty;
    if (archetype && item.card.archetype === archetype) return sum + item.qty;
    return sum;
  }, 0);
}

function fallbackMonsterPicks(seed, archetype, profile = null) {
  const tokens = getSeedTokens(seed, archetype);
  const knownNames = [
    "Ash Blossom & Joyous Spring",
    "Effect Veiler",
    "Droll & Lock Bird",
    "Ghost Belle & Haunted Mansion",
    "Ghost Mourner & Moonlit Chill",
    "D.D. Crow",
    "Nibiru, the Primal Being",
    "Maxx \"C\"",
  ];
  const known = knownNames
    .map((name) => byName(name))
    .filter(Boolean)
    .map((card) => ({ card, qty: desiredCoreQty(card), reason: reason("reasonGenericFill"), score: 130 }));

  const themed = state.allCards
    .filter((card) => isMainDeckMonster(card) && !isBanned(card) && !isSkillOrToken(card) && isCardInFormat(card))
    .filter((card) => (archetype && card.archetype === archetype) || tokenHit(card, tokens) || isInteractionCard(card))
    .map((card) => ({
      card,
      qty: desiredQty(card, 90, "ai", profile),
      reason: reason(card.archetype === archetype ? "reasonSameArchetype" : "reasonGenericSynergy", { archetype }),
      score: aiFillPriority(card, seed, archetype, tokens, profile),
    }))
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));

  const seen = new Set();
  return [...themed, ...known].filter((item) => {
    if (seen.has(item.card.id)) return false;
    seen.add(item.card.id);
    return true;
  });
}

function mainMonsterCount(deck) {
  return deck.filter((item) => isMainDeckMonster(item.card)).reduce((sum, item) => sum + item.qty, 0);
}

function remainingCopies(card, deck) {
  const current = deck.find((item) => item.card.id === card.id)?.qty || 0;
  return copyLimit(card) - current;
}

function removeOneMainDeckSpellTrap(deck, seed) {
  for (let index = deck.length - 1; index >= 0; index -= 1) {
    const item = deck[index];
    if (!isSpellOrTrapCard(item.card) || item.card.id === seed.id) continue;
    if (item.qty > 1) item.qty -= 1;
    else deck.splice(index, 1);
    return true;
  }
  return false;
}

function fillExtraDeck(deck, seed, archetype, tokens) {
  const pool = state.allCards
    .filter((card) => isExtraDeck(card) && !isBanned(card) && isCardInFormat(card))
    .filter((card) => (archetype && card.archetype === archetype) || tokenHit(card, tokens))
    .slice(0, 80);

  for (const card of pool) {
    if (countCards(deck) >= 15) break;
    addCard(deck, card, 1, reason("reasonExtraAxis"));
  }

  for (const [name, qty, reason] of extraStaples) {
    if (countCards(deck) >= 15) break;
    const card = byName(name);
    if (card) addCard(deck, card, qty, reason);
  }
}

function addCard(deck, card, desired, reason) {
  if (!card || isBanned(card) || isSkillOrToken(card) || !isCardInFormat(card)) return;
  const current = deck.find((item) => item.card.id === card.id);
  const limit = copyLimit(card);
  const safeDesired = Math.min(desired, limit);
  if (safeDesired <= 0) return;

  if (current) {
    current.qty = Math.min(limit, current.qty + safeDesired);
    return;
  }

  deck.push({ card, qty: safeDesired, reason });
}

function normalizeDeck(deck, target) {
  const normalized = [];
  let total = 0;

  for (const item of deck) {
    if (total >= target) break;
    const qty = Math.min(item.qty, target - total);
    if (qty > 0) {
      normalized.push({ ...item, qty });
      total += qty;
    }
  }

  return normalized;
}

function renderFocusCard(card, reasonValue = null) {
  const localized = localizedCard(card);
  const cardId = Number(card.id);
  els.seedEmpty.classList.add("hidden");
  els.seedCard.classList.remove("hidden");
  els.seedCard.innerHTML = `
    ${largeCardImageMarkup(card, localized.name)}
    <div>
      <p class="eyebrow">${escapeHtml(reasonValue ? t("focusedCard") : t("seedCard"))}</p>
      <h2>${escapeHtml(localized.name)}</h2>
      <div class="seed-meta">
        ${card.type ? `<span>${escapeHtml(localizeType(card.type))}</span>` : ""}
        ${card.archetype ? `<span>${escapeHtml(localizeArchetype(card.archetype))}</span>` : ""}
        ${card.race ? `<span>${escapeHtml(localizeRace(card.race))}</span>` : ""}
        ${card.attribute ? `<span>${escapeHtml(localizeAttribute(card.attribute))}</span>` : ""}
        ${banlistBadges(card).map((badge) => `<span class="ban-badge ${badge.className}">${escapeHtml(badge.label)}</span>`).join("")}
        ${localized.missingOfficial ? `<span class="official-missing-badge">${escapeHtml(t("officialLocaleMissing"))}</span>` : ""}
      </div>
      ${reasonValue ? `<p class="focus-reason">${escapeHtml(reasonText(reasonValue))}</p>` : ""}
      <p class="seed-desc">${escapeHtml(localized.desc || t("noDesc"))}</p>
      ${renderCardSets(card)}
      <p class="image-note">${escapeHtml(t("mainImageNote"))}</p>
    </div>
  `;
  upgradeLargeCardImages(els.seedCard);
  markSelectedRows(card.id);
  if (cardId && !state.packIds.has(cardId)) {
    ensurePackDataForCards([card]).then(() => {
      const selected = findSelectedDetail();
      const focusedId = Number(selected?.card?.id || state.currentSeed?.id || state.lastDeck?.seed?.id);
      if (focusedId === cardId) renderFocusCard(card, reasonValue);
    });
  }
}

function renderCardSets(card) {
  const sets = cardSetRows(card);
  const title = `${activeFormatName()} ${t("cardSetsTitle")}`;
  if (!state.packIds.has(Number(card.id)) && ["http:", "https:"].includes(location.protocol)) {
    return `
      <section class="card-sets">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(t("cardSetsLoading"))}</p>
      </section>
    `;
  }
  if (!sets.length) {
    return `
      <section class="card-sets">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(t("cardSetsEmpty"))}</p>
      </section>
    `;
  }

  return `
    <section class="card-sets">
      <h3>${escapeHtml(title)}</h3>
      <ul>
        ${sets.slice(0, 10).map((set) => `
          <li>
            <strong>${escapeHtml(set.name)}</strong>
            <span>${escapeHtml(set.detail)}</span>
          </li>
        `).join("")}
      </ul>
      ${sets.length > 10 ? `<p>${escapeHtml(format(t("cardSetsMore"), { count: sets.length - 10 }))}</p>` : ""}
    </section>
  `;
}

function cardSetRows(card) {
  const indexed = state.packRowsById.get(Number(card.id))?.[state.activeFormat] || [];
  if (indexed.length) {
    return indexed.map((set) => {
      const name = localizedPackName(set.name || {});
      const detail = [set.code, set.rarity, formatDate(set.date)].filter(Boolean).join(" · ");
      return { name, detail };
    });
  }

  if (state.activeFormat !== "tcg") return [];

  const seen = new Set();
  return (card.card_sets || [])
    .map((set) => {
      const name = compactSpaces(set.set_name || "");
      const code = compactSpaces(set.set_code || "");
      const rarity = compactSpaces(set.set_rarity || "");
      const detail = [code, rarity].filter(Boolean).join(" · ");
      return { name, detail };
    })
    .filter((set) => {
      const key = `${set.name}|${set.detail}`;
      if (!set.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function localizedPackName(name) {
  if (typeof name === "string") return name;
  if (state.language === "zh") return name.zh || name.en || name.ja || "";
  if (state.language === "ja") return name.ja || name.en || name.zh || "";
  return name.en || name.zh || name.ja || "";
}

function renderDeck(deck) {
  state.viewMode = "detail";
  state.currentSeed = deck.seed;
  els.scoreBoard.classList.remove("hidden");
  els.backToBuildList.classList.toggle("hidden", state.deckVariants.length <= 1);
  els.variantSection.classList.add("hidden");
  els.comparisonPanel.classList.add("hidden");
  els.detailInsights.classList.remove("hidden");
  els.deckColumns.classList.remove("hidden");

  const titleName = localizeTrendName(deck.archetype || inferNameFamily(deck.seed.name));
  els.deckTitle.textContent = deckTitleText(deck, titleName);
  els.mainCount.textContent = countCards(deck.main);
  els.extraCount.textContent = countCards(deck.extra);
  els.scoreValue.textContent = deck.score;
  els.notice.classList.remove("error");
  els.notice.dataset.noticeKey = "deck";
  els.notice.textContent = noticeText(deck);
  renderSampleEvidence(deck.sampleContext);
  renderHandSimulation(deck.handSimulation);
  renderTrustPanel(deck);
  renderDeckViewTabs();
  renderRows(els.mainDeck, deck.main);
  renderRows(els.extraDeck, deck.extra);
  const selected = findSelectedDetail();
  if (selected) {
    renderFocusCard(selected.card, selected.reason);
  }
  scheduleVisibleImagePreload({ decks: [deck] });
}

function renderBuildListView(seed) {
  state.viewMode = "list";
  state.currentSeed = seed;
  state.lastDeck = null;
  els.scoreBoard.classList.add("hidden");
  els.backToBuildList.classList.add("hidden");
  els.detailInsights.classList.add("hidden");
  els.deckColumns.classList.add("hidden");
  els.mainDeck.replaceChildren();
  els.extraDeck.replaceChildren();
  resetHandSimulation();

  const titleName = state.activeSearchLabel || localizeTrendName(seed.archetype || inferNameFamily(seed.name));
  els.deckTitle.textContent = state.deckVariants.length ? format(t("buildListPageTitle"), { name: titleName }) : t("chooseBuildTitle");
  els.notice.classList.remove("error");
  els.notice.dataset.noticeKey = "list";
  const publicCount = state.deckVariants.filter((item) => item.variantKind === "public").length;
  const aiCount = state.deckVariants.filter((item) => item.variantKind === "ai").length;
  els.notice.textContent = publicCount
    ? format(t("publicDeckSummary"), { count: publicCount, aiCount, format: activeFormatName() })
    : format(t("aiOnlySummary"), { aiCount, format: activeFormatName() });
  renderTrustPanel(null);
  renderDeckComparison();
  renderVariantTabs();
  scheduleVisibleImagePreload({ decks: state.deckVariants });
}

function renderTrustPanel(deck = null) {
  const decks = deck ? [deck] : state.deckVariants;
  if (!decks.length) {
    els.trustPanel.classList.add("hidden");
    els.trustContent.replaceChildren();
    return;
  }

  const publicDecks = decks.filter((item) => item.variantKind === "public");
  const sourceNames = [...new Set(publicDecks.map((item) => item.sourceSample?.source).filter(Boolean).map(localizeTrendSource))];
  const latestDate = latestSampleDate(decks) || state.lastDeckSearchCache?.generatedAt || state.metaSamples.generatedAt || "";
  const regulation = state.limitRegulations[state.activeFormat] || {};
  const coverage = translationCoverageForDecks(decks);
  const issues = deck ? deckLegalityIssues(deck) : [];
  const deckCache = cacheLabel(state.lastDeckSearchCache);
  const limitCache = cacheLabel(regulation);

  const items = [
    [t("trustFormat"), activeFormatName()],
    [t("trustSource"), sourceNames.length ? sourceNames.join(" / ") : deck?.variantKind === "ai" ? t("aiDeckDesc") : t("trustUnknown")],
    [t("trustUpdated"), latestDate ? formatDateTime(latestDate) : t("trustUnknown")],
    [t("trustBanlist"), regulation.date ? `${activeFormatName()} · ${formatDate(regulation.date)}` : t("trustUnknown")],
    [t("trustLegality"), deck ? (issues.length ? format(t("trustLegalIssues"), { count: issues.length }) : t("trustLegalOk")) : t("trustUnknown")],
    [t("trustTranslation"), format(t("trustTranslationValue"), coverage)],
    [t("trustCache"), format(t("trustCacheValue"), { deckCache, limitCache })],
  ];

  els.trustContent.replaceChildren(...items.map(([label, value]) => trustItem(label, value)));
  els.trustPanel.classList.remove("hidden");
}

function trustItem(label, value) {
  const node = document.createElement("div");
  node.className = "trust-item";
  node.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  return node;
}

function cacheLabel(info) {
  if (!info) return t("trustUnknown");
  const source = info.cache || (info.cachedAt ? "disk" : "");
  if (!source) return t("trustUnknown");
  return info.stale ? `${source} stale` : source;
}

function latestSampleDate(decks) {
  const dates = decks
    .map((deck) => deck.sourceSample?.date || deck.sampleContext?.samples?.[0]?.sample?.date || "")
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b - a);
  return dates[0]?.toISOString() || "";
}

function deckCards(deck) {
  return [...(deck?.main || []), ...(deck?.extra || [])];
}

function uniqueDeckCards(deck) {
  const map = new Map();
  for (const item of deckCards(deck)) {
    if (!item.card?.id || map.has(Number(item.card.id))) continue;
    map.set(Number(item.card.id), item.card);
  }
  return [...map.values()];
}

function translationCoverageForDecks(decks) {
  const cards = new Map();
  for (const deck of decks.slice(0, 12)) {
    for (const card of uniqueDeckCards(deck)) cards.set(Number(card.id), card);
  }
  if (!cards.size && state.currentSeed) cards.set(Number(state.currentSeed.id), state.currentSeed);
  let translated = 0;
  for (const card of cards.values()) {
    const localized = localizedCard(card);
    if (state.language === "en" || (localized.name !== card.name && !localized.missingOfficial)) translated += 1;
  }
  return { translated, total: cards.size };
}

function deckLegalityIssues(deck) {
  return deckCards(deck).filter((item) => item.qty > copyLimit(item.card, state.activeFormat));
}

function renderDeckComparison() {
  const decks = state.deckVariants.filter((deck) => deck.variantKind === "public");
  if (decks.length < 2) {
    els.comparisonPanel.classList.add("hidden");
    els.comparisonContent.replaceChildren();
    return;
  }

  const cardCounts = new Map();
  const engineCounts = new Map();
  for (const deck of decks) {
    for (const card of uniqueDeckCards(deck)) {
      const id = Number(card.id);
      const current = cardCounts.get(id) || { card, count: 0 };
      current.count += 1;
      cardCounts.set(id, current);
    }
    for (const engine of deck.sourceSample?.engines || []) {
      const label = localizedEngineList([engine]) || engine;
      engineCounts.set(label, (engineCounts.get(label) || 0) + 1);
    }
  }

  const total = decks.length;
  const rows = [...cardCounts.values()]
    .map((entry) => ({ ...entry, rate: entry.count / total }))
    .sort((a, b) => b.count - a.count || localizedCard(a.card).name.localeCompare(localizedCard(b.card).name));
  const core = rows.filter((entry) => entry.rate >= 0.7).slice(0, 8);
  const flex = rows.filter((entry) => entry.rate >= 0.25 && entry.rate < 0.7).slice(0, 8);
  const engines = [...engineCounts.entries()]
    .map(([label, count]) => ({ label, count, rate: count / total }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);

  els.comparisonContent.replaceChildren(
    comparisonCard(t("comparisonCore"), core.map((entry) => ({
      label: localizedCard(entry.card).name,
      meta: format(t("comparisonRate"), { rate: Math.round(entry.rate * 100), count: entry.count, total }),
    }))),
    comparisonCard(t("comparisonFlex"), flex.map((entry) => ({
      label: localizedCard(entry.card).name,
      meta: format(t("comparisonRate"), { rate: Math.round(entry.rate * 100), count: entry.count, total }),
    }))),
    comparisonCard(t("comparisonEngines"), engines.map((entry) => ({
      label: entry.label,
      meta: format(t("comparisonRate"), { rate: Math.round(entry.rate * 100), count: entry.count, total }),
    }))),
  );
  els.comparisonPanel.classList.remove("hidden");
}

function comparisonCard(title, items) {
  const node = document.createElement("article");
  node.className = "comparison-card";
  const body = items.length
    ? `<ul>${items.map((item) => `<li><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.meta)}</small></li>`).join("")}</ul>`
    : `<div class="comparison-empty">${escapeHtml(t("comparisonEmpty"))}</div>`;
  node.innerHTML = `<h4>${escapeHtml(title)}</h4>${body}`;
  return node;
}

function renderVariantTabs() {
  if (!state.deckVariants.length) {
    els.variantSection.classList.add("hidden");
    els.variantTabs.replaceChildren();
    return;
  }

  els.variantSection.classList.remove("hidden");
  els.variantTabs.replaceChildren(
    ...state.deckVariants.map((deck) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `variant-button${deck.variantId === state.activeVariantId ? " active" : ""}`;
      button.dataset.variantId = deck.variantId;
      if (deck.variantKind !== "public") button.dataset.style = deck.style;
      const label = deck.variantKind === "public" ? publicDeckDisplayTitle(deck) : deckTitleText(deck);
      const desc = deck.variantKind === "public" ? publicDeckSubtitle(deck) : t(deck.variantDescKey || `variant${capitalize(deck.style)}Desc`);
      button.innerHTML = `
        <span class="variant-title">${deck.variantKind === "ai" ? `<em class="ai-badge">${escapeHtml(t("aiBadge"))}</em>` : ""}${escapeHtml(label)}</span>
        <small>${escapeHtml(desc)} · ${deck.score} · ${percent(deck.handSimulation.starterRate)}</small>
      `;
      return button;
    }),
  );
}

function deckTitleText(deck, fallbackName = "") {
  if (deck.variantKind === "public") return publicDeckDisplayTitle(deck);
  const titleName = fallbackName || localizeTrendName(deck.archetype || inferNameFamily(deck.seed.name));
  if (deck.variantKind === "ai") return format(t("aiDeckTitle"), { name: titleName, profile: t(deck.aiProfile?.titleKey || "styleNameAi") });
  return format(t("deckTitle"), { name: titleName });
}

function localizeDeckTitle(title = "") {
  return localizeTrendName(title) || title;
}

function publicDeckDisplayTitle(deck) {
  const sample = deck.sourceSample || {};
  const base = localizeDeckTitle(sample.title || deck.variantTitle);
  const creator = compactSpaces(sample.creator || "");
  if (creator) return `${base} · ${creator}`;
  if (sample.placement) return `${base} · ${sample.placement}`;
  if (sample.date) return `${base} · ${formatDateTime(sample.date)}`;
  return base;
}

function publicDeckSubtitle(deck) {
  const sample = deck.sourceSample || {};
  const bits = [sample.source ? localizeTrendSource(sample.source) : t("publicDeckDesc")];
  if (sample.tournament) bits.push(sample.tournament);
  if (sample.placement) bits.push(sample.placement);
  if (sample.date) bits.push(formatDateTime(sample.date));
  if (sample.views) bits.push(`${sample.views} views`);
  const engines = localizedEngineList(sample.engines);
  if (engines) bits.push(engines);
  if (sample.notes) bits.push(sample.notes);
  return bits.join(" · ");
}

function markSelectedRows(cardId) {
  for (const row of document.querySelectorAll(".deck-row, .deck-card-tile")) {
    row.classList.toggle("selected", Number(row.dataset.cardId) === Number(cardId));
  }
}

function renderSampleEvidence(sampleContext) {
  if (state.lastDeck?.variantKind === "public") {
    const sample = state.lastDeck.sourceSample || {};
    const updated = sample.date || state.metaSamples.generatedAt ? format(t("sampleUpdated"), { time: formatDateTime(sample.date || state.metaSamples.generatedAt) }) : "";
    els.sampleEvidence.innerHTML = `
      <div class="sample-list">
        <div>${escapeHtml(format(t("selectedPublicDeck"), {
          title: publicDeckDisplayTitle(state.lastDeck),
          creator: sample.creator || "-",
          source: localizeTrendSource(sample.source || "YGOPRODeck"),
        }))}</div>
        ${sample.url ? `<div><a href="${escapeHtml(sample.url)}" target="_blank" rel="noreferrer">${escapeHtml(sample.url)}</a></div>` : ""}
        ${sample.tournament || sample.placement ? `<div>${escapeHtml([sample.placement, sample.tournament].filter(Boolean).join(" · "))}</div>` : ""}
        ${sample.engines?.length ? `<div>${escapeHtml(format(t("sampleEngines"), { engines: localizedEngineList(sample.engines) }))}</div>` : ""}
        ${sample.notes ? `<div>${escapeHtml(format(t("sampleNotes"), { notes: sample.notes }))}</div>` : ""}
        ${isDeckTypeOnlyTitle(sample) ? `<div>${escapeHtml(t("sampleDeckTypeOnly"))}</div>` : ""}
        ${updated ? `<div>${escapeHtml(updated)}</div>` : ""}
      </div>
    `;
    return;
  }

  if (state.lastDeck?.variantKind === "ai") {
    const samples = sampleContext?.samples || [];
    els.sampleEvidence.innerHTML = `
      <div class="sample-list">
        <div>${escapeHtml(format(t("aiEvidenceLine"), { profile: t(state.lastDeck.aiProfile?.titleKey || "styleNameAi") }))}</div>
        <div>${escapeHtml(t("aiEvidenceFactors"))}</div>
        <div>${escapeHtml(samples.length ? format(t("aiEvidenceSamples"), { count: samples.length }) : t("aiEvidenceNoSamples"))}</div>
      </div>
    `;
    return;
  }

  const samples = sampleContext?.samples || [];
  const updated = state.metaSamples.generatedAt ? format(t("sampleUpdated"), { time: formatDateTime(state.metaSamples.generatedAt) }) : "";
  if (!samples.length) {
    els.sampleEvidence.textContent = [t("sampleNone"), updated].filter(Boolean).join(" ");
    return;
  }

  const sampleLines = samples.slice(0, 4).map(({ sample }) => {
    const event = sample.tournament || sample.source || "YGOPRODeck";
    return `<div>${format(t("sampleLine"), {
      title: `<a href="${escapeHtml(sample.url)}" target="_blank" rel="noreferrer">${escapeHtml(sample.title)}</a>`,
      placement: escapeHtml(sample.placement || "Sample"),
      event: escapeHtml(event),
    })}</div>`;
  });

  els.sampleEvidence.innerHTML = `
    <div class="sample-list">
      <div>${escapeHtml(format(t("sampleSummary"), { count: samples.length }))}</div>
      ${updated ? `<div>${escapeHtml(updated)}</div>` : ""}
      ${sampleLines.join("")}
    </div>
  `;
}

function renderHandSimulation(sim) {
  if (!sim) {
    resetHandSimulation();
    return;
  }

  const spans = els.handStats.querySelectorAll("span");
  spans[0].textContent = percent(sim.starterRate);
  spans[1].textContent = percent(sim.interactionRate);
  spans[2].textContent = percent(sim.brickRate);
  els.handDetail.textContent = format(t("handDetail"), sim);
}

function resetHandSimulation() {
  els.handDetail.textContent = t("handPanelEmpty");
  for (const span of els.handStats.querySelectorAll("span")) span.textContent = "--";
}

function renderRows(container, cards) {
  container.replaceChildren();
  container.classList.toggle("deck-card-grid", state.activeDeckView === "cards");

  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "notice";
    empty.textContent = t("noCards");
    container.append(empty);
    return;
  }

  if (state.activeDeckView === "cards") {
    container.innerHTML = cards.map(renderDeckCardTile).join("");
    return;
  }

  for (const item of cards) {
    const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.cardId = item.card.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    const image = row.querySelector("img");
    const title = row.querySelector("strong");
    const badges = row.querySelector(".limit-badges");
    const qty = row.querySelector(".row-qty");
    const reason = row.querySelector("p");
    const localized = localizedCard(item.card);

    image.src = cardImage(item.card, true);
    image.alt = localized.name;
    const imageFrame = row.querySelector(".deck-row-image");
    imageFrame.insertAdjacentHTML("beforeend", renderCardLimitOverlay(item.card));
    title.textContent = localized.name;
    const badgeNodes = banlistBadges(item.card).map((badge) => {
      const node = document.createElement("span");
      node.className = `ban-badge ${badge.className}`;
      node.textContent = badge.label;
      return node;
    });
    if (localized.missingOfficial) {
      const node = document.createElement("span");
      node.className = "official-missing-badge";
      node.textContent = t("officialLocaleMissing");
      badgeNodes.push(node);
    }
    badges.replaceChildren(...badgeNodes);
    qty.textContent = `x${item.qty}`;
    reason.textContent = reasonText(item.reason);

    container.append(row);
  }
}

function renderDeckCardTile(item) {
  const localized = localizedCard(item.card);
  const isSelected = Number(item.card.id) === Number(state.selectedDetail?.cardId);
  return `
    <article class="deck-card-tile${isSelected ? " selected" : ""}" data-card-id="${escapeHtml(item.card.id)}" role="button" tabindex="0">
      <div class="limit-image-frame">
        <img src="${cardImage(item.card, true)}" alt="${escapeHtml(localized.name)}" loading="lazy" />
        ${renderCardLimitOverlay(item.card)}
      </div>
      <div>
        <strong>${escapeHtml(localized.name)}</strong>
        <span>${escapeHtml(item.card.type ? localizeType(item.card.type) : "")}</span>
        ${localized.missingOfficial ? `<span class="official-missing-badge">${escapeHtml(t("officialLocaleMissing"))}</span>` : ""}
      </div>
      <footer>
        <small>${escapeHtml(reasonText(item.reason))}</small>
        <span class="row-qty">x${escapeHtml(item.qty)}</span>
      </footer>
    </article>
  `;
}

function renderDeckViewTabs() {
  els.deckViewTabs.querySelectorAll("[data-deck-view]").forEach((button) => {
    const view = button.dataset.deckView === "cards" ? "cards" : "list";
    button.classList.toggle("active", view === state.activeDeckView);
    button.textContent = t(view === "cards" ? "limitViewCards" : "limitViewList");
  });
}

function renderCardLimitOverlay(card) {
  const status = limitStatusForFormat(card, state.activeFormat);
  if (!status) return "";
  const limit = copyLimit(card, state.activeFormat);
  return renderLimitCountBadge(status, limit, t(limitStatusLabelKey(status)));
}

function noticeText(deck) {
  if (deck.variantKind === "public") {
    const sample = deck.sourceSample || {};
    return format(t("selectedPublicDeck"), {
      title: localizeDeckTitle(sample.title || deck.variantTitle),
      creator: sample.creator || "-",
      source: localizeTrendSource(sample.source || "YGOPRODeck"),
    });
  }
  if (deck.variantKind === "ai") return format(t("aiNotice"), { profile: t(deck.aiProfile?.descKey || "variantAiDesc") });
  const styleName = t(`styleName${capitalize(deck.style)}`);

  const source = deck.archetype
    ? format(t("sourceArchetype"), { archetype: localizeArchetype(deck.archetype) })
    : t("sourceFallback");

  return format(t("notice"), { style: styleName, source });
}

async function copyDeckSection(section) {
  if (!state.lastDeck) return;
  const cards = state.lastDeck[section];
  const text = cards.map((item) => `${item.qty} ${localizedCard(item.card).name}`).join("\n");
  await navigator.clipboard.writeText(text);
  setStatus("copied");
  setTimeout(() => setStatus("done"), 1200);
}

async function copyDeckExport(kind) {
  if (!state.lastDeck) return;
  const text = deckExportText(state.lastDeck, kind);
  await navigator.clipboard.writeText(text);
  setStatus("copied");
  showToast(format(t("exportToast"), { type: t(`exportType${capitalize(kind)}`) }));
  setTimeout(() => setStatus("done"), 1200);
}

function deckExportText(deck, kind) {
  if (kind === "ydk") return deckYdkText(deck);
  if (kind === "ydke") return deckYdkeText(deck);
  if (kind === "md") return deckReadableText(deck, { useEnglishNames: false, prefixQty: false });
  return deckReadableText(deck, { useEnglishNames: false, prefixQty: true });
}

function deckReadableText(deck, options = {}) {
  const nameFor = (card) => options.useEnglishNames ? card.name : localizedCard(card).name;
  const lineFor = (item) => options.prefixQty ? `${item.qty} ${nameFor(item.card)}` : `${nameFor(item.card)} x${item.qty}`;
  return [
    `# ${deckTitleText(deck)}`,
    "",
    `${t("mainDeck")} (${countCards(deck.main)})`,
    ...deck.main.map(lineFor),
    "",
    `${t("extraDeck")} (${countCards(deck.extra)})`,
    ...deck.extra.map(lineFor),
  ].join("\n");
}

function deckYdkText(deck) {
  const repeatIds = (items) => items.flatMap((item) => Array.from({ length: item.qty }, () => String(item.card.id)));
  return [
    "#created by Seed Deck Builder",
    "#main",
    ...repeatIds(deck.main),
    "#extra",
    ...repeatIds(deck.extra),
    "!side",
  ].join("\n");
}

function deckYdkeText(deck) {
  return `ydke://${ydkeSection(deck.main)}!${ydkeSection(deck.extra)}!!`;
}

function ydkeSection(items) {
  const ids = items.flatMap((item) => Array.from({ length: item.qty }, () => Number(item.card.id)));
  const bytes = new Uint8Array(ids.length * 4);
  ids.forEach((id, index) => {
    const value = Number(id) >>> 0;
    const offset = index * 4;
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  });
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function estimateScore(main, extra, seed, archetype) {
  const mainTotal = countCards(main);
  const extraTotal = countCards(extra);
  const archetypeCount = main
    .filter((item) => archetype && item.card.archetype === archetype)
    .reduce((sum, item) => sum + item.qty, 0);
  const starterCount = main
    .filter((item) => starterHints.some((hint) => normalize(item.card.desc || "").includes(hint)))
    .reduce((sum, item) => sum + item.qty, 0);

  let score = 42;
  score += Math.min(22, archetypeCount * 1.2);
  score += Math.min(18, starterCount * 1.1);
  score += mainTotal === 40 ? 8 : -8;
  score += extraTotal >= 10 ? 6 : 0;
  score += isExtraDeck(seed) ? 4 : 0;

  return Math.max(1, Math.min(99, Math.round(score)));
}

function desiredCoreQty(card) {
  if (copyLimit(card) < 3) return copyLimit(card);
  if (card.type?.includes("Normal Monster")) return 2;
  if (card.level >= 7 && !normalize(card.desc || "").includes("special summon")) return 1;
  return 3;
}

function desiredQty(card, score, style, profile = null) {
  if (copyLimit(card) < 3) return copyLimit(card);
  if (isExtraDeck(card)) return 1;
  if (profile?.id === "ai-going-second" && isBoardBreakerCard(card)) return 3;
  if (profile?.id === "ai-control" && isInteractionCard(card)) return 3;
  if (profile?.id === "ai-engine" && starterHints.some((hint) => normalize(card.desc || "").includes(hint))) return 3;
  if (score > 115) return 3;
  if (score > 68) return 2;
  return 1;
}

function targetMainEngineSize(style, profile = null) {
  if (profile?.engineSize) return profile.engineSize;
  if (style === "ai") return 30;
  return 28;
}

function countCards(deck) {
  return deck.reduce((sum, item) => sum + item.qty, 0);
}

function byName(name) {
  const normalizedName = normalize(name);
  return state.allCards.find((card) => normalize(card.name) === normalizedName);
}

function copyLimit(card, targetFormat = state.activeFormat) {
  const regulationLimit = copyLimitFromRegulation(card, targetFormat);
  if (regulationLimit != null) return regulationLimit;
  const ban = banStatusForFormat(card, targetFormat);
  if (ban === "forbidden") return 0;
  if (ban === "limited") return 1;
  if (ban === "semi-limited") return 2;
  return 3;
}

function copyLimitFromRegulation(card, targetFormat = state.activeFormat) {
  const regulation = state.limitRegulations[targetFormat]?.regulation;
  if (!regulation) return null;
  const limits = konamiIds(card)
    .map((id) => regulation[String(id)])
    .filter((value) => Number.isInteger(value));
  if (!limits.length) return 3;
  return Math.max(0, Math.min(3, Math.min(...limits)));
}

function konamiIds(card) {
  const ids = [];
  if (card?.id) ids.push(Number(card.id));
  for (const info of card?.misc_info || []) {
    if (info.konami_id) ids.push(Number(info.konami_id));
  }
  return [...new Set(ids.filter(Number.isFinite))];
}

function isBanned(card) {
  return copyLimit(card) === 0;
}

function banlistBadges(card) {
  return [{ labelKey: formatBanLabelKey(state.activeFormat), status: limitStatusForFormat(card, state.activeFormat) }]
    .map(({ labelKey, status }) => banlistBadge(labelKey, status))
    .filter(Boolean);
}

function banlistBadge(formatKey, status) {
  const statusKey = {
    forbidden: "banBanned",
    limited: "banLimited",
    "semi-limited": "banSemiLimited",
  }[normalizeBanStatus(status)];
  if (!statusKey) return null;
  return {
    label: `${t(formatKey)} ${t(statusKey)}`,
    className: `ban-${normalizeBanStatus(status).replace(/[^a-z]+/g, "-")}`,
  };
}

function formatBanLabelKey(targetFormat) {
  if (targetFormat === "ocg") return "banOcg";
  if (targetFormat === "md") return "banMd";
  return "banTcg";
}

function banStatusForFormat(card, targetFormat = state.activeFormat) {
  const info = card?.banlist_info || {};
  const raw = {
    tcg: info.ban_tcg,
    ocg: info.ban_ocg,
    md: info.ban_md || info.ban_master_duel || info.ban_masterduel || info.ban_masterDuel,
  }[targetFormat];
  return normalizeBanStatus(raw);
}

function limitStatusForFormat(card, targetFormat = state.activeFormat) {
  const limit = copyLimitFromRegulation(card, targetFormat);
  if (limit === 0) return "forbidden";
  if (limit === 1) return "limited";
  if (limit === 2) return "semi-limited";
  return banStatusForFormat(card, targetFormat);
}

function normalizeBanStatus(status) {
  const text = normalize(String(status || ""));
  if (!text) return "";
  if (text.includes("forbidden") || text.includes("banned")) return "forbidden";
  if (text.includes("semi")) return "semi-limited";
  if (text.includes("limited")) return "limited";
  return "";
}

function isCardInFormat(card, targetFormat = state.activeFormat) {
  if (!card) return false;
  if (targetFormat === "tcg" || targetFormat === "ocg") return true;
  const formats = (card.misc_info || []).flatMap((info) => info.formats || []).map((item) => normalize(item));
  if (!formats.length) return true;
  return formats.includes("master duel");
}

function activeFormatName() {
  return t(`formatName${capitalize(state.activeFormat)}`);
}

function activeFormatShortName() {
  return state.activeFormat === "md" ? "MD" : activeFormatName();
}

function isExtraDeck(card) {
  const type = card.type || "";
  return (
    type.includes("Fusion Monster") ||
    type.includes("Synchro Monster") ||
    type.includes("XYZ Monster") ||
    type.includes("Link Monster")
  );
}

function isMainDeckMonster(card) {
  return Boolean(card?.type?.includes("Monster") && !isExtraDeck(card));
}

function isSpellOrTrapCard(card) {
  const type = card?.type || "";
  return type.includes("Spell Card") || type.includes("Trap Card");
}

function isSkillOrToken(card) {
  const type = card.type || "";
  return type.includes("Skill Card") || type.includes("Token");
}

function sameCardKind(a, b) {
  if (!a.type || !b.type) return false;
  return a.type.split(" ")[0] === b.type.split(" ")[0];
}

function getSeedTokens(seed, archetype) {
  const monsterFields = isMainDeckMonster(seed) || isExtraDeck(seed) ? `${seed.race || ""} ${seed.attribute || ""}` : "";
  const raw = `${seed.name} ${archetype || ""} ${monsterFields}`;
  const tokens = normalize(raw)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));

  return [...new Set(tokens)].slice(0, 12);
}

function getSampleMatchTokens(seed, archetype) {
  const raw = `${seed.name} ${archetype || ""}`;
  const tokens = normalize(raw)
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((token) => token.length > 2 && !stopWords.has(token) && !["dark", "light", "earth", "water", "fire", "wind"].includes(token));

  return [...new Set(tokens)].slice(0, 8);
}

function inferNameFamily(name) {
  const parts = name.split(/[-,:'"]/).map((part) => part.trim()).filter(Boolean);
  if (parts[0] && parts[0].length > 3) return parts[0];
  return name.split(" ").slice(0, 2).join(" ");
}

function tokenHit(card, tokens) {
  const text = normalize(`${card.name} ${card.desc || ""}`);
  return tokens.some((token) => text.includes(token));
}

function sharedTokenScore(name, query) {
  const nameTokens = new Set(name.split(/[^\p{L}\p{N}]+/gu).filter(Boolean));
  return query
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((token) => nameTokens.has(token))
    .reduce((score) => score + 24, 0);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function compactSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compactNormalize(value) {
  return normalize(value).replace(/\s+/g, "");
}

function cardImage(card, small) {
  const image = card.card_images?.[0];
  const imageId = Number(image?.id || card?.id);
  if (small) {
    return localCardImageUrl(imageId, "small", image?.image_url_small || image?.image_url || "");
  }
  return localCardImageUrl(imageId, "full", image?.image_url || image?.image_url_small || "");
}

function localCardImageUrl(imageId, size, fallbackUrl = "") {
  const id = Number(imageId);
  if (!CAN_USE_LOCAL_API || !id) return fallbackUrl;
  return `/api/card-image?id=${encodeURIComponent(id)}&size=${encodeURIComponent(size || "small")}`;
}

function largeCardImageMarkup(card, alt, attributes = "") {
  const small = cardImage(card, true);
  const full = cardImage(card, false);
  return `<img class="large-card-image" src="${escapeHtml(small)}" data-full-src="${escapeHtml(full)}" alt="${escapeHtml(alt)}" ${attributes} />`;
}

function upgradeLargeCardImages(root = document) {
  for (const image of root.querySelectorAll("img.large-card-image[data-full-src]")) {
    const fullSrc = image.dataset.fullSrc;
    if (!fullSrc || fullSrc === image.src) continue;
    const loader = new Image();
    loader.onload = () => {
      if (image.isConnected) image.src = fullSrc;
    };
    loader.src = fullSrc;
  }
}

async function bootstrapResourceCacheGate() {
  if (!CAN_USE_LOCAL_API || !els.resourceGate) return;

  els.resourceGate.classList.remove("hidden");
  els.resourceContinueButton?.classList.add("hidden");
  els.resourceContinueButton?.addEventListener("click", hideResourceGate, { once: true });

  try {
    await fetch("/api/resource-cache/start", { cache: "no-store" });
    let status = null;
    for (;;) {
      status = await fetchResourceCacheStatus();
      updateResourceGate(status);
      if (status?.smallReady) break;
      if (status?.phase === "error") {
        showResourceGateError();
        return;
      }
      await delay(650);
    }
    updateResourceGate(status);
    els.resourceGateText.textContent = t("resourceSmallReady");
    setTimeout(hideResourceGate, 450);
  } catch {
    showResourceGateError();
  }
}

async function fetchResourceCacheStatus() {
  const response = await fetch("/api/resource-cache/status", { cache: "no-store" });
  if (!response.ok) throw new Error(`resource cache ${response.status}`);
  return response.json();
}

function updateResourceGate(status) {
  const small = status?.small || {};
  const full = status?.full || {};
  const smallPercent = progressPercent(small);
  const fullPercent = progressPercent(full);
  setProgress(els.resourceSmallBar, els.resourceSmallPercent, smallPercent);
  setProgress(els.resourceFullBar, els.resourceFullPercent, fullPercent);
  if (els.resourceSmallDetail) els.resourceSmallDetail.textContent = resourcePhaseDetail(small);
  if (els.resourceFullDetail) {
    els.resourceFullDetail.textContent = full.total
      ? format(t("resourceFullBackground"), { percent: `${fullPercent}%` })
      : t("resourceFullPending");
  }
}

function setProgress(bar, label, percent) {
  if (bar) bar.style.width = `${percent}%`;
  if (label) label.textContent = `${percent}%`;
}

function progressPercent(phase) {
  const total = Number(phase?.total || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((Number(phase.completed || 0) / total) * 100));
}

function resourcePhaseDetail(phase) {
  const total = Number(phase?.total || 0);
  const completed = Number(phase?.completed || 0);
  const failed = Number(phase?.failed || 0);
  const cached = Number(phase?.cached || 0);
  const downloaded = Number(phase?.downloaded || 0);
  const base = `${completed} / ${total || "--"}`;
  const parts = [];
  if (cached) parts.push(`${t("resourceCached")} ${cached}`);
  if (downloaded) parts.push(`${t("resourceDownloaded")} ${downloaded}`);
  if (failed) parts.push(`${t("resourceFailed")} ${failed}`);
  return parts.length ? `${base} · ${parts.join(" · ")}` : base;
}

function showResourceGateError() {
  if (els.resourceGateText) els.resourceGateText.textContent = t("resourceError");
  els.resourceContinueButton?.classList.remove("hidden");
}

function hideResourceGate() {
  els.resourceGate?.classList.add("hidden");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cardImageId(card) {
  return Number(card?.card_images?.[0]?.id || card?.id || 0);
}

function trendRepresentativeImageId(name) {
  const card = findTrendRepresentativeCard(name);
  return cardImageId(card) || Number(TREND_REPRESENTATIVE_CARD_IDS[name] || 0);
}

function scheduleVisibleImagePreload(context = {}) {
  if (!CAN_USE_LOCAL_API) return;

  const smallIds = new Set();
  const croppedIds = new Set();

  for (const item of context.trendItems || []) {
    const id = trendRepresentativeImageId(item.name);
    if (id) {
      smallIds.add(id);
      croppedIds.add(id);
    }
  }

  for (const group of context.powerRankings?.groups || []) {
    for (const item of group.items || []) {
      const name = String(item.name || item.label || "").replace(/\s+Engine$/i, "");
      const id = trendRepresentativeImageId(name);
      if (id) smallIds.add(id);
    }
  }

  for (const deck of context.decks || []) {
    for (const item of [...(deck.main || []), ...(deck.extra || [])]) {
      const id = cardImageId(item.card);
      if (id) smallIds.add(id);
    }
  }

  const ids = [...smallIds].slice(0, IMAGE_PRELOAD_BATCH_SIZE);
  const cropped = [...croppedIds].slice(0, 40);
  const allIds = [...new Set([...ids, ...cropped])];
  if (!allIds.length) return;

  const sizes = cropped.length ? "small,cropped" : "small";
  const key = `${sizes}:${allIds.join(",")}`;
  if (key === lastImagePreloadKey) return;
  lastImagePreloadKey = key;

  if (imagePreloadTimer) clearTimeout(imagePreloadTimer);
  const run = () => {
    fetch(`/api/preload-card-images?ids=${encodeURIComponent(allIds.join(","))}&sizes=${encodeURIComponent(sizes)}`, {
      cache: "no-store",
    }).catch(() => {});
  };

  imagePreloadTimer = setTimeout(() => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      run();
    }
  }, 250);
}

function applyLanguage() {
  document.documentElement.lang = state.language === "ja" ? "ja" : state.language === "en" ? "en" : "zh-CN";
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  els.input.placeholder = {
    zh: "例如：灰流丽 / 閃刀姫－レイ / 青眼 / 泡影 / Sky Striker Ace - Raye",
    ja: "例：灰流うらら / 閃刀姫－レイ / 青眼 / 泡影 / Sky Striker Ace - Raye",
    en: "Example: Ash Blossom / 閃刀姫－レイ / Blue-Eyes / Imperm / Sky Striker Ace - Raye",
  }[state.language];

  setStatus(els.status.dataset.statusKey || "idle");
  if (!state.lastDeck && els.notice.dataset.noticeKey === "initial") {
    els.notice.textContent = t("initialNotice");
    els.sampleEvidence.textContent = t("samplePanelEmpty");
    els.handDetail.textContent = t("handPanelEmpty");
  }
}

function localizedCard(card) {
  const langKey = localeTextKey();
  const masterDuelLocalized = masterDuelLocalizedCard(card, langKey);
  const storedLocalized = langKey ? state.localeById.get(Number(card.id))?.[langKey] : null;
  const localized = state.activeFormat !== "md" && storedLocalized && !storedLocalized.official ? null : storedLocalized;
  const needsOfficialLocale = state.activeFormat !== "md" && state.language !== "en";
  return {
    name: decodeEntities(masterDuelLocalized?.name || localized?.name || card.name),
    desc: decodeEntities(masterDuelLocalized?.desc || localized?.desc || card.desc || ""),
    missingOfficial: Boolean(needsOfficialLocale && !masterDuelLocalized && !localized?.official),
  };
}

function masterDuelLocalizedCard(card, langKey) {
  if (state.activeFormat !== "md" || state.language !== "zh" || langKey !== "zh-CN") return null;
  return state.masterDuelLocaleById.get(Number(card?.id))?.[langKey] || null;
}

function localizeType(type) {
  if (state.language === "en") return type;
  const map = fieldMaps[state.language]?.type || {};
  if (map[type]) return map[type];
  let text = type;
  for (const [source, target] of Object.entries(map)) {
    text = text.replaceAll(source, target);
  }
  return text;
}

function localizeRace(race) {
  return fieldMaps[state.language]?.race?.[race] || race;
}

function localizeAttribute(attribute) {
  return fieldMaps[state.language]?.attribute?.[attribute] || attribute;
}

function localizeArchetype(archetype) {
  if (state.language === "zh" && state.activeFormat === "md") {
    const mdLabel = state.masterDuelLocaleData?.archetypes?.["zh-CN"]?.[archetype];
    if (mdLabel) return mdLabel;
    const inferredLabel = state.inferredArchetypeLocales?.zh?.[archetype];
    if (inferredLabel) return inferredLabel;
  }
  return fieldMaps[state.language]?.archetype?.[archetype] || localizeCompoundDeckName(archetype) || archetype;
}

function localizeTrendName(name) {
  let label = "";
  if (state.language === "zh" && state.activeFormat === "md") {
    const mdLabel = state.masterDuelLocaleData?.archetypes?.["zh-CN"]?.[name];
    if (mdLabel) label = mdLabel;
  }
  label = label
    || trendNameMaps[state.language]?.[name]
    || localizeCompoundDeckName(name)
    || localizeArchetype(name);
  flagUntranslatedDeckName(name, label);
  return label;
}

function localizedEngineList(engines) {
  return (Array.isArray(engines) ? engines : [])
    .map((engine) => {
      const card = byName(engine);
      if (card) return localizedCard(card).name;
      return localizeTrendName(engine) || engine;
    })
    .filter(Boolean)
    .join(" / ");
}

function flagUntranslatedDeckName(source, label) {
  if (state.language !== "zh" || !source || !label || !hasLatinDeckText(label)) return;
  if (state.masterDuelLocaleData?.archetypes?.["zh-CN"]?.[source] === label) return;
  if (state.inferredArchetypeLocales?.zh?.[source] === label) return;
  const allowed = ["AI", "MD", "TCG", "OCG", "K9", "S:P", "I:P", "D/D/D", "ABC", "XYZ", "No"];
  let normalizedLabel = ` ${label} `;
  for (const token of allowed) {
    normalizedLabel = normalizedLabel.replaceAll(token, "");
  }
  if (!hasLatinDeckText(normalizedLabel)) return;

  const key = `${source} => ${label}`;
  if (state.untranslatedDeckNames.has(key)) return;
  state.untranslatedDeckNames.add(key);
  console.warn("[deck-locale] untranslated deck name", { source, label });
}

function hasLatinDeckText(value) {
  return /[A-Za-z]{3,}/.test(String(value || ""));
}

function isDeckTypeOnlyTitle(sample) {
  if (!sample?.title) return false;
  return Array.isArray(sample.archetypes) && sample.archetypes.some((name) => compactNormalize(name) === compactNormalize(sample.title));
}

function localizeCompoundDeckName(name = "") {
  if (state.language === "en") return "";
  const components = localizedDeckComponentEntries();
  const words = compactSpaces(name).split(/\s+/).filter(Boolean);
  if (words.length < 2 || !components.length) return "";

  const segments = [];
  let translated = 0;
  for (let index = 0; index < words.length;) {
    const match = components.find((entry) => {
      if (entry.words.length > words.length - index) return false;
      return entry.words.every((word, offset) => word.toLowerCase() === words[index + offset].toLowerCase());
    });
    if (match) {
      segments.push({ text: match.label, translated: true });
      translated += 1;
      index += match.words.length;
    } else {
      const previous = segments[segments.length - 1];
      if (previous && !previous.translated) previous.text = `${previous.text} ${words[index]}`;
      else segments.push({ text: words[index], translated: false });
      index += 1;
    }
  }

  if (!translated) return "";
  if (segments.every((segment) => segment.translated) && state.language === "zh") {
    return segments.map((segment) => segment.text).join("");
  }
  return segments.map((segment) => segment.text).join(" ");
}

function localizedDeckComponentEntries() {
  const maps = [];
  if (state.language === "zh" && state.activeFormat === "md") maps.push(state.masterDuelLocaleData?.archetypes?.["zh-CN"] || {});
  if (state.language === "zh" && state.activeFormat === "md") maps.push(state.inferredArchetypeLocales?.zh || {});
  maps.push(fieldMaps[state.language]?.archetype || {});
  maps.push(trendNameMaps[state.language] || {});

  const merged = new Map();
  for (const map of maps) {
    for (const [key, label] of Object.entries(map || {})) {
      if (!key || !label || merged.has(key)) continue;
      merged.set(key, label);
    }
  }

  return [...merged.entries()]
    .map(([key, label]) => ({ key, label, words: compactSpaces(key).split(/\s+/).filter(Boolean) }))
    .filter((entry) => entry.words.length)
    .sort((a, b) => b.words.length - a.words.length || b.key.length - a.key.length);
}

function deckNameComponents(name = "") {
  const components = localizedDeckComponentEntries().map((entry) => entry.key);
  const words = compactSpaces(name).split(/\s+/).filter(Boolean);
  const matches = [];
  for (let index = 0; index < words.length;) {
    const match = components
      .map((key) => ({ key, words: compactSpaces(key).split(/\s+/).filter(Boolean) }))
      .sort((a, b) => b.words.length - a.words.length || b.key.length - a.key.length)
      .find((entry) => (
        entry.words.length <= words.length - index
        && entry.words.every((word, offset) => word.toLowerCase() === words[index + offset].toLowerCase())
      ));
    if (match) {
      matches.push(match.key);
      index += match.words.length;
    } else {
      index += 1;
    }
  }
  return matches;
}

function localizeTrendSource(source) {
  return trendSourceMaps[state.language]?.[source] || source;
}

function reason(key, params = {}) {
  return { key, params };
}

function reasonText(value) {
  if (!value) return "";
  if (typeof value === "string") return t(value) || value;
  const params = { ...value.params };
  if (params.archetype) params.archetype = localizeArchetype(params.archetype);
  if (params.race) params.race = localizeRace(params.race);
  if (params.attribute) params.attribute = localizeAttribute(params.attribute);
  return format(t(value.key), params);
}

function t(key) {
  return i18n[state.language]?.[key] || i18n.en[key] || key;
}

function format(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(value) {
  try {
    return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
      dateStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setBusy(isBusy, statusKey = "loading") {
  const button = els.form.querySelector("button");
  button.disabled = isBusy;
  els.input.disabled = isBusy;
  if (isBusy) setStatus(statusKey);
}

function setStatus(key) {
  els.status.dataset.statusKey = key;
  els.status.textContent = t(`status${capitalize(key)}`);
}

let toastTimer = null;
function showToast(message) {
  if (!message) return;
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 2200);
}

function showError(message) {
  els.notice.classList.add("error");
  els.notice.dataset.noticeKey = "error";
  els.notice.textContent = message;
}

function clearError() {
  els.notice.classList.remove("error");
  els.notice.dataset.noticeKey = state.lastDeck ? "deck" : "initial";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

function decodeEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&ndash;", "-")
    .replaceAll("&mdash;", "-")
    .replaceAll("&nbsp;", " ");
}
