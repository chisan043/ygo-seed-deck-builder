# 卡名与卡组别名维护表

检索日期：2026-10-10。运行时唯一来源为 `deck-aliases.js`，不属于自动刷新的数据缓存；浏览器离线模式和桌面安装包均加载它。当前维护 124 个主题、430 个主题别名，另有单卡俗称和易混淆名称。卡库自身已有的正式卡名、译名和主题名继续参与查询。

## 识别规则

- 完整卡名／主题名优先于同位置的短简称；同一卡组的不同译名直接识别。
- 不同主题或单卡共用同一个别名时，`compile()` 按 NFKC、大小写及标点归一化后自动汇总所有含义，不允许后写入的名称覆盖前一个。
- `confusables` 记录容易误说的名称或未指明分支的叫法。这是提示候选，不代表它们都是各候选的准确别名。
- “电子流”“水产”等未指明分支的名称先选择核心；混合构筑可以在原句继续写明两个系列，完整原句仍交给模型。
- 两字母英文简称支持中文句子、单独输入及英文大写写法。英文句子中的小写短词不作为简称，避免误识别。
- 只写打法的 AI 多方案流程保持不变。提示出现前不会调用模型。
- “贴纸”“烧血”“高抗性”“后攻”“轮椅”等战术或随环境变化的泛称不绑定单一主题。

## 已收录的易混淆名称

| 名称 | 供确认的含义 | 依据 |
| --- | --- | --- |
| 黄金城／黃金城 | 急流山的金宫；黄金国 | 原有单卡俗称与本次用户明确指出的误说情形 |
| 机巧／機巧 | Karakuri；Gizmek | [玩家索引分列「机巧/カラクリ」与「机巧/機巧」](https://www.bilibili.com/read/cv23447309/)；以核心卡区分 |
| 电子流／電子流 | 电子龙；电子暗黑 | [电子龙作者介绍及关联电子暗黑](https://www.bilibili.com/opus/1124754516376289288)、[里电子介绍](https://moegirl.uk/电子暗黑) |
| 水产／水產 | 水精鳞；海皇 | [海皇与水精鳞玩家主题讨论](https://bbs.newwise.com/thread-905614-1-1.html)，原文讨论了核心分支与混合构筑 |
| 魔导／魔導 | 魔导书；黑魔导 | [魔导书字段及同汉字不同字段说明](https://bkso.baidu.com/item/魔导书/64487979)，这是防止混淆的确认候选，不将黑魔导并入魔导书字段 |
| 龙骑／龍騎／龙骑兵／龍騎兵 | 龙骑兵团；超魔导龙骑士－真红眼龙骑兵 | [官方龙骑兵团卡表](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&pid=3000001175000&request_locale=cn&rp=99999)、[百鸽的龙骑兵译名](https://ygocdb.com/card/37818794)，短词缺少完整名称时要求确认 |
| 红龙／紅龍 | 赤龙（Crimson Dragon）；共鸣者／红莲魔 | [赤龙与红龙译名](https://yugioh.fandom.com/zh/wiki/红龙（系列）)、[玩家索引共鸣者／红莲魔](https://www.bilibili.com/read/cv23447309/)；相近名称只列候选，不自动合并 |
| 小蓝／小藍 | 洗衣龙女；蓝色喷流灵；梅洛人鱼；蛇眼梣树灵；调皮宝贝水滴娃；直播双子璃拉 | [龙女仆的“小蓝”](https://moegirl.uk/index.php?title=半龙女仆·洗衣龙女&variant=zh-sg)、[喷流灵多译名](https://ygocdb.com/card/76145933)、[萌卡活动中的三位“小蓝”](https://ygobbs2.com/t/529998)、[作者称调皮水娃为小蓝](https://www.bilibili.com/video/BV1934y1a7ih/)、[双子作者称小蓝／小红](https://www.iyingdi.com/tz/post/5092928) |
| 小红／小紅 | 直播双子姬丝基勒；红色喷流灵 | [双子构筑作者](https://www.iyingdi.com/tz/post/5092928)、[喷流灵小红译名](https://ygocdb.com/card/75922381) |

## 明确简称的核查样例

[玩家卡组索引](https://www.bilibili.com/read/cv23447309/)用于交叉检查 PK、RR、SR、军贯／寿司、火灵天星等名称；[随风旅鸟作者构筑](https://www.bilibili.com/opus/589289682188050560)使用“旅鸟”；[白银城作者教学](https://www.bilibili.com/video/BV1W14y1X7Zo/)同时使用白银城、拉比林斯；[雷精作者卡组介绍](https://www.bilibili.com/opus/729096236560285698)同时使用雷精、卫星闪灵。其余正式译名结合项目已有的中日卡名和主题资料核对。历史攻略仅作名称依据，不将其旧禁限和强度判断带入构筑。

[朋克作者构筑](https://www.iyingdi.com/tz/post/5511648)、[枪弹／弹丸名称整理](https://www.bilibili.com/opus/830287620099538997)、[双子作者教学](https://www.iyingdi.com/tz/post/5092928)、[官方军贯卡表](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=16201&ope=2&request_locale=cn)、[白森／白之森作者介绍](https://forum.gamer.com.tw/Co.php?bPage=0&bsn=725&sn=349056&subbsn=9)核查了本次补充名称。直播双子与邪恶双子属于同套牌常见的主卡／额外分支，“双子”以直播双子作为入口，不制造无意义的二选一。

## 添加或修改

修改 `records` 中目标主题的 `aliases`；不确定的新俗称先核查社区实际用法。别名属于不同主题时分别保留，由编译器自动产生歧义。新增易误说短词写入 `confusables`；单卡俗称必须用已核实卡号写入 `cardAliases`。需要展示核心卡的主题使用 `coreIds`，不能凭名称猜卡号。新增来源补充到本文件。

运行 `npm run check:ai`，覆盖别名共享、归一化冲突、英文边界、完整名称优先、选择确认和静态／安装包资源加载。

## 主题别名清单

| 主题标识 | 已维护名称 |
| --- | --- |
| Eldlich | 黄金国 / 黃金國 / 黄金國 / 黄金国巫妖 / 黃金國巫妖 / エルドリッチ |
| Dark Magician | 黑魔导 / ブラックマジシャン / ブラック・マジシャン / 黑魔术 / 黑魔術 / 黑魔术师 / 黑魔術師 / 黑魔導 |
| Blue-Eyes | 青眼 / 青眼白龙 / ブルーアイズ / 蓝眼 |
| Sky Striker | 闪刀 / 闪刀姬 / 閃刀姫 |
| Branded | 烙印 / 烙印融合 |
| Kewl Tune | 杀手旋律 / 殺手旋律 / キラーチューン |
| Dracotail | 星宿 / 星辰 |
| Enneacraft | 纠罪巧 / 糾罪巧 / 九艺 |
| Radiant Typhoon | 绚岚 |
| Radiant Typhoon Zoodiac | 绚岚十二兽 / 絢嵐十二獸 |
| Zoodiac | 十二兽 / 十二獸 |
| Blitzclique | 雷盟 |
| Ryu-Ge | 龙华 / 龍華 / 竜華 |
| Ryzeal | 莱泽奥尔 / 萊澤奧爾 / ライゼオル |
| Mermail | 水精鳞 / 水精鱗 |
| Atlantean | 海皇 |
| Goblin Biker | 百鬼罗刹 / 百鬼羅刹 |
| Tenpai Dragon | 天杯龙 / 天盃龍 |
| Centur-Ion | 百夫长骑士 / 百夫長騎士 / センチュリオン |
| Fiendsmith | 刻魔 / デモンスミス |
| Orcust | 自奏圣乐 / 自奏聖樂 / オルフェゴール |
| Horus | 荷鲁斯 / 荷魯斯 / ホルス |
| Dragon Link | 龙链接 / 龍連接 / ドラゴンリンク |
| Armed Dragon | 武装龙 / 武裝龍 / アームド・ドラゴン |
| Magnet Warrior | 磁石战士 / 磁石戰士 / 磁石の戦士 |
| Artmage | 艺魔 / 藝魔 / アートメイジ |
| Odion | 利希德 / リシド |
| Elfnote | 耀圣 / 耀聖 |
| Power Patron | 狱神 / 獄神 |
| Memento | 冥铭途 / 冥銘途 / 冥骸府 / メメント |
| DoomZ | 终刻 / 終刻 |
| Yummy | 黯蜜 / 美味萌宠 / 美味萌寵 / ヤミー |
| Maliss | 码丽丝 / 碼麗絲 / M∀LICE / MALICE / マリス |
| Toon | 卡通 |
| Lunalight | 月光 |
| Exosister | 驱魔姐妹 / 驅魔姐妹 / 救祓少女 / エクソシスター |
| Light and Darkness Ritual | 光暗仪式 |
| Chaos Ritual | 混沌仪式 |
| Vanquish Soul | 对击斗魂 / 對擊鬥魂 |
| Vanquish Soul K9 | 对击斗魂K9 / 對擊鬥魂K9 |
| DMG Shining Sarc | 黑魔术少女光之黄金柜 / 黑魔術少女光之黃金櫃 |
| Shining Sarc | 光之黄金柜 / 光之黃金櫃 |
| Dragoon | 真红眼龙骑兵 / 真紅眼龍騎兵 |
| Labrynth | 白银城 / 白銀城 / 白银 / 白銀 / 白银之城 / 拉比林斯 / 拉比丽斯 / 拉比麗斯 / ラビュリンス |
| Tearlaments | 珠泪 / 珠淚 / 珠泪哀歌族 / 泪冠哀歌 / 淚冠哀歌 / ティアラメンツ |
| Spright | 雷精 / 雷精灵 / 雷精靈 / 卫星闪灵 / 衛星閃靈 / 电光闪灵 / 電光閃靈 / 雷光妖灵 / スプライト |
| Floowandereeze | 旅鸟 / 旅鳥 / 随风旅鸟 / 隨風旅鳥 / 飘风旅鸟 / ふわんだりぃず |
| Dragonmaid | 龙女仆 / 龍女僕 / 半龙女仆 / 半龍女僕 / ドラゴンメイド |
| Adamancipator | 魔救 / 魔救奇石 / アダマシア |
| Prank-Kids | 调皮宝贝 / 調皮寶貝 / 调皮 / 調皮 / プランキッズ |
| Trickstar | 淘气仙星 / 淘氣仙星 / 仙星 / トリックスター |
| Phantom Knights | 幻影骑士团 / 幻影騎士團 / 幻骑 / 幻騎 / PK / 幻影騎士団 |
| Raidraptor | 急袭猛禽 / 急襲猛禽 / RR / レイド・ラプターズ |
| Speedroid | 疾行机人 / 疾行機人 / SR / スピードロイド |
| Lyrilusc | 抒情歌鸲 / 抒情歌鴝 / LL / リリカル・ルスキニア |
| T.G. | 科技属 / 科技屬 / TG / テックジーナス |
| D/D | DD / DDD / D/D/D |
| Virtual World | 电脑堺 / 電腦堺 / 电脑界 / 電腦界 / 電脳堺 |
| Tri-Brigade | 铁兽战线 / 鐵獸戰線 / 铁兽 / 鐵獸 / トライブリゲード |
| Swordsoul | 相剑 / 相劍 / 相剣 |
| Tenyi | 天威 / 天威龙 / 天威龍 |
| Drytron | 龙辉巧 / 龍輝巧 / ドライトロン |
| Kashtira | 俱舍怒威族 / 俱舍 / クシャトリラ |
| Purrely | 纯爱妖精 / 純愛妖精 / 纯爱 / 純愛 / ピュアリィ |
| Rescue-ACE | 救援ACE / 救援王牌 / 消防 / R-ACE / レスキューエース |
| Snake-Eye | 蛇眼 / 罪宝蛇眼 / 罪寶蛇眼 / スネークアイ |
| Fire King | 炎王 / 炎王兽 / 炎王獸 |
| Unchained | 破械 / 破坏械 / 破壞械 |
| Yubel | 尤贝尔 / 尤貝爾 / 于贝尔 / ユベル |
| Bystial | 深渊之兽 / 深淵之獸 / 深渊兽 / 深淵獸 / ビーステッド |
| Runick | 神碑 / ルーン |
| Salamangreat | 转生炎兽 / 轉生炎獸 / 炎兽 / 炎獸 / サラマングレイト |
| Altergeist | 幻变骚灵 / 幻變騷靈 / 骚灵 / 騷靈 / オルターガイスト |
| Subterror | 地中族 / サブテラー |
| Endymion | 恩底弥翁 / 恩底彌翁 / 安迪米翁 / エンディミオン |
| Witchcrafter | 魔女术 / 魔女術 / ウィッチクラフト |
| Dogmatika | 教导 / 教導 / ドラグマ |
| Invoked | 召唤兽 / 召喚獸 / 召喚獣 |
| Shaddoll | 影依 / シャドール |
| Burning Abyss | 彼岸 / 燃烧深渊 / 燃燒深淵 |
| Thunder Dragon | 雷龙 / 雷龍 / サンダー・ドラゴン |
| Danger! | 未界域 / 危险未界域 / 危險未界域 |
| Numeron | 源数 / 源數 / ヌメロン |
| Madolche | 魔偶甜点 / 魔偶甜點 / 魔式甜点 / 魔式甜點 / マドルチェ |
| Traptrix | 虫惑魔 / 蟲惑魔 |
| Rikka | 六花 |
| Sunavalon | 圣天树 / 聖天樹 / サンアバロン |
| Aroma | 芳香 / 芳香法师 / 芳香法師 / アロマ |
| Blackwing | 黑羽 / BF / ブラックフェザー |
| Galaxy | 银河 / 銀河 / 银河眼 / 銀河眼 / ギャラクシー |
| Utopia | 霍普 / 希望皇 / ホープ |
| Red-Eyes | 真红眼 / 真紅眼 / 真红眼黑龙 / 真紅眼黑龍 / レッドアイズ |
| Code Talker | 码语者 / 碼語者 / 代码语者 / 代碼語者 / コード・トーカー |
| @Ignister | 火灵天星 / 火靈天星 / 艾灵星 / 艾靈星 / アットイグニスター |
| Mathmech | 斩机 / 斬機 |
| Marincess | 海晶少女 / 海晶 / マリンセス |
| Machina | 机甲 / 機甲 / マシンナーズ |
| Ancient Gear | 古代机械 / 古代機械 / 古代的机械 / 古代的機械 / アンティーク・ギア |
| Infinitrack | 无限起动 / 無限起動 |
| Crystron | 水晶机巧 / 水晶機巧 / クリストロン |
| Karakuri | 机巧 / 機巧 / 卡拉库里 / カラクリ |
| Gizmek | 机巧 / 機巧 / 机巧兽 / 機巧獸 |
| Cyber Dragon | 电子龙 / 電子龍 / 表电子 / 表電子 / サイバー・ドラゴン |
| Cyberdark | 电子暗黑 / 電子暗黑 / 电子黑暗 / 電子黑暗 / 里电子 / 裏電子 / サイバーダーク |
| Spellbook | 魔导书 / 魔導書 / 魔导 / 魔導 |
| Dragunity | 龙骑兵团 / 龍騎兵團 / ドラグニティ |
| Resonator | 共鸣者 / 共鳴者 / 红莲魔 / 紅蓮魔 / 红莲魔龙 / 紅蓮魔龍 / 暗红恶魔 / 暗紅惡魔 / リゾネーター |
| Nekroz | 影灵衣 / 影靈衣 / ネクロス |
| Ritual Beast | 灵兽 / 靈獸 / 霊獣 |
| Zefra | 神数 / 神數 / セフィラ |
| Gimmick Puppet | 机关傀儡 / 機關傀儡 / ギミック・パペット |
| Generaider | 王战 / 王戰 / ジェネレイド |
| Phantasm Spiral | 幻煌龙 / 幻煌龍 |
| SPYRAL | 秘旋谍 / 秘旋諜 |
| Dinomorphia | 恐啡肽 / 恐啡肽狂龙 / ダイノルフィア |
| Dinowrestler | 恐龙摔跤手 / 恐龍摔跤手 |
| Infernoble Knight | 焰圣骑士 / 焰聖騎士 / 炎聖騎士 |
| Noble Knight | 圣骑士 / 聖騎士 |
| P.U.N.K. | 朋克 / 龐克 / PUNK / パンク |
| Rokket | 枪弹 / 槍彈 / 弹丸 / 彈丸 / ヴァレット |
| Live☆Twin | 直播双子 / 直播雙子 / 直播☆双子 / 直播☆雙子 / 双子 / 雙子 / ライブツイン |
| Evil★Twin | 邪恶双子 / 邪惡雙子 / 邪恶★双子 / 邪惡★雙子 / イビルツイン |
| White Forest | 白森林 / 白森 / 白之森 / 白き森 |
| Gunkan | 军贯 / 軍貫 / 寿司 / 壽司 / 軍貫寿司 |
