let recipeImportPreview = null;
let recipeImportRevision = 0;
const API_BASE = "https://db.ygoprodeck.com/api/v7";
const CAN_USE_LOCAL_API = ["http:", "https:"].includes(location.protocol)
  && new URLSearchParams(location.search).get("api") === "1";
const CAN_USE_LOCAL_IMAGE_API = ["http:", "https:"].includes(location.protocol)
  && (CAN_USE_LOCAL_API || Boolean(window.desktopUpdates));
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
const APP_VERSION = "0.8.0";
let desktopUpdateState = null;
const RELEASE_PAGE_URL = "https://github.com/chisan043/ygo-seed-deck-builder/releases/latest";
const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/chisan043/ygo-seed-deck-builder/releases/latest";
const TREND_COLORS = ["#0b7767", "#c88a2c", "#2f6f9f", "#8b5a9d", "#6f8d3d", "#b65c4a", "#4b6f83", "#8d7b43", "#a84d73", "#507b54"];
const TREND_REPRESENTATIVE_CARD_IDS = YGOTrendSupport.representativeIds;
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
const OFFLINE_SCRIPT_VERSION = "20261009-multilang-trends";
const PUBLIC_DECK_SEARCH_LIMIT = 240;
const RECENT_PUBLIC_DECK_DAYS = 7;
const MIN_PUBLIC_DECK_CHOICES = 15;
const IMAGE_PRELOAD_BATCH_SIZE = 120;
const LOCAL_DECK_STORAGE_KEY = "deckBuilderLocalDecks";
const LOCAL_CARD_BOOKMARK_STORAGE_KEY = "deckBuilderLocalCardBookmarks";
const LOCAL_CARD_HISTORY_STORAGE_KEY = "deckBuilderLocalCardHistory";
const LOCAL_DECK_SCHEMA_VERSION = 1;
const LOCAL_CARD_HISTORY_LIMIT = 80;
const storedStyle = localStorage.getItem("deckBuilderActiveStyle");
const storedFormat = localStorage.getItem("deckBuilderActiveFormat");
const storedPage = new URLSearchParams(location.search).get("page") || localStorage.getItem("deckBuilderActivePage");

const state = {
  allCards: [],
  aliasData: null,
  aliasSearchData: null,
  masterDuelLocaleData: null,
  masterDuelLocaleById: new Map(),
  inferredArchetypeLocales: { zh: {}, ja: {} },
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
  trendLocalePrefetchKeys: new Set(),
  limitRegulations: {},
  searchIndex: [],
  lastDeck: null,
  currentSeed: null,
  activeSearchArchetype: "",
  activeSearchLabel: "",
  deckVariants: [],
  activeStyle: VALID_STYLES.has(storedStyle) ? storedStyle : "competitive",
  activeFormat: VALID_FORMATS.has(storedFormat) ? storedFormat : "md",
  activePage: ["builder", "decks", "banlist", "ai-settings"].includes(storedPage) ? storedPage : "builder",
  activeLimitFilter: "all",
  activeLimitView: localStorage.getItem("deckBuilderLimitView") === "cards" ? "cards" : "list",
  activeDeckView: localStorage.getItem("deckBuilderDeckView") === "cards" ? "cards" : "list",
  activeLocalBrowserTab: "cards",
  activeLocalDeckView: "library",
  localBookmarkedCardIds: loadLocalCardIdList(LOCAL_CARD_BOOKMARK_STORAGE_KEY),
  localCardHistoryIds: loadLocalCardIdList(LOCAL_CARD_HISTORY_STORAGE_KEY),
  selectedLimitCardId: null,
  activeVariantId: null,
  selectedDetail: null,
  latestRelease: null,
  savedDecks: loadSavedDeckRecords(),
  activeLocalDeckId: "",
  localDeckDraft: null,
  localSelectedCardId: null,
  viewMode: "empty",
  language: localStorage.getItem("deckBuilderLanguage") || "zh",
};

let masterDuelLocalePromise = null;
let dataHealthSignature = "";
let watchingDataUpdates = false;
const offlineScriptPromises = new Map();
let imagePreloadTimer = null;
let lastImagePreloadKey = "";
let lastOfficialLocalePreloadKey = "";
let metaSamplesLoadPromise = null;

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
    downloadYdk: "下载 YDK",
    recipeImportTitle: "导入卡组配方",
    recipeReverseHint: "可导入 YDK 文件、YDKE 链接或卡名清单。预览确认后保存到本地卡组。",
    recipeLoading: "正在读取配方…",
    recipeFile: "选择 YDK 文件",
    recipePaste: "或粘贴 YDK、YDKE 链接或卡名清单",
    recipePreview: "预览配方",
    recipeSave: "导入主卡组和额外卡组",
    recipeCancel: "取消",
    recipeInvalid: "无法解析配方。请检查 YDK 分区与卡片密码，或粘贴完整的 ydke:// 链接。",
    recipeUnknown: "未识别到以下卡片：{cards}。请核对后重新预览；尚未导入任何卡片。",
    recipeSide: "配方包含 {count} 张副卡组卡片。本工具仅导入主卡组和额外卡组，副卡组不保存。",
    recipePreviewCounts: "将导入至 {format}：主卡组 {main}，额外卡组 {extra}。",
    recipeTooLarge: "文件太大，请选择不超过 30 KB 的 YDK 文本文件。",
    recipeEditHint: "配方已保留原始张数；导入后可在编辑器中修改不符合规则的卡片。",
    appEyebrow: "多源卡表原型",
    appTitle: "种子卡构筑器",
    languageLabel: "语言",
    inputLabel: "输入卡名或主题",
    generateButton: "生成卡组",
    styleCompetitive: "真实样本优先",
    styleAi: "AI 模型构筑",
    formatLabel: "环境",
    formatTcg: "TCG",
    formatOcg: "OCG",
    formatMd: "大师决斗",
    pageBuilder: "构筑器",
    pageDecks: "卡组",
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
    emptyBody: "选择真实样本查看公开卡组，或使用 AI 模型按你的要求构筑。",
    recommendationEyebrow: "推荐",
    pendingTitle: "待生成",
    mainShort: "主卡",
    extraShort: "额外",
    synergyShort: "协同",
    mainDeck: "主卡组",
    extraDeck: "额外卡组",
    samplePanelTitle: "真实样本依据",
    samplePanelEmpty: "生成后显示命中的近 7 天真实构筑。",
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
    exportMd: "复制卡名清单",
    exportDone: "已复制导出内容",
    exportToast: "已复制：{type}",
    exportTypeText: "卡表",
    exportTypeYdk: "YDK",
    exportTypeYdke: "YDKE",
    exportTypeMd: "卡名清单",
    saveCurrentDeck: "收藏构筑",
    saveCurrentDeckDone: "已收藏到卡组。",
    saveCurrentDeckEmpty: "当前没有可收藏的构筑。",
    decksEyebrow: "本地卡组",
    decksTitle: "卡组",
    localDeckLibraryKicker: "我的牌组",
    localDeckLibraryTitle: "卡组选择",
    localDeckLibraryHint: "选择一个卡组进入编辑，或新建空白卡组。",
    localPublicSearch: "搜索公开牌组",
    localDeckListAction: "构组牌组一览",
    importLocalDeck: "导入牌组",
    localDeckCreateSlot: "新建卡组",
    localStandardBadge: "STANDARD",
    duplicateLocalDeck: "复制",
    deleteLocalDeckCase: "删除",
    localDeckCopySuffix: "{name} 副本",
    localDeckDuplicated: "已复制牌组。",
    localDeckImported: "已导入牌组。",
    localDeckImportedName: "导入牌组",
    confirmDeleteLocalDeck: "删除「{name}」？",
    backToDeckLibrary: "返回列表",
    localCardInspectorEmpty: "选择一张卡查看详情。",
    localCardInspectorTitle: "当前卡牌",
    localBrowserCards: "卡片列表",
    localBrowserSaved: "收藏构筑",
    localBrowserBookmarks: "收藏卡牌",
    localBrowserHistory: "历史卡牌",
    localCardPoolTitle: "卡片列表",
    localCardPoolCount: "{count} 张可选",
    localCardPoolEmpty: "输入卡名或系列名搜索卡片。",
    localBookmarkEmpty: "还没有收藏卡牌。在左侧卡牌详情里点收藏即可加入。",
    localHistoryEmpty: "还没有历史卡牌。搜索、点击或拖拽卡牌后会自动记录。",
    newLocalDeck: "新建卡组",
    saveLocalDeck: "保存卡组",
    localDeckSearchLabel: "搜索收藏",
    localDeckSearchPlaceholder: "卡组名 / 卡名",
    localDeckNameLabel: "卡组名",
    localDeckNamePlaceholder: "未命名卡组",
    openLocalDeckAsBuild: "返回牌组",
    localDeckAutoBuild: "自动构筑",
    localDeckAutoBuilding: "正在按近 7 天真实样本自动构筑。",
    localDeckAutoBuilt: "已自动构筑。",
    localDeckAutoNeedSeed: "请先选择或搜索一张种子卡。",
    localDeckClear: "一键清空",
    localDeckCleared: "卡组已清空。",
    deleteLocalDeck: "删除",
    localCardSearchLabel: "添加卡牌",
    localCardSearchPlaceholder: "输入卡名添加到主卡或额外",
    addLocalCard: "添加",
    localCardHint: "会按卡牌类型自动加入主卡组或额外卡组。",
    localLegalityShort: "合法性",
    localLegalOk: "合法",
    localLegalIssue: "{count} 个问题",
    localDeckEmptyTitle: "还没有本地卡组",
    localDeckEmptyBody: "可以收藏生成的构筑，也可以新建空白卡组自己搭配。",
    localDeckSaved: "卡组已保存。",
    localDeckDeleted: "卡组已删除。",
    localDeckOpened: "已打开本地卡组。",
    localDeckUntitled: "未命名卡组",
    localDeckCustom: "自建卡组",
    localDeckFavorite: "收藏构筑",
    localDeckAddNotFound: "没有找到这张卡。",
    localDeckMainLimit: "主卡组最多 60 张。",
    localDeckExtraLimit: "额外卡组最多 15 张。",
    localDeckCopyDone: "已复制：{section}",
    localDeckRemove: "移除",
    localDeckBoardEmpty: "从右侧卡片列表添加卡牌。",
    localCardBookmark: "收藏",
    localCardUnbookmark: "取消收藏",
    localDropMainOnly: "这张卡不能放入主卡组。",
    localDropExtraOnly: "这张卡不能放入额外卡组。",
    aiBadge: "AI生成",
    resourceGateEyebrow: "客户端资源准备",
    resourceGateTitle: "正在下载卡牌资源",
    resourceGateText: "首次启动会先下载热门构筑小卡图。完成后即可使用，官方文本、剩余小图和大图会继续在后台下载。",
    resourceSmallReady: "热门构筑官方文本与小卡图已就绪，正在进入客户端。",
    resourceFullPending: "大图等待中",
    resourceFullBackground: "大图后台下载 {percent}%",
    resourceError: "资源下载遇到网络问题，可以先继续使用，缺失图片会在打开时重试。",
    resourceContinue: "继续使用",
    resourceOfficial: "官方文本",
    resourceSmallImages: "小图",
    resourceCached: "缓存",
    resourceDownloaded: "下载",
    resourceFailed: "失败",
    checkUpdateButton: "检查更新",
    updateChecking: "正在检查更新",
    updateLatest: "已是最新版本",
    updateNoRelease: "未找到发布版本",
    updateCheckFailed: "检查更新失败，请稍后再试",
    updateEyebrow: "版本更新",
    updateAvailableTitle: "发现新版本 {version}",
    updateAvailableBody: "当前版本 {current}，最新版本 {latest}。可以打开 GitHub Releases 下载。",
    updateLater: "稍后",
    updateDownload: "打开下载页",
    updateAutoDownloading: "正在后台下载 {latest}：{percent}%。你可以继续使用当前版本。",
    updateReadyTitle: "新版本 {version} 已下载",
    updateReadyRestartBody: "安装包已校验。请先保存正在编辑的卡组，再重启并安装。",
    updateReadyInstallerBody: "安装包已下载并校验，点击打开安装。已保存的卡组和缓存会保留。",
    updateDownloading: "正在下载 {percent}%",
    updateRestartInstall: "重启并安装",
    updateOpenInstaller: "打开安装包",
    updateRetry: "重试更新",
    updateErrorBody: "本次更新未完成，当前版本仍可正常使用。请检查网络后重试。",
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
    limitUpdated: "禁限表日期：{date}。数据源：{source}。",
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
    initialNotice: "选择一张卡或主题，再选择真实样本或 AI 模型构筑。",
    notFound: "没有找到这张卡。可以输入英文、中文、日文或常用简称；如果是很新的外号，需要先补进别名表。",
    apiError: "YGOPRODeck API 暂时无法访问。",
    genericError: "生成失败，请稍后重试。",
    formatNotAvailable: "这张卡暂不属于 {format} 可用卡池，请切换环境或换一张种子卡。",
    formatForbidden: "这张卡在 {format} 当前禁限表中是禁止卡，不能作为合法构筑的种子卡。",
    noCards: "没有可推荐的卡。",
    noDesc: "暂无效果文本。",
    pendulumEffectLabel: "【灵摆效果】",
    monsterEffectLabel: "【怪兽效果】",
    officialLocaleMissing: "官方中文未收录",
    statusIdle: "等待输入",
    statusLoading: "拉取数据",
    statusDone: "已生成",
    statusError: "出错",
    statusCopied: "已复制",
    deckTitle: "{name} 推荐构筑",
    aiDeckTitle: "{name} {profile}",
    notice: "{style}初稿。{source} 当前强度分会优先参考近 7 天真实样本和起手模拟。",
    aiNotice: "本地算法构筑：{profile}。根据种子卡、系列字段、效果文本、近 7 天真实样本共现、泛用互动位和 5000 次起手模拟生成。",
    sourceArchetype: "已识别为 {archetype} 轴。",
    sourceFallback: "没有明确系列字段，已改用卡名和效果文本做相似匹配。",
    sampleSummary: "命中 {count} 套多源真实样本，优先采用近 7 天构筑共现频率。",
    sampleUpdated: "样本刷新时间：{time}。",
    dataStale: "当前使用历史缓存，联网后自动更新。",
    dataUpdating: "正在后台更新数据。",
    dataUpdateFailed: "自动更新暂未完成，继续使用缓存；稍后自动重试。",
    selectedPublicDeck: "当前选择：{title}。作者：{creator}。来源：{source}。",
    sampleDeckTypeOnly: "数据源只提供主题名，已用作者、赛事和组件信息区分每套构筑。",
    sampleEngines: "组件：{engines}",
    sampleNotes: "备注：{notes}",
    sampleNone: "暂未命中近 7 天真实样本，已回退到组件库与启发式协同。",
    aiEvidenceLine: "AI 方案：{profile}。",
    aiEvidenceFactors: "组建依据：种子卡效果、系列字段、近 7 天真实样本共现、禁限表可投入数、泛用互动位与起手模拟。",
    aiEvidenceSamples: "参考了 {count} 条相近真实样本，优先使用近 7 天命中样本，但没有直接照抄某一套。",
    aiEvidenceNoSamples: "没有足够近似的真实样本，因此以卡池信息和启发式协同生成。",
    publicDeckSummary: "{format} 环境找到 {count} 套真实样本构筑。优先展示近 7 天全部匹配构筑；不足 15 套时按时间由近到远补充历史样本。",
    aiOnlySummary: "{format} 环境没有找到包含这张卡的近 7 天真实构筑，已生成 {aiCount} 套 AI 推荐构筑。",
    publicDeckEmpty: "没有从公开构筑接口找到包含这张卡的列表，已显示 AI 推荐构筑。",
    sampleLine: "{title}，{placement}，{event}",
    handDetail: "5000 次五卡起手：至少 1 张初动 {starterHits} 次，至少 1 张互动 {interactionHits} 次，两者都有 {bothHits} 次。",
    seedCard: "种子卡",
    focusedCard: "当前卡牌",
    mainImageNote: "中文、日文卡图优先使用百鸽社区高清资源，缺图时回退英文；社区卡面译名可能与官方文本不同。",
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
    styleNameCompetitive: "真实样本优先",
    styleNameAi: "本地算法构筑",
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
    downloadYdk: "YDK をダウンロード",
    recipeImportTitle: "デッキレシピをインポート",
    recipeReverseHint: "YDK ファイル、YDKE リンク、カード名リストを読み込めます。プレビューを確認してローカルデッキに保存します。",
    recipeLoading: "レシピを読み込み中…",
    recipeFile: "YDK ファイルを選択",
    recipePaste: "または YDK、YDKE リンク、カード名リストを貼り付け",
    recipePreview: "レシピを確認",
    recipeSave: "メイン・EX デッキを取り込む",
    recipeCancel: "キャンセル",
    recipeInvalid: "レシピを解析できません。YDK の区分とカード番号、または ydke:// リンク全体を確認してください。",
    recipeUnknown: "認識できないカード：{cards}。修正して再度確認してください。カードはまだ取り込まれていません。",
    recipeSide: "サイドデッキが {count} 枚あります。本ツールはメイン・EX のみ取り込み、サイドは保存しません。",
    recipePreviewCounts: "{format} に取り込みます：メイン {main} 枚、EX {extra} 枚。",
    recipeTooLarge: "30 KB 以下の YDK テキストファイルを選択してください。",
    recipeEditHint: "元の枚数を保持しています。取り込み後、ルールに合わないカードを編集できます。",
    appEyebrow: "複数ソースのデッキ試作",
    appTitle: "シードカード デッキビルダー",
    languageLabel: "言語",
    inputLabel: "カード名・テーマを入力",
    generateButton: "デッキ生成",
    styleCompetitive: "実サンプル優先",
    styleAi: "AI モデル構築",
    formatLabel: "環境",
    formatTcg: "TCG",
    formatOcg: "OCG",
    formatMd: "マスターデュエル",
    pageBuilder: "ビルダー",
    pageDecks: "デッキ",
    pageBanlist: "制限リスト",
    variantCompetitiveDesc: "実サンプル優先",
    variantAiDesc: "AIがシードから生成",
    publicDeckDesc: "公開構築",
    aiDeckDesc: "AIおすすめ",
    fallbackDeckDesc: "生成案",
    buildListTitle: "構築リスト",
    buildListPageTitle: "{name} 構築リスト",
    chooseBuildTitle: "構築を選択",
    backToBuildList: "構築リストへ戻る",
    emptyTitle: "カードを1枚選んで開始",
    emptyBody: "実サンプルで公開デッキを見るか、AI モデルに要望に沿って構築してもらえます。",
    recommendationEyebrow: "おすすめ",
    pendingTitle: "未生成",
    mainShort: "メイン",
    extraShort: "EX",
    synergyShort: "相性",
    mainDeck: "メインデッキ",
    extraDeck: "エクストラデッキ",
    samplePanelTitle: "実サンプル根拠",
    samplePanelEmpty: "生成後、直近7日間の実構築サンプルを表示します。",
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
    exportMd: "カード名リストをコピー",
    exportDone: "エクスポート内容をコピーしました",
    exportToast: "コピーしました：{type}",
    exportTypeText: "リスト",
    exportTypeYdk: "YDK",
    exportTypeYdke: "YDKE",
    exportTypeMd: "カード名リスト",
    saveCurrentDeck: "構築を保存",
    saveCurrentDeckDone: "デッキに保存しました。",
    saveCurrentDeckEmpty: "保存できる構築がありません。",
    decksEyebrow: "ローカルデッキ",
    decksTitle: "デッキ",
    localDeckLibraryKicker: "マイデッキ",
    localDeckLibraryTitle: "デッキ選択",
    localDeckLibraryHint: "デッキを選んで編集、または新規作成します。",
    localPublicSearch: "公開デッキを検索",
    localDeckListAction: "構築リスト",
    importLocalDeck: "デッキをインポート",
    localDeckCreateSlot: "新規デッキ",
    localStandardBadge: "STANDARD",
    duplicateLocalDeck: "複製",
    deleteLocalDeckCase: "削除",
    localDeckCopySuffix: "{name} コピー",
    localDeckDuplicated: "デッキを複製しました。",
    localDeckImported: "デッキをインポートしました。",
    localDeckImportedName: "インポートデッキ",
    confirmDeleteLocalDeck: "「{name}」を削除しますか？",
    backToDeckLibrary: "一覧へ戻る",
    localCardInspectorEmpty: "カードを選ぶと詳細を表示します。",
    localCardInspectorTitle: "選択カード",
    localBrowserCards: "カードリスト",
    localBrowserSaved: "保存構築",
    localBrowserBookmarks: "お気に入りカード",
    localBrowserHistory: "履歴カード",
    localCardPoolTitle: "カードリスト",
    localCardPoolCount: "{count}件",
    localCardPoolEmpty: "カード名またはテーマ名で検索してください。",
    localBookmarkEmpty: "お気に入りカードはまだありません。左側の詳細から追加できます。",
    localHistoryEmpty: "履歴カードはまだありません。検索、選択、ドラッグしたカードが記録されます。",
    newLocalDeck: "新規デッキ",
    saveLocalDeck: "保存",
    localDeckSearchLabel: "保存済みを検索",
    localDeckSearchPlaceholder: "デッキ名 / カード名",
    localDeckNameLabel: "デッキ名",
    localDeckNamePlaceholder: "無題デッキ",
    openLocalDeckAsBuild: "デッキへ戻る",
    localDeckAutoBuild: "自動構築",
    localDeckAutoBuilding: "直近7日間の実サンプルを参照して自動構築中です。",
    localDeckAutoBuilt: "自動構築しました。",
    localDeckAutoNeedSeed: "先にシードカードを選択または検索してください。",
    localDeckClear: "全てクリア",
    localDeckCleared: "デッキを空にしました。",
    deleteLocalDeck: "削除",
    localCardSearchLabel: "カード追加",
    localCardSearchPlaceholder: "カード名を入力",
    addLocalCard: "追加",
    localCardHint: "カード種別に応じてメインまたはEXに追加します。",
    localLegalityShort: "合法性",
    localLegalOk: "合法",
    localLegalIssue: "{count}件の問題",
    localDeckEmptyTitle: "保存済みデッキはありません",
    localDeckEmptyBody: "生成した構築を保存するか、新規デッキを作成できます。",
    localDeckSaved: "デッキを保存しました。",
    localDeckDeleted: "デッキを削除しました。",
    localDeckOpened: "ローカルデッキを開きました。",
    localDeckUntitled: "無題デッキ",
    localDeckCustom: "自作デッキ",
    localDeckFavorite: "保存構築",
    localDeckAddNotFound: "カードが見つかりません。",
    localDeckMainLimit: "メインデッキは最大60枚です。",
    localDeckExtraLimit: "EXデッキは最大15枚です。",
    localDeckCopyDone: "コピーしました：{section}",
    localDeckRemove: "削除",
    localDeckBoardEmpty: "右側のカードリストから追加してください。",
    localCardBookmark: "お気に入り",
    localCardUnbookmark: "お気に入り解除",
    localDropMainOnly: "このカードはメインデッキに入れられません。",
    localDropExtraOnly: "このカードはEXデッキに入れられません。",
    aiBadge: "AI生成",
    resourceGateEyebrow: "クライアント資源の準備",
    resourceGateTitle: "カード画像をダウンロード中",
    resourceGateText: "初回起動では人気デッキの小さいカード画像を先に保存します。公式テキストと残りの画像はバックグラウンドで続けて保存します。",
    resourceSmallReady: "人気デッキの公式テキストと小さい画像の準備が完了しました。クライアントへ移動します。",
    resourceFullPending: "大きい画像は待機中",
    resourceFullBackground: "大きい画像をバックグラウンド保存中 {percent}%",
    resourceError: "資源のダウンロードでネットワーク問題が発生しました。不足画像は表示時に再試行します。",
    resourceContinue: "続ける",
    resourceOfficial: "公式テキスト",
    resourceSmallImages: "小画像",
    resourceCached: "キャッシュ",
    resourceDownloaded: "保存",
    resourceFailed: "失敗",
    checkUpdateButton: "更新確認",
    updateChecking: "更新を確認中",
    updateLatest: "最新バージョンです",
    updateNoRelease: "リリースが見つかりません",
    updateCheckFailed: "更新確認に失敗しました。後でもう一度お試しください",
    updateEyebrow: "バージョン更新",
    updateAvailableTitle: "新バージョン {version}",
    updateAvailableBody: "現在のバージョンは {current}、最新は {latest} です。GitHub Releases を開いてダウンロードできます。",
    updateLater: "後で",
    updateDownload: "ダウンロードページを開く",
    updateAutoDownloading: "{latest} をダウンロード中：{percent}%。現在のバージョンを引き続き使用できます。",
    updateReadyTitle: "新バージョン {version} の準備完了",
    updateReadyRestartBody: "検証済みです。編集中のデッキを保存してから再起動してインストールしてください。",
    updateReadyInstallerBody: "ダウンロードと検証が完了しました。インストーラーを開いて更新してください。保存したデッキとキャッシュは保持されます。",
    updateDownloading: "ダウンロード中 {percent}%",
    updateRestartInstall: "再起動してインストール",
    updateOpenInstaller: "インストーラーを開く",
    updateRetry: "更新を再試行",
    updateErrorBody: "更新を完了できませんでした。現在のバージョンは引き続き使用できます。接続を確認して再試行してください。",
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
    limitUpdated: "リミットレギュレーション日付：{date}。データソース：{source}。",
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
    initialNotice: "カードやテーマを入力し、実サンプルまたは AI モデル構築を選んでください。",
    notFound: "カードが見つかりません。英語・中国語・日本語・通称で検索できます。新しい通称は別名表への追加が必要です。",
    apiError: "YGOPRODeck API に接続できません。",
    genericError: "生成に失敗しました。後でもう一度試してください。",
    formatNotAvailable: "このカードは {format} の使用可能カードプールにありません。環境を切り替えるか、別のシードカードを選んでください。",
    formatForbidden: "このカードは {format} の現行リミットレギュレーションで禁止カードのため、合法構築のシードにはできません。",
    noCards: "おすすめできるカードがありません。",
    noDesc: "カードテキストがありません。",
    pendulumEffectLabel: "【ペンデュラム効果】",
    monsterEffectLabel: "【モンスター効果】",
    officialLocaleMissing: "公式日本語未収録",
    statusIdle: "待機中",
    statusLoading: "データ取得中",
    statusDone: "生成済み",
    statusError: "エラー",
    statusCopied: "コピー済み",
    deckTitle: "{name} おすすめ構築",
    aiDeckTitle: "{name} {profile}",
    notice: "{style}の初稿です。{source} 強度スコアは暫定評価で、まだ大会データと初手シミュレーションは未接続です。",
    aiNotice: "ローカル構築：{profile}。シードカード、テーマ、効果テキスト、直近7日間の実サンプル共起、汎用妨害枠、5000回の初手シミュレーションから生成します。",
    sourceArchetype: "{archetype} 軸として認識しました。",
    sourceFallback: "明確なテーマ情報がないため、カード名とテキストの類似性で補完しました。",
    sampleSummary: "複数ソースの実デッキサンプル {count} 件に一致。直近7日間の構築共起頻度を優先しました。",
    sampleUpdated: "サンプル更新：{time}。",
    dataStale: "保存済みデータを表示中。オンライン時に自動更新します。",
    dataUpdating: "データをバックグラウンド更新中。",
    dataUpdateFailed: "更新が完了していません。保存済みデータを使用し、自動的に再試行します。",
    selectedPublicDeck: "選択中：{title}。作者：{creator}。出典：{source}。",
    sampleDeckTypeOnly: "データ元はテーマ名のみ提供しているため、作者・大会・エンジン情報で各リストを区別しています。",
    sampleEngines: "エンジン：{engines}",
    sampleNotes: "メモ：{notes}",
    sampleNone: "直近7日間の実サンプルには未一致のため、コンポーネントとヒューリスティックで補完しました。",
    aiEvidenceLine: "AI案：{profile}。",
    aiEvidenceFactors: "構築根拠：シードカードの効果、テーマ情報、直近7日間の実サンプル共起、制限リスト、汎用妨害枠、初手シミュレーション。",
    aiEvidenceSamples: "近い実デッキサンプル {count} 件を参考にし、直近7日間の一致サンプルを優先しましたが、特定の1リストはコピーしていません。",
    aiEvidenceNoSamples: "十分近い実デッキサンプルがないため、カードプールとヒューリスティックで生成しました。",
    publicDeckSummary: "{format} 環境で実データ構築が {count} 件見つかりました。直近7日間の一致構築をすべて表示し、15件未満なら新しい順に過去のサンプルを補います。",
    aiOnlySummary: "{format} 環境ではこのカードを含む直近7日間の実構築が見つからなかったため、AI モデル構築を {aiCount} 件生成しました。",
    publicDeckEmpty: "公開構築APIでは該当リストが見つからなかったため、AI モデル構築を表示しています。",
    sampleLine: "{title}、{placement}、{event}",
    handDetail: "5枚初手5000回：初動あり {starterHits} 回、妨害あり {interactionHits} 回、両方あり {bothHits} 回。",
    seedCard: "シードカード",
    focusedCard: "選択中のカード",
    mainImageNote: "中国語・日本語のカード画像は百鴿の高解像度コミュニティ画像を優先し、未収録時は英語画像を表示します。画像内の訳名は公式テキストと異なる場合があります。",
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
    styleNameCompetitive: "実サンプル優先",
    styleNameAi: "ローカル構築",
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
    downloadYdk: "Download YDK",
    recipeImportTitle: "Import a deck recipe",
    recipeReverseHint: "Import a YDK file, YDKE link, or card-name list. Preview it before saving to your local decks.",
    recipeLoading: "Reading recipe…",
    recipeFile: "Choose a YDK file",
    recipePaste: "Or paste YDK, a YDKE link, or a card-name list",
    recipePreview: "Preview recipe",
    recipeSave: "Import main and extra decks",
    recipeCancel: "Cancel",
    recipeInvalid: "Cannot parse this recipe. Check YDK sections and card passcodes, or paste the complete ydke:// link.",
    recipeUnknown: "Unrecognized cards: {cards}. Correct these and preview again. No cards have been imported.",
    recipeSide: "This recipe has {count} side-deck cards. Only main and extra decks will be imported; the side deck will not be saved.",
    recipePreviewCounts: "Importing into {format}: {main} main cards, {extra} extra cards.",
    recipeTooLarge: "Choose a YDK text file smaller than 30 KB.",
    recipeEditHint: "Original quantities are preserved. After importing, edit any cards that do not meet the rules.",
    appEyebrow: "Multi-source deck prototype",
    appTitle: "Seed Deck Builder",
    languageLabel: "Language",
    inputLabel: "Enter a card name or archetype",
    generateButton: "Build Deck",
    styleCompetitive: "Real Samples First",
    styleAi: "AI Model Build",
    formatLabel: "Format",
    formatTcg: "TCG",
    formatOcg: "OCG",
    formatMd: "Master Duel",
    pageBuilder: "Builder",
    pageDecks: "Decks",
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
    emptyBody: "Browse public deck recipes with real samples, or use an AI model to build to your preferences.",
    recommendationEyebrow: "Recommendation",
    pendingTitle: "Pending",
    mainShort: "Main",
    extraShort: "Extra",
    synergyShort: "Synergy",
    mainDeck: "Main Deck",
    extraDeck: "Extra Deck",
    samplePanelTitle: "Real Sample Evidence",
    samplePanelEmpty: "Matched real builds from the last 7 days appear after generation.",
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
    exportMd: "Copy Card Names",
    exportDone: "Export copied",
    exportToast: "Copied: {type}",
    exportTypeText: "deck list",
    exportTypeYdk: "YDK",
    exportTypeYdke: "YDKE",
    exportTypeMd: "Card names",
    saveCurrentDeck: "Save Build",
    saveCurrentDeckDone: "Saved to Decks.",
    saveCurrentDeckEmpty: "No build is open to save.",
    decksEyebrow: "Local Decks",
    decksTitle: "Decks",
    localDeckLibraryKicker: "My Decks",
    localDeckLibraryTitle: "Deck Select",
    localDeckLibraryHint: "Choose a deck to edit, or create a blank one.",
    localPublicSearch: "Search Public Decks",
    localDeckListAction: "Deck List",
    importLocalDeck: "Import Deck",
    localDeckCreateSlot: "New Deck",
    localStandardBadge: "STANDARD",
    duplicateLocalDeck: "Copy",
    deleteLocalDeckCase: "Delete",
    localDeckCopySuffix: "{name} Copy",
    localDeckDuplicated: "Deck copied.",
    localDeckImported: "Deck imported.",
    localDeckImportedName: "Imported Deck",
    confirmDeleteLocalDeck: "Delete \"{name}\"?",
    backToDeckLibrary: "Back to List",
    localCardInspectorEmpty: "Select a card to inspect it.",
    localCardInspectorTitle: "Current Card",
    localBrowserCards: "Card List",
    localBrowserSaved: "Saved Builds",
    localBrowserBookmarks: "Bookmarked Cards",
    localBrowserHistory: "Recent Cards",
    localCardPoolTitle: "Card List",
    localCardPoolCount: "{count} available",
    localCardPoolEmpty: "Search by card name or archetype.",
    localBookmarkEmpty: "No bookmarked cards yet. Bookmark cards from the inspector.",
    localHistoryEmpty: "No recent cards yet. Searches, clicks, and drags are recorded here.",
    newLocalDeck: "New Deck",
    saveLocalDeck: "Save Deck",
    localDeckSearchLabel: "Search saved",
    localDeckSearchPlaceholder: "Deck name / card name",
    localDeckNameLabel: "Deck name",
    localDeckNamePlaceholder: "Untitled deck",
    openLocalDeckAsBuild: "Back to Decks",
    localDeckAutoBuild: "Auto Build",
    localDeckAutoBuilding: "Auto-building from last-7-day real samples.",
    localDeckAutoBuilt: "Auto-built deck.",
    localDeckAutoNeedSeed: "Select or search for a seed card first.",
    localDeckClear: "Clear All",
    localDeckCleared: "Deck cleared.",
    deleteLocalDeck: "Delete",
    localCardSearchLabel: "Add card",
    localCardSearchPlaceholder: "Type a card name",
    addLocalCard: "Add",
    localCardHint: "Cards are added to Main or Extra automatically.",
    localLegalityShort: "Legality",
    localLegalOk: "Legal",
    localLegalIssue: "{count} issues",
    localDeckEmptyTitle: "No local decks yet",
    localDeckEmptyBody: "Save a generated build or create a blank deck.",
    localDeckSaved: "Deck saved.",
    localDeckDeleted: "Deck deleted.",
    localDeckOpened: "Local deck opened.",
    localDeckUntitled: "Untitled deck",
    localDeckCustom: "Custom deck",
    localDeckFavorite: "Saved build",
    localDeckAddNotFound: "Card not found.",
    localDeckMainLimit: "Main Deck is capped at 60 cards.",
    localDeckExtraLimit: "Extra Deck is capped at 15 cards.",
    localDeckCopyDone: "Copied: {section}",
    localDeckRemove: "Remove",
    localDeckBoardEmpty: "Add cards from the card list on the right.",
    localCardBookmark: "Bookmark",
    localCardUnbookmark: "Remove Bookmark",
    localDropMainOnly: "This card cannot be placed in the Main Deck.",
    localDropExtraOnly: "This card cannot be placed in the Extra Deck.",
    aiBadge: "AI generated",
    resourceGateEyebrow: "Client Resource Prep",
    resourceGateTitle: "Downloading Card Assets",
    resourceGateText: "First launch downloads small images for popular decks. Official text and remaining images continue in the background.",
    resourceSmallReady: "Popular-deck official text and small images are ready. Entering the client.",
    resourceFullPending: "Large images pending",
    resourceFullBackground: "Large images downloading in background {percent}%",
    resourceError: "Asset download hit a network issue. You can continue; missing images will retry when opened.",
    resourceContinue: "Continue",
    resourceOfficial: "official text",
    resourceSmallImages: "small images",
    resourceCached: "cached",
    resourceDownloaded: "downloaded",
    resourceFailed: "failed",
    checkUpdateButton: "Check Updates",
    updateChecking: "Checking for updates",
    updateLatest: "You are on the latest version",
    updateNoRelease: "No release found",
    updateCheckFailed: "Update check failed. Try again later.",
    updateEyebrow: "Version Update",
    updateAvailableTitle: "New version {version}",
    updateAvailableBody: "Current version: {current}. Latest version: {latest}. Open GitHub Releases to download it.",
    updateLater: "Later",
    updateDownload: "Open Download Page",
    updateAutoDownloading: "Downloading {latest} in the background: {percent}%. You can keep using this version.",
    updateReadyTitle: "Version {version} is ready",
    updateReadyRestartBody: "The installer has been verified. Save any deck you are editing before restarting to install.",
    updateReadyInstallerBody: "The installer has been downloaded and verified. Open it to update. Saved decks and cached data will be kept.",
    updateDownloading: "Downloading {percent}%",
    updateRestartInstall: "Restart and Install",
    updateOpenInstaller: "Open Installer",
    updateRetry: "Retry Update",
    updateErrorBody: "The update could not be completed. You can keep using this version. Check your connection and try again.",
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
    limitUpdated: "List date: {date}. Source: {source}.",
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
    initialNotice: "Choose a card or theme, then select real samples or an AI model build.",
    notFound: "Card not found. You can search English, Chinese, Japanese, or common nicknames; very new aliases need to be added first.",
    apiError: "YGOPRODeck API is unavailable right now.",
    genericError: "Generation failed. Please try again later.",
    formatNotAvailable: "This card is not currently in the {format} card pool. Switch formats or choose another seed card.",
    formatForbidden: "This card is Forbidden in the current {format} list, so it cannot seed a legal build.",
    noCards: "No recommendable cards.",
    noDesc: "No effect text.",
    pendulumEffectLabel: "[ Pendulum Effect ]",
    monsterEffectLabel: "[ Monster Effect ]",
    officialLocaleMissing: "Official locale unavailable",
    statusIdle: "Idle",
    statusLoading: "Loading",
    statusDone: "Generated",
    statusError: "Error",
    statusCopied: "Copied",
    deckTitle: "{name} Recommended Build",
    aiDeckTitle: "{name} {profile}",
    notice: "{style} draft. {source} Strength prioritizes recent real samples and opening-hand simulation.",
    aiNotice: "Local algorithm build: {profile}. Generated from the seed card, archetype, effect text, last-7-day real sample co-occurrence, staple interaction slots, and 5000 opening-hand simulations.",
    sourceArchetype: "Detected the {archetype} axis.",
    sourceFallback: "No clear archetype field, so name and effect-text similarity were used.",
    sampleSummary: "Matched {count} real samples across sources and prioritized last-7-day deck co-occurrence.",
    sampleUpdated: "Samples refreshed: {time}.",
    dataStale: "Showing cached data; updates automatically when online.",
    dataUpdating: "Updating data in the background.",
    dataUpdateFailed: "Update incomplete; using cached data and retrying automatically.",
    selectedPublicDeck: "Selected: {title}. Creator: {creator}. Source: {source}.",
    sampleDeckTypeOnly: "The source provides the deck-type label, so author, event, and engine details are used to distinguish each list.",
    sampleEngines: "Engines: {engines}",
    sampleNotes: "Notes: {notes}",
    sampleNone: "No last-7-day real sample matched, so component packages and heuristic synergy were used.",
    aiEvidenceLine: "AI plan: {profile}.",
    aiEvidenceFactors: "Signals: seed-card text, archetype fields, last-7-day real sample co-occurrence, current copy limits, staple interaction slots, and opening-hand simulation.",
    aiEvidenceSamples: "Referenced {count} nearby real samples, prioritizing last-7-day matches, without copying a single list.",
    aiEvidenceNoSamples: "No close real sample was available, so the list was generated from card-pool data and heuristic synergy.",
    publicDeckSummary: "Found {count} real sample builds for {format}. Show all matching builds from the last 7 days; if fewer than 15 are available, add older samples from newest to oldest.",
    aiOnlySummary: "No last-7-day real build was found for this card in {format}, so {aiCount} AI recommended builds were generated.",
    publicDeckEmpty: "No public decklist was found for this card, so the AI recommended build is shown.",
    sampleLine: "{title}, {placement}, {event}",
    handDetail: "5000 five-card hands: starter in {starterHits}, interaction in {interactionHits}, both in {bothHits}.",
    seedCard: "Seed card",
    focusedCard: "Focused card",
    mainImageNote: "English card images come from YGOPRODeck. Chinese and Japanese use high-resolution community images from Ygocdb, with English fallback for missing images; community translations may differ from official text.",
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
    styleNameCompetitive: "Real Samples First",
    styleNameAi: "Local Algorithm Build",
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

for (const [language, entries] of Object.entries({
  "zh": {
    "aiSettingsTitle": "AI 接口设置",
    "aiSettingsHelp": "支持 OpenAI 兼容的 Chat Completions 接口。启用后选择「AI 模型构筑」让模型组卡。请求会发送候选卡资料、参考卡表和你的打法要求；测试连接及生成均可能产生 API 费用。",
    "aiBaseUrlLabel": "接口地址（Base URL 或完整接口）",
    "aiModelLabel": "模型名称",
    "aiKeyLabel": "API Key",
    "aiEnabledLabel": "使用 API 模型构筑",
    "aiRememberLabel": "在此设备加密保存密钥",
    "aiSave": "保存设置",
    "aiTest": "测试连接",
    "aiForget": "清除密钥",
    "sampleInputPlaceholder": "例如：灰流丽 / 青眼 / 闪刀姬",
    "aiInputLabel": "描述你想要的卡组",
    "aiInputTopicRequired": "请在这句话中写明卡名或主题，例如：围绕青眼，优先后攻。",
    "aiInputPlaceholder": "例如：围绕耀圣，优先后攻，少带手坑。",
    "aiCancel": "取消请求",
    "aiKeyKeep": "留空保留当前密钥",
    "aiKeyOptional": "填写服务密钥；本地模型可留空",
    "aiBrowserKeyHint": "API Key 保存位置：当前浏览器页面的内存，不写入本地文件或浏览器存储；刷新或重新打开后需再次填写。\n密钥仅在本地保存，不会上传备份。",
    "aiDesktopKeyHint": "API Key 保存位置：{path}（勾选「在此设备加密保存密钥」并保存后，由系统加密写入；未勾选时仅保存在本次运行的内存）。\n密钥仅在本地保存，不会上传备份。更换接口地址后需重新填写密钥。",
    "aiSessionKeyHint": "API Key 保存位置：本次程序运行的内存。此设备无法安全保存密钥，因此不会写入本地文件；重启后需再次填写。\n密钥仅在本地保存，不会上传备份。",
    "aiModeLocal": "请先进入「AI 设置」配置并启用接口，再使用 AI 模型构筑。",
    "aiModeModel": "模型：{model}。选择「AI 模型构筑」后生成；真实样本模式不会调用 API。",
    "aiGenerating": "模型正在组卡并检查配方，最多修正一次。可以取消。",
    "aiSaved": "设置已保存。启用后选择 AI 模型构筑并生成卡组。",
    "aiTesting": "正在测试连接…",
    "aiTestPassed": "连接成功。填写打法要求，保存设置后即可生成。",
    "aiKeyCleared": "密钥已清除，API 构筑已停用。",
    "aiModelProfile": "API 模型构筑",
    "aiModelDesc": "模型选卡与搭配，经本地禁限和数量校验。",
    "aiModelReason": "模型选择",
    "aiModelEvidence": "由 {model} 生成；已校验卡号、规则环境、数量和种子卡。效果互动及展开路线仍需实测。",
    "aiFallback": "{error} 已使用本地算法生成；本次未取得模型配方。",
    "aiHttpError": "接口返回 HTTP {status}。401/403 请检查密钥与权限，429 请检查额度，404 请检查地址和模型。",
    "aiEndpointError": "接口地址无效。使用 HTTPS 地址，或本地模型的 http://127.0.0.1 地址；不要在地址里填写密钥。",
    "aiModelError": "请填写服务支持的模型名称。",
    "aiKeyError": "密钥格式无效，请检查是否包含换行。",
    "aiNetworkError": "无法连接模型接口。请检查地址与网络后重试。",
    "aiTimeout": "模型请求超时，请重试或换用更快的模型。",
    "aiResponseError": "接口未返回可用的 Chat Completions 文本。请检查接口类型和模型。",
    "aiRecipeError": "模型两次返回的配方未通过本地校验。请调整要求或模型后重试。",
    "aiContextError": "构筑资料无效，请重新选择种子卡。",
    "aiCancelled": "已取消模型请求。",
    "aiBusy": "模型请求正在进行，请先完成或取消。",
    "aiSettingsError": "无法读取或保存接口设置，请重试。",
    "aiServiceError": "本地服务尚不支持模型接口，请重启更新后的服务。",
    "aiDesktopRequired": "请在桌面程序或本地服务页面使用模型接口。",
    "aiDisabled": "模型接口已停用。"
  },
  "ja": {
    "aiSettingsTitle": "AI API 設定",
    "aiSettingsHelp": "OpenAI 互換の Chat Completions API に対応。有効にして「AI モデル構築」を選ぶとモデルが構築します。候補カード、参考デッキ、構築要望を送信します。接続テスト・生成に API 利用料金が発生する場合があります。",
    "aiBaseUrlLabel": "API URL（Base URL または完全 URL）",
    "aiModelLabel": "モデル名",
    "aiKeyLabel": "API Key",
    "aiEnabledLabel": "API モデルで構築する",
    "aiRememberLabel": "この端末にキーを暗号化して保存",
    "aiSave": "設定を保存",
    "aiTest": "接続テスト",
    "aiForget": "キーを削除",
    "sampleInputPlaceholder": "例：灰流うらら / 青眼 / 閃刀姫",
    "aiInputLabel": "作りたいデッキを入力",
    "aiInputTopicRequired": "カード名・テーマを含めてください。例：青眼を中心に、後攻向け。",
    "aiInputPlaceholder": "例：青眼を中心に、後攻向け、手札誘発は少なめ。",
    "aiCancel": "リクエストを中止",
    "aiKeyKeep": "空欄なら現在のキーを維持",
    "aiKeyOptional": "API キー（ローカルモデルは空欄可）",
    "aiBrowserKeyHint": "API Key の保存先：現在のブラウザーページのメモリのみ。ファイルやブラウザーの保存領域には書き込まず、再読み込みや再度開く場合は再入力が必要です。\nキーはローカルにのみ保存し、バックアップのためにアップロードしません。",
    "aiDesktopKeyHint": "API Key の保存先：{path}（端末への暗号化保存を選択して保存した場合のみ、システム暗号化で書き込みます。未選択の場合は今回の起動中のメモリのみ）。\nキーはローカルにのみ保存し、バックアップのためにアップロードしません。URL を変更した場合は再入力してください。",
    "aiSessionKeyHint": "API Key の保存先：今回の起動中のメモリ。安全な保存を利用できないため、ファイルには書き込まず、再起動後は再入力が必要です。\nキーはローカルにのみ保存し、バックアップのためにアップロードしません。",
    "aiModeLocal": "「AI 設定」で API を設定・有効化してから、AI モデル構築を使用してください。",
    "aiModeModel": "モデル：{model}。「AI モデル構築」で生成してください。実例モードでは API を呼びません。",
    "aiGenerating": "モデルが構築・検証中です。修正は最大1回。中止できます。",
    "aiSaved": "設定を保存しました。AI モデル構築を選んで生成してください。",
    "aiTesting": "接続テスト中…",
    "aiTestPassed": "接続成功。構築要望を入力し、設定を保存して生成してください。",
    "aiKeyCleared": "キーを削除し、API 構築を無効にしました。",
    "aiModelProfile": "API モデル構築",
    "aiModelDesc": "モデルが選択したカードをローカルで枚数・禁止制限検証。",
    "aiModelReason": "モデルの選択",
    "aiModelEvidence": "{model} で生成。ID、ルール、枚数、起点カードを検証済み。効果の相互作用や展開ルートは実戦確認が必要です。",
    "aiFallback": "{error} 今回はモデルの結果を取得できず、ローカル構築を表示しています。",
    "aiHttpError": "API が HTTP {status} を返しました。401/403：キー・権限、429：利用枠、404：URL・モデルを確認してください。",
    "aiEndpointError": "HTTPS の API URL、または http://127.0.0.1 のローカル URL を入力してください。URL にキーを含めないでください。",
    "aiModelError": "対応するモデル名を入力してください。",
    "aiKeyError": "キーの形式が無効です。改行を確認してください。",
    "aiNetworkError": "API に接続できません。URL とネットワークを確認してください。",
    "aiTimeout": "リクエストがタイムアウトしました。再試行してください。",
    "aiResponseError": "Chat Completions のテキストが返されませんでした。API とモデルを確認してください。",
    "aiRecipeError": "2回の配方が検証に失敗しました。要望やモデルを変更してください。",
    "aiContextError": "構築データが無効です。起点カードを選び直してください。",
    "aiCancelled": "モデルのリクエストを中止しました。",
    "aiBusy": "リクエストが進行中です。完了または中止を待ってください。",
    "aiSettingsError": "API 設定の読込・保存に失敗しました。",
    "aiServiceError": "ローカルサービスを更新版で再起動してください。",
    "aiDesktopRequired": "デスクトップアプリまたはローカルサービスで利用してください。",
    "aiDisabled": "モデル API は無効です。"
  },
  "en": {
    "aiSettingsTitle": "AI API settings",
    "aiSettingsHelp": "Supports OpenAI-compatible Chat Completions APIs. Enable it and choose AI model builds to let the model build your deck. Requests send candidate cards, sample recipes and your preferences. Connection tests and generation may incur API charges.",
    "aiBaseUrlLabel": "API URL (base or full endpoint)",
    "aiModelLabel": "Model name",
    "aiKeyLabel": "API Key",
    "aiEnabledLabel": "Build with an API model",
    "aiRememberLabel": "Encrypt and save key on this device",
    "aiSave": "Save settings",
    "aiTest": "Test connection",
    "aiForget": "Clear key",
    "sampleInputPlaceholder": "Example: Ash Blossom / Blue-Eyes / Sky Striker",
    "aiInputLabel": "Describe the deck you want",
    "aiInputTopicRequired": "Include a card name or archetype, for example: build around Blue-Eyes, going second.",
    "aiInputPlaceholder": "For example: build around Blue-Eyes, going second, fewer hand traps.",
    "aiCancel": "Cancel request",
    "aiKeyKeep": "Leave blank to keep the current key",
    "aiKeyOptional": "Service key; optional for local models",
    "aiBrowserKeyHint": "API Key storage: memory of the current browser page only, never a local file or browser storage. Enter it again after reloading or reopening.\nThe key is stored locally only and is never uploaded for backup.",
    "aiDesktopKeyHint": "API Key storage: {path} (system-encrypted only after selecting encrypted storage on this device and saving; otherwise kept in memory for this app session).\nThe key is stored locally only and is never uploaded for backup. Enter a new key when changing the endpoint.",
    "aiSessionKeyHint": "API Key storage: memory for this app session. Secure storage is unavailable, so no local key file is written. Enter it again after restarting.\nThe key is stored locally only and is never uploaded for backup.",
    "aiModeLocal": "Configure and enable an API in AI settings before using AI model builds.",
    "aiModeModel": "Model: {model}. Generate with AI model builds selected; sample mode does not call the API.",
    "aiGenerating": "The model is building and validating your deck, with at most one correction. You can cancel.",
    "aiSaved": "Settings saved. Choose AI model builds and generate a deck.",
    "aiTesting": "Testing connection…",
    "aiTestPassed": "Connected. Enter preferences and save settings before generating.",
    "aiKeyCleared": "Key cleared. API generation is disabled.",
    "aiModelProfile": "API model build",
    "aiModelDesc": "Model card choices validated locally for counts and banlist limits.",
    "aiModelReason": "Model choice",
    "aiModelEvidence": "Generated by {model}. Card IDs, format, counts and seed were checked. Effect interactions and combo routes still need playtesting.",
    "aiFallback": "{error} Showing local algorithm builds; no model recipe was accepted this time.",
    "aiHttpError": "API returned HTTP {status}. Check key/permissions for 401/403, quota for 429, and URL/model for 404.",
    "aiEndpointError": "Use an HTTPS API URL or a local http://127.0.0.1 URL. Do not put credentials in the URL.",
    "aiModelError": "Enter a model name supported by your service.",
    "aiKeyError": "Invalid key format. Check for line breaks.",
    "aiNetworkError": "Cannot connect to the model API. Check the URL and network, then retry.",
    "aiTimeout": "Model request timed out. Retry or choose a faster model.",
    "aiResponseError": "No usable Chat Completions text was returned. Check the endpoint type and model.",
    "aiRecipeError": "Both model recipes failed validation. Adjust your preferences or model and retry.",
    "aiContextError": "Invalid building context. Select a seed card again.",
    "aiCancelled": "Model request cancelled.",
    "aiBusy": "A model request is running. Wait for it or cancel.",
    "aiSettingsError": "Cannot read or save API settings. Please retry.",
    "aiServiceError": "Restart the updated local service to enable the model API.",
    "aiDesktopRequired": "Use the desktop app or local service for model generation.",
    "aiDisabled": "Model API is disabled."
  }
})) Object.assign(i18n[language], entries);

for (const [language, entries] of Object.entries({
  "zh": {
    "pageAiSettings": "AI 设置",
    "aiModeSamples": "真实样本优先：展示匹配的公开卡组，不调用 AI 模型。",
    "aiNoSamples": "暂无匹配的真实样本。可以换一张卡／主题，或选择 AI 模型构筑。",
    "aiConfigure": "配置 AI 接口",
    "aiPromptTitle": "构筑提示词",
    "aiPromptHelp": "这是实际发给模型的系统指令，可修改构筑原则和策略要求。候选卡、禁限数量与本次打法要求由程序自动附上；保存后从下一次生成起生效。",
    "aiPromptLabel": "可编辑的系统提示词",
    "aiPromptSave": "保存提示词",
    "aiPromptReset": "恢复默认",
    "aiBackToBuilder": "返回构筑器",
    "aiPromptRulesTitle": "查看程序附加的输出格式规则",
    "aiPromptRulesHelp": "以下规则会附在提示词后，帮助程序读取卡组。卡号、数量、禁限和分区校验始终保留。",
    "aiPromptSaved": "提示词已保存，下次模型构筑将使用此版本。",
    "aiPromptUnsaved": "提示词有未保存的修改，生成仍使用已保存版本。",
    "aiPromptResetDraft": "已恢复默认内容。点击「保存提示词」后生效。",
    "aiPromptError": "提示词不能为空，最多 12000 字符。"
  },
  "ja": {
    "pageAiSettings": "AI 設定",
    "aiModeSamples": "実サンプル優先：一致する公開デッキを表示します。AI API は呼び出しません。",
    "aiNoSamples": "一致する実サンプルがありません。別のカード・テーマを試すか、AI モデル構築を選んでください。",
    "aiConfigure": "AI API を設定",
    "aiPromptTitle": "構築プロンプト",
    "aiPromptHelp": "モデルに送るシステム指示です。構築方針や戦略を変更できます。候補カード、制限枚数、今回の要望は自動で追加されます。保存後、次の生成から適用されます。",
    "aiPromptLabel": "編集可能なシステムプロンプト",
    "aiPromptSave": "プロンプトを保存",
    "aiPromptReset": "初期値に戻す",
    "aiBackToBuilder": "構築画面へ戻る",
    "aiPromptRulesTitle": "自動追加される出力形式ルールを見る",
    "aiPromptRulesHelp": "デッキを読み取るため、以下のルールを末尾に追加します。ID・枚数・禁止制限・配置の検証は常に維持されます。",
    "aiPromptSaved": "保存しました。次のモデル構築でこの内容を使います。",
    "aiPromptUnsaved": "未保存の変更があります。生成では保存済みの内容を使います。",
    "aiPromptResetDraft": "初期値を表示しました。保存して適用してください。",
    "aiPromptError": "空のプロンプトは保存できません。最大12000文字です。"
  },
  "en": {
    "pageAiSettings": "AI settings",
    "aiModeSamples": "Real samples first: show matching public decks without calling an AI model.",
    "aiNoSamples": "No matching real samples. Try another card or theme, or choose AI model builds.",
    "aiConfigure": "Configure AI API",
    "aiPromptTitle": "Deck-building prompt",
    "aiPromptHelp": "These system instructions are sent to the model. Edit the building principles and strategy. Candidate cards, copy limits and per-build preferences are added automatically. Changes apply to the next generation after saving.",
    "aiPromptLabel": "Editable system prompt",
    "aiPromptSave": "Save prompt",
    "aiPromptReset": "Restore default",
    "aiBackToBuilder": "Back to builder",
    "aiPromptRulesTitle": "View automatically appended output rules",
    "aiPromptRulesHelp": "The following rules are appended so the app can read the deck. Card IDs, counts, banlist limits and deck sections are always validated.",
    "aiPromptSaved": "Prompt saved. The next model build will use this version.",
    "aiPromptUnsaved": "Unsaved changes. Generation still uses the saved prompt.",
    "aiPromptResetDraft": "Default text restored. Save the prompt to apply it.",
    "aiPromptError": "Enter a nonempty prompt, up to 12000 characters."
  }
})) Object.assign(i18n[language], entries);

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
      "Radiant Typhoon Zoodiac": "绚岚十二兽",
      "Elfnote": "耀圣",
      "Power Patron": "狱神",
      "Memento": "冥铭途",
      "DoomZ": "终刻",
      "Yummy": "黯蜜",
      "Yummy Engine": "黯蜜组件",
      "Dark Magician Yummy": "黑魔导黯蜜",
      "Snake-Eye Yummy": "蛇眼黯蜜",
      "Branded": "烙印",
      "Despia": "死狱乡",
      "Tearlaments": "泪冠哀歌",
      "Labrynth": "白银城",
      "Swordsoul": "相剑",
      "Snake-Eye": "蛇眼",
      "Fairy Tail": "妖精传姬",
      "Thunder Dragon": "雷龙",
      "Blitzclique": "雷盟",
      "Ryu-Ge": "龙华",
      "Ryzeal": "莱泽奥尔",
      "Mermail": "水精鳞",
      "Atlantean": "海皇",
      "Goblin Biker": "百鬼罗刹",
      "Tenpai Dragon": "天杯龙",
      "Centur-Ion": "百夫长骑士",
      "Fiendsmith": "刻魔",
      "Fiendsmith Control": "刻魔控制",
      "Orcust": "自奏圣乐",
      "Orcust Engine": "自奏圣乐组件",
      "Horus": "荷鲁斯",
      "Dragon Link": "龙链接",
      "Armed Dragon": "武装龙",
      "Magnet Warrior": "磁石战士",
      "Artmage": "艺魔",
      "Odion": "利希德",
      "HEROs": "英雄",
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
      "Radiant Typhoon Zoodiac": "絢嵐十二獣",
      "Elfnote": "耀聖詩",
      "Power Patron": "獄神",
      "Memento": "メメント",
      "DoomZ": "終刻",
      "Yummy": "ヤミー",
      "Yummy Engine": "ヤミーエンジン",
      "Dark Magician Yummy": "ブラック・マジシャン ヤミー",
      "Snake-Eye Yummy": "スネークアイ ヤミー",
      "Branded": "烙印",
      "Despia": "デスピア",
      "Tearlaments": "ティアラメンツ",
      "Labrynth": "ラビュリンス",
      "Swordsoul": "相剣",
      "Snake-Eye": "スネークアイ",
      "Fairy Tail": "妖精伝姫",
      "Thunder Dragon": "サンダー・ドラゴン",
      "Blitzclique": "雷盟",
      "Ryu-Ge": "竜華",
      "Ryzeal": "ライゼオル",
      "Mermail": "水精鱗",
      "Atlantean": "海皇",
      "Goblin Biker": "百鬼羅刹",
      "Tenpai Dragon": "天盃龍",
      "Centur-Ion": "センチュリオン",
      "Fiendsmith": "デモンスミス",
      "Fiendsmith Control": "デモンスミス コントロール",
      "Orcust": "オルフェゴール",
      "Orcust Engine": "オルフェゴールエンジン",
      "Horus": "ホルス",
      "Dragon Link": "ドラゴンリンク",
      "Armed Dragon": "アームド・ドラゴン",
      "Magnet Warrior": "磁石の戦士",
      "Artmage": "アートメイジ",
      "Odion": "リシド",
      "HEROs": "HERO",
      Magistus: "マギストス",
      Exosister: "エクソシスター",
      Zoodiac: "十二獣",
      "Vanquish Soul": "ヴァンキッシュ・ソウル",
      "Vanquish Soul K9": "ヴァンキッシュ・ソウル K9",
      K9: "K9",
    },
  },
};

const trendNameMaps = YGOTrendSupport.names;

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
  "星辰": "Dracotail",
  "纠罪巧": "Enneacraft",
  "糾罪巧": "Enneacraft",
  "九艺": "Enneacraft",
  "绚岚": "Radiant Typhoon",
  "绚岚十二兽": "Radiant Typhoon Zoodiac",
  "絢嵐十二獸": "Radiant Typhoon Zoodiac",
  "十二兽": "Zoodiac",
  "十二獸": "Zoodiac",
  "雷盟": "Blitzclique",
  "龙华": "Ryu-Ge",
  "龍華": "Ryu-Ge",
  "竜華": "Ryu-Ge",
  "莱泽奥尔": "Ryzeal",
  "萊澤奧爾": "Ryzeal",
  "ライゼオル": "Ryzeal",
  "水精鳞": "Mermail",
  "水精鱗": "Mermail",
  "海皇": "Atlantean",
  "百鬼罗刹": "Goblin Biker",
  "百鬼羅刹": "Goblin Biker",
  "天杯龙": "Tenpai Dragon",
  "天盃龍": "Tenpai Dragon",
  "百夫长骑士": "Centur-Ion",
  "百夫長騎士": "Centur-Ion",
  "センチュリオン": "Centur-Ion",
  "刻魔": "Fiendsmith",
  "デモンスミス": "Fiendsmith",
  "自奏圣乐": "Orcust",
  "自奏聖樂": "Orcust",
  "オルフェゴール": "Orcust",
  "荷鲁斯": "Horus",
  "荷魯斯": "Horus",
  "ホルス": "Horus",
  "龙链接": "Dragon Link",
  "龍連接": "Dragon Link",
  "ドラゴンリンク": "Dragon Link",
  "武装龙": "Armed Dragon",
  "武裝龍": "Armed Dragon",
  "アームド・ドラゴン": "Armed Dragon",
  "磁石战士": "Magnet Warrior",
  "磁石戰士": "Magnet Warrior",
  "磁石の戦士": "Magnet Warrior",
  "艺魔": "Artmage",
  "藝魔": "Artmage",
  "アートメイジ": "Artmage",
  "利希德": "Odion",
  "リシド": "Odion",
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
  "dark",
  "light",
  "earth",
  "water",
  "fire",
  "wind",
  "divine",
]);

const els = {
  builderPage: document.querySelector("#builderPage"),
  decksPage: document.querySelector("#decksPage"),
  banlistPage: document.querySelector("#banlistPage"),
  aiSettingsPage: document.querySelector("#aiSettingsPage"),
  formatMenu: document.querySelector("#formatMenu"),
  formatCurrentLogo: document.querySelector("#formatCurrentLogo"),
  formatCurrentLabel: document.querySelector("#formatCurrentLabel"),
  pageTabs: document.querySelector("#pageTabs"),
  form: document.querySelector("#deckForm"),
  input: document.querySelector("#cardInput"),
  searchChoicePanel: document.querySelector("#searchChoicePanel"),
  language: document.querySelector("#languageSelect"),
  checkUpdateButton: document.querySelector("#checkUpdateButton"),
  status: document.querySelector("#apiStatus"),
  toast: document.querySelector("#toast"),
  updateDialog: document.querySelector("#updateDialog"),
  updateDialogTitle: document.querySelector("#updateDialogTitle"),
  updateDialogBody: document.querySelector("#updateDialogBody"),
  updateLaterButton: document.querySelector("#updateLaterButton"),
  updateDownloadButton: document.querySelector("#updateDownloadButton"),
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
  saveCurrentDeck: document.querySelector("#saveCurrentDeck"),
  localDeckLibraryView: document.querySelector("#localDeckLibraryView"),
  localDeckEditorView: document.querySelector("#localDeckEditorView"),
  localDeckGrid: document.querySelector("#localDeckGrid"),
  localLibraryCount: document.querySelector("#localLibraryCount"),
  importLocalDeck: document.querySelector("#importLocalDeck"),
  localLibraryPublicSearch: document.querySelector("#localLibraryPublicSearch"),
  backToLocalLibrary: document.querySelector("#backToLocalLibrary"),
  localCardInspector: document.querySelector("#localCardInspector"),
  localBrowserTabs: document.querySelector("#localBrowserTabs"),
  localDeckSearch: document.querySelector("#localDeckSearch"),
  localDeckList: document.querySelector("#localDeckList"),
  localDeckName: document.querySelector("#localDeckName"),
  localDeckEditorPanel: document.querySelector(".local-deck-editor"),
  newLocalDeck: document.querySelector("#newLocalDeck"),
  saveLocalDeck: document.querySelector("#saveLocalDeck"),
  deleteLocalDeck: document.querySelector("#deleteLocalDeck"),
  openLocalDeckAsBuild: document.querySelector("#openLocalDeckAsBuild"),
  autoBuildLocalDeck: document.querySelector("#autoBuildLocalDeck"),
  clearLocalDeck: document.querySelector("#clearLocalDeck"),
  localCardSearch: document.querySelector("#localCardSearch"),
  addLocalCard: document.querySelector("#addLocalCard"),
  localCardHint: document.querySelector("#localCardHint"),
  localCardBrowser: document.querySelector(".local-card-browser"),
  localCardPool: document.querySelector("#localCardPool"),
  localCardPoolCount: document.querySelector("#localCardPoolCount"),
  localBookmarkPool: document.querySelector("#localBookmarkPool"),
  localBookmarkCount: document.querySelector("#localBookmarkCount"),
  localHistoryPool: document.querySelector("#localHistoryPool"),
  localHistoryCount: document.querySelector("#localHistoryCount"),
  localMainCount: document.querySelector("#localMainCount"),
  localExtraCount: document.querySelector("#localExtraCount"),
  localLegalityStatus: document.querySelector("#localLegalityStatus"),
  localMainDeck: document.querySelector("#localMainDeck"),
  localExtraDeck: document.querySelector("#localExtraDeck"),
  copyLocalMain: document.querySelector("#copyLocalMain"),
  copyLocalExtra: document.querySelector("#copyLocalExtra"),
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
  renderAiSettingsState();
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
warmMetaSamples();
setInterval(() => warmMetaSamples(), 30 * 60 * 1000);
if (CAN_USE_LOCAL_API) {
  setTimeout(() => watchDataUpdates(), 3000);
  setInterval(() => watchDataUpdates(), 60000);
}
if (window.desktopUpdates) {
  window.desktopUpdates.onChange((snapshot) => renderDesktopUpdate(snapshot));
  window.desktopUpdates.getState().then((snapshot) => renderDesktopUpdate(snapshot)).catch(() => {});
} else {
  setTimeout(() => checkForUpdates({ silent: true }), 1800);
}

let aiConfig = { enabled: false, baseUrl: "", model: "", hasKey: false, systemPrompt: YGOAiDeck.DEFAULT_SYSTEM_PROMPT };
let browserAiKey = "";
let aiController = null;
let aiLastError = "";
let aiSettingsReady;

function aiNode(id) { return document.getElementById(id); }
function aiErrorText(error) {
  const code = String(error?.message || error || "aiNetworkError");
  if (code.startsWith("aiHttpError:")) return format(t("aiHttpError"), { status: code.split(":")[1] });
  return i18n[state.language][code] ? t(code) : t("aiNetworkError");
}
function unwrapAi(result) {
  if (!result?.ok) throw new Error(result?.error || "aiNetworkError");
  return result.value;
}
function renderAiSettingsState() {
  const desktop = Boolean(window.desktopAI);
  const modelMode = document.querySelector('input[name="style"]:checked')?.value === "ai";
  aiNode("builderInputLabel").textContent = t(modelMode ? "aiInputLabel" : "inputLabel");
  els.input.placeholder = t(modelMode ? "aiInputPlaceholder" : "sampleInputPlaceholder");
  aiNode("aiConfigure").classList.toggle("hidden", !modelMode || aiConfig.enabled || Boolean(aiController));
  aiNode("aiRememberLabel").classList.toggle("hidden", !desktop || !aiConfig.canStoreKey);
  aiNode("aiApiKey").placeholder = aiConfig.hasKey ? t("aiKeyKeep") : t("aiKeyOptional");
  aiNode("aiKeyHint").textContent = !desktop ? t("aiBrowserKeyHint") : aiConfig.canStoreKey ? format(t("aiDesktopKeyHint"), { path: aiConfig.storagePath }) : t("aiSessionKeyHint");
  aiNode("aiModeHint").textContent = aiController ? t("aiGenerating") : !modelMode ? t("aiModeSamples") : aiLastError || (aiConfig.enabled ? format(t("aiModeModel"), { model: aiConfig.model }) : t("aiModeLocal"));
  aiNode("aiModeHint").classList.toggle("ai-error", modelMode && Boolean(aiLastError));
}
function aiFormConfig() {
  return {
    baseUrl: aiNode("aiBaseUrl").value.trim(), model: aiNode("aiModel").value.trim(),
    apiKey: aiNode("aiApiKey").value.trim(), enabled: aiNode("aiEnabled").checked,
    rememberKey: aiNode("aiRememberKey").checked,
  };
}
function browserAiConfig(input) {
  const baseUrl = YGOAiDeck.endpoint(input.baseUrl);
  if (!input.model.trim()) throw new Error("aiModelError");
  return { ...input, baseUrl, systemPrompt: aiConfig.systemPrompt, apiKey: input.apiKey || (baseUrl === aiConfig.baseUrl ? browserAiKey : "") };
}
function aiSettingsFeedback(text, error = false) {
  aiNode("aiSettingsStatus").textContent = text;
  aiNode("aiSettingsStatus").classList.toggle("ai-error", error);
}
async function setupAiSettings() {
  try {
    if (window.desktopAI) aiConfig = unwrapAi(await window.desktopAI.getConfig());
    else {
      const saved = JSON.parse(localStorage.getItem("deckBuilderAI") || "{}");
      aiConfig = { baseUrl: typeof saved.baseUrl === "string" ? saved.baseUrl : "", model: typeof saved.model === "string" ? saved.model : "", enabled: Boolean(saved.enabled), hasKey: false, systemPrompt: YGOAiDeck.normalizePrompt(localStorage.getItem("deckBuilderAISystemPrompt")) };
    }
  } catch { aiSettingsFeedback(t("aiSettingsError"), true); }
  aiNode("aiBaseUrl").value = aiConfig.baseUrl;
  aiNode("aiModel").value = aiConfig.model;
  aiNode("aiEnabled").checked = aiConfig.enabled;
  aiNode("aiRememberKey").checked = Boolean(aiConfig.keyStored || !aiConfig.hasKey);
  aiNode("aiSystemPrompt").value = aiConfig.systemPrompt || YGOAiDeck.DEFAULT_SYSTEM_PROMPT;
  aiNode("aiPromptRules").textContent = YGOAiDeck.OUTPUT_RULES;
  renderAiSettingsState();
}
function setAiRequestBusy(busy) {
  aiNode("aiCancel").classList.toggle("hidden", !busy);
  aiNode("aiSettingsCancel").classList.toggle("hidden", !busy);
  for (const node of document.querySelectorAll('#aiSettingsForm input, #aiSettingsForm button:not(#aiSettingsCancel), #aiPromptForm textarea, #aiPromptForm button, #deckForm button[type="submit"], #cardInput, input[name="format"], input[name="style"], #autoBuildLocalDeck')) node.disabled = busy;
  renderAiSettingsState();
}
async function requestAi(payload, config) {
  if (window.desktopAI) return unwrapAi(await window.desktopAI.request(payload));
  if (location.hostname !== "127.0.0.1" || location.protocol !== "http:") throw new Error("aiDesktopRequired");
  try {
    const response = await fetch("/api/ai-deck", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, config }), signal: aiController.signal,
    });
    if (!response.ok) throw new Error("aiServiceError");
    return unwrapAi(await response.json());
  } catch (error) {
    if (aiController?.signal.aborted) throw new Error("aiCancelled");
    throw error;
  }
}
function modelDeckContext(seed, publicSamples, forcedArchetype = "", requirements = "") {
  const archetype = forcedArchetype || seed.archetype || inferNameFamily(seed.name);
  const tokens = getSeedTokens(seed, archetype);
  const sampleContext = buildSampleContext(seed, archetype, tokens, "ai", publicSamples);
  const cards = new Map();
  function include(card) {
    if (!card || cards.size >= 180 || isBanned(card) || isSkillOrToken(card) || !isCardInFormat(card)) return;
    cards.set(card.id, { id: card.id, name: card.name, type: card.type, extra: isExtraDeck(card), archetype: card.archetype || "", race: card.race, attribute: card.attribute, level: card.level, atk: card.atk, def: card.def, linkval: card.linkval, scale: card.scale, limit: copyLimit(card), text: card.desc || "", pendulumText: card.pend_desc || "" });
  }
  include(seed);
  // Preserve real packages before adding alternate theme cards and generic options.
  const samples = sampleContext.samples.slice(0, 3).map(({ sample }) => {
    const recipe = { main: [], extra: [] };
    for (const [field, section] of [["mainIds", "main"], ["extraIds", "extra"]]) {
      for (const row of deckRowsFromIds(sample[field] || [], "")) { include(row.card); recipe[section].push({ id: row.card.id, qty: row.qty }); }
    }
    return { date: sample.date || "", ...recipe };
  });
  for (const profile of aiProfiles) {
    for (const [name] of mainStaplesForProfile(profile)) include(byName(name));
  }
  for (const [name] of extraStaples) include(byName(name));
  state.allCards.filter(card => archetype && card.archetype === archetype).slice(0, 65).forEach(include);
  // Include explicitly named cards and secondary themes from the same request.
  for (const mention of findModelInputMentions(requirements)) {
    if (mention.card) include(mention.card);
    else state.allCards.filter(card => card.archetype === mention.archetype).slice(0, 25).forEach(include);
  }
  for (const profile of [aiProfiles[0], aiProfiles[4]]) scoreCandidates(seed, archetype, tokens, "ai", profile).slice(0, 60).forEach(item => include(item.card));
  const allowedIds = new Set(cards.keys());
  for (const sample of samples) for (const section of ["main", "extra"]) sample[section] = sample[section].filter(row => allowedIds.has(row.id));
  return { format: state.activeFormat, language: { zh: "Simplified Chinese", ja: "Japanese", en: "English" }[state.language], seedId: seed.id, archetype, requirements, banlistDate: state.limitRegulations[state.activeFormat]?.cachedAt || "", cards: [...cards.values()], samples };
}
async function buildConfiguredDeckChoices(seed, preferredStyle, publicSamples, forcedArchetype = "", requirements = "") {
  await aiSettingsReady;
  if (preferredStyle !== "ai") {
    const samples = buildDeckChoices(seed, preferredStyle, publicSamples, forcedArchetype);
    if (!samples.length) throw new Error(t("aiNoSamples"));
    return samples;
  }
  if (!aiConfig.enabled || !aiConfig.baseUrl || !aiConfig.model) throw new Error(t("aiModeLocal"));
  if (aiController) throw new Error(t("aiBusy"));
  aiLastError = "";
  aiController = new AbortController();
  setAiRequestBusy(true);
  try {
    const context = modelDeckContext(seed, publicSamples, forcedArchetype, requirements);
    const result = await requestAi({ context }, { ...aiConfig, apiKey: browserAiKey });
    if (aiController.signal.aborted) throw new Error("aiCancelled");
    // Refresh limits from the current local state before accepting the provider response.
    const checkedContext = { ...context, cards: context.cards.filter(card => isCardInFormat(state.cardByAnyId.get(card.id))).map(card => ({ ...card, limit: copyLimit(state.cardByAnyId.get(card.id)) })) };
    const checked = YGOAiDeck.validate(JSON.stringify(result.recipe), checkedContext);
    if (checked.issues.length) throw new Error("aiRecipeError");
    const recipe = checked.recipe;
    const rows = section => recipe[section].map(row => ({ card: state.cardByAnyId.get(row.id), qty: row.qty, reason: row.reason || t("aiModelReason") }));
    const deck = { seed, style: "ai", format: state.activeFormat, archetype: context.archetype, variantKind: "ai", sampleContext: { samples: [] }, main: rows("main"), extra: rows("extra"), variantId: "ai-model", variantTitle: recipe.title, variantDescKey: "aiModelDesc", aiProfile: { titleKey: "aiModelProfile" }, modelGeneration: { ...recipe, model: result.model } };
    deck.score = estimateScore(deck.main, deck.extra, seed, deck.archetype);
    deck.handSimulation = simulateOpeningHands(deck);
    return [deck];
  } catch (error) {
    if (error.message === "aiCancelled") throw new Error(t("aiCancelled"));
    aiLastError = aiErrorText(error);
    throw new Error(aiLastError);
  } finally {
    aiController = null;
    setAiRequestBusy(false);
  }
}

aiSettingsReady = setupAiSettings();
for (const input of document.querySelectorAll('input[name="style"]')) input.addEventListener("change", () => { if (input.checked) setActiveStyle(input.value); });
aiNode("aiConfigure").addEventListener("click", () => { setActivePage("ai-settings"); aiNode("aiBaseUrl").focus(); });
aiNode("aiSettingsForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (aiController) return;
  aiSettingsFeedback("");
  try {
    const input = aiFormConfig();
    if (window.desktopAI) aiConfig = unwrapAi(await window.desktopAI.saveConfig(input));
    else {
      const config = browserAiConfig(input);
      const metadata = { baseUrl: config.baseUrl, model: config.model, enabled: config.enabled };
      localStorage.setItem("deckBuilderAI", JSON.stringify(metadata));
      browserAiKey = config.apiKey;
      aiConfig = { ...metadata, hasKey: Boolean(browserAiKey), systemPrompt: aiConfig.systemPrompt };
    }
    aiNode("aiApiKey").value = "";
    aiLastError = "";
    renderAiSettingsState();
    if (aiConfig.enabled) setActiveStyle("ai");
    aiSettingsFeedback(t("aiSaved"));
  } catch (error) { aiSettingsFeedback(aiErrorText(error), true); }
});
aiNode("aiTest").addEventListener("click", async () => {
  if (aiController || !aiNode("aiSettingsForm").reportValidity()) return;
  aiController = new AbortController(); setAiRequestBusy(true);
  aiSettingsFeedback(t("aiTesting"));
  try {
    const config = window.desktopAI ? aiFormConfig() : browserAiConfig(aiFormConfig());
    await requestAi({ test: true, config }, config);
    aiSettingsFeedback(t("aiTestPassed"));
  } catch (error) { aiSettingsFeedback(aiErrorText(error), true); }
  finally { aiController = null; setAiRequestBusy(false); }
});
function cancelAiRequest() { aiController?.abort(); window.desktopAI?.cancel().catch(() => {}); }
aiNode("aiCancel").addEventListener("click", cancelAiRequest);
aiNode("aiSettingsCancel").addEventListener("click", cancelAiRequest);
aiNode("aiForget").addEventListener("click", async () => {
  try {
    if (window.desktopAI) aiConfig = unwrapAi(await window.desktopAI.forgetKey());
    else { browserAiKey = ""; aiConfig.hasKey = false; aiConfig.enabled = false; localStorage.setItem("deckBuilderAI", JSON.stringify({ baseUrl: aiConfig.baseUrl, model: aiConfig.model, enabled: false })); }
    aiNode("aiApiKey").value = ""; aiNode("aiEnabled").checked = false;
    aiLastError = ""; renderAiSettingsState(); aiSettingsFeedback(t("aiKeyCleared"));
  } catch (error) { aiSettingsFeedback(aiErrorText(error), true); }
});

function aiPromptFeedback(key, error = false) {
  aiNode("aiPromptStatus").dataset.i18n = key;
  aiNode("aiPromptStatus").textContent = t(key);
  aiNode("aiPromptStatus").classList.toggle("ai-error", error);
}
aiNode("aiSystemPrompt").addEventListener("input", () => aiPromptFeedback("aiPromptUnsaved"));
aiNode("aiPromptReset").addEventListener("click", () => {
  aiNode("aiSystemPrompt").value = YGOAiDeck.DEFAULT_SYSTEM_PROMPT;
  aiPromptFeedback("aiPromptResetDraft");
});
aiNode("aiPromptForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (aiController) return;
  try {
    const prompt = YGOAiDeck.normalizePrompt(aiNode("aiSystemPrompt").value);
    if (window.desktopAI) aiConfig = unwrapAi(await window.desktopAI.savePrompt(prompt));
    else { localStorage.setItem("deckBuilderAISystemPrompt", prompt); aiConfig.systemPrompt = prompt; }
    aiNode("aiSystemPrompt").value = aiConfig.systemPrompt;
    aiPromptFeedback("aiPromptSaved");
  } catch (error) { aiPromptFeedback(error.message === "aiPromptError" ? "aiPromptError" : "aiSettingsError", true); }
});
aiNode("aiBackToBuilder").addEventListener("click", () => { setActivePage("builder"); els.input.focus(); });

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
    await ensureMetaSamplesForSearch();
    const modelInput = preferredStyle === "ai" ? resolveModelInput(query) : null;
    const deckQuery = modelInput ? modelInput.deckQuery : resolveDeckSearchQuery(query);
    const seed = modelInput ? modelInput.seed : findBestCard(query);
    const requirements = preferredStyle === "ai" ? query : "";

    if (preferredStyle !== "ai" && mode === "auto" && shouldShowSearchChoices(deckQuery, seed, query)) {
      renderSearchChoices(query, deckQuery, seed, preferredStyle);
      setStatus("idle");
      return;
    }

    if (deckQuery && (preferredStyle === "ai" || mode !== "card")) {
      await loadBuildsForArchetype(deckQuery.name, deckQuery.label, preferredStyle, requirements);
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
    const decks = await buildConfiguredDeckChoices(seed, preferredStyle, publicDecks, "", requirements);
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
    resetBuilderResults();
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
els.saveCurrentDeck?.addEventListener("click", () => saveCurrentBuildDeck());
els.searchChoicePanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-search-mode]");
  if (!button) return;
  const preferredStyle = document.querySelector('input[name="style"]:checked').value;
  runSearch(button.dataset.query || els.input.value.trim(), preferredStyle, button.dataset.searchMode);
});
els.refreshDataButton.addEventListener("click", () => refreshVisibleData());
els.checkUpdateButton?.addEventListener("click", () => checkForUpdates({ silent: false }));
els.updateLaterButton?.addEventListener("click", () => dismissUpdateDialog());
els.updateDownloadButton?.addEventListener("click", () => openUpdateDownload());
els.localDeckSearch?.addEventListener("input", () => renderLocalDeckLibrary());
els.localDeckName?.addEventListener("input", () => syncLocalDeckDraftName());
els.localBrowserTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-local-browser-tab]");
  if (button) setLocalBrowserTab(button.dataset.localBrowserTab);
});
els.localDeckList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-local-deck-id]");
  if (button) selectLocalDeck(button.dataset.localDeckId);
});
els.localDeckGrid?.addEventListener("click", (event) => {
  const newButton = event.target.closest("[data-local-deck-action='new']");
  if (newButton) {
    createNewLocalDeck();
    return;
  }
  const actionButton = event.target.closest("[data-local-deck-action]");
  if (actionButton) {
    const id = actionButton.dataset.localDeckId;
    if (actionButton.dataset.localDeckAction === "duplicate") duplicateLocalDeck(id);
    if (actionButton.dataset.localDeckAction === "delete") deleteLocalDeckById(id);
    return;
  }
  const deckButton = event.target.closest("[data-local-deck-id]");
  if (deckButton) selectLocalDeck(deckButton.dataset.localDeckId);
});
els.backToLocalLibrary?.addEventListener("click", () => setLocalDeckView("library"));
els.localLibraryPublicSearch?.addEventListener("click", () => {
  setActivePage("builder");
  els.input?.focus();
});
els.importLocalDeck?.addEventListener("click", () => importLocalDeckPrompt());
setupRecipeImportExport();
els.newLocalDeck?.addEventListener("click", () => createNewLocalDeck());
els.saveLocalDeck?.addEventListener("click", () => saveLocalDeckDraft());
els.deleteLocalDeck?.addEventListener("click", () => deleteLocalDeck());
els.openLocalDeckAsBuild?.addEventListener("click", () => setLocalDeckView("library"));
els.autoBuildLocalDeck?.addEventListener("click", async () => {
  if (aiController) return;
  els.autoBuildLocalDeck.disabled = true;
  try { await autoBuildLocalDeck(); }
  catch (error) { setLocalCardHint(error.message || t("genericError"), true); }
  finally { els.autoBuildLocalDeck.disabled = false; }
});
els.clearLocalDeck?.addEventListener("click", () => clearLocalDeckDraft());
els.addLocalCard?.addEventListener("click", () => addCardToLocalDraft());
els.localCardSearch?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addCardToLocalDraft();
});
els.localCardSearch?.addEventListener("input", () => renderLocalCardPool());
els.localCardPool?.addEventListener("click", handleLocalPoolCardClick);
els.localCardPool?.addEventListener("contextmenu", handleLocalPoolCardContextMenu);
els.localCardPool?.addEventListener("dragstart", handleLocalPoolDragStart);
els.localBookmarkPool?.addEventListener("click", handleLocalPoolCardClick);
els.localBookmarkPool?.addEventListener("contextmenu", handleLocalPoolCardContextMenu);
els.localBookmarkPool?.addEventListener("dragstart", handleLocalPoolDragStart);
els.localHistoryPool?.addEventListener("click", handleLocalPoolCardClick);
els.localHistoryPool?.addEventListener("contextmenu", handleLocalPoolCardContextMenu);
els.localHistoryPool?.addEventListener("dragstart", handleLocalPoolDragStart);
els.localCardInspector?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-local-inspector-action]");
  if (!button) return;
  const section = button.dataset.localSection;
  const cardId = Number(button.dataset.localCardId);
  state.localSelectedCardId = cardId;
  if (button.dataset.localInspectorAction === "bookmark") {
    toggleLocalCardBookmark(cardId);
    return;
  }
  if (button.dataset.localInspectorAction === "increase") adjustLocalCardQty(section, cardId, 1);
  if (button.dataset.localInspectorAction === "decrease") adjustLocalCardQty(section, cardId, -1);
});

async function handleLocalDeckRowAction(event) {
  const button = event.target.closest("[data-local-action]");
  const row = event.target.closest("[data-local-card-id][data-local-section]");
  if (!row) return;
  const section = row.dataset.localSection;
  const cardId = Number(row.dataset.localCardId);
  if (!button) {
    event.preventDefault();
    selectLocalCardForInspector(cardId);
    return;
  }
  state.localSelectedCardId = cardId;
  if (button.dataset.localAction === "increase") adjustLocalCardQty(section, cardId, 1);
  if (button.dataset.localAction === "decrease") adjustLocalCardQty(section, cardId, -1);
  if (button.dataset.localAction === "remove") removeLocalCard(section, cardId);
}

function handleLocalDeckCardContextMenu(event) {
  const row = event.target.closest("[data-local-card-id][data-local-section]");
  if (!row) return;
  event.preventDefault();
  const section = row.dataset.localSection;
  const cardId = Number(row.dataset.localCardId);
  if (!section || !Number.isFinite(cardId)) return;
  state.localSelectedCardId = cardId;
  adjustLocalCardQty(section, cardId, -1);
  renderLocalAuxiliaryPools();
}

async function handleLocalPoolCardClick(event) {
  const item = event.target.closest("[data-local-pool-card-id]");
  if (!item) return;
  const card = state.cardByAnyId.get(Number(item.dataset.localPoolCardId));
  if (!card) return;
  selectLocalCardForInspector(card.id);
}

function handleLocalPoolCardContextMenu(event) {
  const item = event.target.closest("[data-local-pool-card-id]");
  if (!item) return;
  event.preventDefault();
  const card = cardByLocalId(item.dataset.localPoolCardId);
  if (!card) return;
  addCardToLocalDraft(card);
}

function refreshLocalCardLocale(cardId, card) {
  ensureLocaleDataForCards([card]).then(() => {
    if (Number(state.localSelectedCardId) !== Number(cardId)) return;
    renderLocalCardInspector();
  }).catch(() => {
    if (Number(state.localSelectedCardId) === Number(cardId)) renderLocalCardInspector();
  });
}

function selectLocalCardForInspector(cardId) {
  const id = Number(cardId);
  if (!Number.isFinite(id)) return;
  const card = cardByLocalId(id);
  state.localSelectedCardId = id;
  recordLocalCardHistory(id);
  renderLocalDeckEditor();
  if (card) {
    renderLocalCardInspector();
    refreshLocalCardLocale(id, card);
  }
}

function handleLocalPoolDragStart(event) {
  const item = event.target.closest("[data-local-pool-card-id]");
  if (!item || !event.dataTransfer) return;
  event.dataTransfer.setData("text/plain", item.dataset.localPoolCardId);
  event.dataTransfer.effectAllowed = "copy";
  recordLocalCardHistory(item.dataset.localPoolCardId);
}

function dragHasType(event, type) {
  return Array.from(event.dataTransfer?.types || []).includes(type);
}

function handleLocalDeckCardDragStart(event) {
  const item = event.target.closest("[data-local-card-id][data-local-section]");
  if (!item || !event.dataTransfer) return;
  event.dataTransfer.setData("application/x-local-deck-card", JSON.stringify({
    cardId: Number(item.dataset.localCardId),
    section: item.dataset.localSection,
  }));
  event.dataTransfer.effectAllowed = "move";
}

function handleLocalDeckDragOver(event) {
  if (!dragHasType(event, "text/plain") || dragHasType(event, "application/x-local-deck-card")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  event.currentTarget.classList.add("drag-over");
}

function handleLocalDeckDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleLocalDeckDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove("drag-over");
  const card = cardByLocalId(event.dataTransfer?.getData("text/plain"));
  if (!card) return;
  addCardToLocalDraft(card);
}

function handleLocalEditorDragOver(event) {
  if (!dragHasType(event, "text/plain") || dragHasType(event, "application/x-local-deck-card")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  els.localDeckEditorPanel?.classList.add("drag-over");
}

function handleLocalEditorDragLeave(event) {
  if (event.relatedTarget && els.localDeckEditorPanel?.contains(event.relatedTarget)) return;
  els.localDeckEditorPanel?.classList.remove("drag-over");
}

function handleLocalEditorDrop(event) {
  if (!dragHasType(event, "text/plain") || dragHasType(event, "application/x-local-deck-card")) return;
  event.preventDefault();
  els.localDeckEditorPanel?.classList.remove("drag-over");
  const card = cardByLocalId(event.dataTransfer?.getData("text/plain"));
  if (!card) return;
  addCardToLocalDraft(card);
}

function handleLocalBrowserDragOver(event) {
  if (!dragHasType(event, "application/x-local-deck-card")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  els.localCardBrowser?.classList.add("drag-over-remove");
}

function handleLocalBrowserDragLeave(event) {
  if (event.relatedTarget && els.localCardBrowser?.contains(event.relatedTarget)) return;
  els.localCardBrowser?.classList.remove("drag-over-remove");
}

function handleLocalBrowserDrop(event) {
  if (!dragHasType(event, "application/x-local-deck-card")) return;
  event.preventDefault();
  els.localCardBrowser?.classList.remove("drag-over-remove");
  let payload = null;
  try {
    payload = JSON.parse(event.dataTransfer.getData("application/x-local-deck-card") || "{}");
  } catch {
    payload = null;
  }
  const section = payload?.section === "extra" ? "extra" : payload?.section === "main" ? "main" : "";
  const cardId = Number(payload?.cardId);
  if (!section || !Number.isFinite(cardId)) return;
  adjustLocalCardQty(section, cardId, -1);
  recordLocalCardHistory(cardId);
  setLocalCardHint(t("localCardHint"), false);
  renderLocalAuxiliaryPools();
}

document.addEventListener("dragend", () => {
  els.localCardBrowser?.classList.remove("drag-over-remove");
  els.localDeckEditorPanel?.classList.remove("drag-over");
});

els.localMainDeck?.addEventListener("click", handleLocalDeckRowAction);
els.localExtraDeck?.addEventListener("click", handleLocalDeckRowAction);
els.localMainDeck?.addEventListener("contextmenu", handleLocalDeckCardContextMenu);
els.localExtraDeck?.addEventListener("contextmenu", handleLocalDeckCardContextMenu);
els.localMainDeck?.addEventListener("dragstart", handleLocalDeckCardDragStart);
els.localExtraDeck?.addEventListener("dragstart", handleLocalDeckCardDragStart);
els.localMainDeck?.addEventListener("dragover", handleLocalDeckDragOver);
els.localMainDeck?.addEventListener("dragleave", handleLocalDeckDragLeave);
els.localMainDeck?.addEventListener("drop", handleLocalDeckDrop);
els.localExtraDeck?.addEventListener("dragover", handleLocalDeckDragOver);
els.localExtraDeck?.addEventListener("dragleave", handleLocalDeckDragLeave);
els.localExtraDeck?.addEventListener("drop", handleLocalDeckDrop);
els.localDeckEditorPanel?.addEventListener("dragover", handleLocalEditorDragOver);
els.localDeckEditorPanel?.addEventListener("dragleave", handleLocalEditorDragLeave);
els.localDeckEditorPanel?.addEventListener("drop", handleLocalEditorDrop);
els.localCardBrowser?.addEventListener("dragover", handleLocalBrowserDragOver);
els.localCardBrowser?.addEventListener("dragleave", handleLocalBrowserDragLeave);
els.localCardBrowser?.addEventListener("drop", handleLocalBrowserDrop);
els.copyLocalMain?.addEventListener("click", () => copyLocalDeckSection("main"));
els.copyLocalExtra?.addEventListener("click", () => copyLocalDeckSection("extra"));
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
  renderAiSettingsState();
  syncFormatMenu();
  renderTrendPanel();
  renderLimitPanel();
  if (state.activePage === "decks") renderLocalDecksPage();
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
  input.addEventListener("change", async () => {
    if (!input.checked) return;
    resetRecipeImportPreview();

    state.activeFormat = VALID_FORMATS.has(input.value) ? input.value : "md";
    localStorage.setItem("deckBuilderActiveFormat", state.activeFormat);
    syncFormatMenu();
    if (els.formatMenu) els.formatMenu.open = false;
    renderTrendPanel();
    loadFormatTrends(state.activeFormat);
    if (state.activePage === "banlist") loadLimitPanel(state.activeFormat);
    if (state.activePage === "decks") {
      state.activeLocalDeckId = "";
      state.localDeckDraft = null;
      renderLocalDecksPage();
    }
    if (state.activePage === "builder") {
      await reloadBuilderForActiveFormat();
    }
  });
}

async function reloadBuilderForActiveFormat() {
  const query = els.input.value.trim();
  const hadArchetypeSearch = Boolean(state.activeSearchArchetype);
  const hadSeedSearch = Boolean(state.currentSeed);
  if (!query) {
    resetBuilderResults();
    return;
  }

  const preferredStyle = document.querySelector('input[name="style"]:checked')?.value || state.activeStyle;
  const mode = hadArchetypeSearch ? "deck" : hadSeedSearch ? "card" : "auto";
  resetBuilderResults();
  await runSearch(query, preferredStyle, mode);
}

function setActivePage(page, options = {}) {
  const nextPage = ["builder", "decks", "banlist", "ai-settings"].includes(page) ? page : "builder";
  state.activePage = nextPage;
  if (options.persist !== false) localStorage.setItem("deckBuilderActivePage", nextPage);

  els.builderPage.classList.toggle("hidden", nextPage !== "builder");
  els.decksPage?.classList.toggle("hidden", nextPage !== "decks");
  els.banlistPage.classList.toggle("hidden", nextPage !== "banlist");
  els.aiSettingsPage.classList.toggle("hidden", nextPage !== "ai-settings");
  els.pageTabs.querySelectorAll("[data-page]").forEach((button) => {
    const isActive = button.dataset.page === nextPage;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  if (nextPage === "banlist") {
    renderLimitPanel();
    if (!state.limitPanelCards[state.activeFormat]) loadLimitPanel(state.activeFormat);
  }
  if (nextPage === "decks") {
    state.activeLocalDeckView = "library";
    renderLocalDecksPage();
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

function dataUpdateNotice() {
  if (!state.dataHealth) return "";
  if (state.dataHealth.running) return t("dataUpdating");
  if (Object.values(state.dataHealth.tasks || {}).some((task) => task.lastError || task.stale)) return t("dataUpdateFailed");
  return "";
}

async function watchDataUpdates() {
  if (watchingDataUpdates) return;
  watchingDataUpdates = true;
  try {
    const response = await fetch("/api/data-health", { cache: "no-store" });
    if (!response.ok) return;
    const health = await response.json();
    state.dataHealth = health;
    const signature = JSON.stringify(Object.entries(health.tasks || {}).map(([name, task]) => [name, task.lastSuccessAt]));
    if (!health.running && signature !== dataHealthSignature && Object.keys(health.tasks || {}).length) {
      await loadAllCards({ forceRefresh: true });
      state.limitRegulations = {};
      state.limitPanelCards = {};
      await Promise.allSettled([
        loadMetaSamplesFromServer(),
        loadLimitRegulation(state.activeFormat),
        loadFormatTrends(state.activeFormat, { forceRefresh: true }),
      ]);
      if (state.activePage === "banlist") await loadLimitPanel(state.activeFormat);
      dataHealthSignature = signature;
    }
    renderTrendPanel();
    if (state.activePage === "banlist") renderLimitPanel();
  } catch {
    // Existing decks remain usable while the local service is unavailable.
  } finally {
    watchingDataUpdates = false;
  }
}

async function loadAllCards({ forceRefresh = false } = {}) {
  if (!forceRefresh && state.allCards.length && state.searchIndex.length) return;
  if (forceRefresh && CAN_USE_LOCAL_API) {
    state.masterDuelLocaleData = null;
    masterDuelLocalePromise = null;
  }

  const aliasPromise = fetchAliasSearchData();
  const localePromise = ensureMasterDuelLocaleData();
  const cardPromise = CAN_USE_LOCAL_API
    ? fetch(CARDINFO_URL, { cache: forceRefresh ? "no-store" : "default" })
    : ensureOfflineScript("data/cardinfo-cache.js", "YGO_CARDINFO_CACHE").then(() => ({
      ok: Boolean(window.YGO_CARDINFO_CACHE),
      json: async () => window.YGO_CARDINFO_CACHE || { data: [] },
    }));
  const [cardResult, aliasResult, masterDuelLocaleResult] = await Promise.allSettled([
    cardPromise,
    aliasPromise,
    localePromise,
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
  state.inferredArchetypeLocales = buildInferredArchetypeLocales(state.allCards, state.masterDuelLocaleData, state.localeById);
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
      stale: Boolean(payload.stale) || !payload.cachedAt || Date.now() - Date.parse(payload.cachedAt) > 86400000,
      source: payload.source || "--",
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
      stale: Boolean(payload.stale) || !payload.cachedAt || Date.now() - Date.parse(payload.cachedAt) > 86400000,
      source: payload.source || "--",
    };
  } catch {
    const cached = window.YGO_LIMIT_REGULATIONS?.formats?.[targetFormat];
    state.limitRegulations[targetFormat] = cached ? { ...cached, stale: true } : { date: "", regulation: null, stale: true };
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
      if (info.beta_id) map.set(Number(info.beta_id), card);
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

function buildInferredArchetypeLocales(cards, localeData, localeById = new Map()) {
  const buckets = { zh: {}, ja: {} };
  const officialNamesByArchetype = { zh: {}, ja: {} };
  const addCandidate = (language, archetype, label) => {
    if (!archetype || !label) return;
    const normalizedLabel = compactNormalize(label);
    if (!normalizedLabel || normalizedLabel.length < 2 || normalizedLabel.length > 18) return;
    const bucket = buckets[language][archetype] || (buckets[language][archetype] = new Map());
    bucket.set(label, (bucket.get(label) || 0) + 1);
  };

  for (const card of cards || []) {
    if (!card?.archetype) continue;
    const locale = localeData?.cards?.[String(card.id)] || {};
    const storedLocale = localeById.get(Number(card.id)) || {};
    const officialNames = {
      zh: [
        locale["zh-CN"]?.name,
        locale["zh-TW"]?.name,
        storedLocale["zh-CN"]?.name,
        storedLocale["zh-TW"]?.name,
      ],
      ja: [
        locale["ja-JP"]?.name,
        storedLocale["ja-JP"]?.name,
      ],
    };

    for (const [language, names] of Object.entries(officialNames)) {
      const cleanNames = names
        .map((name) => decodeEntities(name || ""))
        .filter(Boolean);
      if (cleanNames.length) {
        officialNamesByArchetype[language][card.archetype] ||= [];
        officialNamesByArchetype[language][card.archetype].push(...cleanNames);
      }
      for (const officialName of cleanNames) {
        for (const label of inferArchetypeLabelsFromOfficialName(officialName)) {
          addCandidate(language, card.archetype, label);
        }
      }
    }
  }

  for (const language of ["zh", "ja"]) {
    for (const [archetype, names] of Object.entries(officialNamesByArchetype[language])) {
      const commonLabel = inferCommonOfficialArchetypeLabel(names);
      if (commonLabel) {
        const weight = Math.max(2, names.length);
        const bucket = buckets[language][archetype] || (buckets[language][archetype] = new Map());
        bucket.set(commonLabel, (bucket.get(commonLabel) || 0) + weight);
      }
    }
  }

  const pickLabels = (language) => {
    const labelsByArchetype = {};
    for (const [archetype, labels] of Object.entries(buckets[language])) {
      const best = [...labels.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
      if (!best || best[1] < 2) continue;
      if (language === "zh" && localeData?.archetypes?.["zh-CN"]?.[archetype]) continue;
      labelsByArchetype[archetype] = best[0];
    }
    return labelsByArchetype;
  };

  const zh = pickLabels("zh");
  const ja = pickLabels("ja");
  return { zh, ja };
}

function inferCommonOfficialArchetypeLabel(names = []) {
  const cleanNames = [...new Set((names || [])
    .map((name) => compactSpaces(decodeEntities(name || "")))
    .filter(Boolean))];
  if (cleanNames.length < 2) return "";
  let prefix = cleanNames[0];
  for (const name of cleanNames.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < name.length && prefix[index] === name[index]) index += 1;
    prefix = prefix.slice(0, index);
    if (prefix.length < 2) return "";
  }
  prefix = prefix
    .replace(/[・･－—–\-:：·\s「『“"（(].*$/u, "")
    .replace(/的?$/, (match, offset, source) => (source.length <= 3 ? match : ""))
    .trim();
  return /[\u3400-\u9fff]/u.test(prefix) && prefix.length >= 2 && prefix.length <= 12 ? prefix : "";
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
  const response = await fetch(MASTER_DUEL_LOCALE_URL, { cache: CAN_USE_LOCAL_API ? "no-store" : "default" });
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
    state.inferredArchetypeLocales = buildInferredArchetypeLocales(state.allCards, state.masterDuelLocaleData, state.localeById);
  } catch {
    // Official locales are retried later; failed network requests should not
    // permanently mark a newly released card as untranslated.
  }
}

async function ensureMasterDuelLocaleDataForCards(cards) {
  await ensureMasterDuelLocaleData();
  const missingIds = [
    ...new Set((cards || []).map((card) => Number(card?.id)).filter((id) => id && !state.masterDuelLocaleFullIds.has(id))),
  ];

  try {
    if (missingIds.length) {
      const data = CAN_USE_LOCAL_API
        ? await fetchMasterDuelLocaleSubset(missingIds)
        : await fetchFullMasterDuelLocaleData(missingIds);
      for (const entry of data.entries || []) {
        const id = Number(entry.id);
        mergeMasterDuelLocaleEntry(id, entry.texts || {});
        state.masterDuelLocaleFullIds.add(id);
      }
    }

    const langKey = localeTextKey();
    const aliasFallbackIds = [];
    for (const card of cards || []) {
      const id = Number(card?.id);
      if (!id || state.language === "en") continue;
      const masterText = state.masterDuelLocaleById.get(id)?.[langKey] || null;
      const storedText = state.localeById.get(id)?.[langKey] || null;
      if (needsAliasLocaleFallbackForMasterDuel(card, masterText, storedText)) aliasFallbackIds.push(id);
    }

    if (aliasFallbackIds.length) {
      const fallbackData = await fetchLocaleSubset([...new Set(aliasFallbackIds)]);
      for (const entry of fallbackData.entries || []) {
        const id = Number(entry.id);
        const existing = state.localeById.get(id) || {};
        state.localeById.set(id, { ...existing, ...(entry.texts || {}) });
      }
    }
    state.inferredArchetypeLocales = buildInferredArchetypeLocales(state.allCards, state.masterDuelLocaleData, state.localeById);
  } catch {
    for (const id of missingIds) state.masterDuelLocaleFullIds.add(id);
  }
}

function needsAliasLocaleFallbackForMasterDuel(card, masterText, storedText) {
  if (!masterText?.name && !storedText?.name) return true;
  if (!String(card?.type || "").includes("Pendulum")) return false;
  if (hasCompletePendulumText(storedText?.desc || "")) return false;
  return !hasCompletePendulumText(masterText?.desc || "");
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
  if (!CAN_USE_LOCAL_API) return fetchFullMasterDuelLocaleData(ids);
  const response = await fetch(`${MASTER_DUEL_LOCALE_SUBSET_URL}?ids=${encodeURIComponent(ids.join(","))}`);
  if (!response.ok) return { entries: [] };
  return response.json();
}

async function fetchLocaleSubset(ids) {
  if (!CAN_USE_LOCAL_API) {
    await ensureOfflineScript("data/multilang-aliases.js", "YGO_MULTILANG_ALIASES");
    const wanted = new Set((ids || []).map(Number).filter(Boolean));
    return {
      entries: (window.YGO_MULTILANG_ALIASES?.entries || []).filter((entry) => wanted.has(Number(entry.id))),
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

function hasLoadedMetaSamples() {
  return Array.isArray(state.metaSamples?.samples) && state.metaSamples.samples.length > 0;
}

function warmMetaSamples() {
  if (!CAN_USE_LOCAL_API) return Promise.resolve(false);
  if (!metaSamplesLoadPromise) {
    metaSamplesLoadPromise = loadMetaSamplesFromServer(false).finally(() => {
      metaSamplesLoadPromise = null;
    });
  }
  return metaSamplesLoadPromise;
}

async function ensureMetaSamplesForSearch() {
  if (state.forceDeckSearchRefresh || !hasLoadedMetaSamples()) return warmMetaSamples();
  warmMetaSamples();
  return true;
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
  await refreshTrendCatalog();
  try {
    els.trendStatus.textContent = t("trendLoading");
    const refresh = options.forceRefresh ? "&refresh=1" : "";
    const [trendResult, powerResult] = await Promise.allSettled([
      fetch(`/api/format-trends?format=${encodeURIComponent(formatKey)}${refresh}`, { cache: options.forceRefresh ? "no-store" : "default" }),
      fetch(`/api/power-rankings?format=${encodeURIComponent(formatKey)}${refresh}`, { cache: options.forceRefresh ? "no-store" : "default" }),
    ]);
    if (trendResult.status !== "fulfilled" || !trendResult.value.ok) throw new Error("trend response");
    const payload = await trendResult.value.json();
    if (payload.error) throw new Error(payload.error);
    state.formatTrends[formatKey] = payload;
    if (powerResult.status === "fulfilled" && powerResult.value.ok) {
      state.formatPowerRankings[formatKey] = await powerResult.value.json();
      if (state.formatPowerRankings[formatKey].error) throw new Error(state.formatPowerRankings[formatKey].error);
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

async function refreshTrendCatalog() {
  if (!CAN_USE_LOCAL_API) return;
  try {
    const response = await fetch("data/trend-catalog.json", { cache: "no-store" });
    if (!response.ok) return;
    const catalog = await response.json();
    if (catalog.version === 1 && catalog.entries) window.YGO_TREND_CATALOG = catalog;
  } catch { /* Keep the bundled catalog when the service is unavailable. */ }
}

function handleTrendImageError(event) {
  const image = event.target;
  if (!image.matches?.(".trend-pie-art, .power-row-art") || image.dataset.imageFailed) return;
  image.dataset.imageFailed = "true";
  if (image.tagName.toLowerCase() === "image") image.setAttribute("href", "assets/trend-card-back.svg");
  else image.src = "assets/trend-card-back.svg";
}

document.addEventListener("error", handleTrendImageError, true);

function handleLocalizedCardImageError(event) {
  const image = event.target;
  if (image.tagName !== "IMG" || image.dataset.cardImageFallback) return;
  const source = new URL(image.getAttribute("src") || "", location.href);
  if (source.hostname !== "cdn.233.momobako.com") return;
  const match = source.pathname.match(/^\/ygoimg\/(?:sc|jp)\/(\d+)\.webp(!half)?$/);
  if (!match) return;
  image.dataset.cardImageFallback = "en";
  const folder = match[2] && !image.classList.contains("large-card-image") ? "cards_small" : "cards";
  image.src = `https://images.ygoprodeck.com/images/${folder}/${match[1]}.jpg`;
}

document.addEventListener("error", handleLocalizedCardImageError, true);

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
    els.trendLadderList.innerHTML = renderPowerRankings(state.formatPowerRankings[state.activeFormat]);
    els.trendMeta.textContent = dataUpdateNotice();
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
      <button class="trend-row" type="button" title="${escapeHtml(`${name} (${item.name})`)}" data-trend-name="${escapeHtml(item.name)}" data-trend-label="${escapeHtml(name)}">
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
  if (data.stale || (data.generatedAt && Date.now() - Date.parse(data.generatedAt) > 86400000)) els.trendMeta.textContent += ` ${t("dataStale")}`;
  if (dataUpdateNotice()) els.trendMeta.textContent += ` ${dataUpdateNotice()}`;
  scheduleVisibleImagePreload({
    trendItems: items,
    powerRankings: state.formatPowerRankings[state.activeFormat],
  });
  ensureTrendLocaleData({
    trendItems: items,
    powerRankings: state.formatPowerRankings[state.activeFormat],
  }).catch(() => {});
}

function renderPowerRankings(data) {
  const groups = (data?.groups || []).filter((group) => /^tier\s+[123]$/i.test(String(group.tier || group.label || "")) && (group.items || []).length);
  if (!groups.length) return `<div class="ladder-empty">${escapeHtml(t("trendEmpty"))}</div>`;
  return groups.map((group) => `
    <section class="power-tier">
      <header>
        <strong>${escapeHtml(localizePowerTier(group.tier || group.label))}</strong>
        <span>${escapeHtml(localizePowerDescription(group.description || ""))}</span>
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
  const image = trendRepresentativeImage(searchName) || item.image || "assets/trend-card-back.svg";
  const power = Number(item.power || 0);
  const powerText = Number.isFinite(power) && power > 0 ? power.toFixed(power % 1 ? 1 : 0) : "--";
  return `
    <button class="power-row" type="button" title="${escapeHtml(displayName)}" data-trend-name="${escapeHtml(searchName)}" data-trend-label="${escapeHtml(displayName)}">
      <img class="power-row-art" src="${escapeHtml(image)}" alt="" loading="lazy" />
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

function localizePowerDescription(description) {
  const key = String(description || "");
  const maps = {
    zh: {
      "Estimated from recent samples": "按近期样本估算",
      "The most successful Tournament Topping Decks, with power levels of at least 12.": "近期真实样本中 Power 不低于 12 的构筑。",
      "Decks with power levels between 7 and 12.": "近期真实样本中 Power 介于 7 到 12 的构筑。",
      "Decks with power levels between 3 and 7.": "近期真实样本中 Power 介于 3 到 7 的构筑。",
      "Decks with power levels between 1 and 3.": "近期真实样本中 Power 介于 1 到 3 的构筑。",
    },
    ja: {
      "Estimated from recent samples": "近期サンプルから推定",
      "The most successful Tournament Topping Decks, with power levels of at least 12.": "直近の上位入賞で Power 12 以上のデッキ。",
      "Decks with power levels between 7 and 12.": "直近の上位入賞で Power 7 から 12 のデッキ。",
      "Decks with power levels between 3 and 7.": "直近の上位入賞で Power 3 から 7 のデッキ。",
      "Decks with power levels between 1 and 3.": "直近の上位入賞で Power 1 から 3 のデッキ。",
    },
  };
  return maps[state.language]?.[key] || key;
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
    const imageUrl = trendRepresentativeImage(item.name) || "assets/trend-card-back.svg";
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
  const entry = YGOTrendSupport.entryFor(name, window.YGO_TREND_CATALOG);
  if (entry?.image) return `${entry.image}?v=${entry.imageHash || OFFLINE_SCRIPT_VERSION}`;
  const component = YGOTrendSupport.components(name, window.YGO_TREND_CATALOG).find(item => item.image);
  if (component?.image) return `${component.image}?v=${component.imageHash || OFFLINE_SCRIPT_VERSION}`;
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
  const catalogEntry = YGOTrendSupport.entryFor(name, window.YGO_TREND_CATALOG);
  const mappedId = catalogEntry?.cardId || TREND_REPRESENTATIVE_CARD_IDS[name];
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
  els.limitMeta.textContent = `${format(t("limitUpdated"), { date: displayDate || "--", source: state.limitRegulations[state.activeFormat]?.source || "--" })} ${format(t("limitSummary"), {
    total: rows.length,
    forbidden: counts.forbidden,
    limited: counts.limited,
    semi: counts["semi-limited"],
  })}`;
  if (state.limitRegulations[state.activeFormat]?.stale) els.limitMeta.textContent += ` ${t("dataStale")}`;
  if (dataUpdateNotice()) els.limitMeta.textContent += ` ${dataUpdateNotice()}`;
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
        <p class="seed-desc">${escapeHtml(cardEffectText(card, localized))}</p>
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

function deckSearchCandidates() {
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

  return candidates;
}

// Exact mentions only: fuzzy card search on a whole sentence can pick an unrelated card.
function findModelInputMentions(input) {
  const text = normalize(input);
  const mentions = [];
  function add(label, target) {
    const name = normalize(label);
    if (compactNormalize(name).length < 2 || (name.length < 3 && /^[a-z ]+$/.test(name))) return;
    let start = text.indexOf(name);
    while (start >= 0) {
      const latin = /^[a-z0-9 ]+$/.test(name);
      if (!latin || (!/[a-z0-9]/.test(text[start - 1] || "") && !/[a-z0-9]/.test(text[start + name.length] || ""))) {
        mentions.push({ ...target, start, length: name.length });
        break;
      }
      start = text.indexOf(name, start + 1);
    }
  }
  for (const [label, archetype] of deckSearchCandidates()) add(label, { archetype });
  for (const entry of state.searchIndex) add(entry.label, { card: entry.card });
  // Earlier mentions anchor the deck; at the same position prefer the full card name.
  return mentions.sort((a, b) => a.start - b.start || b.length - a.length || Number(Boolean(b.card)) - Number(Boolean(a.card)));
}

function resolveModelInput(query) {
  const mention = findModelInputMentions(query)[0];
  if (!mention) throw new Error(t("aiInputTopicRequired"));
  return mention.card
    ? { seed: mention.card, deckQuery: null }
    : { seed: null, deckQuery: { name: mention.archetype, label: localizeTrendName(mention.archetype) } };
}

function resolveDeckSearchQuery(query) {
  const compactQuery = compactNormalize(query);
  const normalizedQuery = normalize(query);
  if (!compactQuery && !normalizedQuery) return null;
  const candidates = deckSearchCandidates();
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

async function loadBuildsForArchetype(archetype, label = localizeTrendName(archetype), preferredStyle = state.activeStyle, requirements = "") {
  if (!archetype) return;
  setBusy(true, "loading");
  clearError();

  try {
    await loadAllCards();
    await loadLimitRegulation(state.activeFormat);
    await ensureMetaSamplesForSearch();
    const publicDecks = await searchPublicDecksForArchetype(archetype);
    const seed = representativeSeedForArchetype(archetype, publicDecks);
    if (!seed) throw new Error(t("notFound"));

    const workingSeed = { ...seed, archetype };
    await ensureLocaleDataForCards([workingSeed]);
    const decks = await buildConfiguredDeckChoices(workingSeed, preferredStyle, publicDecks, archetype, requirements);
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
    els.input.value = preferredStyle === "ai" && requirements ? requirements : label;
    renderFocusCard(workingSeed, reason("reasonSeed"));
    renderBuildListView(workingSeed);
    setStatus("done");
  } catch (error) {
    resetBuilderResults();
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
  const candidates = (publicSamples || []).filter(Boolean)
    .map((sample, index) => ({ sample, index, age: publicSampleAgeDays(sample) }))
    .sort((a, b) => a.age - b.age);
  const publicDecks = [];
  for (const { sample, index, age } of candidates) {
    // Keep all recent recipes; extend the date window only until enough usable builds exist.
    if (age > RECENT_PUBLIC_DECK_DAYS && publicDecks.length >= MIN_PUBLIC_DECK_CHOICES) break;
    const deck = buildDeckFromPublicSample(seed, sample, index, forcedArchetype);
    if (deck) publicDecks.push(deck);
  }
  return publicDecks;
}

function publicSampleAgeDays(sample) {
  const value = sample?.date || sample?.created || sample?.updated || "";
  if (!value) return 999999;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 999999;
  return Math.max(0, (Date.now() - parsed) / 86400000);
}

function preferRecentRealSamples(samples = [], days = RECENT_PUBLIC_DECK_DAYS) {
  const list = (samples || []).filter(Boolean);
  const recent = list.filter((sample) => publicSampleAgeDays(sample) <= days);
  return recent.length ? recent : list;
}

function preferRecentSampleItems(sampleItems = [], days = RECENT_PUBLIC_DECK_DAYS) {
  const list = (sampleItems || []).filter(Boolean);
  const recent = list.filter(({ sample }) => publicSampleAgeDays(sample) <= days);
  return recent.length ? recent : list;
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
  if (countCards(main) < 40) return null;

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
  const mainTarget = targetAiMainDeckSize(sampleContext);
  const engineTarget = targetMainEngineSize(style, profile, mainTarget);

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
    if (countCards(main) >= mainTarget) break;
    const card = byName(name);
    if (card) addCard(main, card, qty, reason);
  }

  for (const item of mainCandidates.slice(engineTarget)) {
    if (countCards(main) >= mainTarget) break;
    addCard(main, item.card, 1, item.reason);
  }

  fillMainDeck(main, seed, archetype, tokens, profile, mainTarget);
  if (style === "ai") balanceAiMainDeck(main, seed, archetype, candidates, sampleContext, profile, mainTarget);

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
    main: normalizeDeck(main, mainTarget),
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
  const recentFirstPublicSamples = preferRecentRealSamples(publicSamples);
  const liveSamples = recentFirstPublicSamples
    .filter((sample) => Array.isArray(sample.mainIds) && sample.mainIds.length)
    .map((sample, index) => ({ sample, score: 1200 - index * 8 }));
  const scoredLocalSamples = (state.metaSamples.samples || [])
    .filter((sample) => sampleMatchesActiveFormat(sample))
    .map((sample) => ({ sample, score: scoreSample(sample, seed, archetype, sampleTokens) }))
    .filter((item) => item.score >= 160)
    .sort((a, b) => b.score - a.score);
  const localSamples = preferRecentSampleItems(scoredLocalSamples);
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
  const ageDays = publicSampleAgeDays(sample);
  if (ageDays <= RECENT_PUBLIC_DECK_DAYS) weight += 1.2;
  else if (ageDays <= RECENT_PUBLIC_DECK_DAYS * 2) weight += 0.35;
  else if (ageDays > 30) weight -= 0.4;
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
      if (seedHasMonsterFields && seed.race && hasExactNormalizedTerm(desc, seed.race)) {
        score += 12;
        reasons.push(reason("reasonRace", { race: seed.race }));
      }

      if (seedHasMonsterFields && seed.attribute && hasExactNormalizedTerm(desc, seed.attribute)) {
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
  const sharedRace = seedHasMonsterFields && seed.race && hasExactNormalizedTerm(desc, seed.race);
  const sharedAttribute = seedHasMonsterFields && seed.attribute && hasExactNormalizedTerm(desc, seed.attribute);

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

function fillMainDeck(deck, seed, archetype, tokens, profile = null, mainTarget = 40) {
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
    if (countCards(deck) >= mainTarget) break;
    const card = byName(name);
    if (card) addCard(deck, card, 1, reason("reasonGenericFill"));
  }

  const targetMonsterCount = aiTargetMonsterCount(profile, mainTarget);
  const softPool = state.allCards
    .filter((card) => !isExtraDeck(card) && !isBanned(card) && !isSkillOrToken(card) && isCardInFormat(card))
    .filter((card) => (archetype && card.archetype === archetype) || tokenHit(card, tokens))
    .sort((a, b) => aiFillPriority(b, seed, archetype, tokens, profile) - aiFillPriority(a, seed, archetype, tokens, profile))
    .slice(0, 120);

  for (const card of softPool.filter(isMainDeckMonster)) {
    if (countCards(deck) >= mainTarget || mainMonsterCount(deck) >= targetMonsterCount) break;
    if (card.id !== seed.id) addCard(deck, card, 1, reason(card.archetype === archetype ? "reasonSameArchetype" : "reasonGenericSynergy", { archetype }));
  }

  for (const card of softPool) {
    if (countCards(deck) >= mainTarget) break;
    if (!isMainDeckMonster(card) && themeSpellTrapCount(deck, archetype, seed) >= themeSpellTrapCap(profile, mainTarget)) continue;
    if (card.id !== seed.id) addCard(deck, card, 1, reason("reasonSameAxis"));
  }
}

function balanceAiMainDeck(deck, seed, archetype, candidates, sampleContext, profile = null, mainTarget = 40) {
  const targetMonsterCount = aiTargetMonsterCount(profile, mainTarget);
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

    if (countCards(deck) >= mainTarget && !removeOneMainDeckSpellTrap(deck, seed)) break;
    addCard(deck, item.card, 1, item.reason || reason("reasonSampleMain"));
  }

  const monsterCount = mainMonsterCount(deck);
  if (monsterCount >= targetMonsterCount) return;

  const fallbackMonsters = fallbackMonsterPicks(seed, archetype, profile)
    .map((item) => item.card);

  for (const card of fallbackMonsters) {
    if (mainMonsterCount(deck) >= targetMonsterCount) break;
    if (remainingCopies(card, deck) <= 0) continue;
    if (countCards(deck) >= mainTarget && !removeOneMainDeckSpellTrap(deck, seed)) break;
    addCard(deck, card, 1, reason(card.archetype === archetype ? "reasonSameArchetype" : "reasonGenericFill", { archetype }));
  }
}

function aiTargetMonsterCount(profile = null, mainTarget = 40) {
  const extraSlots = Math.max(0, mainTarget - 40);
  const scaledExtraMonsters = Math.round(extraSlots * 0.45);
  if (profile?.id === "ai-engine") return 16 + scaledExtraMonsters;
  if (profile?.id === "ai-going-second" || profile?.id === "ai-control") return 12 + scaledExtraMonsters;
  return 14 + scaledExtraMonsters;
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

function themeSpellTrapCap(profile = null, mainTarget = 40) {
  const extraSlots = Math.max(0, mainTarget - 40);
  const scaledExtraSpells = Math.round(extraSlots * 0.35);
  if (profile?.id === "ai-engine") return 14 + scaledExtraSpells;
  if (profile?.id === "ai-going-second" || profile?.id === "ai-control") return 10 + scaledExtraSpells;
  return 12 + scaledExtraSpells;
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
      <p class="seed-desc">${escapeHtml(cardEffectText(card, localized))}</p>
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
  els.notice.textContent = state.deckVariants[0]?.modelGeneration
    ? format(t("aiModelEvidence"), { model: state.deckVariants[0].modelGeneration.model })
    : format(t("publicDeckSummary"), { count: publicCount, aiCount, format: activeFormatName() });
  renderTrustPanel(null);
  renderDeckComparison();
  renderVariantTabs();
  scheduleVisibleImagePreload({ decks: state.deckVariants });
}

function resetBuilderResults() {
  state.deckVariants = [];
  state.lastDeck = null;
  state.currentSeed = null;
  state.activeSearchArchetype = "";
  state.activeSearchLabel = "";
  state.activeVariantId = null;
  state.selectedDetail = null;
  state.viewMode = "empty";

  clearSearchChoices();
  els.seedCard.classList.add("hidden");
  els.seedCard.replaceChildren();
  els.seedEmpty.classList.remove("hidden");
  els.deckTitle.textContent = t("pendingTitle");
  els.mainCount.textContent = "0";
  els.extraCount.textContent = "0";
  els.scoreValue.textContent = "--";
  els.scoreBoard.classList.remove("hidden");
  els.backToBuildList.classList.add("hidden");
  els.notice.classList.remove("error");
  els.notice.dataset.noticeKey = "initial";
  els.notice.textContent = t("initialNotice");
  els.trustPanel.classList.add("hidden");
  els.trustContent.replaceChildren();
  els.variantSection.classList.add("hidden");
  els.variantTabs.replaceChildren();
  els.comparisonPanel.classList.add("hidden");
  els.comparisonContent.replaceChildren();
  els.detailInsights.classList.add("hidden");
  els.sampleEvidence.textContent = t("samplePanelEmpty");
  resetHandSimulation();
  els.deckColumns.classList.add("hidden");
  els.mainDeck.replaceChildren();
  els.extraDeck.replaceChildren();
}

function loadSavedDeckRecords() {
  try {
    const payload = JSON.parse(localStorage.getItem(LOCAL_DECK_STORAGE_KEY) || "[]");
    if (!Array.isArray(payload)) return [];
    return payload
      .filter((record) => record && Array.isArray(record.main) && Array.isArray(record.extra))
      .map((record) => ({
        schemaVersion: LOCAL_DECK_SCHEMA_VERSION,
        id: String(record.id || createLocalDeckId()),
        name: compactSpaces(record.name || "") || "",
        format: VALID_FORMATS.has(record.format) ? record.format : "md",
        sourceType: record.sourceType === "saved" || record.sourceType === "ai" || record.sourceType === "public" ? record.sourceType : "custom",
        sourceTitle: compactSpaces(record.sourceTitle || ""),
        main: normalizeLocalCardRecords(record.main),
        extra: normalizeLocalCardRecords(record.extra),
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function normalizeLocalCardRecords(rows = []) {
  return (rows || [])
    .map((row) => ({ id: Number(row.id || row.cardId || 0), qty: Math.max(1, Math.min(300, Math.floor(Number(row.qty || 1)))) }))
    .filter((row) => Number.isInteger(row.id) && row.id > 0 && Number.isFinite(row.qty));
}

function saveSavedDeckRecords() {
  localStorage.setItem(LOCAL_DECK_STORAGE_KEY, JSON.stringify(state.savedDecks));
}

function loadLocalCardIdList(key) {
  try {
    const payload = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(payload)) return [];
    return [...new Set(payload.map((id) => Number(id)).filter(Boolean))];
  } catch {
    return [];
  }
}

function saveLocalCardIdList(key, ids) {
  localStorage.setItem(key, JSON.stringify([...new Set((ids || []).map((id) => Number(id)).filter(Boolean))]));
}

function recordLocalCardHistory(cardId) {
  const id = Number(cardId);
  if (!id) return;
  state.localCardHistoryIds = [
    id,
    ...state.localCardHistoryIds.filter((item) => Number(item) !== id),
  ].slice(0, LOCAL_CARD_HISTORY_LIMIT);
  saveLocalCardIdList(LOCAL_CARD_HISTORY_STORAGE_KEY, state.localCardHistoryIds);
  renderLocalAuxiliaryPools();
}

function toggleLocalCardBookmark(cardId) {
  const id = Number(cardId);
  if (!id) return;
  const exists = state.localBookmarkedCardIds.some((item) => Number(item) === id);
  state.localBookmarkedCardIds = exists
    ? state.localBookmarkedCardIds.filter((item) => Number(item) !== id)
    : [id, ...state.localBookmarkedCardIds];
  saveLocalCardIdList(LOCAL_CARD_BOOKMARK_STORAGE_KEY, state.localBookmarkedCardIds);
  renderLocalCardInspector();
  renderLocalAuxiliaryPools();
}

function localCardsFromIds(ids = []) {
  return ids
    .map((id) => state.cardByAnyId.get(Number(id)))
    .filter((card) => card && isCardInFormat(card, state.activeFormat) && copyLimit(card, state.activeFormat) > 0);
}

function createLocalDeckId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLocalDeckDraft() {
  const now = new Date().toISOString();
  return {
    schemaVersion: LOCAL_DECK_SCHEMA_VERSION,
    id: "",
    name: "",
    format: state.activeFormat,
    sourceType: "custom",
    sourceTitle: "",
    main: [],
    extra: [],
    createdAt: now,
    updatedAt: now,
  };
}

function cloneLocalDeckRecord(record) {
  return JSON.parse(JSON.stringify(record || emptyLocalDeckDraft()));
}

function serializeDeckRows(rows = []) {
  return (rows || [])
    .map((item) => ({ id: Number(item.card?.id || item.id || 0), qty: Math.max(1, Number(item.qty || 1)) }))
    .filter((item) => item.id && item.qty);
}

function serializeCurrentDeckForSave(deck) {
  const now = new Date().toISOString();
  const title = deckTitleText(deck);
  return {
    schemaVersion: LOCAL_DECK_SCHEMA_VERSION,
    id: createLocalDeckId(),
    name: compactSpaces(title || "") || t("localDeckUntitled"),
    format: deck.format || state.activeFormat,
    sourceType: deck.variantKind === "ai" ? "ai" : deck.variantKind === "public" ? "public" : "saved",
    sourceTitle: title,
    main: serializeDeckRows(deck.main),
    extra: serializeDeckRows(deck.extra),
    createdAt: now,
    updatedAt: now,
  };
}

async function saveCurrentBuildDeck() {
  if (!state.lastDeck) {
    showToast(t("saveCurrentDeckEmpty"));
    return;
  }
  await loadAllCards();
  const record = serializeCurrentDeckForSave(state.lastDeck);
  state.savedDecks = [record, ...state.savedDecks.filter((item) => item.id !== record.id)];
  state.activeLocalDeckId = record.id;
  saveSavedDeckRecords();
  showToast(t("saveCurrentDeckDone"));
  if (state.activePage === "decks") {
    state.localDeckDraft = cloneLocalDeckRecord(record);
    renderLocalDecksPage();
  }
}

async function renderLocalDecksPage() {
  await loadAllCards();
  await loadLimitRegulation(state.activeFormat).catch(() => null);
  if (!state.localDeckDraft || state.localDeckDraft.format !== state.activeFormat) {
    const active = state.savedDecks.find((deck) => deck.id === state.activeLocalDeckId && deck.format === state.activeFormat)
      || state.savedDecks.find((deck) => deck.format === state.activeFormat);
    state.activeLocalDeckId = active?.id || "";
    state.localDeckDraft = active ? cloneLocalDeckRecord(active) : emptyLocalDeckDraft();
  }
  await ensureLocaleDataForCards(localDraftCards());
  renderLocalDeckGrid();
  renderLocalDeckLibrary();
  renderLocalDeckEditor();
  renderLocalBrowserTabs();
  renderLocalCardPool();
  renderLocalAuxiliaryPools();
  renderLocalDeckViews();
}

function setLocalDeckView(view) {
  state.activeLocalDeckView = view === "editor" ? "editor" : "library";
  renderLocalDeckViews();
}

function resetDeckPageScroll() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    els.decksPage?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  });
}

function renderLocalDeckViews() {
  els.localDeckLibraryView?.classList.toggle("hidden", state.activeLocalDeckView !== "library");
  els.localDeckEditorView?.classList.toggle("hidden", state.activeLocalDeckView !== "editor");
  if (state.activePage === "decks") resetDeckPageScroll();
}

function renderLocalDeckGrid() {
  if (!els.localDeckGrid) return;
  const records = state.savedDecks
    .filter((record) => record.format === state.activeFormat)
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  if (els.localLibraryCount) els.localLibraryCount.textContent = `${records.length} / 20`;
  const tiles = [
    `
      <button class="local-deck-case local-deck-create-case" type="button" data-local-deck-action="new">
        <span class="local-create-plus">+</span>
        <strong>${escapeHtml(t("localDeckCreateSlot"))}</strong>
      </button>
    `,
    ...records.map((record) => renderLocalDeckCase(record)),
  ];
  els.localDeckGrid.innerHTML = tiles.join("");
  resetLocalDeckGridScroll();
}

function resetLocalDeckGridScroll() {
  if (!els.localDeckGrid) return;
  const reset = () => {
    els.localDeckGrid.scrollTop = 0;
  };
  reset();
  window.requestAnimationFrame(reset);
  window.setTimeout(reset, 80);
  window.setTimeout(reset, 250);
}

function renderLocalDeckCase(record) {
  const mainCount = countLocalRows(record.main);
  const extraCount = countLocalRows(record.extra);
  const title = record.name || t("localDeckUntitled");
  const coverCards = localDeckCoverCards(record);
  const active = record.id === state.activeLocalDeckId;
  const cover = coverCards.length
    ? `<div class="local-case-cover-stack">${coverCards.map((card) => `<img src="${cardImage(card, true)}" alt="${escapeHtml(localizedCard(card).name)}" loading="lazy" />`).join("")}</div>`
    : `<div class="local-case-box" aria-hidden="true"></div>`;
  return `
    <article class="local-deck-case${active ? " active" : ""}" data-local-deck-id="${escapeHtml(record.id)}">
      <span class="local-standard-badge">${escapeHtml(t("localStandardBadge"))}</span>
      <button class="local-deck-case-main" type="button" data-local-deck-id="${escapeHtml(record.id)}" title="${escapeHtml(title)}">
        ${cover}
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(`${mainCount} ${t("mainShort")} · ${extraCount} ${t("extraShort")}`)}</small>
      </button>
      <div class="local-deck-case-actions">
        <button type="button" data-local-deck-action="duplicate" data-local-deck-id="${escapeHtml(record.id)}">${escapeHtml(t("duplicateLocalDeck"))}</button>
        <button type="button" data-local-deck-action="delete" data-local-deck-id="${escapeHtml(record.id)}">${escapeHtml(t("deleteLocalDeckCase"))}</button>
      </div>
    </article>
  `;
}

function localDeckCoverCards(record) {
  const ids = [
    ...(record.extra || []).map((row) => row.id),
    ...(record.main || []).map((row) => row.id),
  ];
  return ids
    .map((id) => state.cardByAnyId.get(Number(id)))
    .filter(Boolean)
    .slice(0, 3);
}

function setLocalBrowserTab(tab) {
  state.activeLocalBrowserTab = ["cards", "bookmarks", "history"].includes(tab) ? tab : "cards";
  renderLocalBrowserTabs();
}

function renderLocalBrowserTabs() {
  els.localBrowserTabs?.querySelectorAll("[data-local-browser-tab]").forEach((button) => {
    const active = button.dataset.localBrowserTab === state.activeLocalBrowserTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelectorAll("[data-local-browser-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.localBrowserPanel !== state.activeLocalBrowserTab);
  });
}

function renderLocalDeckLibrary() {
  if (!els.localDeckList) return;
  const query = compactNormalize(els.localDeckSearch?.value || "");
  const records = state.savedDecks
    .filter((record) => record.format === state.activeFormat)
    .filter((record) => !query || localDeckSearchText(record).includes(query))
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));

  if (!records.length) {
    els.localDeckList.innerHTML = `
      <div class="local-deck-empty">
        <strong>${escapeHtml(t("localDeckEmptyTitle"))}</strong>
        <span>${escapeHtml(t("localDeckEmptyBody"))}</span>
      </div>
    `;
    return;
  }

  els.localDeckList.innerHTML = records.map((record) => {
    const mainCount = countLocalRows(record.main);
    const extraCount = countLocalRows(record.extra);
    const title = record.name || t("localDeckUntitled");
    const cardLine = localDeckCardNames(record).slice(0, 4).join(" / ");
    return `
      <button class="local-deck-item${record.id === state.activeLocalDeckId ? " active" : ""}" type="button" data-local-deck-id="${escapeHtml(record.id)}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml([activeFormatName(record.format), `${mainCount} ${t("mainShort")}`, `${extraCount} ${t("extraShort")}`].join(" · "))}</span>
        <small>${escapeHtml(cardLine || formatDateTime(record.updatedAt))}</small>
      </button>
    `;
  }).join("");
}

function localDeckSearchText(record) {
  return compactNormalize(`${record.name || ""} ${localDeckCardNames(record).join(" ")}`);
}

function localDeckCardNames(record) {
  const names = [];
  for (const row of [...(record.main || []), ...(record.extra || [])]) {
    const card = cardByLocalId(row.id);
    if (card) names.push(localizedCard(card).name, card.name);
  }
  return names.filter(Boolean);
}

function renderLocalDeckEditor() {

  const draft = state.localDeckDraft || emptyLocalDeckDraft();
  if (els.localDeckName) els.localDeckName.value = draft.name || "";
  const mainRows = hydrateLocalRows(draft.main, reason(draft.sourceType === "custom" ? "localDeckCustom" : "localDeckFavorite"));
  const extraRows = hydrateLocalRows(draft.extra, reason(draft.sourceType === "custom" ? "localDeckCustom" : "localDeckFavorite"));
  ensureLocalSelection(mainRows, extraRows);
  const mainCount = countCards(mainRows);
  const extraCount = countCards(extraRows);
  const issues = localDeckLegalityIssues(mainRows, extraRows);
  if (els.localMainCount) els.localMainCount.textContent = mainCount;
  if (els.localExtraCount) els.localExtraCount.textContent = extraCount;
  if (els.localLegalityStatus) {
    els.localLegalityStatus.textContent = issues.length ? format(t("localLegalIssue"), { count: issues.length }) : t("localLegalOk");
    els.localLegalityStatus.classList.toggle("is-warning", Boolean(issues.length));
  }
  renderLocalRows(els.localMainDeck, mainRows, "main");
  renderLocalRows(els.localExtraDeck, extraRows, "extra");
  renderLocalCardInspector();
}

function ensureLocalSelection(mainRows = [], extraRows = []) {
  const selected = cardByLocalId(state.localSelectedCardId);
  if (selected) return;
  const first = mainRows[0]?.card || extraRows[0]?.card || null;
  state.localSelectedCardId = first ? Number(first.id) : null;
}

function localDraftCards(draft = state.localDeckDraft) {
  return [...(draft?.main || []), ...(draft?.extra || [])]
    .map((row) => cardByLocalId(row.id))
    .filter(Boolean);
}

function hydrateLocalRows(rows = [], reasonValue = reason("localDeckCustom")) {
  return (rows || [])
    .map((row) => {
      const card = cardByLocalId(row.id);
      return card ? { card, qty: Math.max(1, Number(row.qty || 1)), reason: reasonValue } : null;
    })
    .filter(Boolean);
}

function renderLocalRows(container, rows, section) {
  if (!container) return;
  const total = countCards(rows);
  const columns = section === "extra" ? 10 : (total > 40 ? 12 : 10);
  const rowsNeeded = section === "extra" ? 2 : (total > 40 ? 5 : 4);
  container.style.setProperty("--local-deck-columns", columns);
  container.style.setProperty("--local-deck-rows", rowsNeeded);
  container.classList.toggle("is-main-compact", section === "main" && total > 40);
  container.classList.toggle("is-main-roomy", section === "main" && total <= 40);
  if (!rows.length) {
    container.innerHTML = `<div class="local-card-slot-empty">${escapeHtml(t("localDeckBoardEmpty"))}</div>`;
    return;
  }
  const expanded = rows.flatMap((item) => (
    Array.from({ length: Number(item.qty || 1) }, (_, index) => ({ ...item, copyIndex: index + 1 }))
  ));
  container.innerHTML = expanded.map((item) => {
    const localized = localizedCard(item.card);
    const selected = Number(item.card.id) === Number(state.localSelectedCardId);
    return `
      <button class="local-card-tile${selected ? " selected" : ""}" type="button" title="${escapeHtml(localized.name)}" draggable="true" data-local-section="${escapeHtml(section)}" data-local-card-id="${escapeHtml(item.card.id)}" data-local-copy-index="${escapeHtml(item.copyIndex)}">
        <img src="${cardImage(item.card, true)}" alt="${escapeHtml(localized.name)}" loading="lazy" />
        ${localLimitBadgeHtml(item.card)}
        <span class="sr-only">${escapeHtml(localized.name)}</span>
      </button>
    `;
  }).join("");
}

function renderLocalCardInspector() {
  if (!els.localCardInspector) return;
  const card = localSelectedCard();
  if (!card) {
    els.localCardInspector.innerHTML = `
      <div class="local-inspector-empty">
        <strong>${escapeHtml(t("localCardInspectorTitle"))}</strong>
        <span>${escapeHtml(t("localCardInspectorEmpty"))}</span>
      </div>
    `;
    return;
  }
  const localized = localizedCard(card);
  const location = localDeckCardLocation(card.id);
  const qty = location?.row?.qty || 0;
  const bookmarked = state.localBookmarkedCardIds.some((id) => Number(id) === Number(card.id));
  els.localCardInspector.innerHTML = `
    <div class="local-inspector-card">
      <img src="${cardImage(card, false)}" alt="${escapeHtml(localized.name)}" loading="lazy" />
      <p>${escapeHtml(t("localCardInspectorTitle"))}</p>
      <h3>${escapeHtml(localized.name)}</h3>
      <div class="local-inspector-tags">
        <span>${escapeHtml(card.type ? localizeType(card.type) : "")}</span>
        ${card.archetype ? `<span>${escapeHtml(localizeArchetype(card.archetype))}</span>` : ""}
        ${card.attribute ? `<span>${escapeHtml(localizeAttribute(card.attribute))}</span>` : ""}
      </div>
      <strong>${escapeHtml(qty ? `x${qty}` : t("localDeckBoardEmpty"))}</strong>
      <p class="local-inspector-desc">${escapeHtml(cardEffectText(card, localized))}</p>
      ${location ? `
        <div class="local-inspector-actions">
          <button type="button" data-local-inspector-action="increase" data-local-section="${escapeHtml(location.section)}" data-local-card-id="${escapeHtml(card.id)}">+1</button>
          <button type="button" data-local-inspector-action="decrease" data-local-section="${escapeHtml(location.section)}" data-local-card-id="${escapeHtml(card.id)}">-1</button>
        </div>
      ` : ""}
      <button class="ghost-button local-bookmark-button${bookmarked ? " active" : ""}" type="button" data-local-inspector-action="bookmark" data-local-card-id="${escapeHtml(card.id)}">
        ${escapeHtml(t(bookmarked ? "localCardUnbookmark" : "localCardBookmark"))}
      </button>
    </div>
  `;
}

function localSelectedCard() {
  const selected = cardByLocalId(state.localSelectedCardId);
  if (selected) return selected;
  const firstId = state.localDeckDraft?.main?.[0]?.id || state.localDeckDraft?.extra?.[0]?.id;
  const first = cardByLocalId(firstId);
  if (first) state.localSelectedCardId = Number(first.id);
  return first || null;
}

function cardByLocalId(cardId) {
  const numericId = Number(cardId);
  if (!Number.isFinite(numericId)) return null;
  return state.cardByAnyId.get(numericId)
    || state.cardByAnyId.get(String(cardId))
    || state.allCards.find((card) => Number(card.id) === numericId)
    || null;
}

function localDeckCardLocation(cardId) {
  const target = Number(cardId);
  for (const section of ["main", "extra"]) {
    const row = (state.localDeckDraft?.[section] || []).find((item) => Number(item.id) === target);
    if (row) return { section, row };
  }
  return null;
}

function renderLocalCardPool() {
  if (!els.localCardPool) return;
  const query = els.localCardSearch?.value.trim() || "";
  const cards = localCardPoolMatches(query);
  if (els.localCardPoolCount) els.localCardPoolCount.textContent = format(t("localCardPoolCount"), { count: cards.length });
  renderLocalPoolCards(els.localCardPool, cards, "localCardPoolEmpty");
}

function renderLocalAuxiliaryPools() {
  const bookmarkedCards = localCardsFromIds(state.localBookmarkedCardIds);
  const historyCards = localCardsFromIds(state.localCardHistoryIds);
  if (els.localBookmarkCount) els.localBookmarkCount.textContent = format(t("localCardPoolCount"), { count: bookmarkedCards.length });
  if (els.localHistoryCount) els.localHistoryCount.textContent = format(t("localCardPoolCount"), { count: historyCards.length });
  renderLocalPoolCards(els.localBookmarkPool, bookmarkedCards, "localBookmarkEmpty");
  renderLocalPoolCards(els.localHistoryPool, historyCards, "localHistoryEmpty");
}

function renderLocalPoolCards(container, cards, emptyKey) {
  if (!container) return;
  if (!cards.length) {
    container.innerHTML = `<div class="local-deck-empty compact">${escapeHtml(t(emptyKey))}</div>`;
    return;
  }
  container.innerHTML = cards.map((card) => {
    const localized = localizedCard(card);
    return `
      <button class="local-pool-card" type="button" draggable="true" data-local-pool-card-id="${escapeHtml(card.id)}">
        <img src="${cardImage(card, true)}" alt="${escapeHtml(localized.name)}" loading="lazy" />
        <span>${escapeHtml(localized.name)}</span>
        <small>${escapeHtml(card.type ? localizeType(card.type) : "")}</small>
        ${localLimitBadgeHtml(card)}
      </button>
    `;
  }).join("");
}

function localLimitBadgeHtml(card) {
  const limit = copyLimit(card, state.activeFormat);
  if (limit >= 3) return "";
  const status = limit <= 0 ? "forbidden" : limit === 1 ? "limited" : "semi-limited";
  const label = format(t("limitCountAllowed"), { count: limit });
  return renderLimitCountBadge(status, limit, label);
}

function localCardPoolMatches(query) {
  const normalizedQuery = normalize(query);
  const compactQuery = compactNormalize(query);
  const candidates = new Map();
  const add = (card, score = 0) => {
    if (!card || isSkillOrToken(card) || !isCardInFormat(card, state.activeFormat) || copyLimit(card, state.activeFormat) <= 0) return;
    const existing = candidates.get(Number(card.id));
    if (!existing || score > existing.score) candidates.set(Number(card.id), { card, score });
  };

  if (!normalizedQuery && !compactQuery) {
    for (const deck of state.deckVariants.slice(0, 8)) {
      for (const row of [...(deck.main || []), ...(deck.extra || [])]) add(row.card, 200);
    }
    for (const record of state.savedDecks.filter((item) => item.format === state.activeFormat).slice(0, 12)) {
      for (const row of [...record.main, ...record.extra]) add(state.cardByAnyId.get(Number(row.id)), 160);
    }
    for (const sample of localDeckSamplesForFormat(state.activeFormat).slice(0, 18)) {
      for (const id of [...(sample.mainIds || []), ...(sample.extraIds || [])]) add(state.cardByAnyId.get(Number(id)), 120);
    }
  } else {
    for (const entry of state.searchIndex) {
      let score = 0;
      if (entry.text === normalizedQuery || entry.compact === compactQuery) score += 1000;
      if (entry.text.startsWith(normalizedQuery) || entry.compact.startsWith(compactQuery)) score += 420;
      if (entry.text.includes(normalizedQuery) || entry.compact.includes(compactQuery)) score += 260;
      score += sharedTokenScore(entry.text, normalizedQuery);
      if (score > 0) add(entry.card, score + entry.weight);
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || localizedCard(a.card).name.localeCompare(localizedCard(b.card).name))
    .slice(0, 80)
    .map((item) => item.card);
}

function countLocalRows(rows = []) {
  return (rows || []).reduce((sum, row) => sum + Number(row.qty || 0), 0);
}

function localDeckLegalityIssues(mainRows, extraRows) {
  const issues = [];
  const mainCount = countCards(mainRows);
  const extraCount = countCards(extraRows);
  if (mainCount > 60 || (mainCount > 0 && mainCount < 40)) issues.push("main-size");
  if (extraCount > 15) issues.push("extra-size");
  for (const item of [...mainRows, ...extraRows]) {
    if (item.qty > copyLimit(item.card, state.activeFormat)) issues.push(`copy-${item.card.id}`);
  }
  return issues;
}

function selectLocalDeck(id) {
  const record = state.savedDecks.find((deck) => deck.id === id);
  if (!record) return;
  state.activeLocalDeckId = record.id;
  state.localDeckDraft = cloneLocalDeckRecord(record);
  state.localSelectedCardId = record.main?.[0]?.id || record.extra?.[0]?.id || null;
  state.activeLocalDeckView = "editor";
  state.activeLocalBrowserTab = "cards";
  renderLocalDecksPage();
}

function createNewLocalDeck() {
  state.activeLocalDeckId = "";
  state.localDeckDraft = emptyLocalDeckDraft();
  state.localSelectedCardId = null;
  state.activeLocalDeckView = "editor";
  state.activeLocalBrowserTab = "cards";
  renderLocalDecksPage();
}

async function saveLocalDeckDraft() {
  await loadAllCards();
  syncLocalDeckDraftName();
  const draft = cloneLocalDeckRecord(state.localDeckDraft || emptyLocalDeckDraft());
  const now = new Date().toISOString();
  draft.id ||= createLocalDeckId();
  draft.name = compactSpaces(els.localDeckName?.value || draft.name || "") || t("localDeckUntitled");
  draft.format = state.activeFormat;
  draft.schemaVersion = LOCAL_DECK_SCHEMA_VERSION;
  draft.updatedAt = now;
  draft.createdAt ||= now;
  const existingIndex = state.savedDecks.findIndex((deck) => deck.id === draft.id);
  if (existingIndex >= 0) state.savedDecks.splice(existingIndex, 1, draft);
  else state.savedDecks.unshift(draft);
  state.activeLocalDeckId = draft.id;
  state.localDeckDraft = cloneLocalDeckRecord(draft);
  saveSavedDeckRecords();
  renderLocalDeckGrid();
  renderLocalDecksPage();
  showToast(t("localDeckSaved"));
}

function deleteLocalDeck() {
  const id = state.activeLocalDeckId;
  if (!id) {
    createNewLocalDeck();
    return;
  }
  state.savedDecks = state.savedDecks.filter((deck) => deck.id !== id);
  saveSavedDeckRecords();
  state.activeLocalDeckId = "";
  state.localDeckDraft = emptyLocalDeckDraft();
  state.localSelectedCardId = null;
  state.activeLocalDeckView = "library";
  renderLocalDecksPage();
  showToast(t("localDeckDeleted"));
}

function deleteLocalDeckById(id) {
  const record = state.savedDecks.find((deck) => deck.id === id);
  if (!record) return;
  const title = record.name || t("localDeckUntitled");
  if (!window.confirm(format(t("confirmDeleteLocalDeck"), { name: title }))) return;
  state.savedDecks = state.savedDecks.filter((deck) => deck.id !== id);
  if (state.activeLocalDeckId === id) {
    state.activeLocalDeckId = "";
    state.localDeckDraft = emptyLocalDeckDraft();
    state.localSelectedCardId = null;
  }
  saveSavedDeckRecords();
  renderLocalDecksPage();
  showToast(t("localDeckDeleted"));
}

function duplicateLocalDeck(id) {
  const record = state.savedDecks.find((deck) => deck.id === id);
  if (!record) return;
  const now = new Date().toISOString();
  const clone = cloneLocalDeckRecord(record);
  clone.id = createLocalDeckId();
  clone.name = format(t("localDeckCopySuffix"), { name: record.name || t("localDeckUntitled") });
  clone.createdAt = now;
  clone.updatedAt = now;
  state.savedDecks = [clone, ...state.savedDecks];
  state.activeLocalDeckId = clone.id;
  state.localDeckDraft = cloneLocalDeckRecord(clone);
  saveSavedDeckRecords();
  renderLocalDecksPage();
  showToast(t("localDeckDuplicated"));
}

function importLocalDeckPrompt() {
  resetRecipeImportPreview();
  document.querySelector("#recipeImportPanel").classList.remove("hidden");
  document.querySelector("#recipeImportText").focus();
}

function saveImportedRecipe() {
  if (!recipeImportPreview || recipeImportPreview.format !== state.activeFormat) return;
  const imported = recipeImportPreview;
  const now = new Date().toISOString();
  const record = {
    schemaVersion: LOCAL_DECK_SCHEMA_VERSION,
    id: createLocalDeckId(),
    name: compactSpaces(document.querySelector("#recipeImportName").value) || t("localDeckImportedName"),
    format: imported.format,
    sourceType: "custom",
    sourceTitle: "import",
    main: imported.main,
    extra: imported.extra,
    createdAt: now,
    updatedAt: now,
  };
  state.savedDecks = [record, ...state.savedDecks];
  state.activeLocalDeckId = record.id;
  state.localDeckDraft = cloneLocalDeckRecord(record);
  state.localSelectedCardId = record.main[0]?.id || record.extra[0]?.id || null;
  state.activeLocalDeckView = "editor";
  saveSavedDeckRecords();
  document.querySelector("#recipeImportPanel").classList.add("hidden");
  resetRecipeImportPreview();
  renderLocalDecksPage();
  showToast(t("localDeckImported"));
}

function findImportCard(text) {
  const needle = compactNormalize(text);
  const candidates = new Map();
  for (const entry of state.searchIndex || []) {
    if (entry.compact === needle) candidates.set(entry.card.id, entry.card);
  }
  for (const card of state.allCards) {
    if (compactNormalize(card.name) === needle || compactNormalize(localizedCard(card).name) === needle) candidates.set(card.id, card);
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

function parseLocalDeckImportLine(line) {
  let text = compactSpaces(line.replace(/\s*(?:\/\/|#).+$/, ""));
  if (!text) return null;
  let qty = 1;
  let match = text.match(/^(\d{1,2})\s+(.+)$/);
  if (match && !/^\d+$/.test(text)) {
    qty = Number(match[1]);
    text = match[2].trim();
  }
  match = text.match(/^(.+?)\s*(?:x|×)\s*(\d{1,2})$/i);
  if (match) {
    text = match[1].trim();
    qty = Number(match[2]);
  }
  const card = /^\d+$/.test(text) ? cardByLocalId(Number(text)) : findImportCard(text);
  return card && Number.isInteger(qty) && qty > 0 && qty <= 300 ? { card, qty } : null;
}

async function addCardToLocalDraft(cardOverride = null, targetSection = null) {
  await loadAllCards();
  const query = els.localCardSearch?.value.trim() || "";
  if (!cardOverride && !query) {
    setLocalCardHint(t("localDeckAddNotFound"), true);
    return;
  }
  const card = cardOverride || findBestCard(query);
  if (!card) {
    setLocalCardHint(t("localDeckAddNotFound"), true);
    return;
  }
  if (!isCardInFormat(card, state.activeFormat) || copyLimit(card, state.activeFormat) === 0) {
    setLocalCardHint(format(t("formatForbidden"), { format: activeFormatName() }), true);
    return;
  }
  const section = isExtraDeck(card) ? "extra" : "main";
  if (targetSection && targetSection !== section) {
    setLocalCardHint(t(section === "extra" ? "localDropExtraOnly" : "localDropMainOnly"), true);
    return;
  }
  const rows = state.localDeckDraft?.[section] || [];
  const maxTotal = section === "extra" ? 15 : 60;
  if (countLocalRows(rows) >= maxTotal && !rows.some((row) => Number(row.id) === Number(card.id))) {
    setLocalCardHint(t(section === "extra" ? "localDeckExtraLimit" : "localDeckMainLimit"), true);
    return;
  }
  state.localSelectedCardId = Number(card.id);
  recordLocalCardHistory(card.id);
  adjustLocalCardQty(section, card.id, 1);
  renderLocalCardInspector();
  refreshLocalCardLocale(card.id, card);
  if (els.localCardSearch) els.localCardSearch.value = "";
  setLocalCardHint(t("localCardHint"), false);
}

function adjustLocalCardQty(section, cardId, delta) {
  const draft = state.localDeckDraft ||= emptyLocalDeckDraft();
  syncLocalDeckDraftName();
  const rows = draft[section] ||= [];
  const card = cardByLocalId(cardId);
  if (!card) return;
  const current = rows.find((row) => Number(row.id) === Number(card.id));
  if (!current && delta <= 0) return;
  if (!current) {
    const maxTotal = section === "extra" ? 15 : 60;
    if (countLocalRows(rows) >= maxTotal) {
      setLocalCardHint(t(section === "extra" ? "localDeckExtraLimit" : "localDeckMainLimit"), true);
      return;
    }
    rows.push({ id: Number(card.id), qty: 1 });
  } else {
    const limit = copyLimit(card, state.activeFormat);
    current.qty = Math.max(0, Math.min(limit, Number(current.qty || 0) + delta));
    if (current.qty <= 0) rows.splice(rows.indexOf(current), 1);
  }
  draft.updatedAt = new Date().toISOString();
  renderLocalDeckEditor();
  renderLocalDeckGrid();
}

function removeLocalCard(section, cardId) {
  syncLocalDeckDraftName();
  const rows = state.localDeckDraft?.[section] || [];
  state.localDeckDraft[section] = rows.filter((row) => Number(row.id) !== Number(cardId));
  state.localDeckDraft.updatedAt = new Date().toISOString();
  if (Number(state.localSelectedCardId) === Number(cardId)) state.localSelectedCardId = null;
  renderLocalDeckEditor();
  renderLocalDeckGrid();
}

function syncLocalDeckDraftName() {
  if (!state.localDeckDraft || !els.localDeckName) return;
  const value = compactSpaces(els.localDeckName.value || "");
  if (value) state.localDeckDraft.name = value;
}

function setLocalCardHint(message, isError = false) {
  if (!els.localCardHint) return;
  els.localCardHint.textContent = message;
  els.localCardHint.classList.toggle("error", isError);
}

function localDeckObjectFromRecord(record) {
  const main = hydrateLocalRows(record.main, reason(record.sourceType === "custom" ? "localDeckCustom" : "localDeckFavorite"));
  const extra = hydrateLocalRows(record.extra, reason(record.sourceType === "custom" ? "localDeckCustom" : "localDeckFavorite"));
  const seed = main[0]?.card || extra[0]?.card || null;
  if (!seed) return null;
  const archetype = seed.archetype || inferNameFamily(seed.name);
  const deck = {
    seed,
    style: "local",
    format: record.format || state.activeFormat,
    archetype,
    variantId: record.id || "local-draft",
    variantKind: "local",
    localName: record.name || t("localDeckUntitled"),
    variantTitle: record.name || t("localDeckUntitled"),
    main,
    extra,
    score: main.length || extra.length ? estimateScore(main, extra, seed, archetype) : 0,
    sampleContext: { samples: [], mainPicks: [], extraPicks: [] },
    handSimulation: null,
    localRecord: record,
  };
  deck.handSimulation = main.length ? simulateOpeningHands(deck) : null;
  return deck;
}

async function openLocalDeckAsBuild() {
  await loadAllCards();
  const draft = cloneLocalDeckRecord(state.localDeckDraft || emptyLocalDeckDraft());
  draft.name = compactSpaces(els.localDeckName?.value || draft.name || "") || t("localDeckUntitled");
  draft.format = state.activeFormat;
  const deck = localDeckObjectFromRecord(draft);
  if (!deck) {
    showToast(t("noCards"));
    return;
  }
  state.deckVariants = [deck];
  state.activeVariantId = deck.variantId;
  state.lastDeck = deck;
  state.currentSeed = deck.seed;
  state.selectedDetail = { cardId: deck.seed.id, section: "seed" };
  setActivePage("builder");
  await ensureLocaleDataForDecks([deck]);
  renderDeck(deck);
  renderFocusCard(deck.seed, reason("reasonSeed"));
  showToast(t("localDeckOpened"));
}

function localAutoBuildSeed() {
  const selected = state.cardByAnyId.get(Number(state.localSelectedCardId));
  if (selected && isCardInFormat(selected, state.activeFormat) && copyLimit(selected, state.activeFormat) > 0) return selected;
  const query = els.localCardSearch?.value.trim() || "";
  const searched = query ? findBestCard(query) : null;
  if (searched && isCardInFormat(searched, state.activeFormat) && copyLimit(searched, state.activeFormat) > 0) return searched;
  return localDraftCards()[0] || null;
}

async function autoBuildLocalDeck() {
  await loadAllCards();
  await loadLimitRegulation(state.activeFormat).catch(() => null);
  const seed = localAutoBuildSeed();
  if (!seed) {
    setLocalCardHint(t("localDeckAutoNeedSeed"), true);
    return;
  }
  setLocalCardHint(t("localDeckAutoBuilding"), false);
  await ensureLocaleDataForCards([seed]);
  const publicDecks = await searchPublicDecksForSeed(seed);
  const deck = (await buildConfiguredDeckChoices(seed, "ai", publicDecks))[0];
  if (!deck) {
    setLocalCardHint(t("localDeckAddNotFound"), true);
    return;
  }

  syncLocalDeckDraftName();
  const draft = state.localDeckDraft ||= emptyLocalDeckDraft();
  const existingName = compactSpaces(els.localDeckName?.value || draft.name || "");
  draft.name = existingName || `${localizedCard(seed).name} ${t("aiDeckDesc")}`;
  draft.format = state.activeFormat;
  draft.sourceType = "ai";
  draft.sourceTitle = deckTitleText(deck);
  draft.main = serializeDeckRows(deck.main);
  draft.extra = serializeDeckRows(deck.extra);
  draft.updatedAt = new Date().toISOString();
  state.localSelectedCardId = Number(seed.id);
  await ensureLocaleDataForDecks([deck]);
  if (els.localCardSearch) els.localCardSearch.value = "";
  setLocalCardHint(t("localCardHint"), false);
  renderLocalDeckEditor();
  renderLocalDeckGrid();
  renderLocalCardPool();
  renderLocalAuxiliaryPools();
  showToast(t("localDeckAutoBuilt"));
}

function clearLocalDeckDraft() {
  const draft = state.localDeckDraft ||= emptyLocalDeckDraft();
  syncLocalDeckDraftName();
  draft.main = [];
  draft.extra = [];
  draft.sourceType = "custom";
  draft.sourceTitle = "";
  draft.updatedAt = new Date().toISOString();
  state.localSelectedCardId = null;
  setLocalCardHint(t("localCardHint"), false);
  renderLocalDeckEditor();
  renderLocalDeckGrid();
  showToast(t("localDeckCleared"));
}

async function copyLocalDeckSection(section) {
  await loadAllCards();
  const rows = hydrateLocalRows(state.localDeckDraft?.[section] || [], reason("localDeckCustom"));
  const text = rows.map((item) => `${item.qty} ${localizedCard(item.card).name}`).join("\n");
  await navigator.clipboard.writeText(text);
  showToast(format(t("localDeckCopyDone"), { section: t(section === "main" ? "mainDeck" : "extraDeck") }));
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
      const desc = deck.variantKind === "public" ? publicDeckSubtitle(deck) : deck.modelGeneration?.strategy || t(deck.variantDescKey || `variant${capitalize(deck.style)}Desc`);
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
  if (deck.variantKind === "local") return deck.localName || t("localDeckUntitled");
  if (deck.modelGeneration) return `${t("aiModelProfile")} · ${deck.modelGeneration.model}${deck.variantTitle ? ` · ${deck.variantTitle}` : ""}`;
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
  if (state.lastDeck?.modelGeneration) {
    const generated = state.lastDeck.modelGeneration;
    els.sampleEvidence.replaceChildren();
    for (const text of [format(t("aiModelEvidence"), { model: generated.model }), generated.strategy, ...generated.warnings]) {
      if (!text) continue;
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      els.sampleEvidence.append(paragraph);
    }
    return;
  }

  if (state.lastDeck?.variantKind === "local") {
    els.sampleEvidence.textContent = t("localDeckOpened");
    return;
  }

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
  if (deck.modelGeneration) return format(t("aiModelEvidence"), { model: deck.modelGeneration.model });
  if (deck.variantKind === "local") {
    return `${t("localDeckCustom")} · ${activeFormatName(deck.format || state.activeFormat)}`;
  }
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

function downloadBuildRecipe() {
  const recipe = state.lastDeck ? deckRecipe(state.lastDeck) : null;
  if (!recipe || !recipe.main.length && !recipe.extra.length) { showToast(t("noCards")); return; }
  const name = deckTitleText(state.lastDeck);
  const filename = (name || "deck").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80).replace(/[. ]+$/, "") || "deck";
  const url = URL.createObjectURL(new Blob([YGODeckTransfer.toYdk(recipe)], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.ydk`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetRecipeImportPreview() {
  recipeImportRevision += 1;
  recipeImportPreview = null;
  document.querySelector("#confirmRecipeImport").disabled = true;
  document.querySelector("#recipeImportResult").textContent = "";
}

function readRecipeImport(raw) {
  if (raw.length > 30000) throw new Error("recipeTooLarge");
  let recipe;
  if (/^ydke:\/\//i.test(raw.trim())) recipe = YGODeckTransfer.decodeYdke(raw);
  else if (/^#\s*(main|extra)\s*$/im.test(raw)) recipe = YGODeckTransfer.parseYdk(raw);
  else {
    recipe = { main: [], extra: [], side: [] };
    const unknown = [];
    for (const line of raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
      if (/^#|^\/\//.test(line) || /^(?:主卡组|额外卡组|メインデッキ|エクストラデッキ|Main Deck|Extra Deck)\s*\(\d+\)$/i.test(line)) continue;
      const parsed = parseLocalDeckImportLine(line);
      if (!parsed) { unknown.push(line); continue; }
      const section = isExtraDeck(parsed.card) ? "extra" : "main";
      recipe[section].push(...Array.from({ length: parsed.qty }, () => parsed.card.id));
      if (recipe[section].length > 300) throw new Error("invalidRecipe");
    }
    if (unknown.length) return { unknown };
  }
  const imported = { main: [], extra: [], sideCount: recipe.side.length, unknown: [] };
  for (const section of ["main", "extra"]) {
    for (const id of recipe[section]) {
      const card = cardByLocalId(id);
      if (!card) { imported.unknown.push(String(id)); continue; }
      const row = imported[section].find(row => row.id === Number(card.id));
      if (row) row.qty += 1;
      else imported[section].push({ id: Number(card.id), qty: 1 });
    }
  }
  return imported;
}

async function previewRecipeImport() {
  resetRecipeImportPreview();
  const revision = recipeImportRevision;
  const result = document.querySelector("#recipeImportResult");
  result.textContent = t("recipeLoading");
  try {
    await loadAllCards();
    if (revision !== recipeImportRevision) return;
    const imported = readRecipeImport(document.querySelector("#recipeImportText").value);
    if (imported.unknown?.length) {
      result.textContent = format(t("recipeUnknown"), { cards: [...new Set(imported.unknown)].join(" / ") });
      return;
    }
    if (!imported.main.length && !imported.extra.length) throw new Error("invalidRecipe");
    recipeImportPreview = { ...imported, format: state.activeFormat };
    const counts = format(t("recipePreviewCounts"), { format: activeFormatName(), main: countLocalRows(imported.main), extra: countLocalRows(imported.extra) });
    const side = imported.sideCount ? `<p class="recipe-warning">${escapeHtml(format(t("recipeSide"), { count: imported.sideCount }))}</p>` : "";
    const cards = ["main", "extra"].map(section => `<p><strong>${escapeHtml(t(section === "main" ? "mainDeck" : "extraDeck"))}</strong></p><ul class="recipe-card-preview">${imported[section].map(row => `<li>${escapeHtml(localizedCard(cardByLocalId(row.id)).name)} × ${row.qty}</li>`).join("")}</ul>`).join("");
    result.innerHTML = `<p>${escapeHtml(counts)}</p>${side}<p>${escapeHtml(t("recipeEditHint"))}</p>${cards}`;
    document.querySelector("#confirmRecipeImport").disabled = false;
  } catch (error) {
    if (revision === recipeImportRevision) result.textContent = t(error.message === "recipeTooLarge" ? "recipeTooLarge" : "recipeInvalid");
  }
}

function setupRecipeImportExport() {
  document.querySelector("#downloadDeckYdk").addEventListener("click", downloadBuildRecipe);
  document.querySelector("#recipeImportText").addEventListener("input", resetRecipeImportPreview);
  document.querySelector("#previewRecipeImport").addEventListener("click", previewRecipeImport);
  document.querySelector("#confirmRecipeImport").addEventListener("click", saveImportedRecipe);
  document.querySelector("#cancelRecipeImport").addEventListener("click", () => {
    resetRecipeImportPreview();
    document.querySelector("#recipeImportPanel").classList.add("hidden");
    els.importLocalDeck.focus();
  });
  document.querySelector("#recipeImportFile").addEventListener("change", async event => {
    resetRecipeImportPreview();
    const revision = recipeImportRevision;
    const file = event.target.files?.[0];
    if (!file) return;
    document.querySelector("#recipeImportText").value = "";
    if (file.size > 30000) { document.querySelector("#recipeImportResult").textContent = t("recipeTooLarge"); return; }
    try {
      const raw = await file.text();
      if (revision !== recipeImportRevision) return;
      document.querySelector("#recipeImportText").value = raw;
      document.querySelector("#recipeImportName").value = file.name.replace(/\.(ydk|txt)$/i, "");
      await previewRecipeImport();
    } catch { if (revision === recipeImportRevision) document.querySelector("#recipeImportResult").textContent = t("recipeInvalid"); }
  });
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

function deckRecipe(deck) {
  const ids = (items) => items.flatMap(item => Array.from({ length: item.qty }, () => Number(item.card.id)));
  return { main: ids(deck.main), extra: ids(deck.extra), side: [] };
}

function deckYdkText(deck) {
  return YGODeckTransfer.toYdk(deckRecipe(deck));
}

function deckYdkeText(deck) {
  return YGODeckTransfer.encodeYdke(deckRecipe(deck));
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
  score += mainTotal >= 40 && mainTotal <= 60 ? 8 : -8;
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

function targetAiMainDeckSize(sampleContext = null) {
  const totals = (sampleContext?.samples || [])
    .map(({ sample }) => countResolvedDeckIds(sample?.mainIds || []))
    .filter((total) => total >= 40 && total <= 60)
    .sort((a, b) => a - b);
  if (!totals.length) return 40;
  const middle = Math.floor(totals.length / 2);
  return totals.length % 2 ? totals[middle] : Math.round((totals[middle - 1] + totals[middle]) / 2);
}

function countResolvedDeckIds(ids = []) {
  return ids.reduce((sum, rawId) => {
    const card = state.cardByAnyId.get(Number(rawId));
    if (!card || isBanned(card) || isSkillOrToken(card) || !isCardInFormat(card)) return sum;
    return sum + 1;
  }, 0);
}

function targetMainEngineSize(style, profile = null, mainTarget = 40) {
  const extraSlots = Math.max(0, mainTarget - 40);
  if (profile?.engineSize) return Math.min(mainTarget, profile.engineSize + Math.round(extraSlots * 0.6));
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

function activeFormatName(targetFormat = state.activeFormat) {
  const key = VALID_FORMATS.has(targetFormat) ? targetFormat : state.activeFormat;
  return t(`formatName${capitalize(key)}`);
}

function activeFormatShortName() {
  return state.activeFormat === "md" ? "MD" : activeFormatName();
}

function isExtraDeck(card) {
  const type = card.type || "";
  return /\b(Fusion|Synchro|XYZ|Xyz|Link)\b/.test(type) && type.includes("Monster");
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

function hasExactNormalizedTerm(text, term) {
  const expected = normalize(term).split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
  if (!expected.length) return false;
  const words = new Set(normalize(text).split(/[^\p{L}\p{N}]+/gu).filter(Boolean));
  return expected.every((token) => words.has(token));
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
  if (!id) return fallbackUrl;
  const language = state.language === "zh" || state.language === "ja" ? state.language : "en";
  if (CAN_USE_LOCAL_IMAGE_API) {
    return `/api/card-image?id=${encodeURIComponent(id)}&size=${encodeURIComponent(size || "small")}&lang=${language}`;
  }
  if (language !== "en" && size !== "cropped") {
    const folder = language === "zh" ? "sc" : "jp";
    return `https://cdn.233.momobako.com/ygoimg/${folder}/${id}.webp${size === "full" ? "" : "!half"}`;
  }
  return fallbackUrl;
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
    const initialSrc = image.getAttribute("src");
    const loader = new Image();
    loader.onload = () => {
      if (image.isConnected && image.getAttribute("src") === initialSrc && image.dataset.fullSrc === fullSrc) image.src = fullSrc;
    };
    loader.src = fullSrc;
  }
}

async function bootstrapResourceCacheGate() {
  if (!CAN_USE_LOCAL_API || !els.resourceGate) return;

  try {
    const initialStatus = await fetchResourceCacheStatus().catch(() => null);
    if (initialStatus?.smallReady) {
      hideResourceGate();
      return;
    }

    els.resourceGate.classList.remove("hidden");
    els.resourceContinueButton?.classList.add("hidden");
    els.resourceContinueButton?.addEventListener("click", hideResourceGate, { once: true });

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
  const official = status?.official || {};
  const small = status?.small || {};
  const full = status?.full || {};
  const smallPercent = combinedProgressPercent([official, small]);
  const fullPercent = progressPercent(full);
  setProgress(els.resourceSmallBar, els.resourceSmallPercent, smallPercent);
  setProgress(els.resourceFullBar, els.resourceFullPercent, fullPercent);
  if (els.resourceSmallDetail) {
    const parts = [];
    if (official.total) parts.push(`${t("resourceOfficial")} ${resourcePhaseDetail(official)}`);
    if (small.total) parts.push(`${t("resourceSmallImages")} ${resourcePhaseDetail(small)}`);
    els.resourceSmallDetail.textContent = parts.length ? parts.join(" · ") : resourcePhaseDetail(small);
  }
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

function combinedProgressPercent(phases) {
  const totals = (phases || []).reduce((sum, phase) => sum + Number(phase?.total || 0), 0);
  if (!totals) return 0;
  const completed = (phases || []).reduce((sum, phase) => sum + Number(phase?.completed || 0), 0);
  return Math.min(100, Math.round((completed / totals) * 100));
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

function trendRepresentativeCardId(name) {
  const card = findTrendRepresentativeCard(name);
  return Number(card?.id || TREND_REPRESENTATIVE_CARD_IDS[name] || 0);
}

function officialLocaleCandidateCardsForTrend(name, limit = 8) {
  const normalizedName = normalize(name);
  const candidates = [];
  const add = (card) => {
    if (!card?.id || candidates.some((item) => Number(item.id) === Number(card.id))) return;
    candidates.push(card);
  };

  add(findTrendRepresentativeCard(name));
  for (const card of state.allCards || []) {
    if (candidates.length >= limit) break;
    const cardArchetype = normalize(card.archetype || "");
    const cardName = normalize(card.name || "");
    if (cardArchetype === normalizedName || cardName.includes(normalizedName)) add(card);
  }

  return candidates.slice(0, limit);
}

function collectOfficialTrendLocaleCards(context = {}) {
  const cards = [];
  const addTrendName = (name) => {
    for (const card of officialLocaleCandidateCardsForTrend(name)) cards.push(card);
  };

  for (const item of context.trendItems || []) addTrendName(item.name);
  for (const group of context.powerRankings?.groups || []) {
    for (const item of group.items || []) {
      addTrendName(String(item.name || item.label || "").replace(/\s+Engine$/i, ""));
    }
  }

  const seen = new Set();
  return cards.filter((card) => {
    const id = Number(card?.id || 0);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function ensureTrendLocaleData(context = {}) {
  if (!CAN_USE_LOCAL_API || state.activeFormat === "md") return;
  const locale = konamiLocaleForLanguage();
  if (!locale) return;
  if (!state.allCards.length) await loadAllCards();

  const cards = collectOfficialTrendLocaleCards(context);
  const missingCards = cards.filter((card) => !state.localeIds.has(localeCacheKey(card.id)));
  if (!missingCards.length) return;

  const ids = missingCards.map((card) => Number(card.id)).filter(Boolean).slice(0, IMAGE_PRELOAD_BATCH_SIZE);
  const key = `${state.activeFormat}:${locale}:${ids.join(",")}`;
  if (!ids.length || state.trendLocalePrefetchKeys.has(key)) return;
  state.trendLocalePrefetchKeys.add(key);

  try {
    const before = JSON.stringify(state.inferredArchetypeLocales || {});
    await ensureOfficialLocaleDataForCards(missingCards);
    const after = JSON.stringify(state.inferredArchetypeLocales || {});
    if (before !== after) renderTrendPanel();
  } catch (error) {
    state.trendLocalePrefetchKeys.delete(key);
    throw error;
  }
}

function scheduleVisibleImagePreload(context = {}) {
  if (!CAN_USE_LOCAL_API) return;

  const smallIds = new Set();
  const croppedIds = new Set();
  const officialLocaleIds = new Set();

  for (const item of context.trendItems || []) {
    const id = trendRepresentativeImageId(item.name);
    if (id) {
      smallIds.add(id);
      croppedIds.add(id);
    }
    const cardId = trendRepresentativeCardId(item.name);
    if (cardId) officialLocaleIds.add(cardId);
  }

  for (const group of context.powerRankings?.groups || []) {
    for (const item of group.items || []) {
      const name = String(item.name || item.label || "").replace(/\s+Engine$/i, "");
      const id = trendRepresentativeImageId(name);
      if (id) smallIds.add(id);
      const cardId = trendRepresentativeCardId(name);
      if (cardId) officialLocaleIds.add(cardId);
    }
  }

  for (const deck of context.decks || []) {
    for (const item of [...(deck.main || []), ...(deck.extra || [])]) {
      const id = cardImageId(item.card);
      if (id) smallIds.add(id);
      const cardId = Number(item.card?.id || 0);
      if (cardId) officialLocaleIds.add(cardId);
    }
  }

  const ids = [...smallIds].slice(0, IMAGE_PRELOAD_BATCH_SIZE);
  const cropped = [...croppedIds].slice(0, 40);
  const allIds = [...new Set([...ids, ...cropped])];
  if (!allIds.length) return;

  const sizes = cropped.length ? "small,cropped" : "small";
  const language = state.language === "zh" || state.language === "ja" ? state.language : "en";
  const key = `${language}:${sizes}:${allIds.join(",")}`;
  if (key === lastImagePreloadKey) return;
  lastImagePreloadKey = key;

  if (imagePreloadTimer) clearTimeout(imagePreloadTimer);
  const run = () => {
    fetch(`/api/preload-card-images?ids=${encodeURIComponent(allIds.join(","))}&sizes=${encodeURIComponent(sizes)}&lang=${language}`, {
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

  const locale = state.activeFormat !== "md" ? konamiLocaleForLanguage() : "";
  const officialIds = [...officialLocaleIds].slice(0, IMAGE_PRELOAD_BATCH_SIZE);
  const officialKey = `${locale}:${officialIds.join(",")}`;
  if (locale && officialIds.length && officialKey !== lastOfficialLocalePreloadKey) {
    lastOfficialLocalePreloadKey = officialKey;
    fetch(`/api/preload-official-locales?ids=${encodeURIComponent(officialIds.join(","))}&locale=${encodeURIComponent(locale)}`, {
      cache: "no-store",
    }).catch(() => {});
  }
}

function applyLanguage() {
  if (document.querySelector("#recipeImportResult")) resetRecipeImportPreview();
  document.documentElement.lang = state.language === "ja" ? "ja" : state.language === "en" ? "en" : "zh-CN";
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  els.input.placeholder = t("sampleInputPlaceholder");

  setStatus(els.status.dataset.statusKey || "idle");
  if (!state.lastDeck && els.notice.dataset.noticeKey === "initial") {
    els.notice.textContent = t("initialNotice");
    els.sampleEvidence.textContent = t("samplePanelEmpty");
    els.handDetail.textContent = t("handPanelEmpty");
  }
  if (state.latestRelease?.version && !els.updateDialog?.classList.contains("hidden")) {
    if (desktopUpdateState && desktopUpdateState.status !== "unavailable") renderDesktopUpdate(desktopUpdateState);
    else showUpdateDialog(state.latestRelease);
  }
}

function localizedCard(card) {
  const langKey = localeTextKey();
  const masterDuelLocalized = masterDuelLocalizedCard(card, langKey);
  const storedLocalized = langKey ? state.localeById.get(Number(card.id))?.[langKey] : null;
  const localized = state.activeFormat !== "md" && storedLocalized && !storedLocalized.official ? null : storedLocalized;
  const needsOfficialLocale = state.activeFormat !== "md" && state.language !== "en";
  const masterDesc = decodeEntities(masterDuelLocalized?.desc || "");
  const localizedDesc = decodeEntities(localized?.desc || "");
  const baseDesc = decodeEntities(card.desc || "");
  const isPendulum = String(card?.type || "").includes("Pendulum");
  const desc = isPendulum && hasCompletePendulumText(localizedDesc) && !hasCompletePendulumText(masterDesc)
    ? localizedDesc
    : (masterDesc || localizedDesc || baseDesc);
  return {
    name: decodeEntities(masterDuelLocalized?.name || localized?.name || card.name),
    desc,
    pendulumDesc: decodeEntities(masterDuelLocalized?.pendulumDesc || masterDuelLocalized?.pend_desc || localized?.pendulumDesc || localized?.pend_desc || card.pend_desc || ""),
    monsterDesc: decodeEntities(masterDuelLocalized?.monsterDesc || masterDuelLocalized?.monster_desc || localized?.monsterDesc || localized?.monster_desc || card.monster_desc || ""),
    missingOfficial: Boolean(needsOfficialLocale && !masterDuelLocalized && !localized?.official),
  };
}

function hasPendulumEffectMarker(text = "") {
  return /Pendulum Effect|灵摆|靈擺|ペンデュラム|Ｐスケール|Pスケール|\[ *P/i.test(text);
}

function hasMonsterEffectMarker(text = "") {
  return /Monster Effect|怪兽效果|怪獸效果|モンスター効果/i.test(text);
}

function hasCompletePendulumText(text = "") {
  return Boolean(text && hasPendulumEffectMarker(text) && hasMonsterEffectMarker(text));
}

function cardEffectText(card, localized = localizedCard(card)) {
  const desc = decodeEntities(localized?.desc || card?.desc || "");
  const isPendulum = String(card?.type || "").includes("Pendulum")
    || Boolean(localized?.pendulumDesc || localized?.monsterDesc || card?.pend_desc || card?.monster_desc);
  if (!isPendulum) return desc || t("noDesc");

  if (hasCompletePendulumText(desc)) return desc;

  const pendulumText = decodeEntities(localized?.pendulumDesc || card?.pend_desc || "");
  const monsterText = decodeEntities(localized?.monsterDesc || card?.monster_desc || desc || "");
  const parts = [];
  if (pendulumText) parts.push(`${t("pendulumEffectLabel")}\n${pendulumText}`);
  if (monsterText) parts.push(`${t("monsterEffectLabel")}\n${monsterText}`);
  return parts.join("\n\n") || desc || t("noDesc");
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
  const catalogLabel = YGOTrendSupport.labelFor(archetype, state.language, window.YGO_TREND_CATALOG);
  if (catalogLabel) return catalogLabel;
  if (state.language === "zh" && state.activeFormat === "md") {
    const mdLabel = state.masterDuelLocaleData?.archetypes?.["zh-CN"]?.[archetype];
    if (mdLabel) return mdLabel;
  }
  if (state.language === "zh") {
    const inferredLabel = state.inferredArchetypeLocales?.zh?.[archetype];
    if (inferredLabel) return inferredLabel;
  }
  if (state.language === "ja") {
    const inferredLabel = state.inferredArchetypeLocales?.ja?.[archetype];
    if (inferredLabel) return inferredLabel;
  }
  return fieldMaps[state.language]?.archetype?.[archetype] || localizeCompoundDeckName(archetype) || archetype;
}

function localizeTrendName(name) {
  const catalogLabel = YGOTrendSupport.labelFor(name, state.language, window.YGO_TREND_CATALOG);
  if (catalogLabel) return catalogLabel;
  let label = "";
  if (state.language === "zh" && state.activeFormat === "md") {
    const mdLabel = state.masterDuelLocaleData?.archetypes?.["zh-CN"]?.[name];
    if (mdLabel) label = mdLabel;
  }
  if (!label && state.language === "zh") {
    const inferredLabel = state.inferredArchetypeLocales?.zh?.[name];
    if (inferredLabel) label = inferredLabel;
  }
  if (!label && state.language === "ja") {
    const inferredLabel = state.inferredArchetypeLocales?.ja?.[name];
    if (inferredLabel) label = inferredLabel;
  }
  label = label
    || trendNameMaps[state.language]?.[name]
    || localizeCompoundDeckName(name)
    || localizeArchetype(name);
  flagUntranslatedDeckName(name, label);
  if (["zh", "ja"].includes(state.language) && YGOTrendSupport.hasUntranslatedText(label)) {
    return state.language === "ja" ? "名称の翻訳準備中" : "译名待收录";
  }
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
  if (state.language === "zh") maps.push(state.inferredArchetypeLocales?.zh || {});
  if (state.language === "ja") maps.push(state.inferredArchetypeLocales?.ja || {});
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

async function checkForUpdates({ silent = false } = {}) {
  if (!silent) showToast(t("updateChecking"));
  try {
    if (window.desktopUpdates && desktopUpdateState?.status !== "unavailable") {
      const snapshot = await window.desktopUpdates.check();
      renderDesktopUpdate(snapshot, { manual: !silent });
      if (snapshot.status !== "unavailable") return snapshot;
    }
    const release = await fetchLatestRelease();
    if (!release?.version) {
      if (!silent) showToast(t("updateNoRelease"));
      return null;
    }

    state.latestRelease = release;
    if (compareVersions(release.version, APP_VERSION) <= 0) {
      if (!silent) showToast(t("updateLatest"));
      return release;
    }

    const dismissedVersion = localStorage.getItem("deckBuilderDismissedUpdateVersion");
    if (!silent || dismissedVersion !== release.version) showUpdateDialog(release);
    return release;
  } catch {
    if (!silent) showToast(t("updateCheckFailed"));
    return null;
  }
}

async function fetchLatestRelease() {
  const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
    cache: "no-store",
    headers: { accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`release ${response.status}`);
  const payload = await response.json();
  const tag = String(payload?.tag_name || payload?.name || "").trim();
  return {
    version: normalizeVersion(tag),
    tag,
    htmlUrl: payload?.html_url || RELEASE_PAGE_URL,
    name: payload?.name || tag,
  };
}

function showUpdateDialog(release = state.latestRelease) {
  if (!els.updateDialog || !release?.version) return;
  state.latestRelease = release;
  els.updateDialogTitle.textContent = format(t("updateAvailableTitle"), { version: release.tag || `v${release.version}` });
  els.updateDialogBody.textContent = format(t("updateAvailableBody"), {
    current: `v${APP_VERSION}`,
    latest: release.tag || `v${release.version}`,
  });
  els.updateDownloadButton.disabled = false;
  els.updateDownloadButton.textContent = t("updateDownload");
  els.updateDialog.classList.remove("hidden");
}

function renderDesktopUpdate(snapshot, { manual = false } = {}) {
  const previous = desktopUpdateState;
  desktopUpdateState = snapshot;
  if (["idle", "unavailable"].includes(snapshot.status)) return;
  if (snapshot.status === "current") { if (manual) showToast(t("updateLatest")); return; }
  if (snapshot.status === "checking") return;
  if (snapshot.version) state.latestRelease = { version: snapshot.version, tag: `v${snapshot.version}` };
  const visible = !els.updateDialog.classList.contains("hidden");
  const dismissed = localStorage.getItem("deckBuilderDismissedUpdateVersion") === snapshot.version;
  const becameReady = snapshot.status === "ready" && previous?.status !== "ready";
  if (!manual && !visible && !becameReady && (snapshot.status !== "downloading" || dismissed)) return;
  const downloading = snapshot.status === "downloading";
  const ready = snapshot.status === "ready";
  els.updateDialogTitle.textContent = ready
    ? format(t("updateReadyTitle"), { version: `v${snapshot.version}` })
    : downloading ? format(t("updateAvailableTitle"), { version: `v${snapshot.version}` }) : t("updateCheckFailed");
  els.updateDialogBody.textContent = ready
    ? t(snapshot.installMode === "restart" ? "updateReadyRestartBody" : "updateReadyInstallerBody")
    : downloading ? format(t("updateAutoDownloading"), { latest: `v${snapshot.version}`, percent: snapshot.percent || 0 }) : t("updateErrorBody");
  els.updateDownloadButton.disabled = downloading;
  els.updateDownloadButton.textContent = ready
    ? t(snapshot.installMode === "restart" ? "updateRestartInstall" : "updateOpenInstaller")
    : downloading ? format(t("updateDownloading"), { percent: snapshot.percent || 0 }) : t("updateRetry");
  els.updateDialog.classList.remove("hidden");
}

function dismissUpdateDialog() {
  if (state.latestRelease?.version) {
    localStorage.setItem("deckBuilderDismissedUpdateVersion", state.latestRelease.version);
  }
  els.updateDialog?.classList.add("hidden");
}

async function openUpdateDownload() {
  if (window.desktopUpdates && desktopUpdateState?.status !== "unavailable") {
    try {
      if (desktopUpdateState?.status === "ready") await window.desktopUpdates.install();
      else await checkForUpdates({ silent: false });
    } catch { showToast(t("updateCheckFailed")); }
    return;
  }
  const url = state.latestRelease?.htmlUrl || RELEASE_PAGE_URL;
  window.open(url, "_blank", "noopener");
  dismissUpdateDialog();
}

function normalizeVersion(value = "") {
  const match = String(value).trim().match(/^v?(\d+(?:\.\d+){0,2})/i);
  if (!match) return "";
  return match[1].split(".").concat(["0", "0"]).slice(0, 3).join(".");
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split(".").map((part) => Number(part || 0));
  const rightParts = normalizeVersion(right).split(".").map((part) => Number(part || 0));
  for (let index = 0; index < 3; index += 1) {
    if ((leftParts[index] || 0) > (rightParts[index] || 0)) return 1;
    if ((leftParts[index] || 0) < (rightParts[index] || 0)) return -1;
  }
  return 0;
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
