const messages = {
  zh: {
    title: "大师决斗 · 官方卡组", retry: "重新打开", hint: "首次在下方官方页面登录，程序随后自动填入配方。登录状态未过期时可复用。",
    loading: "正在打开官方页面…", login: "请在下方官方页面完成登录。", manual: "请在官方页面登录并打开「我的卡组」，或新建空白卡组。",
    filled: "配方已填入，请核对卡片与卡组名，再点击官方 Save 保存。", finish: "保存后，在游戏「卡组」中打开官方数据库，选择配方并点击「复制卡组」。",
    network: "官方页面加载失败。检查网络后点击「重新打开」。", schema: "官方编辑页结构无法识别，未能自动填入。可新建空白卡组后重试，或改用 YDK 导出。",
    auth: "KONAMI 拒绝了登录请求（403）。点击「重新打开」，从官方数据库重新发起登录。",
    occupied: "当前卡组已有卡片，未覆盖。请新建空白卡组后重试。", blocked: "该链接不属于官方登录页面，已停止跳转。", closed: "窗口已关闭。",
  },
  ja: {
    title: "マスターデュエル · 公式デッキ", retry: "再表示", hint: "下の公式ページで初回ログインするとレシピを自動入力します。有効なログイン状態は再利用されます。",
    loading: "公式ページを読み込み中…", login: "下の公式ページでログインしてください。", manual: "公式ページでログインして「マイデッキ」を開くか、空のデッキを新規作成してください。",
    filled: "レシピを入力しました。カードとデッキ名を確認し、公式の Save を押してください。", finish: "保存後、ゲームの「デッキ」で公式データベースを開き、レシピを選んで「デッキコピー」を押してください。",
    network: "公式ページを読み込めません。ネットワークを確認して「再表示」を押してください。", schema: "公式編集ページの構造を認識できません。空のデッキで再試行するか、YDK を書き出してください。",
    auth: "KONAMI がログイン要求を拒否しました（403）。「再表示」で公式データベースからログインをやり直してください。",
    occupied: "既存のカードがあるため上書きしませんでした。空のデッキを新規作成してください。", blocked: "公式ログインページ以外への移動を停止しました。", closed: "ウィンドウを閉じました。",
  },
  en: {
    title: "Master Duel · Official Deck", retry: "Reopen", hint: "Sign in on the official page below once; the app then fills the recipe. Your session is reused while valid.",
    loading: "Opening the official page…", login: "Sign in on the official page below.", manual: "Sign in and open My Deck, or create a blank deck on the official page.",
    filled: "Recipe filled. Check the cards and deck name, then click the official Save button.", finish: "After saving, open the official database in the game's Deck screen, select the recipe, and click Copy Deck.",
    network: "Official page could not load. Check your connection, then click Reopen.", schema: "Cannot recognize the official editor. Try a new blank deck or export YDK instead.",
    auth: "KONAMI rejected the login request (403). Click Reopen to start a fresh login from the official database.",
    occupied: "This deck has existing cards and was not overwritten. Create a blank deck to continue.", blocked: "Navigation outside official login sites was stopped.", closed: "Window closed.",
  },
};
let lastSequence = -1;
function render(state) {
  if (state.sequence < lastSequence) return;
  lastSequence = state.sequence;
  const text = messages[state.language] || messages.zh;
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : state.language;
  document.querySelector("#title").textContent = text.title;
  document.querySelector("#retry").textContent = text.retry;
  document.querySelector("#retry").disabled = state.phase === "filled" || state.phase === "loading";
  document.querySelector("#name").textContent = state.name;
  document.querySelector("#name").title = state.name;
  document.querySelector("#origin").textContent = state.origin;
  document.querySelector("#status").textContent = text[state.phase] || text.manual;
  document.querySelector("#status").classList.toggle("error", ["auth", "network", "schema", "occupied", "blocked"].includes(state.phase));
  document.querySelector("#hint").textContent = state.phase === "filled" ? text.finish : text.hint;
}
window.deckTransferWindow.onChange(render);
window.deckTransferWindow.getState().then(render);
new ResizeObserver(() => window.deckTransferWindow.resizeHeader(document.querySelector("header").offsetHeight)).observe(document.querySelector("header"));
document.querySelector("#retry").addEventListener("click", () => window.deckTransferWindow.retry());
