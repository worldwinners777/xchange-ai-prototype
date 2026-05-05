/* =====================================================================
 * X-Change Prototype - Application Logic (v2)
 * 吉田自動車工業 タイヤ販売店舗向け AI業務管理プロトタイプ
 *
 * v2 改善点:
 *   - 店舗ダッシュボード: 5KPIカード + 5大ボタン + 修正依頼バナー
 *   - 店舗: 本日売上一覧 / 本日経費一覧 / 修正依頼一覧 を新規追加
 *   - 本社: PC向け左サイドバーレイアウト
 *   - 本社: 8KPIダッシュボード / 未確認一覧 / CSV出力センター
 *   - 既存の音声→確認→登録, OCR→分類→登録, 承認/修正依頼フローは維持
 * ===================================================================== */

(function () {
  "use strict";

  // ================== 定数 ==================
  const STORAGE_KEY = "xchange.records.v1";
  // ===== v3.1: 経費区分（12種） =====
  const EXPENSE_CATEGORIES = [
    "タイヤ仕入", "工具消耗品", "廃タイヤ処分費", "店舗備品",
    "ガソリン代", "車両関連費", "通信費", "広告宣伝費",
    "修繕費", "外注費", "雑費", "その他"
  ];
  // ===== v3.1: 経費 支払方法（v1 から維持） =====
  const EXPENSE_PAYMENT_METHODS = ["現金","クレジットカード","銀行振込","口座引落","その他"];
  // 旧名互換（古いレコードや一部関数で参照）
  const CATEGORIES = EXPENSE_CATEGORIES;
  const DOW = ["日","月","火","水","木","金","土"];

  // ===== v3: 売上区分（複数選択可） =====
  const SALES_CATEGORIES = [
    "新品タイヤ販売", "中古タイヤ販売", "タイヤ交換工賃", "バランス調整",
    "廃タイヤ処分料", "バルブ交換", "パンク修理", "ホイール販売", "その他"
  ];
  // ===== v3: 売上 支払方法 =====
  const SALE_PAYMENT_METHODS = ["現金","クレジットカード","QR決済","銀行振込","売掛","その他"];
  // ===== v3: デフォルト値 =====
  const DEFAULT_STORE_NAME = "吉田自動車工業 X-Change本店";
  const DEFAULT_STAFF      = "店長";

  // ===== v3.17: 実OCR (Tesseract.js) 設定 =====
  // CDN から遅延ロード。APIキー不要・全てブラウザ内で完結。
  const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const TESSERACT_LANG = "jpn+eng";
  // Tesseract の status 文字列を日本語化
  const TESSERACT_STATUS_JA = {
    "loading tesseract core":   "OCRエンジン読込中",
    "initializing tesseract":   "OCRエンジン初期化中",
    "loading language traineddata": "日本語学習モデル読込中",
    "initializing api":         "API初期化中",
    "initialized api":          "API初期化完了",
    "recognizing text":         "テキスト認識中",
    "loaded language traineddata": "日本語モデル読込完了",
    "loading":                  "読込中",
    "done":                     "完了"
  };
  // ===== v3: 既知の車種マスタ（AI解析用） =====
  const CAR_MODELS = [
    "プリウス","アクア","ヴィッツ","ヤリス","カローラ","ハリアー","RAV4",
    "ノート","セレナ","ヴェゼル","フィット","Nボックス","タント","スペーシア",
    "ハイエース","アルファード","ヴェルファイア","エクストレイル","CX-5","CX-30",
    "フォレスター","レガシィ","インプレッサ","ステップワゴン","フリード",
    "オデッセイ","シエンタ","ランドクルーザー","ジムニー","ハスラー",
    "ムーヴ","ワゴンR","エブリイ","アクセラ","デミオ","ロードスター",
    "クラウン","マークX","セルシオ","スカイライン","フェアレディZ","GT-R"
  ];

  // ================== モック: 音声サンプル ==================
  // ===== v3.1: 経費 音声/テキスト サンプル =====
  const EXPENSE_VOICE_SAMPLES = [
    "本日、ENEOSでガソリン代5,000円を現金で支払い。",
    "カインズで工具とパーツクリーナーを3,420円、現金で購入。",
    "タイヤ卸業者からタイヤ仕入れ185,000円、銀行振込。",
    "東京電力 電気料金 28,400円、口座引落で支払い。",
    "NTTドコモ 携帯電話料金 8,800円、口座引落。",
    "タウンワーク 求人広告掲載料 22,000円、クレジットカード。",
    "廃タイヤ処分料、産廃業者へ 12,000円、現金で支払い。"
  ];

  // ===== v3.15: 音声入力テンプレート (12項目・日付/店舗/担当者は除外) =====
  // 売上音声入力画面を開いた時に textarea に初期表示される。
  // 「📝 入力テンプレートを入れる」「クリア」ボタン押下時もこれを再表示。
  // 日付・店舗名・担当者はシステム側でデフォルト設定するため除外。
  const VOICE_TEMPLATE = [
    "お客様名:",
    "売上区分:",
    "商品名:",
    "タイヤサイズ:",
    "数量:",
    "単価:",
    "合計金額:",
    "支払方法:",
    "車種:",
    "車両番号:",
    "作業内容:",
    "備考:"
  ].join("\n");

  // ===== v3: 音声サンプル（テキストのみ。AIモック解析器が項目分解する） =====
  const VOICE_SAMPLES = [
    // v3.15: 12項目の項目名形式 (お客様名/単価追加、日付/店舗/担当者は除外)
    "お客様名、高橋様。\n売上区分、新品タイヤ販売。\n商品名、ヨコハマ アイスガード。\nタイヤサイズ、195 65 R15。\n数量、4本。\n単価、1万7千円。\n合計金額、6万8千円。\n支払方法、現金。\n車種、プリウス。\n車両番号、品川 300 あ 1234。\n作業内容、タイヤ交換、バランス調整、廃タイヤ処分あり。\n備考、売掛なし。",
    "新品タイヤ4本販売、サイズは195/65R15、車はプリウス、タイヤ代と交換工賃込みで合計48,000円、支払いは現金、廃タイヤ処分あり、バランス調整あり。",
    "ブリヂストン レグノ 215/55R17を4本、お客様は田中様、車種ヴィッツ、品川300あ12-34、合計136,000円、クレジットカード、工賃込み、廃タイヤ処分あり。",
    "中古タイヤ4本、175/65R14、アクア、佐藤様、現金で18,000円、廃タイヤ処分も込み。",
    "パンク修理1箇所、お客様セレナ、山本様、現金3,300円。",
    "ホイール販売4本、ハリアー、QR決済で88,000円、バルブ交換込み、お客様は鈴木様。",
    "ミシュラン プライマシー4 225/45R18を4本、ノート、井上様、銀行振込で15万6千円、工賃とバランス調整込み。",
    "ヨコハマ アイスガード 195/65R15 4本、フィット、高橋様、売掛で6万8千円、工賃と廃タイヤ処分込み。"
  ];

  // ================== v3.1: モック レシートサンプル (新カテゴリ対応) ==================
  const SAMPLE_RECEIPTS = [
    { id: "rcpt-eneos", icon: "⛽", label: "ENEOS ガソリン",
      vendor: "ENEOS 田中SS", amount: 5000, taxAmount: 454,
      content: "ガソリン代（送迎車・営業車給油）",
      ocrText: "ENEOS 田中サービスステーション\n2026/05/03 14:32\n--------------------\nレギュラー 32.5L @154円\n--------------------\n小計      4,546円\n消費税(10%)  454円\n合計      5,000円\nお支払い  現金\n--------------------\n領収書",
      paymentMethod: "現金",
      aiCandidates: [{ cat: "ガソリン代", score: 0.94 }, { cat: "車両関連費", score: 0.04 }, { cat: "雑費", score: 0.02 }] },

    { id: "rcpt-cainz", icon: "🛠", label: "カインズ 工具",
      vendor: "カインズ", amount: 3420, taxAmount: 311,
      content: "工具・パーツクリーナー・軍手",
      ocrText: "ホームセンター カインズ\n2026/05/03\n--------------------\nラチェットレンチ      1,980\nパーツクリーナー        980\n軍手 5双組              460\n--------------------\n小計      3,109円\n消費税(10%) 311円\n合計      3,420円\nお支払い  現金\n--------------------\n領収書",
      paymentMethod: "現金",
      aiCandidates: [{ cat: "工具消耗品", score: 0.91 }, { cat: "店舗備品", score: 0.06 }, { cat: "雑費", score: 0.03 }] },

    { id: "rcpt-bs", icon: "🛞", label: "タイヤ仕入",
      vendor: "ブリヂストンタイヤジャパン", amount: 185000, taxAmount: 16818,
      content: "タイヤ仕入(195/65R15 レグノGR-XII × 24本)",
      ocrText: "ブリヂストンタイヤジャパン㈱\n納品書 兼 請求書\nNo.A-2026-05003\n2026/05/03\n--------------------\nお取引先様:吉田自動車工業 X-Change本店\n--------------------\n195/65R15 レグノGR-XII × 24本\n@単価 7,716円(税込)\n--------------------\n小計    168,182円\n消費税(10%) 16,818円\n合計    185,000円\nお支払: 翌月末 銀行振込",
      paymentMethod: "銀行振込",
      aiCandidates: [{ cat: "タイヤ仕入", score: 0.99 }, { cat: "工具消耗品", score: 0.005 }, { cat: "その他", score: 0.005 }] },

    { id: "rcpt-haitire", icon: "♻️", label: "廃タイヤ処分",
      vendor: "城南産業廃棄物センター", amount: 12000, taxAmount: 1091,
      content: "廃タイヤ処分料 80本分",
      ocrText: "城南産業廃棄物センター\n産業廃棄物処理証明書 兼 領収書\n2026/05/03\n--------------------\n廃タイヤ処分 80本\n--------------------\n小計      10,909円\n消費税(10%) 1,091円\n合計      12,000円\nお支払い  現金\n--------------------\nマニフェスト番号: 2026-WT-0503",
      paymentMethod: "現金",
      aiCandidates: [{ cat: "廃タイヤ処分費", score: 0.98 }, { cat: "外注費", score: 0.015 }, { cat: "雑費", score: 0.005 }] },

    { id: "rcpt-tepco", icon: "💡", label: "電気料金",
      vendor: "東京電力エナジーパートナー", amount: 28400, taxAmount: 2581,
      content: "電気料金 4月分",
      ocrText: "東京電力エナジーパートナー\n2026年4月分 電気使用量のお知らせ\n--------------------\n使用量 612kWh\n基本料金     1,716円\n電力量料金 22,684円\n再エネ賦課金 4,000円\n--------------------\n小計    25,819円\n消費税(10%) 2,581円\n請求金額 28,400円\nお支払方法: 口座引落",
      paymentMethod: "口座引落",
      aiCandidates: [{ cat: "雑費", score: 0.55 }, { cat: "店舗備品", score: 0.25 }, { cat: "修繕費", score: 0.20 }] },

    { id: "rcpt-docomo", icon: "📱", label: "通信費",
      vendor: "NTTドコモ", amount: 8800, taxAmount: 800,
      content: "携帯電話料金 4月分",
      ocrText: "NTTドコモ ご利用料金のお知らせ\n2026年4月分\n--------------------\n5Gギガホプレミア\n基本料・通話料・パケット料\n--------------------\n小計     8,000円\n消費税(10%) 800円\n合計     8,800円\nお支払: 口座引落",
      paymentMethod: "口座引落",
      aiCandidates: [{ cat: "通信費", score: 0.97 }, { cat: "雑費", score: 0.02 }, { cat: "広告宣伝費", score: 0.01 }] },

    { id: "rcpt-ad", icon: "📰", label: "求人広告料",
      vendor: "タウンワーク掲載料", amount: 22000, taxAmount: 2000,
      content: "求人広告掲載料 4月後半分",
      ocrText: "リクルート タウンワーク\n求人広告掲載料\n掲載期間: 2026/04/15-04/28\n--------------------\n小計    20,000円\n消費税(10%) 2,000円\n合計    22,000円(税込)\nお支払: クレジットカード",
      paymentMethod: "クレジットカード",
      aiCandidates: [{ cat: "広告宣伝費", score: 0.96 }, { cat: "雑費", score: 0.03 }, { cat: "通信費", score: 0.01 }] }
  ];

  // ================== ストレージ ==================
  // ===== v3.2: 確認ステータス =====
  // 旧 "承認待ち"/"承認済み" → 新 "未確認"/"確認済み" + 新規 "月次処理済み"
  const STATUSES = ["未確認","確認済み","修正依頼","月次処理済み"];

  function migrateRecord(r) {
    // ステータス名のマイグレーション
    if (r.status === "承認待ち")      r.status = "未確認";
    else if (r.status === "承認済み") r.status = "確認済み";
    return r;
  }
  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedDemo();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return seedDemo();
      const migrated = parsed.map(migrateRecord);
      // マイグレーションで変更があれば保存
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch (_e) { return seedDemo(); }
  }
  function saveAll(records) { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
  function seedDemo() {
    const now = new Date();
    const yymm = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const past = (days, hour) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      d.setHours(hour || 10 + (days % 6), 15, 0, 0);
      return d.toISOString();
    };
    const records = [
      // ===== v3 形式の売上（フル項目） =====
      { id: uid(), type: "sale", createdAt: past(0, 11),
        date: yymm(now), storeName: DEFAULT_STORE_NAME, staff: DEFAULT_STAFF,
        customer: "井上様",
        carModel: "ノート", carNumber: "品川 500 さ 22-22",
        productName: "ヨコハマ ブルーアース", tireSize: "185/65R15",
        qty: 4, unitPrice: 13500,
        total: 54000, paymentMethod: "現金",
        salesCategories: ["新品タイヤ販売", "タイヤ交換工賃"],
        workContent: "新品タイヤ販売、タイヤ交換工賃、バランス調整",
        items: [{ name: "ヨコハマ ブルーアース 185/65R15", qty: 4, unitPrice: 13500 }],
        note: "",
        voiceTranscript: "ヨコハマ ブルーアース 185/65R15 を4本、井上様、ノート、現金で5万4千円、工賃込み。",
        status: "未確認" },
      { id: uid(), type: "sale", createdAt: past(0, 14),
        date: yymm(now), storeName: DEFAULT_STORE_NAME, staff: DEFAULT_STAFF,
        customer: "中村様",
        carModel: "プリウス", carNumber: "練馬 300 あ 12-34",
        productName: "ブリヂストン ポテンザ", tireSize: "245/40R19",
        qty: 4, unitPrice: 40000,
        total: 160000, paymentMethod: "クレジットカード",
        salesCategories: ["新品タイヤ販売", "タイヤ交換工賃", "バランス調整"],
        workContent: "新品タイヤ販売、タイヤ交換工賃、バランス調整",
        items: [{ name: "ブリヂストン ポテンザ 245/40R19", qty: 4, unitPrice: 40000 }],
        note: "工賃込み",
        voiceTranscript: "ブリヂストン ポテンザ 245/40R19 を4本、中村様、プリウス、クレジットカード16万円、工賃とバランス調整込み。",
        status: "未確認" },
      { id: uid(), type: "sale", createdAt: past(1, 13),
        date: yymm(new Date(now.getTime() - 86400000)),
        storeName: DEFAULT_STORE_NAME, staff: DEFAULT_STAFF,
        customer: "高橋様",
        carModel: "ハリアー", carNumber: "品川 330 ね 88-77",
        productName: "ブリヂストン レグノ", tireSize: "215/55R17",
        qty: 4, unitPrice: 34000,
        total: 136000, paymentMethod: "クレジットカード",
        salesCategories: ["新品タイヤ販売", "タイヤ交換工賃"],
        workContent: "新品タイヤ販売、タイヤ交換工賃",
        items: [{ name: "ブリヂストン レグノ 215/55R17", qty: 4, unitPrice: 34000 }],
        note: "工賃込み",
        voiceTranscript: "ブリヂストン レグノ 215/55R17 を4本、高橋様、ハリアー、クレジットカード13万6千円、工賃込み。",
        status: "確認済み", approval: { at: past(1, 16), note: "" } },
      { id: uid(), type: "sale", createdAt: past(2, 10),
        date: yymm(new Date(now.getTime() - 86400000*2)),
        storeName: DEFAULT_STORE_NAME, staff: DEFAULT_STAFF,
        customer: "斎藤様",
        carModel: "アクア", carNumber: "品川 500 す 11-22",
        productName: "ダンロップ エナセーブ", tireSize: "195/65R15",
        qty: 4, unitPrice: 14500,
        total: 58000, paymentMethod: "QR決済",
        salesCategories: ["新品タイヤ販売"],
        workContent: "新品タイヤ販売",
        items: [{ name: "ダンロップ エナセーブ 195/65R15", qty: 4, unitPrice: 14500 }],
        note: "",
        voiceTranscript: "ダンロップ エナセーブ 195/65R15 を4本、斎藤様、アクア、QR決済5万8千円。",
        status: "修正依頼",
        rejection: { at: past(2, 17), note: "明細にバランス調整料が抜けていませんか？領収書をご確認ください。" } },
      // ===== v3.1 形式の経費（フル項目） =====
      { id: uid(), type: "expense", createdAt: past(0, 9),
        date: yymm(now),
        storeName: DEFAULT_STORE_NAME, staff: DEFAULT_STAFF,
        vendor: "ENEOS 田中SS", amount: 5000, taxAmount: 454,
        content: "ガソリン代（送迎車・営業車給油）",
        aiCategory: "ガソリン代",
        category: "ガソリン代",
        paymentMethod: "現金", note: "",
        ocrText: SAMPLE_RECEIPTS[0].ocrText, receiptThumb: SAMPLE_RECEIPTS[0].icon,
        aiCandidates: SAMPLE_RECEIPTS[0].aiCandidates,
        status: "未確認" },
      { id: uid(), type: "expense", createdAt: past(2, 15),
        date: yymm(new Date(now.getTime() - 86400000*3)),
        storeName: DEFAULT_STORE_NAME, staff: DEFAULT_STAFF,
        vendor: "ブリヂストンタイヤジャパン", amount: 185000, taxAmount: 16818,
        content: "タイヤ仕入(195/65R15 レグノGR-XII × 24本)",
        aiCategory: "タイヤ仕入",
        category: "タイヤ仕入",
        paymentMethod: "銀行振込", note: "5月分仕入",
        ocrText: SAMPLE_RECEIPTS[2].ocrText, receiptThumb: SAMPLE_RECEIPTS[2].icon,
        aiCandidates: SAMPLE_RECEIPTS[2].aiCandidates,
        status: "確認済み", approval: { at: past(2, 18), note: "" } },
      { id: uid(), type: "expense", createdAt: past(3, 16),
        date: yymm(new Date(now.getTime() - 86400000*4)),
        storeName: DEFAULT_STORE_NAME, staff: DEFAULT_STAFF,
        vendor: "東京電力エナジーパートナー", amount: 28400, taxAmount: 2581,
        content: "電気料金 4月分",
        aiCategory: "雑費",
        category: "修繕費",
        paymentMethod: "口座引落", note: "",
        ocrText: SAMPLE_RECEIPTS[4].ocrText, receiptThumb: SAMPLE_RECEIPTS[4].icon,
        aiCandidates: SAMPLE_RECEIPTS[4].aiCandidates,
        status: "月次処理済み",
        approval: { at: past(3, 18), note: "" },
        monthClosedAt: past(3, 19) },
      { id: uid(), type: "expense", createdAt: past(4, 11),
        date: yymm(new Date(now.getTime() - 86400000*5)),
        storeName: DEFAULT_STORE_NAME, staff: DEFAULT_STAFF,
        vendor: "カインズ", amount: 3420, taxAmount: 311,
        content: "工具・パーツクリーナー・軍手",
        aiCategory: "工具消耗品",
        category: "工具消耗品",
        paymentMethod: "クレジットカード", note: "",
        ocrText: SAMPLE_RECEIPTS[1].ocrText, receiptThumb: SAMPLE_RECEIPTS[1].icon,
        aiCandidates: SAMPLE_RECEIPTS[1].aiCandidates,
        status: "修正依頼",
        rejection: { at: past(4, 17), note: "金額の単位を再確認してください。" } }
    ];
    saveAll(records);
    return records;
  }

  // ================== ユーティリティ ==================
  function uid() { return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function yen(n) { return "¥" + Number(n || 0).toLocaleString("ja-JP"); }
  function fmtDate(iso) {
    const d = new Date(iso);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
  function fmtFullDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
  function fmtGreeting(d) {
    return `${d.getMonth()+1}月${d.getDate()}日(${DOW[d.getDay()]})`;
  }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function isSameDay(iso, key) {
    const d = new Date(iso);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return k === key;
  }
  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }
  function isInMonth(iso, ym) { return monthKey(new Date(iso)) === ym; }
  function lastMonthKey() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return monthKey(d);
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 1800);
  }
  function statusPill(s) {
    const map = {
      "未確認":       "pending",
      "確認済み":     "approved",
      "修正依頼":     "rejected",
      "月次処理済み": "locked",
      // 旧名（マイグレーション漏れ用フォールバック）
      "承認待ち":     "pending",
      "承認済み":     "approved"
    };
    const cls = map[s] || "pending";
    return `<span class="status-pill ${cls}">${escapeHtml(s)}</span>`;
  }
  function isLocked(r) { return r && r.status === "月次処理済み"; }
  // 日付ソート（新しい順 / 古い順）
  function sortByDate(list, order) {
    return [...list].sort((a, b) => {
      const t = new Date(a.createdAt) - new Date(b.createdAt);
      return order === "asc" ? t : -t;
    });
  }
  function recordTitle(r) {
    if (r.type === "sale") {
      // v3: 商品名 + タイヤサイズを優先
      if (r.productName || r.tireSize) {
        const prod = r.productName || "";
        const size = r.tireSize ? ` ${r.tireSize}` : "";
        const cats = (r.salesCategories && r.salesCategories.length > 1)
          ? ` 他${r.salesCategories.length - 1}項目` : "";
        return `${r.customer || "—"} / ${prod}${size}${cats}`;
      }
      // v1/v2 フォールバック
      const n0 = (r.items && r.items[0] && r.items[0].name) || "";
      const more = (r.items && r.items.length > 1) ? ` 他${r.items.length - 1}件` : "";
      return `${r.customer || "—"} / ${n0}${more}`;
    }
    return `${r.vendor} / ${r.category}`;
  }
  function recordAmount(r) { return r.type === "sale" ? r.total : r.amount; }
  // 仕入判定（v3.1: タイヤ仕入 / 旧: 仕入 の両方を粗利益計算で「仕入」として扱う）
  function isCostCategory(r) {
    return r.category === "タイヤ仕入" || r.category === "仕入";
  }

  // ================== v3: AIモック音声解析 ==================
  // 漢数字混じりの金額 ("4万8千", "15万6千", "12万") を数値化
  function parseKanjiYen(text) {
    const m = text.match(/(\d+)\s*万(?:\s*(\d+)\s*千)?(?:\s*(\d+)\s*百)?(?:\s*(\d+))?/);
    if (!m) return null;
    let n = 0;
    n += Number(m[1] || 0) * 10000;
    n += Number(m[2] || 0) * 1000;
    n += Number(m[3] || 0) * 100;
    n += Number(m[4] || 0);
    return n;
  }
  function newEmptySalesDraft() {
    return {
      date: todayKey(),
      storeName: DEFAULT_STORE_NAME,
      staff: DEFAULT_STAFF,
      customer: "",
      carModel: "",
      carNumber: "",
      productName: "",
      tireSize: "",
      qty: 1,
      unitPrice: 0,
      total: 0,
      paymentMethod: "",
      salesCategories: [],
      workContent: "",
      note: "",
      voiceTranscript: ""
    };
  }
  // 音声テキストから売上項目を抽出（モック）
  function parseVoiceText(text) {
    const draft = newEmptySalesDraft();
    draft.voiceTranscript = text;
    if (!text) return draft;

    // タイヤサイズ: 195/65R15 / 215／55R17 / 195 65 R15 (空白) / 195、65、R15 等
    const sizeMatch = text.match(/(\d{3})\s*[\/／、,]?\s*(\d{2,3})\s*[\/／、,]?\s*[Rｒ]\s*(\d{2})/);
    if (sizeMatch) draft.tireSize = `${sizeMatch[1]}/${sizeMatch[2]}R${sizeMatch[3]}`;

    // 数量: "4本" / "1箇所" / "2件" / "3個" / "1台"
    const qtyMatch = text.match(/(\d+)\s*(?:本|箇所|件|個|台|枚)/);
    if (qtyMatch) draft.qty = Number(qtyMatch[1]);

    // お客様名: 「お客様は田中様」優先 / 「○○様」検出（"お客"は除外）
    {
      const m1 = text.match(/お客様(?:は|の|\s|、|，|,)*([一-龥ぁ-んァ-ヶー]{2,8})様/);
      if (m1) {
        draft.customer = `${m1[1]}様`;
      } else {
        const all = [...text.matchAll(/([一-龥ぁ-んァ-ヶー]{2,8})様/g)];
        for (const m of all) {
          if (m[1] !== "お客") { draft.customer = `${m[1]}様`; break; }
        }
      }
    }

    // 車種マスタ照合
    for (const m of CAR_MODELS) {
      if (text.includes(m)) { draft.carModel = m; break; }
    }

    // 車両番号: "品川 300 あ 12-34" / "品川 300 あ 1234"(ハイフン省略) / 空白区切り
    const numMatch = text.match(/([一-龥]{1,3})\s*(\d{2,3})\s*([ぁ-ん])\s*(\d{1,2})\s*[-‐‑‒–—－―]?\s*(\d{1,4})/);
    if (numMatch) {
      draft.carNumber = `${numMatch[1]} ${numMatch[2]} ${numMatch[3]} ${numMatch[4]}-${numMatch[5]}`;
    }

    // 合計金額: 「合計NN円」優先 → 漢数字「N万N千」 → 任意の「NN円」（最後）
    let total = 0;
    const goukei = text.match(/合計\s*([0-9,]+)\s*円/);
    if (goukei) {
      total = Number(goukei[1].replace(/,/g, ""));
    } else {
      const kgou = text.match(/合計\s*([0-9一二三四五六七八九十]+(?:\s*万)(?:\s*\d+\s*千)?)/);
      const k = text.match(/(\d+\s*万(?:\s*\d+\s*千)?(?:\s*\d+\s*百)?(?:\s*\d+)?)/);
      if (k) {
        total = parseKanjiYen(k[1]) || 0;
      } else {
        const all = [...text.matchAll(/([0-9,]{3,})\s*円/g)];
        if (all.length) total = Number(all[all.length - 1][1].replace(/,/g, ""));
      }
    }
    draft.total = total;

    // 支払方法: 順序優先（先に「売掛」を判定する必要に注意）
    const payRules = [
      [/売掛|掛け売り|掛売/, "売掛"],
      [/現金/, "現金"],
      [/(?:クレジット|VISA|JCB|AMEX|カード)/i, "クレジットカード"],
      [/(?:QR|PayPay|ペイペイ|d払い|楽天ペイ|au\s*PAY)/i, "QR決済"],
      [/振込|銀行/, "銀行振込"]
    ];
    for (const [pat, val] of payRules) {
      if (pat.test(text)) { draft.paymentMethod = val; break; }
    }

    // 売上区分（複数マッチ）
    const catRules = [
      [/新品タイヤ|新品/, "新品タイヤ販売"],
      [/中古タイヤ|中古/, "中古タイヤ販売"],
      [/タイヤ交換|交換工賃|工賃/, "タイヤ交換工賃"],
      [/バランス調整|バランス/, "バランス調整"],
      [/廃タイヤ処分|廃タイヤ|タイヤ処分|処分料/, "廃タイヤ処分料"],
      [/バルブ交換|バルブ/, "バルブ交換"],
      [/パンク修理|パンク/, "パンク修理"],
      [/ホイール販売|ホイール/, "ホイール販売"]
    ];
    for (const [pat, val] of catRules) {
      if (pat.test(text) && !draft.salesCategories.includes(val)) {
        draft.salesCategories.push(val);
      }
    }
    // タイヤサイズはあるが新品/中古指定なし → 新品扱い
    if (draft.tireSize
        && !draft.salesCategories.includes("新品タイヤ販売")
        && !draft.salesCategories.includes("中古タイヤ販売")) {
      draft.salesCategories.unshift("新品タイヤ販売");
    }
    // 何も検出できなかった場合の保険
    if (!draft.salesCategories.length) draft.salesCategories.push("その他");

    // 商品名: メーカー＋モデル名を抽出 / カテゴリから推定
    const brand = text.match(/(ブリヂストン|ヨコハマ|ダンロップ|トーヨー|ミシュラン|グッドイヤー|コンチネンタル|ピレリ|ファルケン|ハンコック|ナンカン|クムホ)\s*([^、。\n\s]+)?/);
    if (brand) {
      draft.productName = brand[2] ? `${brand[1]} ${brand[2]}` : brand[1];
    } else if (draft.salesCategories.includes("新品タイヤ販売")) {
      draft.productName = "新品タイヤ";
    } else if (draft.salesCategories.includes("中古タイヤ販売")) {
      draft.productName = "中古タイヤ";
    } else if (draft.salesCategories.includes("ホイール販売")) {
      draft.productName = "ホイール";
    } else {
      draft.productName = draft.salesCategories[0] || "売上";
    }

    // 単価 = 合計 / 数量 (概算)
    if (draft.qty > 0 && draft.total > 0) {
      draft.unitPrice = Math.round(draft.total / draft.qty);
    }

    // 作業内容 = カテゴリ列 + アライメント等の追加検出キーワード
    const extraWork = [];
    if (/アライメント/.test(text)) extraWork.push("アライメント調整");
    if (/ローテーション/.test(text)) extraWork.push("タイヤローテーション");
    if (/窒素ガス/.test(text)) extraWork.push("窒素ガス充填");
    draft.workContent = [...draft.salesCategories, ...extraWork].join("、");

    // ===== v3.14: 構造化フィールド解析 (項目名:値 形式) を最後に上書き =====
    //   「売上区分：新品タイヤ販売」 や 「商品名、ヨコハマ アイスガード」 など
    //   ラベル付き入力を優先反映。ラベルなし自由文章は上記の free-form でカバー済み。
    const structured = parseStructuredFields(text);
    applyStructuredOverrides(draft, structured);

    return draft;
  }

  // ===== v3.14: 構造化フィールド解析 ==================
  // ラベル「項目名」+ 区切り「:、,：」 + 値「次のラベル / 改行 / 「。」 まで」 を抽出
  function parseStructuredFields(text) {
    const labelMap = {
      "売上区分":   "salesCategories",
      "商品名":     "productName",
      "タイヤサイズ": "tireSize",
      "サイズ":     "tireSize",
      "数量":       "qty",
      "単価":       "unitPrice",      // v3.15: 単価ラベル追加
      "車種":       "carModel",
      "車両番号":   "carNumber",
      "ナンバー":   "carNumber",
      "合計金額":   "total",
      "金額":       "total",
      "支払方法":   "paymentMethod",
      "支払い":     "paymentMethod",
      "支払":       "paymentMethod",
      "作業内容":   "workContent",
      "備考":       "note",
      "お客様名":   "customer",
      "お客様":     "customer",
      "顧客名":     "customer"        // v3.15: 顧客名ラベル追加
    };
    // 長いラベルから先にマッチさせる (タイヤサイズ > サイズ など)
    const labels = Object.keys(labelMap).sort((a, b) => b.length - a.length);
    const labelAlt = labels.join("|");
    // 値: 次のラベル/「。」/改行/末尾 まで (lazy)
    const re = new RegExp(
      `(${labelAlt})\\s*[:：、,]\\s*([^]*?)(?=\\s*(?:${labelAlt})\\s*[:：、,]|[。\\n]|$)`,
      "g"
    );
    const result = {};
    let m;
    while ((m = re.exec(text)) !== null) {
      const label = m[1];
      const value = (m[2] || "").trim();
      const key = labelMap[label];
      if (!result[key] && value) result[key] = value;
    }
    return result;
  }
  // 構造化抽出結果を draft に反映 (フィールド毎に値の二次パース)
  function applyStructuredOverrides(draft, s) {
    if (!s) return;

    if (s.tireSize) {
      const m = s.tireSize.match(/(\d{3})\s*[\/／、,]?\s*(\d{2,3})\s*[\/／、,]?\s*[Rｒ]\s*(\d{2})/);
      if (m) draft.tireSize = `${m[1]}/${m[2]}R${m[3]}`;
      else draft.tireSize = s.tireSize;
    }
    if (s.qty) {
      const m = s.qty.match(/(\d+)/);
      if (m) draft.qty = Number(m[1]);
    }
    // v3.15: 単価の構造化抽出
    if (s.unitPrice) {
      let amount = 0;
      const m = s.unitPrice.match(/([0-9,]+)/);
      if (m) amount = Number(m[1].replace(/,/g, ""));
      if (!amount) {
        const k = parseKanjiYen(s.unitPrice);
        if (k) amount = k;
      }
      if (amount) draft.unitPrice = amount;
    }
    if (s.carModel) draft.carModel = s.carModel;
    if (s.carNumber) {
      const m = s.carNumber.match(/([一-龥]{1,3})\s*(\d{2,3})\s*([ぁ-ん])\s*(\d{1,2})\s*[-‐‑‒–—－―]?\s*(\d{1,4})/);
      if (m) draft.carNumber = `${m[1]} ${m[2]} ${m[3]} ${m[4]}-${m[5]}`;
      else draft.carNumber = s.carNumber;
    }
    if (s.total) {
      let amount = 0;
      const m = s.total.match(/([0-9,]+)/);
      if (m) amount = Number(m[1].replace(/,/g, ""));
      if (!amount) {
        const k = parseKanjiYen(s.total);
        if (k) amount = k;
      }
      if (amount) draft.total = amount;
    }
    if (s.paymentMethod) {
      const payRules = [
        [/売掛|掛け売り|掛売/, "売掛"],
        [/現金/, "現金"],
        [/(?:クレジット|VISA|JCB|AMEX|カード)/i, "クレジットカード"],
        [/(?:QR|PayPay|ペイペイ|d払い|楽天ペイ|au\s*PAY)/i, "QR決済"],
        [/振込|銀行/, "銀行振込"]
      ];
      for (const [pat, val] of payRules) {
        if (pat.test(s.paymentMethod)) { draft.paymentMethod = val; break; }
      }
    }
    if (s.salesCategories) {
      const candidates = s.salesCategories.split(/[、,]/);
      const matched = [];
      for (const cand of candidates) {
        const c = cand.trim();
        if (!c) continue;
        if (SALES_CATEGORIES.includes(c)) { matched.push(c); continue; }
        if (/新品/.test(c))         matched.push("新品タイヤ販売");
        else if (/中古/.test(c))    matched.push("中古タイヤ販売");
        else if (/工賃|交換/.test(c)) matched.push("タイヤ交換工賃");
        else if (/バランス/.test(c)) matched.push("バランス調整");
        else if (/廃タイヤ|処分/.test(c)) matched.push("廃タイヤ処分料");
        else if (/バルブ/.test(c))  matched.push("バルブ交換");
        else if (/パンク/.test(c))  matched.push("パンク修理");
        else if (/ホイール/.test(c)) matched.push("ホイール販売");
        else                         matched.push("その他");
      }
      if (matched.length) draft.salesCategories = [...new Set(matched)];
    }
    if (s.productName) draft.productName = s.productName;
    if (s.workContent) draft.workContent = s.workContent;
    if (s.note) {
      draft.note = s.note;
      // 備考に「○○様」が含まれ、free-form が同じ名前を customer に入れていたらクリア
      const ncm = s.note.match(/([一-龥ぁ-んァ-ヶー]{2,8})様/);
      if (ncm && draft.customer === `${ncm[1]}様`) draft.customer = "";
    }
    if (s.customer) {
      draft.customer = s.customer.endsWith("様") ? s.customer : `${s.customer}様`;
    }
  }

  // ================== v3.1: AIモック 経費テキスト解析 ==================
  function newEmptyExpenseDraft() {
    return {
      date: todayKey(),
      storeName: DEFAULT_STORE_NAME,
      staff: DEFAULT_STAFF,
      vendor: "",
      content: "",
      amount: 0,
      taxAmount: 0,
      paymentMethod: "",
      aiCategory: "",        // AI 分類科目（snapshot）
      category: "",          // 現在の科目（店長/本社が変更可）
      aiCandidates: [],      // [{cat, score}] Top3
      ocrText: "",
      receiptThumb: "🧾",
      receiptDataUrl: "",
      memoText: "",          // 経費内容メモ（音声/テキスト）
      note: ""
    };
  }
  // テキストから経費項目を抽出（音声入力 / メモ用）
  // ===== v3.17.2: OCRレシート専用 抽出ロジック =====
  // OCR文字列の数字をそのまま拾わず、キーワード近傍を優先し、税率(8/10)・小さな数字・電話/伝票番号を除外する。
  // confidence:
  //   "high"   : 「合計/総合計/税込合計/お支払金額/請求金額」キーワード直近の金額
  //   "medium" : 「税込/クレジット支払/カード支払/現金/お預り/お買上金額」キーワード直近の金額
  //   "low"    : ¥プレフィクス/円サフィクス付き数字の最大値 (キーワード手掛かりなし)
  //   "none"   : 抽出不可 (OCR文字化け等)
  function extractAmountFromReceipt(text) {
    if (!text) return { amount: 0, confidence: "none" };
    const T = String(text);
    // === Priority A: 総合計 / 合計（税込）/ 税込合計 ===
    const a = T.match(/(?:総合計|合計\s*[\(（]?\s*税込\s*[\)）]?|税込合計)\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/);
    if (a) { const v = Number(a[1].replace(/,/g, "")); if (v >= 10) return { amount: v, confidence: "high" }; }
    // === Priority B: お支払い金額 / お支払合計 / 請求金額 ===
    const b = T.match(/(?:お?支払(?:い)?(?:金額|合計)|請求金額)\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/);
    if (b) { const v = Number(b[1].replace(/,/g, "")); if (v >= 10) return { amount: v, confidence: "high" }; }
    // === Priority C: 「合計」(小計を除外) — 最後の出現を採用 (通常レシート末尾が総合計) ===
    // Safari 16.3 以前で lookbehind が parse error になるため、ループで「小計」を除外する
    const cMatches = [];
    const cRe = /合計\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/g;
    let cm;
    while ((cm = cRe.exec(T)) !== null) {
      if (T.charAt(cm.index - 1) !== "小") cMatches.push(cm);
    }
    if (cMatches.length) {
      const last = cMatches[cMatches.length - 1];
      const v = Number(last[1].replace(/,/g, ""));
      if (v >= 10) return { amount: v, confidence: "high" };
    }
    // === Priority D: 税込 (合計を含まないため確度はやや下) ===
    const d = T.match(/税込(?!合計)\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/);
    if (d) { const v = Number(d[1].replace(/,/g, "")); if (v >= 10) return { amount: v, confidence: "medium" }; }
    // === Priority E: クレジット支払/カード支払/VISA/Master/JCB/AMEX 近傍 ===
    const e = T.match(/(?:クレジット支払|カード支払|VISA|Master(?:card)?|JCB|AMEX|American\s*Express)\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/i);
    if (e) { const v = Number(e[1].replace(/,/g, "")); if (v >= 50) return { amount: v, confidence: "medium" }; }
    // === Priority F: 現金/お預[かり]/お買上[げ]?金額 ===
    const f = T.match(/(?:現金|お預[かりり]|お買上(?:げ)?金額)\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/);
    if (f) { const v = Number(f[1].replace(/,/g, "")); if (v >= 50) return { amount: v, confidence: "medium" }; }
    // === Priority G: ¥プレフィクス/円サフィクスの数字から最大値 (≧50円のみ・低信頼) ===
    const marked = [];
    for (const m of T.matchAll(/[¥￥]\s*([0-9][0-9,]+)/g)) marked.push(Number(m[1].replace(/,/g, "")));
    for (const m of T.matchAll(/([0-9][0-9,]+)\s*円(?!引)/g)) marked.push(Number(m[1].replace(/,/g, "")));
    const filtered = marked.filter(v => v >= 50 && v < 100000000);
    if (filtered.length) return { amount: Math.max.apply(null, filtered), confidence: "low" };
    return { amount: 0, confidence: "none" };
  }

  // 消費税抽出: 「消費税等/税額/内消費税/消費税(8%)/消費税(10%)」キーワード直近の金額。8/10 単独はレートとして除外。
  function extractTaxFromReceipt(text) {
    if (!text) return 0;
    const T = String(text);
    const candidates = [];
    const patterns = [
      /消費税(?:等)?(?:\s*[\(（]?\s*(?:8|10)\s*%\s*[\)）]?)?\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/g,
      /税額\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/g,
      /内消費税\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]+)\s*円?/g
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(T)) !== null) {
        const v = Number(m[1].replace(/,/g, ""));
        if (v > 0 && v !== 8 && v !== 10) candidates.push(v);
      }
    }
    return candidates.length ? candidates[0] : 0;
  }

  // OCR用 購入先抽出 (parseExpenseText 内のリストと同等。OCRに頻出のコンビニ・カー用品店を網羅)
  function extractVendorFromReceipt(text) {
    if (!text) return "";
    const T = String(text);
    const vendors = [
      // セブン系 (7&i 表記対応)
      ["セブン-イレブン", "セブンイレブン"], ["セブンイレブン", "セブンイレブン"], ["7\\s*&\\s*i", "セブンイレブン"], ["セブン", "セブンイレブン"],
      // コンビニ
      ["ローソン", "ローソン"], ["ファミリーマート", "ファミリーマート"], ["ファミマ", "ファミリーマート"],
      ["ミニストップ", "ミニストップ"], ["デイリーヤマザキ", "デイリーヤマザキ"],
      // ガソリンスタンド
      ["ENEOS", "ENEOS"], ["エネオス", "ENEOS"],
      ["コスモ石油", "コスモ石油"], ["出光", "出光興産"], ["昭和シェル", "昭和シェル"],
      // ホームセンター・カー用品店
      ["カインズ", "カインズ"], ["コメリ", "ホームセンターコメリ"],
      ["ホームセンター", "ホームセンター"], ["ビバホーム", "ビバホーム"],
      ["オートバックス", "オートバックス"], ["イエローハット", "イエローハット"],
      // 公共料金・通信
      ["東京電力", "東京電力エナジーパートナー"], ["TEPCO", "東京電力エナジーパートナー"],
      ["NTTドコモ", "NTTドコモ"], ["ドコモ", "NTTドコモ"],
      ["ソフトバンク", "ソフトバンク"], ["楽天モバイル", "楽天モバイル"],
      // タイヤ仕入
      ["ブリヂストンタイヤジャパン", "ブリヂストンタイヤジャパン"],
      ["ブリヂストン", "ブリヂストン"], ["ヨコハマタイヤ", "ヨコハマタイヤ"],
      ["タイヤ卸", "タイヤ卸業者"],
      // 広告・産廃
      ["タウンワーク", "タウンワーク掲載料"], ["リクルート", "リクルート"], ["産廃", "産業廃棄物処理業者"],
      // スーパー
      ["イオン", "イオン"], ["ヨーカドー", "イトーヨーカドー"], ["ライフ", "ライフ"]
    ];
    for (const [needle, val] of vendors) {
      const re = new RegExp(needle);
      if (re.test(T)) return val;
    }
    return "";
  }

  // OCR用 支払方法抽出
  function extractPaymentFromReceipt(text) {
    if (!text) return "";
    const T = String(text);
    const rules = [
      [/口座引落|引落/, "口座引落"],
      [/銀行振込|振込/, "銀行振込"],
      [/(?:クレジット支払|クレジット|クレカ|カード支払|VISA|Master(?:card)?|JCB|AMEX|American\s*Express|ダイナース|UnionPay|銀聯)/i, "クレジットカード"],
      [/QR(?:コード)?(?:決済)?|PayPay|d払い|au\s*PAY|楽天ペイ|メルペイ/i, "QR決済"],
      [/(?:現金|釣銭|お?釣り|お?預[かりり]|お預り)/, "現金"]
    ];
    for (const [re, val] of rules) if (re.test(T)) return val;
    return "";
  }

  // OCR用 日付抽出
  function extractDateFromReceipt(text) {
    if (!text) return "";
    const dm = String(text).match(/(20\d{2})[\/年.\-\s]+(\d{1,2})[\/月.\-\s]+(\d{1,2})/);
    if (!dm) return "";
    const y = dm[1];
    const mn = String(Math.min(12, Math.max(1, +dm[2]))).padStart(2, "0");
    const dd = String(Math.min(31, Math.max(1, +dm[3]))).padStart(2, "0");
    return `${y}-${mn}-${dd}`;
  }

  // 内容欄の自動要約 (OCR全文を絶対に「内容」へ流し込まない)
  // 推定確度に応じた短い要約を返す。
  //   - 高信頼カテゴリ (score≥0.80) があれば「ガソリン代」「タイヤ仕入」等の短いラベル
  //   - 購入先のみ判明 → 「<購入先>購入分」
  //   - どちらも不明だがOCR/メモテキストはある → 「レシート内容 要確認」
  //   - 全く何もない → 空欄
  function summarizeReceiptContent(vendor, topCandidate, hasText) {
    const cat = topCandidate ? topCandidate.cat : "";
    const conf = topCandidate ? Number(topCandidate.score || 0) : 0;
    const catLabel = {
      "ガソリン代":     "ガソリン代",
      "タイヤ仕入":     "タイヤ仕入",
      "工具消耗品":     "工具・消耗品購入",
      "廃タイヤ処分費": "廃タイヤ処分料",
      "通信費":         "通信費",
      "広告宣伝費":     "広告宣伝費",
      "店舗備品":       "店舗備品購入",
      "車両関連費":     "車両関連費",
      "修繕費":         "修繕費",
      "外注費":         "外注費"
    };
    if (cat && conf >= 0.80 && catLabel[cat]) return catLabel[cat];
    if (vendor) return `${vendor}購入分`;
    if (cat && conf >= 0.50 && catLabel[cat]) return catLabel[cat];
    return hasText ? "レシート内容 要確認" : "";
  }

  function parseExpenseText(text) {
    const draft = newEmptyExpenseDraft();
    if (!text) return draft;
    draft.memoText = text;
    draft.content  = text;
    draft.date     = todayKey();

    // v3.17: OCRテキストから日付を抽出（YYYY/MM/DD・YYYY-MM-DD・YYYY年MM月DD日 等）
    const dm = text.match(/(20\d{2})[\/年.\-\s]+(\d{1,2})[\/月.\-\s]+(\d{1,2})/);
    if (dm) {
      const y = dm[1], m = String(Math.min(12, +dm[2])).padStart(2, "0"), d = String(Math.min(31, +dm[3])).padStart(2, "0");
      draft.date = `${y}-${m}-${d}`;
    }

    // 金額: 優先順位 ①「総合計/合計/税込/総額/請求金額/お支払合計」キーワード近傍 → ②漢数字 → ③ 一番大きい金額
    let amount = 0;
    const totalKey = text.match(/(?:総合計|合計|税込|総額|請求金額|お?支払(?:い)?合計)\s*[:：]?\s*[¥￥]?\s*([0-9,]+)\s*円?/);
    if (totalKey) {
      amount = Number(totalKey[1].replace(/,/g, ""));
    } else {
      const k = text.match(/(\d+\s*万(?:\s*\d+\s*千)?(?:\s*\d+\s*百)?(?:\s*\d+)?)\s*円?/);
      if (k) {
        amount = parseKanjiYen(k[1]) || 0;
      } else {
        // 全ての金額候補から最大値を採用 (¥1,234 / 1,234円 / 1234)
        const cands = [];
        for (const m of text.matchAll(/[¥￥]\s*([0-9][0-9,]{2,})/g))         cands.push(Number(m[1].replace(/,/g, "")));
        for (const m of text.matchAll(/([0-9][0-9,]{2,})\s*円/g))             cands.push(Number(m[1].replace(/,/g, "")));
        if (cands.length) amount = Math.max.apply(null, cands);
      }
    }
    draft.amount = amount;
    if (amount > 0) {
      // 税込価格から消費税(10%)を逆算
      draft.taxAmount = Math.round(amount * 10 / 110);
    }

    // 購入先: 既知ベンダー名照合（順序重要：長い名称を先に）
    const vendors = [
      ["ENEOS", "ENEOS"], ["エネオス", "ENEOS"],
      ["コスモ石油", "コスモ石油"], ["出光", "出光興産"], ["昭和シェル", "昭和シェル"],
      ["カインズ", "カインズ"], ["コメリ", "ホームセンターコメリ"],
      ["ホームセンター", "ホームセンター"], ["ビバホーム", "ビバホーム"],
      ["東京電力", "東京電力エナジーパートナー"], ["TEPCO", "東京電力エナジーパートナー"],
      ["NTTドコモ", "NTTドコモ"], ["ドコモ", "NTTドコモ"],
      ["ソフトバンク", "ソフトバンク"], ["楽天モバイル", "楽天モバイル"],
      ["ブリヂストンタイヤジャパン", "ブリヂストンタイヤジャパン"],
      ["ブリヂストン", "ブリヂストン"], ["ヨコハマタイヤ", "ヨコハマタイヤ"],
      ["タイヤ卸", "タイヤ卸業者"], ["タウンワーク", "タウンワーク掲載料"],
      ["リクルート", "リクルート"], ["産廃", "産業廃棄物処理業者"],
      // v3.17: コンビニ・スーパー等を追加
      ["セブン-イレブン", "セブン-イレブン"], ["セブンイレブン", "セブン-イレブン"], ["セブン", "セブン-イレブン"],
      ["ローソン", "ローソン"], ["ファミリーマート", "ファミリーマート"], ["ファミマ", "ファミリーマート"],
      ["ミニストップ", "ミニストップ"], ["デイリーヤマザキ", "デイリーヤマザキ"],
      ["イオン", "イオン"], ["ヨーカドー", "イトーヨーカドー"], ["ライフ", "ライフ"],
      ["スターバックス", "スターバックス"], ["ドトール", "ドトール"], ["マクドナルド", "マクドナルド"]
    ];
    for (const [needle, val] of vendors) {
      if (text.includes(needle)) { draft.vendor = val; break; }
    }

    // 支払方法（口座引落 / 振込 / カード / 現金 の順で判定）
    // v3.17: VISA/Master/JCB/AMEX/釣銭/お預り 等を追加
    const payRules = [
      [/口座引落|引落/, "口座引落"],
      [/銀行振込|振込/, "銀行振込"],
      [/(?:クレジット|クレカ|カード|VISA|Master(?:card)?|JCB|AMEX|American\s*Express|ダイナース|UnionPay|銀聯)/i, "クレジットカード"],
      [/QR(?:コード)?(?:決済)?|PayPay|d払い|au\s*PAY|楽天ペイ|メルペイ/i, "QR決済"],
      [/(?:現金|釣銭|お?釣り|お?預[かりり]|お預り)/, "現金"]
    ];
    for (const [pat, val] of payRules) {
      if (pat.test(text)) { draft.paymentMethod = val; break; }
    }

    // OCR テキストが無い場合のフォールバック表示
    draft.ocrText = `[音声/テキスト入力]\n--------------------\n${text}`;

    return draft;
  }

  // テキスト or OCR 内容から AI 分類候補 (top3) を返却
  function classifyExpense(textBlob) {
    const ja = String(textBlob || "");
    // [pattern, category, baseScore]
    const rules = [
      [/タイヤ仕入|タイヤ卸|納品書.*タイヤ|レグノ|エナセーブ|プライマシー|アイスガード|ブルーアース|ポテンザ/i, "タイヤ仕入", 0.95],
      [/ブリヂストン.*仕入|ヨコハマタイヤ.*仕入|ダンロップ.*仕入|タイヤ.*入荷|タイヤ.*納品書|タイヤ.*請求書/i, "タイヤ仕入", 0.85],
      [/廃タイヤ.*処分|タイヤ.*処分料|産業廃棄物.*タイヤ|マニフェスト/i, "廃タイヤ処分費", 0.94],
      [/ENEOS|エネオス|出光|シェル|コスモ石油|レギュラー|ハイオク|軽油/i, "ガソリン代", 0.93],
      [/ガソリン|燃料/i, "ガソリン代", 0.85],
      [/(?:カインズ|ホームセンター|コメリ|ビバホーム|DIY)/i, "工具消耗品", 0.88],
      [/工具|パーツクリーナー|ドライバー|スパナ|レンチ|軍手|タイヤワックス/i, "工具消耗品", 0.90],
      [/(?:ドコモ|ソフトバンク|au|UQ|楽天モバイル)|電話料金|通信費|インターネット|プロバイダ|wi-?fi/i, "通信費", 0.94],
      [/求人.*広告|広告.*料|タウンワーク|チラシ|ポスター|バナー|リスティング|広告/i, "広告宣伝費", 0.92],
      [/オイル交換|ワイパー|バッテリー交換|車検|車両.*メンテ/i, "車両関連費", 0.88],
      [/修理代|修繕|メンテナンス|配管|ペンキ/, "修繕費", 0.85],
      [/外注|業務委託|清掃|警備|出張/i, "外注費", 0.82],
      [/事務用品|文房具|文具|備品|店舗用品|看板|什器/i, "店舗備品", 0.85],
      [/電力|電気代|ガス代|水道|TEPCO|東京電力/i, "雑費", 0.55]
    ];
    const scored = [];
    for (const [pat, cat, score] of rules) {
      if (pat.test(ja)) {
        const existing = scored.find(s => s.cat === cat);
        if (existing) {
          existing.score = Math.min(0.99, existing.score + 0.04);
        } else {
          scored.push({ cat, score });
        }
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3);
    // 候補が3未満ならフィラを足す
    const fillers = ["雑費", "その他", "店舗備品"];
    for (const f of fillers) {
      if (top.length >= 3) break;
      if (!top.some(t => t.cat === f)) top.push({ cat: f, score: 0.20 - top.length * 0.04 });
    }
    return top;
  }

  // ================== 状態 ==================
  let records = loadAll();
  let currentRole = "store";
  let draftSale = null;
  let draftExpense = null;
  let pendingRejectId = null;
  let pendingFilter = "all";
  // v3.2: HQ一覧のソート状態（desc: 新しい順 / asc: 古い順）
  let hqSort = { sales: "desc", expenses: "desc", pending: "desc" };

  // ================== ルーティング ==================
  function setRole(role) {
    currentRole = role;
    document.body.dataset.role = role;
    $$(".role-btn").forEach(b => {
      const on = b.dataset.role === role;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".role-pane").forEach(p => { p.hidden = p.dataset.pane !== role; });
    if (role === "hq") setHQTab("dashboard");
    else goScreen("store-home");
    renderAll();
  }
  function goScreen(name) {
    $$('[data-pane="store"] .screen').forEach(s => s.classList.toggle("active", s.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    // 画面ごとのレンダリング
    if (name === "store-home")             renderStoreDashboard();
    if (name === "store-today-sales")      renderStoreTodaySales();
    if (name === "store-today-expenses")   renderStoreTodayExpenses();
    if (name === "store-rejections")       renderStoreRejections();
    // v3.15: 売上音声入力画面を開いた時に textarea が空ならテンプレートを初期表示
    if (name === "store-sales-voice") {
      const ta = $("#voiceTranscript");
      if (ta && !ta.value.trim()) {
        ta.value = VOICE_TEMPLATE;
      }
    }
  }
  function setHQTab(name) {
    $$(".hq-nav-item").forEach(b => b.classList.toggle("active", b.dataset.hqTab === name));
    $$(".hq-screen").forEach(s => s.classList.toggle("active", s.dataset.hqScreen === name));
    if (name === "dashboard")     renderHQDashboard();
    if (name === "sales")         renderHQSales();
    if (name === "sales-report")  renderSalesReport();
    if (name === "expenses")      renderHQExpenses();
    if (name === "pending")       renderHQPending();
    if (name === "monthly")       { ensureMonthPicker(); renderMonthly(); }
    if (name === "csv")           renderHQCSV();
  }
  function ensureMonthPicker() {
    const p = $("#monthlyPicker");
    if (!p.value) p.value = monthKey(new Date());
  }

  // ================== 店舗: ダッシュボード ==================
  function renderStoreDashboard() {
    $("#greetingDate").textContent = fmtGreeting(new Date());

    const today = todayKey();
    const ym = monthKey(new Date());
    const todaySales   = records.filter(r => r.type === "sale"    && isSameDay(r.createdAt, today));
    const todayExpense = records.filter(r => r.type === "expense" && isSameDay(r.createdAt, today));
    const monthSales   = records.filter(r => r.type === "sale"    && isInMonth(r.createdAt, ym));
    const salesAmount     = todaySales.reduce((s,r) => s + r.total, 0);
    const monthSalesAmt   = monthSales.reduce((s,r) => s + r.total, 0);
    const expenseAmount   = todayExpense.reduce((s,r) => s + r.amount, 0);
    const cost          = todayExpense.filter(isCostCategory).reduce((s,r) => s + r.amount, 0);
    const opex          = todayExpense.filter(r => !isCostCategory(r)).reduce((s,r) => s + r.amount, 0);
    const gross         = salesAmount - cost - opex;
    const pending       = records.filter(r => r.status === "未確認").length;
    const reject        = records.filter(r => r.status === "修正依頼").length;

    $("#todaySalesAmount").textContent      = yen(salesAmount);
    $("#todaySalesCount").textContent       = `${todaySales.length}件`;
    $("#storeMonthSalesAmount").textContent = yen(monthSalesAmt);          // v3.16
    $("#storeMonthSalesCount").textContent  = `${monthSales.length}件`;     // v3.16
    $("#todayExpenseAmount").textContent    = yen(expenseAmount);
    $("#todayExpenseCount").textContent     = `${todayExpense.length}件`;
    $("#todayGross").textContent            = yen(gross);
    $("#storePending").textContent          = String(pending);
    $("#storeReject").textContent           = String(reject);

    $("#actionSalesSub").textContent  = `${todaySales.length}件 / ${yen(salesAmount)}`;
    $("#actionExpenseSub").textContent= `${todayExpense.length}件 / ${yen(expenseAmount)}`;
    $("#actionRejectSub").textContent = `${reject}件`;

    const banner = $("#rejectionBanner");
    const badge = $("#actionRejectBadge");
    const alertRow = document.querySelector('.action-row.alert');
    if (reject > 0) {
      banner.hidden = false;
      $("#rbCount").textContent = String(reject);
      badge.hidden = false;
      badge.textContent = String(reject);
      if (alertRow) alertRow.classList.add("has-items");
    } else {
      banner.hidden = true;
      badge.hidden = true;
      if (alertRow) alertRow.classList.remove("has-items");
    }
  }

  // ================== 店舗: 本日の売上一覧 ==================
  function renderStoreTodaySales() {
    const today = todayKey();
    const list = records.filter(r => r.type === "sale" && isSameDay(r.createdAt, today))
                        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = list.reduce((s,r) => s + r.total, 0);
    $("#todaySalesListTotal").textContent = yen(total);
    $("#todaySalesListCount").textContent = `${list.length}件`;
    const el = $("#todaySalesList");
    if (!list.length) { el.innerHTML = `<div class="recent-empty">本日の売上はまだありません</div>`; return; }
    el.innerHTML = list.map(recentRow).join("");
    bindRecentClicks(el);
  }
  function renderStoreTodayExpenses() {
    const today = todayKey();
    const list = records.filter(r => r.type === "expense" && isSameDay(r.createdAt, today))
                        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = list.reduce((s,r) => s + r.amount, 0);
    $("#todayExpenseListTotal").textContent = yen(total);
    $("#todayExpenseListCount").textContent = `${list.length}件`;
    const el = $("#todayExpenseList");
    if (!list.length) { el.innerHTML = `<div class="recent-empty">本日の経費はまだありません</div>`; return; }
    el.innerHTML = list.map(recentRow).join("");
    bindRecentClicks(el);
  }
  function renderStoreRejections() {
    const list = records.filter(r => r.status === "修正依頼")
                        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const lead = $("#rejectionLead");
    if (!list.length) {
      lead.innerHTML = `現在、本社からの修正依頼はありません。`;
      lead.style.background = "#dff5e8";
      lead.style.borderColor = "#9be0b9";
      lead.style.color = "#0a7a4d";
    } else {
      lead.innerHTML = `本社から <strong>${list.length}件</strong> の修正依頼が届いています。<br/>内容を確認し、必要な項目を修正して再提出してください。`;
      lead.style.background = "";
      lead.style.borderColor = "";
      lead.style.color = "";
    }
    const el = $("#rejectionsList");
    if (!list.length) { el.innerHTML = ""; return; }
    el.innerHTML = list.map(rejectionCardV2).join("");
    bindRejectionCardActions(el);
  }
  // v3.5: 修正依頼カード v2 (情報リッチ + 3ボタン)
  function rejectionCardV2(r) {
    const isSale = r.type === "sale";
    const date = r.date || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "—");
    const title = isSale
      ? `${r.customer || "—"} / ${r.productName || (r.items && r.items[0] && r.items[0].name) || "—"}`
      : (r.vendor || "—");
    const amount = isSale ? r.total : r.amount;
    const rej = r.rejection || { note: "（修正依頼コメントなし）", at: r.createdAt };
    const rejAt = rej.at ? fmtFullDate(rej.at) : "—";
    return `
      <div class="rejection-card-v2" data-id="${r.id}">
        <div class="rcv-header">
          <span class="rcv-tag ${isSale ? "sales" : "expense"}">${isSale ? "売上" : "経費"}</span>
          <span class="rcv-date">📅 ${escapeHtml(date)}</span>
          ${statusPill(r.status)}
        </div>
        <div class="rcv-title">${escapeHtml(title)}</div>
        <div class="rcv-amount">${yen(amount)}</div>
        <div class="rcv-rejection">
          <div class="rcv-rej-label">⚠️ 本社からの修正依頼</div>
          <div class="rcv-rej-text">${escapeHtml(rej.note)}</div>
          <div class="rcv-rej-at">送信日時: ${rejAt}</div>
        </div>
        <div class="rcv-actions">
          <button type="button" class="btn ghost"   data-rej-action="detail">👁 詳細を見る</button>
          <button type="button" class="btn primary" data-rej-action="edit">✏️ 修正する</button>
          <button type="button" class="btn success" data-rej-action="edit-submit">📤 修正して再提出</button>
        </div>
      </div>
    `;
  }
  function bindRejectionCardActions(root) {
    root.querySelectorAll("[data-rej-action]").forEach(b => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = b.closest("[data-id]");
        if (!card) return;
        const id = card.dataset.id;
        switch (b.dataset.rejAction) {
          case "detail":       openDetail(id); break;
          case "edit":
          case "edit-submit":  openStoreEditModal(id); break;
        }
      });
    });
  }
  function recentRow(r) {
    const isSale = r.type === "sale";
    const title = recordTitle(r);
    const amount = yen(recordAmount(r));
    return `
      <div class="recent-item" data-id="${r.id}">
        <div class="ri-left">
          <span class="ri-tag ${isSale ? "sales" : "expense"}">${isSale ? "売上" : "経費"}</span>
          <div class="ri-title">${escapeHtml(title)}</div>
          <div class="ri-sub">${fmtDate(r.createdAt)} ・ ${escapeHtml(r.paymentMethod || "")}</div>
        </div>
        <div class="ri-right">
          <div class="ri-amount">${amount}</div>
          ${statusPill(r.status)}
        </div>
      </div>
    `;
  }
  function bindRecentClicks(root) {
    root.querySelectorAll(".recent-item").forEach(c => {
      c.addEventListener("click", () => openDetail(c.dataset.id));
    });
  }

  // ================== 売上: 音声入力 (v3.11) ==================
  // メイン導線: スマホ標準キーボードの音声入力ボタンを利用
  //   1. 「📱 スマホ音声入力を使う」ボタン → textareaにフォーカス → スマホでキーボード起動
  //   2. または 入力欄を直接タップ → 同上
  // 補助: サンプル音声を入れる / クリア
  // 確定: 🤖 AIで分解する → 確認画面へ
  // ※ ブラウザ録音/Web Speech API は使用しません(API料金不要)
  function setupVoiceUI() {
    // 「スマホ音声入力を使う」ボタン: textareaにフォーカス→キーボード起動
    $("#useKeyboardVoiceBtn").addEventListener("click", () => {
      const ta = $("#voiceTranscript");
      ta.focus();
      // モバイルではフォーカスでキーボードが立ち上がる。textareaが画面内に入るよう微調整。
      setTimeout(() => {
        try { ta.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_e) {}
      }, 50);
    });

    // サンプル音声テキスト投入
    $("#sampleVoiceBtn").addEventListener("click", () => {
      const sample = VOICE_SAMPLES[Math.floor(Math.random() * VOICE_SAMPLES.length)];
      $("#voiceTranscript").value = sample;
      $("#voiceTranscript").focus();
      toast("サンプル音声テキストを入れました");
    });

    // v3.15: 入力テンプレート投入 (12項目・日付/店舗/担当者は除外)
    $("#templateVoiceBtn").addEventListener("click", () => {
      $("#voiceTranscript").value = VOICE_TEMPLATE;
      $("#voiceTranscript").focus();
      toast("テンプレートを入れました。各項目に音声入力してください");
    });

    // クリア (v3.15: 完全空欄ではなくテンプレートを再表示)
    $("#clearVoiceBtn").addEventListener("click", () => {
      $("#voiceTranscript").value = VOICE_TEMPLATE;
      $("#voiceTranscript").focus();
      toast("テンプレートを再表示しました");
    });

    // AIで分解する → 確認画面へ
    $("#parseBtn").addEventListener("click", () => {
      const text = ($("#voiceTranscript").value || "").trim();
      if (!text) {
        toast("音声テキストを入力してください");
        $("#voiceTranscript").focus();
        return;
      }
      $("#salesAILoading").hidden = false;
      setTimeout(() => {
        $("#salesAILoading").hidden = true;
        draftSale = parseVoiceText(text);
        renderSalesConfirm();
        goScreen("store-sales-confirm");
      }, 1200);
    });
  }

  // ================== 売上: 確認画面 (v3) ==================
  function renderSalesConfirm() {
    if (!draftSale) draftSale = newEmptySalesDraft();
    // 大型サマリー
    $("#confTotal").value      = draftSale.total || "";
    $("#confQty").value        = draftSale.qty || "";
    $("#confUnitPrice").value  = draftSale.unitPrice || "";
    // 基本情報
    $("#confDate").value       = draftSale.date || todayKey();
    $("#confStoreName").value  = draftSale.storeName || DEFAULT_STORE_NAME;
    $("#confStaff").value      = draftSale.staff || DEFAULT_STAFF;
    $("#confCustomer").value   = draftSale.customer || "";
    // 車両
    $("#confCarModel").value   = draftSale.carModel || "";
    $("#confCarNumber").value  = draftSale.carNumber || "";
    // 商品
    $("#confProductName").value = draftSale.productName || "";
    $("#confTireSize").value    = draftSale.tireSize || "";
    // 作業内容/備考
    $("#confWorkContent").value = draftSale.workContent || "";
    $("#confNote").value        = draftSale.note || "";

    renderSalesCatChips();
    renderPayButtons("#paymentMethods", draftSale.paymentMethod, (val) => {
      draftSale.paymentMethod = val;
      renderPayButtons("#paymentMethods", val);
    });
  }
  // 売上区分チップ（複数選択トグル）
  function renderSalesCatChips() {
    const wrap = $("#salesCatChips");
    wrap.innerHTML = SALES_CATEGORIES.map(c => `
      <button type="button" class="cat-chip ${draftSale.salesCategories.includes(c) ? "active" : ""}" data-sale-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
    `).join("");
    wrap.querySelectorAll("[data-sale-cat]").forEach(b => {
      b.addEventListener("click", () => {
        const cat = b.dataset.saleCat;
        const i = draftSale.salesCategories.indexOf(cat);
        if (i >= 0) draftSale.salesCategories.splice(i, 1);
        else draftSale.salesCategories.push(cat);
        renderSalesCatChips();
      });
    });
  }
  function renderPayButtons(sel, active, onPick) {
    const wrap = $(sel);
    wrap.querySelectorAll(".pay-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.pay === active);
      if (onPick) b.onclick = () => onPick(b.dataset.pay);
    });
  }

  function setupSalesConfirm() {
    // 数値フィールド
    $("#confTotal").addEventListener("input",     e => draftSale.total     = Number(e.target.value || 0));
    $("#confQty").addEventListener("input",       e => draftSale.qty       = Number(e.target.value || 0));
    $("#confUnitPrice").addEventListener("input", e => draftSale.unitPrice = Number(e.target.value || 0));
    // 基本情報
    $("#confDate").addEventListener("input",      e => draftSale.date      = e.target.value);
    $("#confStoreName").addEventListener("input", e => draftSale.storeName = e.target.value);
    $("#confStaff").addEventListener("input",     e => draftSale.staff     = e.target.value);
    $("#confCustomer").addEventListener("input",  e => draftSale.customer  = e.target.value);
    // 車両
    $("#confCarModel").addEventListener("input",  e => draftSale.carModel  = e.target.value);
    $("#confCarNumber").addEventListener("input", e => draftSale.carNumber = e.target.value);
    // 商品
    $("#confProductName").addEventListener("input", e => draftSale.productName = e.target.value);
    $("#confTireSize").addEventListener("input",    e => draftSale.tireSize    = e.target.value);
    // 作業内容/備考
    $("#confWorkContent").addEventListener("input", e => draftSale.workContent = e.target.value);
    $("#confNote").addEventListener("input",        e => draftSale.note        = e.target.value);

    // 登録
    $("#confirmSalesBtn").addEventListener("click", () => {
      if (!draftSale.total || draftSale.total <= 0)   { toast("合計金額を入力してください"); $("#confTotal").focus(); return; }
      if (!draftSale.qty || draftSale.qty <= 0)       { toast("数量を入力してください"); $("#confQty").focus(); return; }
      if (!draftSale.paymentMethod)                   { toast("支払方法を選択してください"); return; }
      if (!draftSale.salesCategories.length)          { toast("売上区分を1つ以上選択してください"); return; }

      // items[] を旧フォーマット互換で自動生成（一覧表示・CSV出力との互換のため）
      const itemName = (draftSale.productName || draftSale.salesCategories[0] || "売上")
                     + (draftSale.tireSize ? ` ${draftSale.tireSize}` : "");
      const items = [{
        name: itemName,
        qty: Number(draftSale.qty) || 1,
        unitPrice: Number(draftSale.unitPrice) || 0
      }];

      const rec = {
        id: uid(), type: "sale",
        createdAt: new Date().toISOString(),
        // v3
        date: draftSale.date || todayKey(),
        storeName: draftSale.storeName || DEFAULT_STORE_NAME,
        staff: draftSale.staff || DEFAULT_STAFF,
        carModel: draftSale.carModel || "",
        carNumber: draftSale.carNumber || "",
        productName: draftSale.productName || "",
        tireSize: draftSale.tireSize || "",
        qty: Number(draftSale.qty) || 1,
        unitPrice: Number(draftSale.unitPrice) || 0,
        salesCategories: [...draftSale.salesCategories],
        workContent: draftSale.workContent || "",
        // 共通
        customer: draftSale.customer || "",
        items: items,
        total: Number(draftSale.total) || 0,
        paymentMethod: draftSale.paymentMethod,
        note: draftSale.note || "",
        voiceTranscript: draftSale.voiceTranscript || "",
        status: "未確認"
      };
      records.push(rec); saveAll(records);
      $("#doneSalesAmount").textContent = yen(rec.total);
      goScreen("store-sales-done");
      draftSale = null;
      // 音声画面のリセット (v3.11: micBtn は廃止、textareaのみクリア)
      $("#voiceTranscript").value = "";
      renderAll();
    });
  }

  // ================== v3.1: 経費 アップロード ==================
  // 状態: 画像 (file or sample) + メモ。OCR読取で draft を構築、AI分類で確認画面へ。
  // v3.17: ocrSource = "real" | "sample" | "memo" | "empty"
  //   - "real":   ユーザーがアップロードしたレシート画像 + Tesseract.js
  //   - "sample": サンプルカードを選択した場合のみ (固定OCRテキスト)
  //   - "memo":   画像なし + メモ欄のみ
  //   - "empty":  画像も読取結果もメモもない (確認画面の項目は空欄)
  let _expenseUploadCtx = null; // { sample, dataUrl, fileName, icon, ocrText, ocrSource }
  function _resetExpenseUploadUI() {
    _expenseUploadCtx = null;
    $("#receiptInput").value = "";
    $("#receiptImg").src = "";
    $("#receiptPreview").hidden = true;
    $("#expenseMemoText").value = "";
    $("#ocrPreviewCard").hidden = true;
    const ta = $("#ocrPreviewText"); if (ta) ta.value = "";
    $("#ocrFieldsPreview").innerHTML = "";
    hideOCRProgress();
    setOCRStatusChip("idle");
  }

  // v3.17: OCR利用状況チップ (画面常時表示・実OCRかサンプルかを明示)
  function setOCRStatusChip(state) {
    const el = $("#ocrSourceStatus");
    if (!el) return;
    const map = {
      idle:    { txt: "未読取",                klass: "idle"   },
      real:    { txt: "実OCR結果を使用中",     klass: "real"   },
      sample:  { txt: "サンプルOCR結果を使用中", klass: "sample" },
      memo:    { txt: "メモテキストを使用中",   klass: "memo"   },
      working: { txt: "OCR読取中…",            klass: "working"}
    };
    const cur = map[state] || map.idle;
    el.textContent = cur.txt;
    el.dataset.state = cur.klass;
  }

  // v3.17: 開発確認用デバッグ表示 (画面下部・小さく)
  function logOCRDebug(source, text, draft) {
    const lines = [
      `OCR source: ${source}`,
      `OCR text length: ${(text || "").length}`,
      `detected vendor: ${draft && draft.vendor || "(none)"}`,
      `detected total amount: ${draft && draft.amount || 0}`,
      `detected category: ${draft && draft.aiCandidates && draft.aiCandidates[0] && draft.aiCandidates[0].cat || "(none)"}`
    ];
    // console
    try { console.debug("[v3.17 OCR]", { source, len: (text||"").length, vendor: draft && draft.vendor, amount: draft && draft.amount, top: draft && draft.aiCandidates && draft.aiCandidates[0] }); } catch (_) {}
    // 画面下部 (debug strip)
    const dbg = $("#ocrDebug");
    if (dbg) {
      dbg.hidden = false;
      dbg.textContent = lines.join(" / ");
    }
  }

  // ===== v3.17: Tesseract.js 遅延ロード =====
  let _tesseractPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_tesseractPromise) return _tesseractPromise;
    _tesseractPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("Tesseract.js のロードに失敗しました"));
      };
      s.onerror = () => reject(new Error("Tesseract.js CDN への接続に失敗しました（オフライン？）"));
      document.head.appendChild(s);
    });
    return _tesseractPromise;
  }

  // ===== v3.17: OCR進捗バー =====
  function showOCRProgress(label) {
    const blk = $("#ocrProgressBlock");
    if (!blk) return;
    blk.hidden = false;
    updateOCRProgress(label || "OCR準備中…", 0);
  }
  function updateOCRProgress(label, pct) {
    const lbl = $("#ocrProgressLabel");
    const per = $("#ocrProgressPercent");
    const bar = $("#ocrProgressBarFill");
    const v = Math.max(0, Math.min(100, Math.round((pct || 0) * 100)));
    if (lbl) lbl.textContent = label || "処理中";
    if (per) per.textContent = `${v}%`;
    if (bar) bar.style.width = `${v}%`;
  }
  function hideOCRProgress() {
    const blk = $("#ocrProgressBlock"); if (blk) blk.hidden = true;
  }

  // ===== v3.17: 実OCR実行（Tesseract.js） =====
  async function runRealOCR(dataUrl) {
    showOCRProgress("OCRエンジン読込中");
    const Tess = await loadTesseract();
    updateOCRProgress("OCRエンジン読込完了", 0.05);
    const result = await Tess.recognize(dataUrl, TESSERACT_LANG, {
      logger: (m) => {
        const ja = TESSERACT_STATUS_JA[m.status] || m.status || "処理中";
        // status によって 0..1 の進捗を出す
        updateOCRProgress(ja, m.progress || 0);
      }
    });
    updateOCRProgress("完了", 1);
    setTimeout(hideOCRProgress, 600);
    return (result && result.data && result.data.text) ? result.data.text : "";
  }

  // ===== v3.17: OCRソースバッジ更新 =====
  function setOCRSourceBadge(source) {
    const el = $("#ocrSourceBadge");
    if (!el) return;
    el.dataset.source = source;
    el.textContent =
      source === "real"   ? "実OCR読取" :
      source === "sample" ? "サンプルOCR読取" :
                            "メモテキスト";
  }

  // ===== v3.17: OCRテキスト → フィールドプレビュー再描画 =====
  function refreshOCRFieldsPreview() {
    const ta = $("#ocrPreviewText");
    const text = ta ? (ta.value || "") : "";
    const memo = ($("#expenseMemoText").value || "").trim();
    // テキスト + メモ を結合してパース
    const blob = [text, memo].filter(Boolean).join("\n");
    const draft = parseExpenseText(blob || memo || text || "");
    $("#ocrFieldsPreview").innerHTML = `
      <div class="ofp-row"><span class="ofp-label">日付</span><span class="ofp-value">${escapeHtml(draft.date || "—")}</span></div>
      <div class="ofp-row"><span class="ofp-label">購入先</span><span class="ofp-value">${escapeHtml(draft.vendor || "—")}</span></div>
      <div class="ofp-row"><span class="ofp-label">金額</span><span class="ofp-value">${yen(draft.amount)}</span></div>
      <div class="ofp-row"><span class="ofp-label">消費税</span><span class="ofp-value">${yen(draft.taxAmount)}</span></div>
      <div class="ofp-row"><span class="ofp-label">支払方法</span><span class="ofp-value">${escapeHtml(draft.paymentMethod || "—")}</span></div>
      <div class="ofp-row"><span class="ofp-label">内容</span><span class="ofp-value">${escapeHtml((draft.content || "").slice(0, 60) || "—")}</span></div>
    `;
  }

  function setupExpenseUpload() {
    // 画像アップロード（v3.17: 実OCRはユーザーが「OCR読取」を押した時に実行）
    // v3.17修正: 画像アップ時は前のサンプル選択状態 / OCRプレビュー / debug をクリアし、サンプル経費が混入しないようにする
    $("#receiptInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        $("#receiptImg").src = ev.target.result;
        $("#receiptPreview").hidden = false;
        _expenseUploadCtx = {
          sample: null,                  // ← サンプルは絶対に紐づけない
          dataUrl: ev.target.result,
          fileName: file.name,
          icon: "🧾",
          ocrText: "",                   // 実OCR実行後に格納
          ocrSource: "real"
        };
        $("#ocrPreviewCard").hidden = true;
        const ta = $("#ocrPreviewText"); if (ta) ta.value = "";
        const dbg = $("#ocrDebug"); if (dbg) { dbg.hidden = true; dbg.textContent = ""; }
        setOCRStatusChip("idle");
      };
      reader.readAsDataURL(file);
    });
    $("#reUploadBtn").addEventListener("click", () => {
      _expenseUploadCtx = null;
      $("#receiptInput").value = ""; $("#receiptImg").src = "";
      $("#receiptPreview").hidden = true;
      $("#ocrPreviewCard").hidden = true;
      const ta = $("#ocrPreviewText"); if (ta) ta.value = "";
      const dbg = $("#ocrDebug"); if (dbg) { dbg.hidden = true; dbg.textContent = ""; }
      hideOCRProgress();
      setOCRStatusChip("idle");
    });

    // サンプルレシート選択（固定OCRテキスト・サンプルOCR読取として扱う）
    const grid = $("#sampleReceipts");
    grid.innerHTML = SAMPLE_RECEIPTS.map(r => `
      <div class="sample-card" data-sample="${r.id}">
        <div class="sample-thumb">${r.icon}</div>
        <div class="sample-name">${escapeHtml(r.label)}</div>
      </div>
    `).join("");
    grid.querySelectorAll(".sample-card").forEach(c => {
      c.addEventListener("click", () => {
        const sample = SAMPLE_RECEIPTS.find(r => r.id === c.dataset.sample);
        // v3.17修正: サンプル選択時は実画像 (dataUrl) とファイル選択をリセットし、混在状態を防ぐ
        _expenseUploadCtx = {
          sample,
          dataUrl: "",                  // ← 実画像は絶対に紐づけない
          fileName: sample.label,
          icon: sample.icon,
          ocrText: sample.ocrText || "",
          ocrSource: "sample"
        };
        $("#receiptInput").value = "";
        $("#receiptImg").src = "";
        $("#receiptPreview").hidden = true;
        $("#ocrPreviewCard").hidden = true;
        const ta = $("#ocrPreviewText"); if (ta) ta.value = "";
        const dbg = $("#ocrDebug"); if (dbg) { dbg.hidden = true; dbg.textContent = ""; }
        hideOCRProgress();
        setOCRStatusChip("idle");
        toast(`サンプル「${sample.label}」を選択しました`);
      });
    });

    // 経費内容メモ: サンプル投入 / クリア
    $("#sampleExpenseTextBtn").addEventListener("click", () => {
      const s = EXPENSE_VOICE_SAMPLES[Math.floor(Math.random() * EXPENSE_VOICE_SAMPLES.length)];
      $("#expenseMemoText").value = s;
      $("#expenseMemoText").focus();
      toast("サンプル経費テキストを入れました");
    });
    $("#clearExpenseTextBtn").addEventListener("click", () => {
      $("#expenseMemoText").value = "";
      $("#expenseMemoText").focus();
    });

    // OCRテキスト編集 → フィールドプレビュー再描画（debounce）
    let _ocrEditTimer = null;
    const ocrTa = $("#ocrPreviewText");
    if (ocrTa) {
      ocrTa.addEventListener("input", () => {
        clearTimeout(_ocrEditTimer);
        _ocrEditTimer = setTimeout(() => {
          // ctx.ocrText も同期しておく（AI分類時に使われる）
          if (_expenseUploadCtx) _expenseUploadCtx.ocrText = ocrTa.value || "";
          refreshOCRFieldsPreview();
        }, 250);
      });
    }
    // メモ編集中もプレビューを更新（OCRカードが表示されている場合のみ）
    $("#expenseMemoText").addEventListener("input", () => {
      if (!$("#ocrPreviewCard").hidden) {
        clearTimeout(_ocrEditTimer);
        _ocrEditTimer = setTimeout(refreshOCRFieldsPreview, 250);
      }
    });

    // OCR読取ボタン (v3.17修正: ソース別に厳密分岐。画像未アップ時はサンプルを使わず明示エラー)
    //   - 実画像アップ済み (ctx.dataUrl) → 実OCR (Tesseract.js)
    //   - サンプル選択済み (ctx.sample)  → サンプルOCRテキストを表示
    //   - 画像なし + メモあり             → メモテキストをそのまま表示
    //   - 画像なし + メモなし             → 「先にレシート画像をアップロードしてください」
    $("#ocrReadBtn").addEventListener("click", async () => {
      const memo = ($("#expenseMemoText").value || "").trim();
      const ctx = _expenseUploadCtx;
      const ta = $("#ocrPreviewText");

      // ソース判定 (実画像が最優先・サンプルとは絶対に混同しない)
      let mode;
      if (ctx && ctx.dataUrl) {
        mode = "real";
      } else if (ctx && ctx.sample) {
        mode = "sample";
      } else if (memo) {
        mode = "memo";
      } else {
        toast("先にレシート画像をアップロードしてください");
        return;
      }

      if (mode === "real") {
        // 実OCR: Tesseract.js でブラウザ内処理
        $("#ocrReadBtn").disabled = true;
        $("#aiClassifyBtn").disabled = true;
        setOCRStatusChip("working");
        try {
          const text = await runRealOCR(ctx.dataUrl);
          ctx.ocrText = text || "";
          ctx.ocrSource = "real";
          ta.value = text || "";
          setOCRSourceBadge("real");
          setOCRStatusChip("real");
          $("#ocrPreviewCard").hidden = false;
          refreshOCRFieldsPreview();
          // デバッグ表示
          const preview = parseExpenseText([text, memo].filter(Boolean).join("\n"));
          preview.aiCandidates = classifyExpense(`${text} ${memo}`);
          logOCRDebug("real", text, preview);
          if (!text || !text.trim()) {
            toast("OCRで文字を検出できませんでした。明るい場所で撮り直してください");
          } else {
            toast("実OCR読取が完了しました");
          }
        } catch (err) {
          hideOCRProgress();
          setOCRStatusChip("idle");
          console.error("[v3.17 OCR] error:", err);
          toast("OCR読取に失敗しました: " + (err && err.message || "不明なエラー"));
        } finally {
          $("#ocrReadBtn").disabled = false;
          $("#aiClassifyBtn").disabled = false;
        }
      } else if (mode === "sample") {
        // サンプル: 固定OCRテキストをそのまま表示 (実OCRは絶対に走らせない)
        const sampleText = ctx.ocrText || ctx.sample.ocrText || "";
        ta.value = sampleText;
        setOCRSourceBadge("sample");
        setOCRStatusChip("sample");
        $("#ocrPreviewCard").hidden = false;
        refreshOCRFieldsPreview();
        const dbgDraft = parseExpenseText([sampleText, memo].filter(Boolean).join("\n"));
        dbgDraft.aiCandidates = ctx.sample.aiCandidates || classifyExpense(`${sampleText} ${memo}`);
        logOCRDebug("sample", sampleText, dbgDraft);
        toast("サンプルOCR読取を表示しました");
      } else {
        // メモのみ
        ta.value = memo;
        setOCRSourceBadge("memo");
        setOCRStatusChip("memo");
        $("#ocrPreviewCard").hidden = false;
        refreshOCRFieldsPreview();
        const dbgDraft = parseExpenseText(memo);
        dbgDraft.aiCandidates = classifyExpense(memo);
        logOCRDebug("memo", memo, dbgDraft);
        toast("メモテキストをOCR結果に展開しました");
      }
    });

    // AI分類して確認 (v3.17修正: 画像アップ時は必ず実OCR結果のみで分類。サンプルは混入させない)
    $("#aiClassifyBtn").addEventListener("click", async () => {
      const memo = ($("#expenseMemoText").value || "").trim();
      const ctx = _expenseUploadCtx;
      if (!ctx && !memo) {
        toast("レシート画像 or 経費メモを入れてください");
        return;
      }

      // 画像アップ済みでまだ実OCR未実行なら、ここで実行する (絶対にサンプルにフォールバックしない)
      if (ctx && ctx.dataUrl && !ctx.ocrText) {
        $("#ocrReadBtn").disabled = true;
        $("#aiClassifyBtn").disabled = true;
        setOCRStatusChip("working");
        try {
          const text = await runRealOCR(ctx.dataUrl);
          ctx.ocrText = text || "";
          ctx.ocrSource = "real";
          $("#ocrPreviewText").value = text || "";
          setOCRSourceBadge("real");
          setOCRStatusChip("real");
          $("#ocrPreviewCard").hidden = false;
          refreshOCRFieldsPreview();
        } catch (err) {
          hideOCRProgress();
          setOCRStatusChip("idle");
          console.error("[v3.17 OCR] error:", err);
          toast("OCR読取に失敗しました。読取結果なしで確認画面へ進みます");
        } finally {
          $("#ocrReadBtn").disabled = false;
          $("#aiClassifyBtn").disabled = false;
        }
      }

      // OCRテキストに編集が入っていればそれを優先 (ctx に同期)
      const ocrTaVal = ($("#ocrPreviewText").value || "").trim();
      if (ctx && ocrTaVal) ctx.ocrText = ocrTaVal;

      $("#ocrLoading").hidden = false;
      $("#ocrLoadingLabel").textContent = "AI経費分類 中…";
      setTimeout(() => {
        $("#ocrLoading").hidden = true;
        draftExpense = _buildDraftFromUpload({ requireOnly: "full" });
        // 確認画面進入直前のデバッグログ
        logOCRDebug(draftExpense.ocrSource || "unknown", ocrTaVal || (ctx && ctx.ocrText) || memo, draftExpense);
        renderExpenseConfirm();
        goScreen("store-expense-confirm");
      }, 600);
    });
  }

  // v3.17修正: ソース別に厳密分岐。
  //   1. ctx.dataUrl(実画像) があれば必ず "real" 系統 (絶対にサンプルへフォールバックしない)
  //   2. ctx.sample があり ctx.dataUrl が無い時のみ "sample" 系統
  //   3. 画像なし + メモのみ → "memo"
  //   4. 何もない → "empty" (項目は空欄。サンプルで埋めない)
  // AI分類の優先順位:
  //   ① 手動修正済み OCRテキスト ② 実OCR/サンプルOCR テキスト ③ メモ ④ (サンプル選択時のみ)サンプルの aiCandidates 既定値
  function _buildDraftFromUpload(opts) {
    const memo = ($("#expenseMemoText").value || "").trim();
    const ctx = _expenseUploadCtx;
    const ocrTa = $("#ocrPreviewText");
    const ocrCardOpen = !$("#ocrPreviewCard").hidden;
    const ocrEdited = ocrCardOpen && ocrTa ? (ocrTa.value || "").trim() : "";
    let draft;
    let source;

    if (ctx && ctx.dataUrl) {
      // === 実OCR系統 (実画像アップ済み) ===
      // v3.17.2: OCR全文をそのまま「内容」「金額」へ流し込まない。
      // OCR専用抽出器で 購入先/金額/消費税/支払方法/日付 を推定し、内容は短い要約のみ。
      // 推定できない項目は空欄のまま (サンプル経費で埋めない)。
      source = "real";
      const baseText = ocrEdited || ctx.ocrText || "";

      // 抽出
      const amt    = extractAmountFromReceipt(baseText);
      const taxRaw = extractTaxFromReceipt(baseText);
      const vendor = extractVendorFromReceipt(baseText);
      const pay    = extractPaymentFromReceipt(baseText);
      const date   = extractDateFromReceipt(baseText) || todayKey();
      const aiCands = classifyExpense(`${baseText} ${memo}`);
      const top    = aiCands && aiCands[0];

      draft = newEmptyExpenseDraft();
      draft.receiptThumb   = "🧾";
      draft.receiptDataUrl = ctx.dataUrl;
      draft.date           = date;
      draft.vendor         = vendor;        // 不明時は空欄 (要確認)
      draft.amount         = amt.amount;    // 0 のまま空欄を許容
      draft.paymentMethod  = pay;           // 不明時は空欄
      // 消費税: OCRから直接拾えればそれを最優先。高信頼な合計のみ自動逆算 (10%税込前提)。
      if (taxRaw > 0) {
        draft.taxAmount = taxRaw;
      } else if (amt.amount > 0 && amt.confidence === "high") {
        draft.taxAmount = Math.round(amt.amount * 10 / 110);
      } else {
        draft.taxAmount = 0;
      }
      draft.aiCandidates = aiCands;
      // 内容欄は OCR 全文ではなく、購入先/カテゴリから生成した短い要約。
      draft.content = summarizeReceiptContent(vendor, top, !!baseText || !!memo);
      // OCR原文は専用欄 (登録レコードの ocrText)
      draft.ocrText = baseText
        ? `[実OCR読取 (Tesseract.js)]\n--------------------\n${baseText}`
        : (memo ? `[メモテキスト (画像OCR結果なし)]\n--------------------\n${memo}` : "[OCR結果なし]");
      draft.memoText = memo;
      // 低信頼度フラグ: 確認画面で警告バナー表示 / 必須項目バリデーション強化
      draft.lowConfidence = (
        amt.confidence === "low" ||
        amt.confidence === "none" ||
        !vendor
      );
    } else if (ctx && ctx.sample) {
      // === サンプル系統 (サンプルカード選択時のみ) ===
      // サンプルレシートは固定OCRテキスト + 既知の正解値を使う (デモ用)。
      source = "sample";
      const s = ctx.sample;
      const baseText = ocrEdited || ctx.ocrText || s.ocrText || "";
      draft = newEmptyExpenseDraft();
      draft.receiptThumb   = s.icon || "🧾";
      draft.receiptDataUrl = "";
      draft.ocrText = `[サンプルOCR読取]\n--------------------\n${baseText}`;
      draft.memoText = memo;

      if (ocrEdited) {
        // ユーザーがサンプルOCRテキストを編集した場合は、編集後テキストから再抽出
        const amt    = extractAmountFromReceipt(baseText);
        const taxRaw = extractTaxFromReceipt(baseText);
        draft.vendor        = extractVendorFromReceipt(baseText) || s.vendor || "";
        draft.amount        = amt.amount || s.amount || 0;
        draft.taxAmount     = taxRaw || s.taxAmount || Math.round((s.amount || 0) * 10 / 110);
        draft.paymentMethod = extractPaymentFromReceipt(baseText) || s.paymentMethod || "";
        draft.date          = extractDateFromReceipt(baseText) || todayKey();
        draft.aiCandidates  = classifyExpense(`${baseText} ${memo}`);
        draft.content       = s.content || summarizeReceiptContent(draft.vendor, draft.aiCandidates[0], true);
      } else {
        // 既定: サンプル正解値をそのまま採用
        draft.vendor        = s.vendor || "";
        draft.amount        = s.amount || 0;
        draft.taxAmount     = s.taxAmount || Math.round((s.amount || 0) * 10 / 110);
        draft.paymentMethod = s.paymentMethod || "";
        draft.date          = todayKey();
        draft.aiCandidates  = s.aiCandidates || classifyExpense(`${s.ocrText} ${memo}`);
        draft.content       = s.content || "";
      }
      draft.lowConfidence = false;
    } else if (memo || ocrEdited) {
      // === メモのみ系統 (画像なし) ===
      source = "memo";
      const baseText = ocrEdited || memo;
      draft = parseExpenseText(baseText);
      draft.receiptThumb = "📝";
      draft.receiptDataUrl = "";
      draft.aiCandidates = classifyExpense(baseText);
    } else {
      // === 空 (画像もメモもない) === サンプル経費で埋めない
      source = "empty";
      draft = newEmptyExpenseDraft();
      draft.receiptThumb = "📝";
      draft.receiptDataUrl = "";
      draft.aiCandidates = classifyExpense("");
    }

    draft.ocrSource = source; // 確認画面・詳細モーダル等で参照可能なフラグ

    // AI分類スナップショット & 初期選択
    //   - source === "empty"        : 全項目空欄 (サンプル経費で埋めない)
    //   - draft.lowConfidence === true : AIの推定はスナップショットとして残しつつ、現在カテゴリは空にして店長に手動選択させる
    //   - それ以外                   : top候補を自動選択 (なければ雑費)
    if (opts && opts.requireOnly === "full") {
      const topCat = draft.aiCandidates && draft.aiCandidates[0] && draft.aiCandidates[0].cat;
      if (source === "empty") {
        draft.aiCategory = "";
        draft.category   = "";
      } else if (draft.lowConfidence) {
        draft.aiCategory = topCat || "";
        draft.category   = "";
      } else {
        draft.aiCategory = topCat || "雑費";
        draft.category   = topCat || "雑費";
      }
    }
    return draft;
  }

  // ================== v3.1: 経費 確認画面 ==================
  function renderExpenseConfirm() {
    if (!draftExpense) return;

    // v3.17.2: 低信頼度バナー表示の切り替え
    const banner = $("#expenseAiBanner");
    if (banner) {
      if (draftExpense.lowConfidence) {
        banner.classList.add("low-confidence");
        banner.innerHTML = "⚠ <strong>OCRの読み取り精度が低いため、金額・購入先・経費科目を手入力してください。</strong>";
      } else {
        banner.classList.remove("low-confidence");
        banner.innerHTML = "🤖 AIが分類しました。<strong>必ず内容をご確認ください。</strong>";
      }
    }

    // レシート画像
    const thumb = $("#receiptThumb");
    if (draftExpense.receiptDataUrl) {
      thumb.innerHTML = `<img src="${draftExpense.receiptDataUrl}" alt="receipt"/>`;
    } else {
      thumb.textContent = draftExpense.receiptThumb || "🧾";
    }
    // OCR
    $("#ocrText").textContent = draftExpense.ocrText || "";
    // 大型サマリー
    $("#confExpenseAmount").value = draftExpense.amount || "";
    $("#confExpenseVendor").value = draftExpense.vendor || "";
    $("#confExpenseCatDisplay").textContent = draftExpense.category || "—";
    // 基本情報
    $("#confExpenseDate").value      = draftExpense.date || todayKey();
    $("#confExpenseStoreName").value = draftExpense.storeName || DEFAULT_STORE_NAME;
    $("#confExpenseStaff").value     = draftExpense.staff || DEFAULT_STAFF;
    $("#confExpenseTax").value       = draftExpense.taxAmount || "";
    // 内容/備考
    $("#confExpenseContent").value = draftExpense.content || "";
    $("#confExpenseNote").value    = draftExpense.note || "";

    // AI分類スナップショット注釈
    const snap = $("#aiSnapshotNote");
    if (draftExpense.aiCategory) {
      snap.innerHTML = `🤖 AI分類: <strong>${escapeHtml(draftExpense.aiCategory)}</strong>（記録に保存されます。最終確定は本社）`;
    } else {
      snap.textContent = "";
    }

    renderCategoryUI();
    renderPayButtons("#expensePaymentMethods", draftExpense.paymentMethod, (val) => {
      draftExpense.paymentMethod = val;
      renderPayButtons("#expensePaymentMethods", val);
    });
  }
  function renderCategoryUI() {
    const candWrap = $("#catCandidates");
    const cands = (draftExpense.aiCandidates || []).slice(0, 3);
    candWrap.innerHTML = cands.map((c, i) => `
      <button class="cat-card ${draftExpense.category === c.cat ? "active" : ""}" data-cat="${escapeHtml(c.cat)}">
        <div class="cat-rank">候補${i+1}</div>
        <div class="cat-name">${escapeHtml(c.cat)}</div>
        <div class="cat-score">確度 ${Math.round(c.score * 100)}%</div>
      </button>
    `).join("");
    candWrap.querySelectorAll("[data-cat]").forEach(b => {
      b.addEventListener("click", () => {
        draftExpense.category = b.dataset.cat;
        $("#confExpenseCatDisplay").textContent = draftExpense.category;
        renderCategoryUI();
      });
    });
    const allWrap = $("#catAll");
    const others = EXPENSE_CATEGORIES.filter(c => !cands.some(cc => cc.cat === c));
    allWrap.innerHTML = others.map(c => `
      <button class="cat-chip ${draftExpense.category === c ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
    `).join("");
    allWrap.querySelectorAll("[data-cat]").forEach(b => {
      b.addEventListener("click", () => {
        draftExpense.category = b.dataset.cat;
        $("#confExpenseCatDisplay").textContent = draftExpense.category;
        renderCategoryUI();
      });
    });
  }

  function setupExpenseConfirm() {
    $("#confExpenseAmount").addEventListener("input",     e => draftExpense.amount     = Number(e.target.value || 0));
    $("#confExpenseVendor").addEventListener("input",     e => draftExpense.vendor     = e.target.value);
    $("#confExpenseDate").addEventListener("input",       e => draftExpense.date       = e.target.value);
    $("#confExpenseStoreName").addEventListener("input",  e => draftExpense.storeName  = e.target.value);
    $("#confExpenseStaff").addEventListener("input",      e => draftExpense.staff      = e.target.value);
    $("#confExpenseTax").addEventListener("input",        e => draftExpense.taxAmount  = Number(e.target.value || 0));
    $("#confExpenseContent").addEventListener("input",    e => draftExpense.content    = e.target.value);
    $("#confExpenseNote").addEventListener("input",       e => draftExpense.note       = e.target.value);

    $("#confirmExpenseBtn").addEventListener("click", () => {
      // v3.17.2: 必須項目バリデーション (購入先・金額・経費科目・支払方法)
      if (!draftExpense.vendor)                              { toast("購入先を入力してください"); $("#confExpenseVendor").focus(); return; }
      if (!draftExpense.amount || draftExpense.amount <= 0) { toast("金額を確認してください"); $("#confExpenseAmount").focus(); return; }
      if (!draftExpense.category)                            { toast("経費科目を選択してください"); return; }
      if (!draftExpense.paymentMethod)                       { toast("支払方法を選択してください"); return; }

      const rec = {
        id: uid(), type: "expense",
        createdAt: new Date().toISOString(),
        // v3.1
        date: draftExpense.date || todayKey(),
        storeName: draftExpense.storeName || DEFAULT_STORE_NAME,
        staff: draftExpense.staff || DEFAULT_STAFF,
        vendor: draftExpense.vendor,
        content: draftExpense.content || "",
        amount: Number(draftExpense.amount),
        taxAmount: Number(draftExpense.taxAmount) || 0,
        paymentMethod: draftExpense.paymentMethod,
        // 科目: AI分類は immutable, current category は 店長/本社 が変更可
        aiCategory: draftExpense.aiCategory || draftExpense.category || "",
        category: draftExpense.category,
        // 共通
        note: draftExpense.note || "",
        ocrText: draftExpense.ocrText || "",
        receiptThumb: draftExpense.receiptThumb || "🧾",
        receiptDataUrl: draftExpense.receiptDataUrl || "",
        aiCandidates: draftExpense.aiCandidates || [],
        status: "未確認"
      };
      records.push(rec); saveAll(records);
      $("#doneExpenseAmount").textContent = yen(rec.amount);
      goScreen("store-expense-done");
      draftExpense = null;
      _resetExpenseUploadUI();
      renderAll();
    });
  }

  // ================== 本社: ダッシュボード (8 KPI) ==================
  // ================== v3.16: 売上集計 (Sales Report) ==================
  // 期間別 / 支払方法別 / 売上区分別 / 商品別 / タイヤサイズ別 + フィルタ + CSV出力
  const SR_FILTERS = { start: "", end: "", payment: "all", category: "all", status: "all" };

  function yesterdayKey() {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function firstDayOfMonth() {
    const d = new Date(); d.setDate(1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function srApplyFilters(list) {
    let r = list.slice();
    if (SR_FILTERS.start) r = r.filter(x => (x.date || x.createdAt.slice(0,10)) >= SR_FILTERS.start);
    if (SR_FILTERS.end)   r = r.filter(x => (x.date || x.createdAt.slice(0,10)) <= SR_FILTERS.end);
    if (SR_FILTERS.payment !== "all") r = r.filter(x => x.paymentMethod === SR_FILTERS.payment);
    if (SR_FILTERS.category !== "all") r = r.filter(x => (x.salesCategories || []).includes(SR_FILTERS.category));
    if (SR_FILTERS.status !== "all") r = r.filter(x => x.status === SR_FILTERS.status);
    return r;
  }

  function renderSalesReport() {
    // フィルタの初期値: 当月
    if (!SR_FILTERS.start && !SR_FILTERS.end) {
      SR_FILTERS.start = firstDayOfMonth();
      SR_FILTERS.end   = todayKey();
    }
    // DOM <-> state 同期
    $("#srStart").value    = SR_FILTERS.start;
    $("#srEnd").value      = SR_FILTERS.end;
    $("#srPayment").value  = SR_FILTERS.payment;
    $("#srCategory").value = SR_FILTERS.category;
    $("#srStatus").value   = SR_FILTERS.status;

    // === KPI: 期間別 (フィルタ非依存・全期間集計) ===
    const allSales = records.filter(r => r.type === "sale");
    const today    = todayKey();
    const yest     = yesterdayKey();
    const ym       = monthKey(new Date());
    const prevYm   = lastMonthKey();

    const todaySales       = allSales.filter(r => isSameDay(r.createdAt, today));
    const yesterdaySales   = allSales.filter(r => isSameDay(r.createdAt, yest));
    const monthSales       = allSales.filter(r => isInMonth(r.createdAt, ym));
    const prevMonthSales   = allSales.filter(r => isInMonth(r.createdAt, prevYm));

    const sum = (arr) => arr.reduce((s, r) => s + (r.total || 0), 0);

    $("#srKpiToday").textContent       = yen(sum(todaySales));
    $("#srKpiTodayCnt").textContent    = `${todaySales.length}件`;
    $("#srKpiYesterday").textContent   = yen(sum(yesterdaySales));
    $("#srKpiYesterdayCnt").textContent= `${yesterdaySales.length}件`;
    $("#srKpiMonth").textContent       = yen(sum(monthSales));
    $("#srKpiMonthCnt").textContent    = `${monthSales.length}件`;
    $("#srKpiPrevMonth").textContent   = yen(sum(prevMonthSales));
    $("#srKpiPrevMonthCnt").textContent= `${prevMonthSales.length}件`;
    $("#srKpiAll").textContent         = yen(sum(allSales));
    $("#srKpiAllCnt").textContent      = `${allSales.length}件`;

    // === KPI: 件数 ===
    $("#srKpiTodayCntOnly").textContent   = String(todaySales.length);
    $("#srKpiMonthCntOnly").textContent   = String(monthSales.length);
    $("#srKpiPendingOnly").textContent    = String(allSales.filter(r => r.status === "未確認").length);
    $("#srKpiConfirmedOnly").textContent  = String(allSales.filter(r => r.status === "確認済み").length);

    // === 絞り込み結果 ===
    const filtered = srApplyFilters(allSales);
    const filteredTotal = sum(filtered);
    $("#srFilteredTotal").textContent = yen(filteredTotal);
    $("#srFilteredCount").textContent = `${filtered.length}件`;
    const periodLabel = (SR_FILTERS.start && SR_FILTERS.end)
      ? `${SR_FILTERS.start} 〜 ${SR_FILTERS.end}`
      : "全期間";
    const filtersDesc = [];
    if (SR_FILTERS.payment !== "all") filtersDesc.push(`支払=${SR_FILTERS.payment}`);
    if (SR_FILTERS.category !== "all") filtersDesc.push(`区分=${SR_FILTERS.category}`);
    if (SR_FILTERS.status !== "all") filtersDesc.push(`状態=${SR_FILTERS.status}`);
    $("#srFilteredPeriod").textContent = periodLabel + (filtersDesc.length ? ` / ${filtersDesc.join(" / ")}` : "");

    // === 日別売上 (絞り込み期間内) ===
    renderSrDailyList(filtered);

    // === 月別売上 (全期間) ===
    renderSrMonthlyList(allSales);

    // === カテゴリ別内訳 (絞り込み期間内) ===
    renderBreakdown("#srByPayment",
      aggregateBy(filtered, r => [r.paymentMethod || "(未設定)"], r => r.total));
    renderBreakdown("#srByCategory",
      aggregateBySalesCats(filtered));
    renderBreakdown("#srByProduct",
      aggregateByProduct(filtered));
    renderBreakdown("#srByTireSize",
      aggregateByTireSize(filtered));
  }

  function renderSrDailyList(list) {
    const map = {};
    list.forEach(r => {
      const d = r.date || (r.createdAt ? r.createdAt.slice(0,10) : "—");
      if (!map[d]) map[d] = { total: 0, count: 0 };
      map[d].total += r.total;
      map[d].count++;
    });
    const rows = Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
    const wrap = $("#srDailyList");
    if (!rows.length) {
      wrap.innerHTML = `<div class="sr-period-empty">該当する売上はありません</div>`;
      return;
    }
    let html = `<div class="sr-period-row sr-period-header"><span>日付</span><span class="srp-amount">金額</span><span class="srp-count">件数</span></div>`;
    html += rows.map(([d, v]) => `
      <div class="sr-period-row">
        <span>${escapeHtml(d)}</span>
        <span class="srp-amount">${yen(v.total)}</span>
        <span class="srp-count">${v.count}件</span>
      </div>
    `).join("");
    wrap.innerHTML = html;
  }

  function renderSrMonthlyList(list) {
    const map = {};
    list.forEach(r => {
      const m = monthKey(new Date(r.createdAt));
      if (!map[m]) map[m] = { total: 0, count: 0 };
      map[m].total += r.total;
      map[m].count++;
    });
    const rows = Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
    const wrap = $("#srMonthlyList");
    if (!rows.length) {
      wrap.innerHTML = `<div class="sr-period-empty">月別データなし</div>`;
      return;
    }
    let html = `<div class="sr-period-row sr-period-header"><span>年月</span><span class="srp-amount">金額</span><span class="srp-count">件数</span></div>`;
    html += rows.map(([m, v]) => `
      <div class="sr-period-row">
        <span>${escapeHtml(m)}</span>
        <span class="srp-amount">${yen(v.total)}</span>
        <span class="srp-count">${v.count}件</span>
      </div>
    `).join("");
    wrap.innerHTML = html;
  }

  function setupSalesReport() {
    // フィルタ変更 → 即時反映
    $("#srStart").addEventListener("change", e => { SR_FILTERS.start = e.target.value; renderSalesReport(); });
    $("#srEnd").addEventListener("change",   e => { SR_FILTERS.end   = e.target.value; renderSalesReport(); });
    $("#srPayment").addEventListener("change", e => { SR_FILTERS.payment = e.target.value; renderSalesReport(); });
    $("#srCategory").addEventListener("change",e => { SR_FILTERS.category = e.target.value; renderSalesReport(); });
    $("#srStatus").addEventListener("change",  e => { SR_FILTERS.status = e.target.value; renderSalesReport(); });
    // リセット
    $("#srResetBtn").addEventListener("click", () => {
      SR_FILTERS.start    = firstDayOfMonth();
      SR_FILTERS.end      = todayKey();
      SR_FILTERS.payment  = "all";
      SR_FILTERS.category = "all";
      SR_FILTERS.status   = "all";
      renderSalesReport();
      toast("絞り込みをリセットしました（当月）");
    });
    // 期間CSV出力
    $("#srExportBtn").addEventListener("click", () => {
      exportSalesCSVByPeriod();
    });
    // クイックリンク
    $("#srGoSalesBtn").addEventListener("click", () => setHQTab("sales"));
    $("#srSetMonthBtn").addEventListener("click", () => {
      SR_FILTERS.start = firstDayOfMonth();
      SR_FILTERS.end   = todayKey();
      renderSalesReport();
      toast("当月のみで絞り込みました");
    });
    $("#srGoPendingBtn").addEventListener("click", () => {
      pendingFilter = "sale";
      setHQTab("pending");
    });
  }

  // 期間指定のCSV出力 (売上のみ・SR_FILTERS反映)
  function exportSalesCSVByPeriod() {
    const head = [
      "日付","店舗名","担当者","売上区分","商品名","タイヤサイズ",
      "数量","単価","合計金額","支払方法","車種","車両番号",
      "作業内容","備考","確認ステータス"
    ];
    const filtered = srApplyFilters(records.filter(x => x.type === "sale"))
      .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    const list = filtered.map(x => [
      x.date || (x.createdAt ? x.createdAt.slice(0,10) : ""),
      x.storeName || "",
      x.staff || "",
      (x.salesCategories || []).join("、"),
      x.productName || (x.items && x.items[0] && x.items[0].name) || "",
      x.tireSize || "",
      x.qty || "",
      x.unitPrice || "",
      x.total || 0,
      x.paymentMethod || "",
      x.carModel || "",
      x.carNumber || "",
      x.workContent || "",
      x.note || "",
      x.status
    ]);
    const start = SR_FILTERS.start || "all";
    const end   = SR_FILTERS.end   || "all";
    downloadCSV(`xchange_sales_${start}_${end}.csv`, [head, ...list]);
    toast(`売上CSVを出力しました (${filtered.length}件・${start}〜${end})`);
  }

  function renderHQDashboard() {
    const today = todayKey();
    const ym = monthKey(new Date());
    $("#hqTodayLabel").textContent = `${fmtGreeting(new Date())} 時点`;

    const todaySales   = records.filter(r => r.type === "sale"    && isSameDay(r.createdAt, today));
    const todayExpense = records.filter(r => r.type === "expense" && isSameDay(r.createdAt, today));
    const monthSales   = records.filter(r => r.type === "sale"    && isInMonth(r.createdAt, ym));
    const monthExp     = records.filter(r => r.type === "expense" && isInMonth(r.createdAt, ym));
    const monthSalesAmt= monthSales.reduce((s,r) => s + r.total, 0);
    const monthExpAmt  = monthExp.reduce((s,r) => s + r.amount, 0);
    const monthCost    = monthExp.filter(isCostCategory).reduce((s,r) => s + r.amount, 0);
    const monthOpex    = monthExp.filter(r => !isCostCategory(r)).reduce((s,r) => s + r.amount, 0);
    const gross        = monthSalesAmt - monthCost - monthOpex;
    const pendingSales = records.filter(r => r.type === "sale"    && r.status === "未確認").length;
    const pendingExp   = records.filter(r => r.type === "expense" && r.status === "未確認").length;
    const rejected     = records.filter(r => r.status === "修正依頼").length;

    $("#kpiTodaySales").textContent        = yen(todaySales.reduce((s,r) => s + r.total, 0));
    $("#kpiTodaySalesCount").textContent   = `${todaySales.length}件`;
    $("#kpiMonthSales").textContent        = yen(monthSalesAmt);
    $("#kpiMonthSalesCount").textContent   = `${monthSales.length}件`;
    $("#kpiTodayExpense").textContent      = yen(todayExpense.reduce((s,r) => s + r.amount, 0));
    $("#kpiTodayExpenseCount").textContent = `${todayExpense.length}件`;
    $("#kpiMonthExpense").textContent      = yen(monthExpAmt);
    $("#kpiMonthExpenseCount").textContent = `${monthExp.length}件`;
    $("#kpiMonthGross").textContent        = yen(gross);
    $("#kpiPendingSales").textContent      = String(pendingSales);
    $("#kpiPendingExpense").textContent    = String(pendingExp);
    $("#kpiRejected").textContent          = String(rejected);

    // サイドバーバッジ
    const total = pendingSales + pendingExp;
    const badge = $("#navPendingBadge");
    if (total > 0) { badge.hidden = false; badge.textContent = String(total); }
    else { badge.hidden = true; }

    // 未確認リスト (上位)
    const pending = [...records]
      .filter(r => r.status === "未確認")
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    const recentEl = $("#hqRecentList");
    if (!pending.length) {
      recentEl.innerHTML = `<div class="empty">未確認の登録はありません</div>`;
    } else {
      recentEl.innerHTML = pending.map(hqCard).join("");
      bindHQCards(recentEl);
    }

    // 本日の登録
    const todays = [...records]
      .filter(r => isSameDay(r.createdAt, today))
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    const todayEl = $("#hqTodayList");
    if (!todays.length) {
      todayEl.innerHTML = `<div class="empty">本日の登録はまだありません</div>`;
    } else {
      todayEl.innerHTML = todays.map(hqCard).join("");
      bindHQCards(todayEl);
    }
  }

  // ================== v3.4: 本社 売上一覧 (テーブル型に復元・列幅%・右切れ防止) ==================
  function renderHQSales() {
    const filter = $("#salesFilter").value;
    let list = records.filter(r => r.type === "sale");
    if (filter !== "all") list = list.filter(r => r.status === filter);
    list = sortByDate(list, hqSort.sales);
    updateSortBtnLabel("#salesSortBtn", hqSort.sales);

    const el = $("#hqSalesList");
    if (!list.length) {
      el.innerHTML = `<div class="empty">該当する売上はありません</div>`;
      return;
    }
    el.innerHTML = `
      <div class="hq-list-wrap">
        <table class="hq-list-table sales">
          <colgroup>
            <col style="width: 8%;">  <!-- 日付 -->
            <col style="width: 9%;">  <!-- 店舗名 -->
            <col style="width: 13%;"> <!-- 売上区分 -->
            <col style="width: 14%;"> <!-- 商品名 -->
            <col style="width: 7%;">  <!-- タイヤサイズ -->
            <col style="width: 5%;">  <!-- 数量 -->
            <col style="width: 9%;">  <!-- 合計金額 -->
            <col style="width: 7%;">  <!-- 支払方法 -->
            <col style="width: 7%;">  <!-- 担当者 -->
            <col style="width: 7%;">  <!-- ステータス -->
            <col style="width: 14%;"> <!-- 操作 -->
          </colgroup>
          <thead>
            <tr>
              <th>日付</th>
              <th>店舗名</th>
              <th>売上区分</th>
              <th>商品名</th>
              <th>サイズ</th>
              <th class="num">数量</th>
              <th class="num">合計金額</th>
              <th>支払</th>
              <th>担当</th>
              <th>ステータス</th>
              <th class="center">操作</th>
            </tr>
          </thead>
          <tbody>${list.map(hqSalesRow).join("")}</tbody>
        </table>
      </div>
    `;
    bindHQCardActions(el);
  }

  function renderHQExpenses() {
    const filter = $("#expenseFilter").value;
    let list = records.filter(r => r.type === "expense");
    if (filter !== "all") list = list.filter(r => r.status === filter);
    list = sortByDate(list, hqSort.expenses);
    updateSortBtnLabel("#expenseSortBtn", hqSort.expenses);

    const el = $("#hqExpenseList");
    if (!list.length) {
      el.innerHTML = `<div class="empty">該当する経費はありません</div>`;
      return;
    }
    el.innerHTML = `
      <div class="hq-list-wrap">
        <table class="hq-list-table expense">
          <colgroup>
            <col style="width: 8%;">  <!-- 日付 -->
            <col style="width: 8%;">  <!-- 店舗名 -->
            <col style="width: 11%;"> <!-- 購入先 -->
            <col style="width: 12%;"> <!-- 内容 -->
            <col style="width: 8%;">  <!-- 金額 -->
            <col style="width: 9%;">  <!-- AI分類 -->
            <col style="width: 10%;"> <!-- 本社確定 -->
            <col style="width: 6%;">  <!-- 支払 -->
            <col style="width: 7%;">  <!-- ステータス -->
            <col style="width: 5%;">  <!-- レシート -->
            <col style="width: 16%;"> <!-- 操作 -->
          </colgroup>
          <thead>
            <tr>
              <th>日付</th>
              <th>店舗名</th>
              <th>購入先</th>
              <th>内容</th>
              <th class="num">金額</th>
              <th>AI分類</th>
              <th>本社確定</th>
              <th>支払</th>
              <th>ステータス</th>
              <th class="center">レシート</th>
              <th class="center">操作</th>
            </tr>
          </thead>
          <tbody>${list.map(hqExpenseRow).join("")}</tbody>
        </table>
      </div>
    `;
    bindHQCardActions(el);
  }

  // ===== v3.4: 支払方法ラベルの省略形 =====
  function shortPay(p) {
    return ({
      "クレジットカード": "カード",
      "銀行振込": "振込",
      "口座引落": "引落"
    })[p] || p || "—";
  }

  // ===== v3.4: 売上テーブル行 (v3.9: data-label でモバイルカード表示対応) =====
  function hqSalesRow(r) {
    const date = r.date || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "—");
    const cats = (r.salesCategories && r.salesCategories.length) ? r.salesCategories.join("、") : "—";
    const product = r.productName || (r.items && r.items[0] && r.items[0].name) || "—";
    const qty = r.qty || (r.items ? r.items.reduce((s, i) => s + (Number(i.qty) || 0), 0) : 0);
    const pay = shortPay(r.paymentMethod);
    return `
      <tr data-id="${r.id}" class="${isLocked(r) ? "row-locked" : ""}">
        <td data-label="日付" title="${escapeHtml(date)}">${escapeHtml(date)}</td>
        <td data-label="店舗" title="${escapeHtml(r.storeName || "—")}">${escapeHtml(r.storeName || "—")}</td>
        <td data-label="売上区分" title="${escapeHtml(cats)}">${escapeHtml(cats)}</td>
        <td data-label="商品名" title="${escapeHtml(product)}">${escapeHtml(product)}</td>
        <td data-label="サイズ" title="${escapeHtml(r.tireSize || "—")}">${escapeHtml(r.tireSize || "—")}</td>
        <td class="num" data-label="数量">${qty || "—"}</td>
        <td class="num amount" data-label="合計" title="${yen(r.total)}">${yen(r.total)}</td>
        <td data-label="支払" title="${escapeHtml(r.paymentMethod || "—")}">${escapeHtml(pay)}</td>
        <td data-label="担当" title="${escapeHtml(r.staff || "—")}">${escapeHtml(r.staff || "—")}</td>
        <td class="status" data-label="ステータス">${statusPill(r.status)}</td>
        <td class="center actions">${buildRowActions(r, false)}</td>
      </tr>
    `;
  }

  // ===== v3.4: 経費テーブル行 (v3.9: data-label でモバイルカード表示対応) =====
  function hqExpenseRow(r) {
    const date = r.date || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "—");
    const aiCat = r.aiCategory || r.category || "—";
    const isFinalSet = (r.status === "確認済み" || r.status === "月次処理済み");
    const finalCat = isFinalSet ? (r.category || "—") : "未確定";
    const finalClass = isFinalSet ? "final-confirmed" : "final-pending";
    const pay = shortPay(r.paymentMethod);
    return `
      <tr data-id="${r.id}" class="${isLocked(r) ? "row-locked" : ""}">
        <td data-label="日付" title="${escapeHtml(date)}">${escapeHtml(date)}</td>
        <td data-label="店舗" title="${escapeHtml(r.storeName || "—")}">${escapeHtml(r.storeName || "—")}</td>
        <td data-label="購入先" title="${escapeHtml(r.vendor || "—")}">${escapeHtml(r.vendor || "—")}</td>
        <td data-label="内容" title="${escapeHtml(r.content || "—")}">${escapeHtml(r.content || "—")}</td>
        <td class="num amount expense" data-label="金額" title="${yen(r.amount)}">${yen(r.amount)}</td>
        <td data-label="AI分類" title="${escapeHtml(aiCat)}">${escapeHtml(aiCat)}</td>
        <td class="${finalClass}" data-label="本社確定" title="${escapeHtml(finalCat)}">${escapeHtml(finalCat)}</td>
        <td data-label="支払" title="${escapeHtml(r.paymentMethod || "—")}">${escapeHtml(pay)}</td>
        <td class="status" data-label="ステータス">${statusPill(r.status)}</td>
        <td class="center" data-label="レシート">${buildRowReceiptThumb(r)}</td>
        <td class="center actions">${buildRowActions(r, true)}</td>
      </tr>
    `;
  }

  // ===== v3.4: テーブル用レシートサムネ =====
  function buildRowReceiptThumb(r) {
    const info = getReceiptInfo(r);
    if (info.kind === "upload") {
      return `<div class="thumb-mini has-image" data-receipt-id="${r.id}" title="アップロード画像 - クリックで拡大"><img src="${info.dataUrl}" alt="receipt"/></div>`;
    }
    if (info.kind === "sample") {
      return `<div class="thumb-mini sample" data-receipt-id="${r.id}" title="サンプル画像（${escapeHtml(info.label)}）- クリックで拡大"><span>${escapeHtml(info.thumb)}</span></div>`;
    }
    return `<div class="thumb-mini empty" data-receipt-id="${r.id}" title="画像なし"><span>画像<br/>なし</span></div>`;
  }

  // ===== v3.4: 操作ボタン (アイコンのみ・コンパクト) =====
  function buildRowActions(r, isExpense) {
    const locked      = isLocked(r);
    const canConfirm  = !locked && (r.status === "未確認" || r.status === "修正依頼");
    const canReject   = !locked && (r.status === "未確認" || r.status === "確認済み");
    const canChangeCat= !locked && isExpense;
    const canMonthClose = !locked && (r.status === "確認済み");

    const buttons = [];
    buttons.push(`<button type="button" class="row-btn detail" data-action="detail" data-id="${r.id}" title="詳細を見る" aria-label="詳細を見る">👁</button>`);
    buttons.push(`<button type="button" class="row-btn confirm" data-action="confirm" data-id="${r.id}" title="確認済みにする" aria-label="確認済みにする" ${canConfirm ? "" : "disabled"}>✓</button>`);
    buttons.push(`<button type="button" class="row-btn reject" data-action="reject" data-id="${r.id}" title="修正依頼を出す" aria-label="修正依頼を出す" ${canReject ? "" : "disabled"}>✏️</button>`);
    if (isExpense) {
      buttons.push(`<button type="button" class="row-btn cat" data-action="change-cat" data-id="${r.id}" title="本社確定科目を変更" aria-label="本社確定科目を変更" ${canChangeCat ? "" : "disabled"}>🏷</button>`);
    }
    if (locked) {
      buttons.push(`<button type="button" class="row-btn unlock" data-action="month-unlock" data-id="${r.id}" title="月次処理を解除（デモ用）" aria-label="月次処理を解除">🔓</button>`);
    } else {
      buttons.push(`<button type="button" class="row-btn month" data-action="month-close" data-id="${r.id}" title="月次処理済みにする" aria-label="月次処理済みにする" ${canMonthClose ? "" : "disabled"}>📅</button>`);
    }
    return `<div class="row-actions">${buttons.join("")}</div>`;
  }

  // ===== レシート画像情報の判定 =====
  function getReceiptInfo(r) {
    if (r.receiptDataUrl) {
      return { kind: "upload", dataUrl: r.receiptDataUrl, label: "アップロード画像" };
    }
    const sample = SAMPLE_RECEIPTS.find(s => s.icon === r.receiptThumb);
    if (sample) {
      return { kind: "sample", thumb: r.receiptThumb, label: sample.label };
    }
    return { kind: "none", thumb: r.receiptThumb || "🧾" };
  }

  function buildReceiptThumbHtml(r) {
    const info = getReceiptInfo(r);
    if (info.kind === "upload") {
      return `<div class="hcv-thumb has-image" data-receipt-id="${r.id}"><img src="${info.dataUrl}" alt="レシート"/><div class="hcv-thumb-badge">画像</div></div>`;
    }
    if (info.kind === "sample") {
      return `<div class="hcv-thumb sample" data-receipt-id="${r.id}"><span>${escapeHtml(info.thumb)}</span><div class="hcv-thumb-badge">サンプル</div></div>`;
    }
    return `<div class="hcv-thumb empty" data-receipt-id="${r.id}"><div class="hcv-thumb-empty">画像<br/>なし</div></div>`;
  }

  // ===== カード アクションボタンの組み立て =====
  function buildHqActionsHtml(r, isExpense) {
    const locked = isLocked(r);
    const buttons = [];
    buttons.push(`<button class="btn ghost small" data-action="detail" data-id="${r.id}">👁 詳細</button>`);
    if (locked) {
      buttons.push(`<button class="btn ghost small" data-action="month-unlock" data-id="${r.id}">🔓 月次解除（デモ）</button>`);
      return buttons.join("");
    }
    if (r.status === "未確認" || r.status === "修正依頼") {
      buttons.push(`<button class="btn success small" data-action="confirm" data-id="${r.id}">✓ 確認済みにする</button>`);
    }
    if (r.status === "未確認" || r.status === "確認済み") {
      buttons.push(`<button class="btn warn small" data-action="reject" data-id="${r.id}">✏️ 修正依頼</button>`);
    }
    if (isExpense) {
      buttons.push(`<button class="btn outline small" data-action="change-cat" data-id="${r.id}">🏷 本社確定科目を変更</button>`);
    }
    if (r.status === "確認済み") {
      buttons.push(`<button class="btn primary small" data-action="month-close" data-id="${r.id}">📅 月次処理済みにする</button>`);
    }
    return buttons.join("");
  }

  // ===== 売上カード =====
  function hqSalesCard(r) {
    const date = r.date || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "—");
    const cats = (r.salesCategories && r.salesCategories.length) ? r.salesCategories.join("、") : "—";
    const product = r.productName || (r.items && r.items[0] && r.items[0].name) || "—";
    const qty = r.qty || (r.items ? r.items.reduce((s, i) => s + (Number(i.qty) || 0), 0) : 0);
    return `
      <div class="hq-card-v2 ${isLocked(r) ? "locked" : ""}" data-id="${r.id}">
        <div class="hcv-header">
          <div class="hcv-header-left">
            <div class="hcv-thumb sales-icon">💰</div>
            <div class="hcv-meta">
              <div class="hcv-date">📅 ${escapeHtml(date)} ・ <span class="hc-tag sales">売上</span></div>
              <div class="hcv-vendor">${escapeHtml(r.customer || "—")} / ${escapeHtml(product)}</div>
              <div class="hcv-store">🏪 ${escapeHtml(r.storeName || "—")}</div>
            </div>
          </div>
          <div class="hcv-header-right">
            <div class="hcv-amount">${yen(r.total)}</div>
            ${statusPill(r.status)}
          </div>
        </div>
        <div class="hcv-body">
          <div class="hcv-field full"><span class="hcv-field-label">売上区分:</span><span class="hcv-field-value">${escapeHtml(cats)}</span></div>
          <div class="hcv-field"><span class="hcv-field-label">タイヤサイズ:</span><span class="hcv-field-value">${escapeHtml(r.tireSize || "—")}</span></div>
          <div class="hcv-field"><span class="hcv-field-label">数量:</span><span class="hcv-field-value">${qty || "—"}本</span></div>
          <div class="hcv-field"><span class="hcv-field-label">支払方法:</span><span class="hcv-field-value">${escapeHtml(r.paymentMethod || "—")}</span></div>
          <div class="hcv-field"><span class="hcv-field-label">担当者:</span><span class="hcv-field-value">${escapeHtml(r.staff || "—")}</span></div>
        </div>
        <div class="hcv-actions">${buildHqActionsHtml(r, false)}</div>
      </div>
    `;
  }

  // ===== 経費カード =====
  function hqExpenseCard(r) {
    const date = r.date || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "—");
    const aiCat = r.aiCategory || r.category || "—";
    const isFinalSet = (r.status === "確認済み" || r.status === "月次処理済み");
    const finalCat = isFinalSet ? (r.category || "—") : "未確定";
    const finalClass = isFinalSet ? "final-confirmed" : "final-pending";
    return `
      <div class="hq-card-v2 ${isLocked(r) ? "locked" : ""}" data-id="${r.id}">
        <div class="hcv-header">
          <div class="hcv-header-left">
            ${buildReceiptThumbHtml(r)}
            <div class="hcv-meta">
              <div class="hcv-date">📅 ${escapeHtml(date)} ・ <span class="hc-tag expense">経費</span></div>
              <div class="hcv-vendor">${escapeHtml(r.vendor || "—")}</div>
              <div class="hcv-store">🏪 ${escapeHtml(r.storeName || "—")}</div>
            </div>
          </div>
          <div class="hcv-header-right">
            <div class="hcv-amount expense">${yen(r.amount)}</div>
            ${statusPill(r.status)}
          </div>
        </div>
        <div class="hcv-body">
          <div class="hcv-field full"><span class="hcv-field-label">内容:</span><span class="hcv-field-value">${escapeHtml(r.content || "—")}</span></div>
          <div class="hcv-field"><span class="hcv-field-label">支払方法:</span><span class="hcv-field-value">${escapeHtml(r.paymentMethod || "—")}</span></div>
          <div class="hcv-field"><span class="hcv-field-label">AI分類科目:</span><span class="hcv-field-value">${escapeHtml(aiCat)}</span></div>
          <div class="hcv-field full"><span class="hcv-field-label">本社確定科目:</span><span class="hcv-field-value ${finalClass}">${escapeHtml(finalCat)}</span></div>
        </div>
        <div class="hcv-actions">${buildHqActionsHtml(r, true)}</div>
      </div>
    `;
  }

  // ===== カード操作ボタンのバインド =====
  function bindHQCardActions(root) {
    // 操作ボタン (data-action 属性付き)
    root.querySelectorAll("[data-action]").forEach(b => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (b.disabled) return;
        const id = b.dataset.id;
        switch (b.dataset.action) {
          case "detail":        openDetail(id); break;
          case "confirm":       markConfirmed(id); break;
          case "reject":        openReject(id); break;
          case "change-cat":    openCategoryChange(id); break;
          case "month-close":   markMonthClosed(id); break;
          case "month-unlock":  unmarkMonthClosed(id); break;
        }
      });
    });
    // レシートサムネクリックで拡大表示 (カード型 .hcv-thumb / テーブル型 .thumb-mini 両対応)
    root.querySelectorAll("[data-receipt-id]").forEach(t => {
      t.addEventListener("click", (e) => {
        e.stopPropagation();
        openImageZoom(t.dataset.receiptId);
      });
    });
    // テーブル行 tr[data-id] クリックで詳細を開く (操作ボタン/サムネ以外の領域)
    root.querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => openDetail(tr.dataset.id));
    });
  }

  function updateSortBtnLabel(sel, order) {
    const b = $(sel);
    if (!b) return;
    b.textContent = order === "desc" ? "📅 新しい順" : "📅 古い順";
  }

  // 旧APIの hqCard / bindHQCards はダッシュボードの直近リストで使用
  function hqCard(r) {
    const isSale = r.type === "sale";
    const sub = `${fmtDate(r.createdAt)} ・ ${escapeHtml(r.paymentMethod || "")}`;
    return `
      <div class="hq-card" data-id="${r.id}">
        <div class="hc-left">
          <span class="hc-tag ${isSale ? "sales" : "expense"}">${isSale ? "売上" : "経費"}</span>
          <div class="hc-title">${escapeHtml(recordTitle(r))}</div>
          <div class="hc-sub">${sub}</div>
        </div>
        <div class="hc-right">
          <div class="hc-amount">${yen(recordAmount(r))}</div>
          ${statusPill(r.status)}
        </div>
      </div>
    `;
  }
  function bindHQCards(root) {
    root.querySelectorAll(".hq-card").forEach(c => {
      c.addEventListener("click", () => openDetail(c.dataset.id));
    });
  }

  // ================== 本社: 未確認一覧 ==================
  function renderHQPending() {
    const allUnsorted = records.filter(r => r.status === "未確認");
    const all   = sortByDate(allUnsorted, hqSort.pending);
    const sales = all.filter(r => r.type === "sale");
    const exps  = all.filter(r => r.type === "expense");
    $("#ptabAll").textContent     = String(all.length);
    $("#ptabSale").textContent    = String(sales.length);
    $("#ptabExpense").textContent = String(exps.length);
    updateSortBtnLabel("#pendingSortBtn", hqSort.pending);

    let list = all;
    if (pendingFilter === "sale")    list = sales;
    if (pendingFilter === "expense") list = exps;

    const el = $("#hqPendingList");
    if (!list.length) {
      el.innerHTML = `<div class="empty">未確認の登録はありません</div>`;
      return;
    }
    el.innerHTML = list.map(pendingCard).join("");

    el.querySelectorAll("[data-pc-detail]").forEach(b => {
      b.addEventListener("click", (e) => { e.stopPropagation(); openDetail(b.dataset.pcDetail); });
    });
    el.querySelectorAll("[data-pc-approve]").forEach(b => {
      b.addEventListener("click", (e) => { e.stopPropagation(); approve(b.dataset.pcApprove); });
    });
    el.querySelectorAll("[data-pc-reject]").forEach(b => {
      b.addEventListener("click", (e) => { e.stopPropagation(); openReject(b.dataset.pcReject); });
    });
  }
  function pendingCard(r) {
    const isSale = r.type === "sale";
    const sub = isSale
      ? `支払: ${escapeHtml(r.paymentMethod)} / 明細 ${r.items.length}件`
      : `支払: ${escapeHtml(r.paymentMethod)} / 支払日 ${escapeHtml(r.date || "—")}`;
    return `
      <div class="pending-card" data-id="${r.id}">
        <div class="pc-header">
          <span class="hc-tag ${isSale ? "sales" : "expense"}">${isSale ? "売上" : "経費"}</span>
          <span class="pc-time">${fmtFullDate(r.createdAt)}</span>
          ${statusPill(r.status)}
        </div>
        <div class="pc-title">${escapeHtml(recordTitle(r))}</div>
        <div class="pc-amount">${yen(recordAmount(r))}</div>
        <div class="pc-sub">${sub}</div>
        <div class="pc-actions">
          <button class="btn ghost small" data-pc-detail="${r.id}">詳細</button>
          <button class="btn warn small"  data-pc-reject="${r.id}">修正依頼</button>
          <button class="btn success small" data-pc-approve="${r.id}">✓ 確認済み</button>
        </div>
      </div>
    `;
  }

  // ================== 詳細モーダル ==================
  // ===== v3.3: 詳細モーダル — セクション分割版 =====
  function openDetail(id) {
    const r = records.find(x => x.id === id);
    if (!r) return;
    const isSale = r.type === "sale";
    $("#modalTitle").textContent = isSale ? "売上 詳細" : "経費 詳細";
    $("#modalBody").innerHTML = isSale ? renderSaleDetailBody(r) : renderExpenseDetailBody(r);

    // 経費詳細: レシート画像クリックで拡大
    if (!isSale) {
      const rcptImg = document.querySelector("#detailModal .detail-receipt-large img");
      const rcptZoom = document.querySelector("#detailModal .drl-zoom");
      const onZoom = (e) => { e.stopPropagation(); openImageZoom(r.id); };
      if (rcptImg) rcptImg.addEventListener("click", onZoom);
      if (rcptZoom) rcptZoom.addEventListener("click", onZoom);

      // 「科目を変更する」リンクボタン
      const changeBtn = document.querySelector("#detailModal .detail-change-cat");
      if (changeBtn && currentRole === "hq" && !isLocked(r)) {
        changeBtn.addEventListener("click", (e) => { e.stopPropagation(); openCategoryChange(r.id); });
      }
    }

    // アクションボタン
    const actions = $("#modalActions");
    actions.innerHTML = "";
    if (currentRole === "hq") {
      const close    = btn("閉じる", "ghost", () => closeModal());
      const reject   = btn("✏️ 修正依頼", "warn", () => openReject(r.id));
      const confirmB = btn("✓ 確認済みにする", "success", () => markConfirmed(r.id));
      const monthClose = btn("📅 月次処理済みにする", "primary", () => markMonthClosed(r.id));
      const unlock   = btn("🔓 月次処理を解除（デモ）", "ghost", () => unmarkMonthClosed(r.id));
      const changeCat = btn("🏷 本社確定科目を変更", "outline", () => openCategoryChange(r.id));

      if (r.status === "未確認" || r.status === "修正依頼") {
        actions.appendChild(confirmB);
        if (r.status !== "修正依頼") actions.appendChild(reject);
      } else if (r.status === "確認済み") {
        actions.appendChild(monthClose);
        actions.appendChild(reject);
      } else if (r.status === "月次処理済み") {
        actions.appendChild(unlock);
      }
      // 経費は「科目変更」ボタンも表示（ロック以外）
      if (!isSale && !isLocked(r)) {
        actions.appendChild(changeCat);
      }
      actions.appendChild(close);
    } else {
      // 店舗ロール: 修正依頼中の登録には「修正する」ボタンを表示
      if (r.status === "修正依頼") {
        actions.appendChild(btn("✏️ 修正する", "primary", () => {
          closeModal();
          openStoreEditModal(r.id);
        }));
      }
      actions.appendChild(btn("閉じる", "ghost", () => closeModal()));
    }
    showModalEl($("#detailModal"));
  }

  function renderSaleDetailBody(r) {
    return `
      <div class="detail-section">
        <div class="detail-section-title">基本情報</div>
        <div class="detail-row"><div class="dl">日付</div><div class="dv">${escapeHtml(r.date || "—")}</div></div>
        ${r.storeName ? `<div class="detail-row"><div class="dl">店舗名</div><div class="dv">${escapeHtml(r.storeName)}</div></div>` : ""}
        ${r.staff     ? `<div class="detail-row"><div class="dl">担当者</div><div class="dv">${escapeHtml(r.staff)}</div></div>` : ""}
        <div class="detail-row"><div class="dl">お客様</div><div class="dv">${escapeHtml(r.customer || "—")}</div></div>
        <div class="detail-row"><div class="dl">確認ステータス</div><div class="dv">${statusPill(r.status)}</div></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">売上情報</div>
        ${r.salesCategories && r.salesCategories.length
          ? `<div class="detail-row"><div class="dl">売上区分</div><div class="dv">${r.salesCategories.map(c => escapeHtml(c)).join("、")}</div></div>`
          : ""}
        ${r.productName ? `<div class="detail-row"><div class="dl">商品名</div><div class="dv">${escapeHtml(r.productName)}</div></div>` : ""}
        ${r.tireSize  ? `<div class="detail-row"><div class="dl">タイヤサイズ</div><div class="dv">${escapeHtml(r.tireSize)}</div></div>` : ""}
        ${r.qty       ? `<div class="detail-row"><div class="dl">数量</div><div class="dv">${r.qty}</div></div>` : ""}
        ${r.unitPrice ? `<div class="detail-row"><div class="dl">単価</div><div class="dv">${yen(r.unitPrice)}</div></div>` : ""}
        <div class="detail-row"><div class="dl">合計金額</div><div class="dv" style="font-size:20px;color:#0b3d91;">${yen(r.total)}</div></div>
        <div class="detail-row"><div class="dl">支払方法</div><div class="dv">${escapeHtml(r.paymentMethod)}</div></div>
      </div>

      ${(r.carModel || r.carNumber) ? `
      <div class="detail-section">
        <div class="detail-section-title">車両情報</div>
        ${r.carModel  ? `<div class="detail-row"><div class="dl">車種</div><div class="dv">${escapeHtml(r.carModel)}</div></div>` : ""}
        ${r.carNumber ? `<div class="detail-row"><div class="dl">車両番号</div><div class="dv">${escapeHtml(r.carNumber)}</div></div>` : ""}
      </div>` : ""}

      ${(r.workContent || r.note) ? `
      <div class="detail-section">
        <div class="detail-section-title">作業・備考</div>
        ${r.workContent ? `<div class="detail-row"><div class="dl">作業内容</div><div class="dv">${escapeHtml(r.workContent)}</div></div>` : ""}
        ${r.note        ? `<div class="detail-row"><div class="dl">備考</div><div class="dv">${escapeHtml(r.note)}</div></div>` : ""}
      </div>` : ""}

      ${r.items && r.items.length ? `
      <div class="detail-section">
        <div class="detail-section-title">明細</div>
        <div class="detail-items">
          ${r.items.map(it => `
            <div class="di-row">
              <div>${escapeHtml(it.name)} ×${it.qty}</div>
              <div>${yen(it.qty * it.unitPrice)}</div>
            </div>
          `).join("")}
        </div>
      </div>` : ""}

      ${r.voiceTranscript ? `
      <div class="detail-section">
        <div class="detail-section-title">元の音声テキスト</div>
        <div style="font-size:13px;color:#4a5568;line-height:1.6;">${escapeHtml(r.voiceTranscript)}</div>
      </div>` : ""}

      ${r.rejection ? `
      <div class="detail-section" style="border-top-color:#f7c8be;">
        <div class="detail-section-title" style="color:#a3232c;">修正依頼コメント（本社→店長）</div>
        <div style="color:#a3232c;font-weight:700;">${escapeHtml(r.rejection.note)}</div>
        <div style="font-size:11px;color:#8a4a3f;margin-top:4px;">${fmtFullDate(r.rejection.at)}</div>
      </div>` : ""}
    `;
  }

  function renderExpenseDetailBody(r) {
    const aiCat = r.aiCategory || r.category || "—";
    const isFinalSet = (r.status === "確認済み" || r.status === "月次処理済み");
    const finalCat = isFinalSet ? (r.category || "—") : "未確定";
    const finalColor = isFinalSet ? "color:#0a7a4d;" : "color:#8a6a00;";
    const info = getReceiptInfo(r);
    const locked = isLocked(r);

    let receiptHtml = "";
    if (info.kind === "upload") {
      receiptHtml = `
        <div class="detail-receipt-large">
          <img src="${info.dataUrl}" alt="receipt" />
          <div class="drl-label">📷 アップロード画像 ・ <span class="drl-zoom">クリックで拡大</span></div>
        </div>`;
    } else if (info.kind === "sample") {
      receiptHtml = `
        <div class="detail-receipt-large">
          <div class="drl-emoji">${escapeHtml(info.thumb)}</div>
          <div class="drl-label">📋 サンプル画像（${escapeHtml(info.label)}） ・ <span class="drl-zoom">詳細を見る</span></div>
        </div>`;
    } else {
      receiptHtml = `
        <div class="detail-receipt-large">
          <div class="drl-emoji">🚫</div>
          <div class="drl-label">レシート画像なし</div>
        </div>`;
    }

    const changeCatLink = (currentRole === "hq" && !locked)
      ? `<button class="link-btn detail-change-cat" type="button" style="margin-left:8px;">変更する →</button>`
      : "";

    return `
      <div class="detail-section">
        <div class="detail-section-title">レシート画像</div>
        ${receiptHtml}
      </div>

      <div class="detail-section">
        <div class="detail-section-title">基本情報</div>
        <div class="detail-row"><div class="dl">日付</div><div class="dv">${escapeHtml(r.date || "—")}</div></div>
        ${r.storeName ? `<div class="detail-row"><div class="dl">店舗名</div><div class="dv">${escapeHtml(r.storeName)}</div></div>` : ""}
        ${r.staff     ? `<div class="detail-row"><div class="dl">担当者</div><div class="dv">${escapeHtml(r.staff)}</div></div>` : ""}
        <div class="detail-row"><div class="dl">確認ステータス</div><div class="dv">${statusPill(r.status)}</div></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">経費情報</div>
        <div class="detail-row"><div class="dl">購入先</div><div class="dv">${escapeHtml(r.vendor || "—")}</div></div>
        ${r.content   ? `<div class="detail-row"><div class="dl">内容</div><div class="dv">${escapeHtml(r.content)}</div></div>` : ""}
        <div class="detail-row"><div class="dl">金額(税込)</div><div class="dv" style="font-size:20px;color:#0a7a4d;">${yen(r.amount)}</div></div>
        ${r.taxAmount ? `<div class="detail-row"><div class="dl">うち消費税</div><div class="dv">${yen(r.taxAmount)}</div></div>` : ""}
        <div class="detail-row"><div class="dl">支払方法</div><div class="dv">${escapeHtml(r.paymentMethod || "—")}</div></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">経費科目（AI分類 と 本社確定）</div>
        <div class="detail-row"><div class="dl">AI分類科目</div><div class="dv">${escapeHtml(aiCat)}</div></div>
        <div class="detail-row">
          <div class="dl">本社確定科目</div>
          <div class="dv" style="${finalColor}">
            ${escapeHtml(finalCat)}${changeCatLink}
          </div>
        </div>
        ${locked ? `<div class="form-sub" style="color:#0b3d91;font-weight:700;">🔒 月次処理済みのため変更不可</div>` : ""}
      </div>

      ${r.note ? `
      <div class="detail-section">
        <div class="detail-section-title">備考</div>
        <div style="font-size:13px;">${escapeHtml(r.note)}</div>
      </div>` : ""}

      ${r.ocrText ? `
      <div class="detail-section">
        <div class="detail-section-title">OCR読取結果</div>
        <pre class="ocr-text" style="margin:0;">${escapeHtml(r.ocrText)}</pre>
      </div>` : ""}

      ${r.rejection ? `
      <div class="detail-section" style="border-top-color:#f7c8be;">
        <div class="detail-section-title" style="color:#a3232c;">修正依頼コメント（本社→店長）</div>
        <div style="color:#a3232c;font-weight:700;">${escapeHtml(r.rejection.note)}</div>
        <div style="font-size:11px;color:#8a4a3f;margin-top:4px;">${fmtFullDate(r.rejection.at)}</div>
      </div>` : ""}
    `;
  }
  function btn(label, kind, onClick) {
    const b = document.createElement("button");
    b.className = `btn ${kind}`;
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }
  // ---------- モーダル開閉ヘルパ ----------
  function showModalEl(el)  { if (el) el.hidden = false; }
  function hideModalEl(el)  { if (el) el.hidden = true; }
  function closeModal()     { hideModalEl($("#detailModal")); }
  function closeRejectModal(){ hideModalEl($("#rejectModal")); pendingRejectId = null; }
  function closeAllModals() {
    closeModal();
    closeRejectModal();
    if (typeof closeImageZoomModal === "function") closeImageZoomModal();
    if (typeof closeCategoryChangeModal === "function") closeCategoryChangeModal();
    if (typeof closeStoreEditModal === "function") closeStoreEditModal();
  }

  // 確認済みにする
  function markConfirmed(id) {
    const r = records.find(x => x.id === id);
    if (!r) return;
    if (isLocked(r)) { toast("月次処理済みのため変更できません"); return; }
    r.status = "確認済み";
    r.approval = { at: new Date().toISOString(), note: "" };
    delete r.rejection;
    saveAll(records);
    closeAllModals();
    toast("確認済みに変更しました");
    renderAll();
  }
  // 旧名互換（pending-card のインライン承認ボタンから呼ばれる）
  function approve(id) { return markConfirmed(id); }
  // 月次処理済みにする
  function markMonthClosed(id) {
    const r = records.find(x => x.id === id);
    if (!r) return;
    if (r.status !== "確認済み") {
      toast("確認済みにしてから月次処理してください");
      return;
    }
    r.status = "月次処理済み";
    r.monthClosedAt = new Date().toISOString();
    saveAll(records);
    closeAllModals();
    toast("月次処理済みに変更しました");
    renderAll();
  }
  // 月次処理を解除（プロトタイプ・デモ用）
  function unmarkMonthClosed(id) {
    const r = records.find(x => x.id === id);
    if (!r) return;
    if (r.status !== "月次処理済み") return;
    r.status = "確認済み";
    delete r.monthClosedAt;
    saveAll(records);
    closeAllModals();
    toast("月次処理を解除しました（デモ用）");
    renderAll();
  }
  function openReject(id) {
    pendingRejectId = id;
    $("#rejectNote").value = "";
    showModalEl($("#rejectModal"));
    setTimeout(() => $("#rejectNote").focus(), 50);
  }
  function setupRejectModal() {
    // ×ボタン
    $("#rejectCloseBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeRejectModal();
    });
    // キャンセル
    $("#rejectCancelBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeRejectModal();
    });
    // 送信
    $("#rejectSendBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const noteEl = $("#rejectNote");
      const note = (noteEl.value || "").trim();
      if (!note) {
        toast("修正内容を入力してください");
        noteEl.focus();
        return;
      }
      const r = records.find(x => x.id === pendingRejectId);
      if (!r) {
        toast("対象の登録が見つかりません");
        closeRejectModal();
        return;
      }
      r.status = "修正依頼";
      r.rejection = { at: new Date().toISOString(), note };
      delete r.approval;
      saveAll(records);
      closeRejectModal();
      closeModal();
      toast("修正依頼を送信しました");
      renderAll();
    });
    // 背景クリックで閉じる
    $("#rejectModal").addEventListener("click", (e) => {
      if (e.target.id === "rejectModal") closeRejectModal();
    });
  }

  // ================== v3.5: 店舗側 修正・再提出モーダル ==================
  let storeEditingId = null;
  let storeEditingDraft = null;

  function openStoreEditModal(id) {
    const r = records.find(x => x.id === id);
    if (!r) return;
    if (r.status !== "修正依頼") {
      toast("修正依頼中の登録のみ修正できます");
      return;
    }
    storeEditingId = id;
    if (r.type === "sale") {
      storeEditingDraft = {
        type: "sale",
        productName: r.productName || "",
        tireSize:    r.tireSize    || "",
        qty:        Number(r.qty)        || (r.items ? r.items.reduce((s,i)=>s+(Number(i.qty)||0),0) : 1),
        unitPrice:  Number(r.unitPrice)  || 0,
        total:      Number(r.total)      || 0,
        paymentMethod: r.paymentMethod || "",
        carModel:   r.carModel   || "",
        carNumber:  r.carNumber  || "",
        salesCategories: [...(r.salesCategories || [])],
        workContent: r.workContent || "",
        note:       r.note || "",
        customer:   r.customer || ""
      };
      $("#storeEditTitle").textContent = "売上の修正・再提出";
      $("#storeEditBody").innerHTML = buildStoreEditSaleHtml(r);
      bindStoreEditSaleForm();
    } else {
      storeEditingDraft = {
        type: "expense",
        vendor:    r.vendor || "",
        content:   r.content || "",
        amount:    Number(r.amount) || 0,
        taxAmount: Number(r.taxAmount) || 0,
        paymentMethod: r.paymentMethod || "",
        // 店舗側で「AI分類科目」(=r.category) を編集可。本社確定科目は店舗側では変更不可。
        category:  r.category || r.aiCategory || "",
        // レシート画像は再アップロード可
        receiptDataUrl: r.receiptDataUrl || "",
        receiptThumb:   r.receiptThumb || "🧾",
        note:      r.note || ""
      };
      $("#storeEditTitle").textContent = "経費の修正・再提出";
      $("#storeEditBody").innerHTML = buildStoreEditExpenseHtml(r);
      bindStoreEditExpenseForm(r);
    }
    showModalEl($("#storeEditModal"));
  }
  function closeStoreEditModal() {
    hideModalEl($("#storeEditModal"));
    storeEditingId = null;
    storeEditingDraft = null;
  }

  // ===== 売上 修正フォーム HTML =====
  function buildStoreEditSaleHtml(r) {
    const rej = r.rejection || { note: "（修正依頼コメントなし）", at: r.createdAt };
    return `
      <div class="store-edit-comment">
        <div class="sec-comment-label">⚠️ 本社からの修正依頼コメント</div>
        <div class="sec-comment-text">${escapeHtml(rej.note)}</div>
        <div class="sec-comment-at">送信日時: ${rej.at ? fmtFullDate(rej.at) : "—"}</div>
      </div>

      <div class="big-summary">
        <div class="bs-amount-block">
          <div class="bs-label">合計金額</div>
          <div class="bs-amount-row">
            <span class="bs-currency">¥</span>
            <input type="number" id="seSaleTotal" class="bs-amount" inputmode="numeric" placeholder="0" />
          </div>
        </div>
        <div class="bs-grid">
          <div class="bs-cell">
            <div class="bs-label">数量</div>
            <input type="number" id="seSaleQty" class="bs-num" inputmode="numeric" placeholder="1" />
          </div>
          <div class="bs-cell">
            <div class="bs-label">単価</div>
            <input type="number" id="seSaleUnitPrice" class="bs-num" inputmode="numeric" placeholder="0" />
          </div>
        </div>
      </div>

      <h3 class="conf-section-title">支払方法</h3>
      <div class="payment-methods" id="seSalesPaymentMethods" role="radiogroup">
        <button type="button" class="pay-btn" data-pay="現金">現金</button>
        <button type="button" class="pay-btn" data-pay="クレジットカード">カード</button>
        <button type="button" class="pay-btn" data-pay="QR決済">QR決済</button>
        <button type="button" class="pay-btn" data-pay="銀行振込">振込</button>
        <button type="button" class="pay-btn" data-pay="売掛">売掛</button>
        <button type="button" class="pay-btn" data-pay="その他">その他</button>
      </div>

      <h3 class="conf-section-title">売上区分（複数選択可）</h3>
      <div class="cat-all" id="seSalesCatChips"></div>

      <h3 class="conf-section-title">商品・サービス</h3>
      <div class="grid-2">
        <div class="col-span-2">
          <label class="form-label">商品名</label>
          <input type="text" id="seSaleProductName" class="form-input" />
        </div>
        <div class="col-span-2">
          <label class="form-label">タイヤサイズ</label>
          <input type="text" id="seSaleTireSize" class="form-input" placeholder="例:195/65R15" />
        </div>
      </div>

      <h3 class="conf-section-title">車両情報</h3>
      <div class="grid-2">
        <div class="col-span-2">
          <label class="form-label">車種</label>
          <input type="text" id="seSaleCarModel" class="form-input" placeholder="例:プリウス" />
        </div>
      </div>

      <div class="form-block">
        <label class="form-label">作業内容</label>
        <textarea id="seSaleWorkContent" class="form-input" rows="2"></textarea>
      </div>
      <div class="form-block">
        <label class="form-label">備考</label>
        <textarea id="seSaleNote" class="form-input" rows="2"></textarea>
      </div>
    `;
  }
  function bindStoreEditSaleForm() {
    const d = storeEditingDraft;
    $("#seSaleTotal").value     = d.total || "";
    $("#seSaleQty").value       = d.qty || "";
    $("#seSaleUnitPrice").value = d.unitPrice || "";
    $("#seSaleProductName").value = d.productName || "";
    $("#seSaleTireSize").value    = d.tireSize || "";
    $("#seSaleCarModel").value    = d.carModel || "";
    $("#seSaleWorkContent").value = d.workContent || "";
    $("#seSaleNote").value        = d.note || "";

    $("#seSaleTotal").addEventListener("input",     e => d.total     = Number(e.target.value || 0));
    $("#seSaleQty").addEventListener("input",       e => d.qty       = Number(e.target.value || 0));
    $("#seSaleUnitPrice").addEventListener("input", e => d.unitPrice = Number(e.target.value || 0));
    $("#seSaleProductName").addEventListener("input", e => d.productName = e.target.value);
    $("#seSaleTireSize").addEventListener("input",    e => d.tireSize    = e.target.value);
    $("#seSaleCarModel").addEventListener("input",    e => d.carModel    = e.target.value);
    $("#seSaleWorkContent").addEventListener("input", e => d.workContent = e.target.value);
    $("#seSaleNote").addEventListener("input",        e => d.note        = e.target.value);

    // 支払方法
    renderPayButtons("#seSalesPaymentMethods", d.paymentMethod, (val) => {
      d.paymentMethod = val;
      renderPayButtons("#seSalesPaymentMethods", val);
    });

    // 売上区分チップ（複数）
    function renderSeSalesCatChips() {
      const wrap = $("#seSalesCatChips");
      wrap.innerHTML = SALES_CATEGORIES.map(c => `
        <button type="button" class="cat-chip ${d.salesCategories.includes(c) ? "active" : ""}" data-se-sale-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
      `).join("");
      wrap.querySelectorAll("[data-se-sale-cat]").forEach(b => {
        b.addEventListener("click", () => {
          const cat = b.dataset.seSaleCat;
          const i = d.salesCategories.indexOf(cat);
          if (i >= 0) d.salesCategories.splice(i, 1);
          else d.salesCategories.push(cat);
          renderSeSalesCatChips();
        });
      });
    }
    renderSeSalesCatChips();
  }

  // ===== 経費 修正フォーム HTML =====
  function buildStoreEditExpenseHtml(r) {
    const rej = r.rejection || { note: "（修正依頼コメントなし）", at: r.createdAt };
    return `
      <div class="store-edit-comment">
        <div class="sec-comment-label">⚠️ 本社からの修正依頼コメント</div>
        <div class="sec-comment-text">${escapeHtml(rej.note)}</div>
        <div class="sec-comment-at">送信日時: ${rej.at ? fmtFullDate(rej.at) : "—"}</div>
      </div>

      <div class="big-summary expense">
        <div class="bs-amount-block">
          <div class="bs-label">金額（税込）</div>
          <div class="bs-amount-row">
            <span class="bs-currency">¥</span>
            <input type="number" id="seExpenseAmount" class="bs-amount" inputmode="numeric" placeholder="0" />
          </div>
        </div>
        <div class="bs-grid">
          <div class="bs-cell">
            <div class="bs-label">消費税</div>
            <input type="number" id="seExpenseTax" class="bs-num" inputmode="numeric" placeholder="0" />
          </div>
          <div class="bs-cell">
            <div class="bs-label">購入先</div>
            <input type="text" id="seExpenseVendor" class="bs-text" placeholder="例:カインズ" />
          </div>
        </div>
      </div>

      <h3 class="conf-section-title">支払方法</h3>
      <div class="payment-methods" id="seExpensePaymentMethods" role="radiogroup">
        <button type="button" class="pay-btn" data-pay="現金">現金</button>
        <button type="button" class="pay-btn" data-pay="クレジットカード">カード</button>
        <button type="button" class="pay-btn" data-pay="銀行振込">振込</button>
        <button type="button" class="pay-btn" data-pay="口座引落">引落</button>
        <button type="button" class="pay-btn" data-pay="その他">その他</button>
      </div>

      <h3 class="conf-section-title">AI分類科目（タップで変更）</h3>
      <div class="cat-all" id="seExpenseAiCatChips"></div>
      <div class="store-edit-locked-note">
        🔒 <strong>本社確定科目</strong> は本社側でのみ変更可能です。店舗からは変更できません。
      </div>

      <h3 class="conf-section-title">レシート画像</h3>
      <div class="receipt-edit-block">
        <div class="receipt-edit-current" id="seReceiptCurrent"></div>
        <div class="receipt-edit-actions">
          <span class="receipt-edit-source-label" id="seReceiptSrcLabel"></span>
          <label class="btn ghost small" for="seReceiptInput">📷 画像を変更</label>
          <input id="seReceiptInput" type="file" accept="image/*" hidden />
          <button type="button" class="btn ghost small" id="seReceiptRemoveBtn">画像を削除</button>
        </div>
      </div>

      <div class="form-block" style="margin-top:14px;">
        <label class="form-label">内容</label>
        <textarea id="seExpenseContent" class="form-input" rows="2"></textarea>
      </div>
      <div class="form-block">
        <label class="form-label">備考</label>
        <textarea id="seExpenseNote" class="form-input" rows="2"></textarea>
      </div>
    `;
  }
  function bindStoreEditExpenseForm(r) {
    const d = storeEditingDraft;
    $("#seExpenseAmount").value  = d.amount || "";
    $("#seExpenseTax").value     = d.taxAmount || "";
    $("#seExpenseVendor").value  = d.vendor || "";
    $("#seExpenseContent").value = d.content || "";
    $("#seExpenseNote").value    = d.note || "";

    $("#seExpenseAmount").addEventListener("input",  e => d.amount    = Number(e.target.value || 0));
    $("#seExpenseTax").addEventListener("input",     e => d.taxAmount = Number(e.target.value || 0));
    $("#seExpenseVendor").addEventListener("input",  e => d.vendor    = e.target.value);
    $("#seExpenseContent").addEventListener("input", e => d.content   = e.target.value);
    $("#seExpenseNote").addEventListener("input",    e => d.note      = e.target.value);

    renderPayButtons("#seExpensePaymentMethods", d.paymentMethod, (val) => {
      d.paymentMethod = val;
      renderPayButtons("#seExpensePaymentMethods", val);
    });

    // AI分類科目チップ（単一選択）
    function renderSeExpenseCatChips() {
      const wrap = $("#seExpenseAiCatChips");
      wrap.innerHTML = EXPENSE_CATEGORIES.map(c => `
        <button type="button" class="cat-chip ${d.category === c ? "active" : ""}" data-se-exp-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
      `).join("");
      wrap.querySelectorAll("[data-se-exp-cat]").forEach(b => {
        b.addEventListener("click", () => {
          d.category = b.dataset.seExpCat;
          renderSeExpenseCatChips();
        });
      });
    }
    renderSeExpenseCatChips();

    // レシート画像プレビュー
    function renderReceiptPreview() {
      const cur = $("#seReceiptCurrent");
      const lbl = $("#seReceiptSrcLabel");
      if (d.receiptDataUrl) {
        cur.innerHTML = `<img src="${d.receiptDataUrl}" alt="receipt" />`;
        cur.classList.remove("empty");
        lbl.textContent = "📷 アップロード画像";
      } else if (SAMPLE_RECEIPTS.find(s => s.icon === d.receiptThumb)) {
        const sample = SAMPLE_RECEIPTS.find(s => s.icon === d.receiptThumb);
        cur.innerHTML = `<span>${escapeHtml(d.receiptThumb)}</span>`;
        cur.classList.remove("empty");
        lbl.textContent = `📋 サンプル画像（${sample.label}）`;
      } else {
        cur.innerHTML = `<div>画像<br/>なし</div>`;
        cur.classList.add("empty");
        lbl.textContent = "🚫 画像なし";
      }
    }
    renderReceiptPreview();

    $("#seReceiptInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        d.receiptDataUrl = ev.target.result;
        d.receiptThumb = "🧾";
        renderReceiptPreview();
        toast("レシート画像を更新しました");
      };
      reader.readAsDataURL(file);
    });
    $("#seReceiptRemoveBtn").addEventListener("click", () => {
      d.receiptDataUrl = "";
      d.receiptThumb = "🧾";
      renderReceiptPreview();
      toast("レシート画像を削除しました");
    });
  }

  // ===== 修正して再提出 =====
  function submitStoreEdit() {
    if (!storeEditingId || !storeEditingDraft) return;
    const r = records.find(x => x.id === storeEditingId);
    if (!r) {
      toast("対象の登録が見つかりません");
      closeStoreEditModal();
      return;
    }
    const d = storeEditingDraft;

    if (d.type === "sale") {
      if (!d.total || d.total <= 0)         { toast("合計金額を入力してください"); $("#seSaleTotal").focus(); return; }
      if (!d.qty || d.qty <= 0)             { toast("数量を入力してください"); $("#seSaleQty").focus(); return; }
      if (!d.paymentMethod)                  { toast("支払方法を選択してください"); return; }
      if (!d.salesCategories.length)         { toast("売上区分を1つ以上選択してください"); return; }

      r.productName = d.productName;
      r.tireSize    = d.tireSize;
      r.qty         = Number(d.qty);
      r.unitPrice   = Number(d.unitPrice);
      r.total       = Number(d.total);
      r.paymentMethod = d.paymentMethod;
      r.carModel    = d.carModel;
      r.salesCategories = [...d.salesCategories];
      r.workContent = d.workContent;
      r.note        = d.note;
      r.customer    = d.customer;
      // items[] を再生成（旧フォーマット互換）
      const itemName = (r.productName || r.salesCategories[0] || "売上")
                     + (r.tireSize ? ` ${r.tireSize}` : "");
      r.items = [{ name: itemName, qty: r.qty, unitPrice: r.unitPrice }];
    } else {
      if (!d.amount || d.amount <= 0)        { toast("金額を入力してください"); $("#seExpenseAmount").focus(); return; }
      if (!d.vendor)                          { toast("購入先を入力してください"); $("#seExpenseVendor").focus(); return; }
      if (!d.paymentMethod)                   { toast("支払方法を選択してください"); return; }
      if (!d.category)                        { toast("AI分類科目を選択してください"); return; }

      r.vendor    = d.vendor;
      r.content   = d.content;
      r.amount    = Number(d.amount);
      r.taxAmount = Number(d.taxAmount);
      r.paymentMethod = d.paymentMethod;
      // 店舗側では r.category (=AI分類科目) を変更可。aiCategory (immutable snapshot) は維持。
      r.category  = d.category;
      r.receiptDataUrl = d.receiptDataUrl;
      r.receiptThumb   = d.receiptThumb;
      r.note      = d.note;
    }

    // ステータスを「未確認」に戻す（修正依頼一覧から自動的に削除される）
    r.status = "未確認";
    r.resubmittedAt = new Date().toISOString();
    delete r.rejection;
    delete r.approval;

    saveAll(records);
    closeStoreEditModal();
    toast("修正内容を本社へ再提出しました");
    renderAll();
  }

  function setupStoreEditModal() {
    $("#storeEditCloseBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeStoreEditModal();
    });
    $("#storeEditCancelBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeStoreEditModal();
    });
    $("#storeEditSubmitBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      submitStoreEdit();
    });
    $("#storeEditModal").addEventListener("click", (e) => {
      if (e.target.id === "storeEditModal") closeStoreEditModal();
    });
  }

  // ================== v3.3: 画像拡大モーダル ==================
  function openImageZoom(recordId) {
    const r = records.find(x => x.id === recordId);
    if (!r) return;
    const info = getReceiptInfo(r);
    const title = `レシート: ${escapeHtml(r.vendor || "")}`;
    $("#imageZoomTitle").textContent = `レシート: ${r.vendor || ""}`;
    const body = $("#imageZoomBody");
    if (info.kind === "upload") {
      body.innerHTML = `
        <div class="image-zoom-body">
          <img src="${info.dataUrl}" alt="receipt"/>
        </div>
        <div style="text-align:center; padding:10px;">
          <span class="image-zoom-source upload">📷 アップロード画像</span>
        </div>
      `;
    } else if (info.kind === "sample") {
      body.innerHTML = `
        <div class="image-zoom-empty">
          <div class="iz-emoji">${escapeHtml(info.thumb)}</div>
          <div class="iz-label">${escapeHtml(info.label)}</div>
          <div class="image-zoom-source sample">📋 サンプル画像（デモ用）</div>
          <div style="margin-top: 14px; font-size: 12px; color: #6b7488;">本番版ではここに撮影されたレシート画像が表示されます。</div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="image-zoom-empty">
          <div class="iz-emoji">🚫</div>
          <div class="iz-label">画像なし</div>
          <div class="image-zoom-source none">レシート画像未登録</div>
        </div>
      `;
    }
    showModalEl($("#imageZoomModal"));
  }
  function closeImageZoomModal() { hideModalEl($("#imageZoomModal")); }
  function setupImageZoomModal() {
    $("#imageZoomCloseBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeImageZoomModal();
    });
    $("#imageZoomModal").addEventListener("click", (e) => {
      if (e.target.id === "imageZoomModal") closeImageZoomModal();
    });
  }

  // ================== v3.3: 本社確定科目 変更モーダル ==================
  let categoryChangeRecordId = null;
  let categoryChangeSelected = null;

  function openCategoryChange(id) {
    const r = records.find(x => x.id === id);
    if (!r) return;
    if (r.type !== "expense") { toast("経費レコードのみ変更可能です"); return; }
    if (isLocked(r)) { toast("月次処理済みのため変更できません"); return; }

    categoryChangeRecordId = id;
    categoryChangeSelected = r.category;

    const aiCat = r.aiCategory || r.category || "—";
    const isFinalSet = (r.status === "確認済み" || r.status === "月次処理済み");
    const finalCat = isFinalSet ? (r.category || "—") : "未確定";
    $("#categoryChangeInfo").innerHTML = `
      <div class="cci-row">
        <span class="cci-label">購入先</span>
        <strong>${escapeHtml(r.vendor || "—")}</strong>
      </div>
      <div class="cci-row">
        <span class="cci-label">金額</span>
        <strong>${yen(r.amount)}</strong>
      </div>
      <div class="cci-row">
        <span class="cci-label">AI分類科目</span>
        <span>${escapeHtml(aiCat)}</span>
      </div>
      <div class="cci-row">
        <span class="cci-label">本社確定科目（現在）</span>
        <strong>${escapeHtml(finalCat)}</strong>
      </div>
    `;
    renderCategoryChangeChips();
    showModalEl($("#categoryChangeModal"));
  }
  function renderCategoryChangeChips() {
    const wrap = $("#categoryChangeChips");
    wrap.innerHTML = EXPENSE_CATEGORIES.map(c => `
      <button type="button" class="cat-chip ${categoryChangeSelected === c ? "active" : ""}" data-cc-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
    `).join("");
    wrap.querySelectorAll("[data-cc-cat]").forEach(b => {
      b.addEventListener("click", () => {
        categoryChangeSelected = b.dataset.ccCat;
        renderCategoryChangeChips();
      });
    });
  }
  function closeCategoryChangeModal() {
    hideModalEl($("#categoryChangeModal"));
    categoryChangeRecordId = null;
    categoryChangeSelected = null;
  }
  function setupCategoryChangeModal() {
    $("#categoryChangeCloseBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeCategoryChangeModal();
    });
    $("#categoryChangeCancelBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeCategoryChangeModal();
    });
    $("#categoryChangeSaveBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!categoryChangeSelected) {
        toast("科目を選択してください");
        return;
      }
      const r = records.find(x => x.id === categoryChangeRecordId);
      if (!r) {
        toast("対象の経費が見つかりません");
        closeCategoryChangeModal();
        return;
      }
      r.category = categoryChangeSelected;
      saveAll(records);
      closeCategoryChangeModal();
      toast("本社確定科目を更新しました");
      renderAll();
    });
    $("#categoryChangeModal").addEventListener("click", (e) => {
      if (e.target.id === "categoryChangeModal") closeCategoryChangeModal();
    });
  }

  // ================== 月次集計 ==================
  // ================== v3.6: 月次集計 (拡張) ==================
  // 月の締め状態 (4状態 + empty)
  function getMonthLockStatus(ym) {
    const list = records.filter(r => isInMonth(r.createdAt, ym));
    if (!list.length) return { code: "empty",   label: "データなし",      canClose: false, canUnlock: false };
    const pending   = list.filter(r => r.status === "未確認").length;
    const rejected  = list.filter(r => r.status === "修正依頼").length;
    const confirmed = list.filter(r => r.status === "確認済み").length;
    const locked    = list.filter(r => r.status === "月次処理済み").length;
    if (pending > 0 || rejected > 0)         return { code: "blocked", label: "確認待ち",        canClose: false, canUnlock: false };
    if (locked === list.length)              return { code: "closed",  label: "月次締め完了",    canClose: false, canUnlock: true  };
    if (confirmed > 0 && locked === 0)       return { code: "ready",   label: "月次締め可能",    canClose: true,  canUnlock: false };
    if (confirmed > 0 && locked > 0)         return { code: "partial", label: "月次締め進行中",  canClose: true,  canUnlock: true  };
    return { code: "empty", label: "データなし", canClose: false, canUnlock: false };
  }

  // 集計ヘルパ: keysFn が複数キー返す場合は等分配分
  function aggregateBy(list, keysFn, amountFn) {
    const map = {};
    list.forEach(r => {
      let keys = keysFn(r);
      if (!keys || !keys.length) keys = ["(未設定)"];
      const share = (amountFn(r) || 0) / keys.length;
      keys.forEach(k => {
        const key = k || "(未設定)";
        map[key] = (map[key] || 0) + share;
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }
  function aggregateBySalesCats(list) {
    return aggregateBy(list,
      r => (r.salesCategories && r.salesCategories.length) ? r.salesCategories : ["(未分類)"],
      r => r.total
    );
  }
  function aggregateByProduct(list) {
    return aggregateBy(list,
      r => [r.productName || (r.items && r.items[0] && r.items[0].name) || "(未設定)"],
      r => r.total
    ).slice(0, 10);
  }
  function aggregateByTireSize(list) {
    return aggregateBy(list,
      r => [r.tireSize || "(サイズ無し)"],
      r => r.total
    ).slice(0, 10);
  }

  function renderBreakdown(sel, entries, opts) {
    const wrap = $(sel);
    if (!wrap) return;
    if (!entries.length) {
      wrap.innerHTML = `<div class="bd-empty">データなし</div>`;
      return;
    }
    const max = entries.reduce((m, e) => Math.max(m, e[1]), 0) || 1;
    wrap.innerHTML = entries.map(([k, v]) => `
      <div class="cat-row">
        <div class="cr-label" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
        <div class="cr-bar"><div class="cr-bar-fill" style="width:${Math.round(v/max*100)}%"></div></div>
        <div class="cr-amount">${yen(Math.round(v))}</div>
      </div>
    `).join("");
  }

  function renderMonthly() {
    const ym = $("#monthlyPicker").value || monthKey(new Date());
    const sales    = records.filter(r => r.type === "sale"    && isInMonth(r.createdAt, ym));
    const expenses = records.filter(r => r.type === "expense" && isInMonth(r.createdAt, ym));
    const all = [...sales, ...expenses];

    // 対象年月
    const [y, m] = ym.split("-");
    $("#monPeriod").textContent = `${y}年${m}月`;

    // 大型KPI
    const salesTotal = sales.reduce((s,r) => s + r.total, 0);
    const expenseTotal = expenses.reduce((s,r) => s + r.amount, 0);
    const gross = salesTotal - expenseTotal;
    $("#monBigSales").textContent   = yen(salesTotal);
    $("#monBigExpense").textContent = yen(expenseTotal);
    $("#monBigGross").textContent   = yen(gross);
    $("#monSalesCnt").textContent   = `${sales.length}件`;
    $("#monExpenseCnt").textContent = `${expenses.length}件`;

    // ステータス別件数
    const pendingCnt   = all.filter(r => r.status === "未確認").length;
    const rejCnt       = all.filter(r => r.status === "修正依頼").length;
    const confirmedCnt = all.filter(r => r.status === "確認済み").length;
    const lockedCnt    = all.filter(r => r.status === "月次処理済み").length;
    $("#monPendingCnt").textContent   = pendingCnt;
    $("#monRejCnt").textContent       = rejCnt;
    $("#monConfirmedCnt").textContent = confirmedCnt;
    $("#monLockedCnt").textContent    = lockedCnt;

    // 月次締めステータス
    const status = getMonthLockStatus(ym);
    const statusBox = $("#monLockStatusBox");
    statusBox.className = `msb-status ${status.code}`;
    statusBox.textContent = status.label;
    const closeBtn = $("#monthCloseBtn");
    const unlockBtn = $("#monthUnlockBtn");
    closeBtn.disabled = !status.canClose;
    unlockBtn.hidden = !status.canUnlock;

    // 売上 内訳
    renderBreakdown("#bdSalesByPay",
      aggregateBy(sales, r => [r.paymentMethod || "(未設定)"], r => r.total));
    renderBreakdown("#bdSalesByCategory",
      aggregateBySalesCats(sales));
    renderBreakdown("#bdSalesByProduct",
      aggregateByProduct(sales));
    renderBreakdown("#bdSalesByTireSize",
      aggregateByTireSize(sales));

    // 経費 内訳
    renderBreakdown("#bdExpenseByCategory",
      aggregateBy(expenses, r => [r.category || "(未分類)"], r => r.amount));
    renderBreakdown("#bdExpenseByPay",
      aggregateBy(expenses, r => [r.paymentMethod || "(未設定)"], r => r.amount));
    renderBreakdown("#bdExpenseByVendor",
      aggregateBy(expenses, r => [r.vendor || "(未設定)"], r => r.amount).slice(0, 10));
  }

  // ===== 月次締め: 確認済み → 月次処理済み =====
  function monthClose() {
    const ym = $("#monthlyPicker").value || monthKey(new Date());
    const monthRecords = records.filter(r => isInMonth(r.createdAt, ym));
    if (!monthRecords.length) {
      toast("対象月のデータがありません");
      return;
    }
    const blocking = monthRecords.filter(r => r.status === "未確認" || r.status === "修正依頼");
    if (blocking.length > 0) {
      const pendingN = monthRecords.filter(r => r.status === "未確認").length;
      const rejN = monthRecords.filter(r => r.status === "修正依頼").length;
      toast(`未確認(${pendingN}件)または修正依頼中(${rejN}件)のデータがあります。先に確認処理を完了してください。`);
      return;
    }
    const confirmedN = monthRecords.filter(r => r.status === "確認済み").length;
    if (confirmedN === 0) {
      toast("月次処理対象（確認済み）がありません");
      return;
    }
    if (!confirm(`${ym} の確認済みデータ ${confirmedN} 件を月次処理済みに変更します。\nよろしいですか？`)) return;

    const closedAt = new Date().toISOString();
    monthRecords.forEach(r => {
      if (r.status === "確認済み") {
        r.status = "月次処理済み";
        r.monthClosedAt = closedAt;
      }
    });
    saveAll(records);
    toast(`${ym} の月次締めを完了しました（${confirmedN} 件処理）`);
    renderAll();
  }

  // ===== 月次締めの解除 (デモ用) =====
  function monthUnlock() {
    const ym = $("#monthlyPicker").value || monthKey(new Date());
    const lockedRecords = records.filter(r => isInMonth(r.createdAt, ym) && r.status === "月次処理済み");
    if (!lockedRecords.length) {
      toast("対象月に月次処理済みデータがありません");
      return;
    }
    if (!confirm(`${ym} の月次処理済みデータ ${lockedRecords.length} 件を確認済みに戻します（デモ用）。\nよろしいですか？`)) return;
    lockedRecords.forEach(r => {
      r.status = "確認済み";
      delete r.monthClosedAt;
    });
    saveAll(records);
    toast(`${ym} の月次締めを解除しました（${lockedRecords.length} 件）`);
    renderAll();
  }

  // ================== CSV出力 ==================
  function downloadCSV(filename, rows) {
    const csv = "﻿" + rows.map(r => r.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function escapeCsvCell(v) {
    const s = String(v == null ? "" : v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function applyRange(list, range) {
    if (range === "all") return list;
    if (range === "today") {
      const t = todayKey();
      return list.filter(r => isSameDay(r.createdAt, t));
    }
    if (range === "month") {
      const ym = monthKey(new Date());
      return list.filter(r => isInMonth(r.createdAt, ym));
    }
    if (range === "last-month") {
      const ym = lastMonthKey();
      return list.filter(r => isInMonth(r.createdAt, ym));
    }
    return list;
  }
  // ===== v3.6: ファイル名を range/年月から決定 =====
  function csvSuffix(range) {
    if (range === "today")      return todayKey();
    if (range === "month")      return monthKey(new Date());
    if (range === "last-month") return lastMonthKey();
    if (range === "all")        return "all";
    if (/^\d{4}-\d{2}$/.test(range)) return range;
    return monthKey(new Date());
  }
  // ===== v3.6: 売上CSV (15項目) =====
  function exportSalesCSV(range) {
    const r = range || "month";
    const head = [
      "日付","店舗名","担当者","売上区分","商品名","タイヤサイズ",
      "数量","単価","合計金額","支払方法","車種","車両番号",
      "作業内容","備考","確認ステータス"
    ];
    const list = applyRange(records.filter(x => x.type === "sale"), r)
      .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(x => [
        x.date || (x.createdAt ? new Date(x.createdAt).toISOString().slice(0,10) : ""),
        x.storeName || "",
        x.staff || "",
        (x.salesCategories || []).join("、"),
        x.productName || (x.items && x.items[0] && x.items[0].name) || "",
        x.tireSize || "",
        x.qty || (x.items ? x.items.reduce((s,i) => s + (Number(i.qty) || 0), 0) : ""),
        x.unitPrice || "",
        x.total || 0,
        x.paymentMethod || "",
        x.carModel || "",
        x.carNumber || "",
        x.workContent || "",
        x.note || "",
        x.status
      ]);
    downloadCSV(`xchange_sales_${csvSuffix(r)}.csv`, [head, ...list]);
    toast(`売上CSVを出力しました (${list.length}件)`);
  }
  // ===== v3.6: 経費CSV (12項目) =====
  function exportExpenseCSV(range) {
    const r = range || "month";
    const head = [
      "日付","店舗名","担当者","購入先","内容","金額","消費税",
      "支払方法","AI分類科目","本社確定科目","備考","確認ステータス"
    ];
    const list = applyRange(records.filter(x => x.type === "expense"), r)
      .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(x => {
        const aiCat   = x.aiCategory || x.category || "";
        const finalCat= (x.status === "確認済み" || x.status === "月次処理済み") ? (x.category || "") : "未確定";
        return [
          x.date || (x.createdAt ? new Date(x.createdAt).toISOString().slice(0,10) : ""),
          x.storeName || "",
          x.staff || "",
          x.vendor || "",
          x.content || "",
          x.amount || 0,
          x.taxAmount || 0,
          x.paymentMethod || "",
          aiCat,
          finalCat,
          x.note || "",
          x.status
        ];
      });
    downloadCSV(`xchange_expenses_${csvSuffix(r)}.csv`, [head, ...list]);
    toast(`経費CSVを出力しました (${list.length}件)`);
  }
  // ===== v3.6: 月次集計CSV (サマリー10項目 + 全内訳 + 全明細) =====
  function exportMonthlyCSV(ym) {
    const targetYm = ym || $("#monthlyPicker").value || monthKey(new Date());
    const sales    = records.filter(r => r.type === "sale"    && isInMonth(r.createdAt, targetYm));
    const expenses = records.filter(r => r.type === "expense" && isInMonth(r.createdAt, targetYm));
    const all = [...sales, ...expenses];

    const salesTotal   = sales.reduce((s,r) => s + r.total, 0);
    const expenseTotal = expenses.reduce((s,r) => s + r.amount, 0);
    const cost = expenses.filter(isCostCategory).reduce((s,r) => s + r.amount, 0);
    const opex = expenses.filter(r => !isCostCategory(r)).reduce((s,r) => s + r.amount, 0);
    const gross = salesTotal - expenseTotal;
    const pendingCnt   = all.filter(r => r.status === "未確認").length;
    const rejCnt       = all.filter(r => r.status === "修正依頼").length;
    const confirmedCnt = all.filter(r => r.status === "確認済み").length;
    const lockedCnt    = all.filter(r => r.status === "月次処理済み").length;
    const status       = getMonthLockStatus(targetYm);

    const out = [];
    out.push([`X-Change 月次集計レポート ${targetYm}`]);
    out.push([`生成日時: ${fmtFullDate(new Date().toISOString())}`]);
    out.push([]);

    // ===== サマリー (ユーザー仕様の10項目) =====
    out.push(["■ 月次集計サマリー"]);
    out.push([
      "対象年月","売上合計","経費合計","粗利益概算",
      "売上件数","経費件数","未確認件数","修正依頼中件数",
      "月次処理済み件数","月次締めステータス"
    ]);
    out.push([
      targetYm, salesTotal, expenseTotal, gross,
      sales.length, expenses.length,
      pendingCnt, rejCnt, lockedCnt, status.label
    ]);
    out.push([]);

    out.push(["■ 粗利益計算詳細"]);
    out.push(["項目", "金額"]);
    out.push(["売上合計", salesTotal]);
    out.push(["経費合計", expenseTotal]);
    out.push(["うち仕入(タイヤ仕入)", cost]);
    out.push(["うち経費(仕入除く)", opex]);
    out.push(["粗利益概算", gross]);
    out.push([]);

    // ===== 売上 内訳 =====
    out.push(["■ 売上 内訳"]);
    out.push(["[支払方法別]"]);
    out.push(["支払方法","金額"]);
    aggregateBy(sales, r => [r.paymentMethod || "(未設定)"], r => r.total)
      .forEach(([k,v]) => out.push([k, Math.round(v)]));
    out.push([]);
    out.push(["[売上区分別 (複数の場合は等分配分)]"]);
    out.push(["売上区分","金額"]);
    aggregateBySalesCats(sales).forEach(([k,v]) => out.push([k, Math.round(v)]));
    out.push([]);
    out.push(["[商品別 Top 10]"]);
    out.push(["商品名","金額"]);
    aggregateByProduct(sales).forEach(([k,v]) => out.push([k, Math.round(v)]));
    out.push([]);
    out.push(["[タイヤサイズ別 Top 10]"]);
    out.push(["タイヤサイズ","金額"]);
    aggregateByTireSize(sales).forEach(([k,v]) => out.push([k, Math.round(v)]));
    out.push([]);

    // ===== 経費 内訳 =====
    out.push(["■ 経費 内訳"]);
    out.push(["[経費科目別 (本社確定基準)]"]);
    out.push(["経費科目","金額"]);
    aggregateBy(expenses, r => [r.category || "(未分類)"], r => r.amount)
      .forEach(([k,v]) => out.push([k, Math.round(v)]));
    out.push([]);
    out.push(["[支払方法別]"]);
    out.push(["支払方法","金額"]);
    aggregateBy(expenses, r => [r.paymentMethod || "(未設定)"], r => r.amount)
      .forEach(([k,v]) => out.push([k, Math.round(v)]));
    out.push([]);
    out.push(["[購入先別 Top 10]"]);
    out.push(["購入先","金額"]);
    aggregateBy(expenses, r => [r.vendor || "(未設定)"], r => r.amount).slice(0, 10)
      .forEach(([k,v]) => out.push([k, Math.round(v)]));
    out.push([]);

    // ===== 売上 全明細 =====
    out.push(["■ 売上 全明細"]);
    out.push([
      "日付","店舗名","担当者","売上区分","商品名","タイヤサイズ",
      "数量","単価","合計金額","支払方法","車種","車両番号",
      "作業内容","備考","確認ステータス"
    ]);
    sales.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
      .forEach(x => out.push([
        x.date || "",
        x.storeName || "",
        x.staff || "",
        (x.salesCategories || []).join("、"),
        x.productName || (x.items && x.items[0] && x.items[0].name) || "",
        x.tireSize || "",
        x.qty || "",
        x.unitPrice || "",
        x.total || 0,
        x.paymentMethod || "",
        x.carModel || "",
        x.carNumber || "",
        x.workContent || "",
        x.note || "",
        x.status
      ]));
    out.push([]);

    // ===== 経費 全明細 =====
    out.push(["■ 経費 全明細"]);
    out.push([
      "日付","店舗名","担当者","購入先","内容","金額","消費税",
      "支払方法","AI分類科目","本社確定科目","備考","確認ステータス"
    ]);
    expenses.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
      .forEach(x => {
        const aiCat = x.aiCategory || x.category || "";
        const finalCat = (x.status === "確認済み" || x.status === "月次処理済み") ? (x.category || "") : "未確定";
        out.push([
          x.date || "",
          x.storeName || "",
          x.staff || "",
          x.vendor || "",
          x.content || "",
          x.amount || 0,
          x.taxAmount || 0,
          x.paymentMethod || "",
          aiCat,
          finalCat,
          x.note || "",
          x.status
        ]);
      });

    downloadCSV(`xchange_monthly_summary_${targetYm}.csv`, out);
    toast(`月次集計CSVを出力しました (${targetYm})`);
  }
  function renderHQCSV() {
    const m = $("#csvMonthlyMonth");
    if (!m.value) m.value = monthKey(new Date());
  }

  // ================== 全画面レンダリング ==================
  function renderAll() {
    if (currentRole === "store") {
      renderStoreDashboard();
      // 同時に表示中のサブ画面も更新
      const active = document.querySelector('[data-pane="store"] .screen.active');
      if (active) {
        const name = active.dataset.screen;
        if (name === "store-today-sales")    renderStoreTodaySales();
        if (name === "store-today-expenses") renderStoreTodayExpenses();
        if (name === "store-rejections")     renderStoreRejections();
      }
    } else {
      renderHQDashboard();
      renderHQSales();
      renderHQExpenses();
      renderHQPending();
      renderMonthly();
      // v3.16: 売上集計タブが表示中なら再描画
      const sr = document.querySelector('[data-hq-screen="sales-report"]');
      if (sr && sr.classList.contains("active")) renderSalesReport();
    }
  }

  // ================== バインド ==================
  function bindGlobal() {
    // ロール切替
    $$(".role-btn").forEach(b => b.addEventListener("click", () => setRole(b.dataset.role)));

    // data-go (店舗)
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-go]");
      if (t) { e.preventDefault(); goScreen(t.dataset.go); }
    });

    // 本社サイドバー
    $$(".hq-nav-item").forEach(b => b.addEventListener("click", () => setHQTab(b.dataset.hqTab)));

    // ダッシュボードKPIから未確認一覧へジャンプ
    $$("[data-hq-jump]").forEach(c => c.addEventListener("click", () => setHQTab(c.dataset.hqJump)));

    // 未確認タブ
    $$(".pending-tab").forEach(b => b.addEventListener("click", () => {
      pendingFilter = b.dataset.pendingType;
      $$(".pending-tab").forEach(x => x.classList.toggle("active", x === b));
      renderHQPending();
    }));

    // モーダル: 詳細
    $("#detailModal").addEventListener("click", (e) => {
      if (e.target.id === "detailModal") closeModal();
    });
    $("#modalCloseBtn").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeModal();
    });
    // モーダル: ESCキーで全モーダルを閉じる
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });

    // フィルタ
    $("#salesFilter").addEventListener("change", renderHQSales);
    $("#expenseFilter").addEventListener("change", renderHQExpenses);
    // v3.2: 日付ソート切替ボタン
    $("#salesSortBtn").addEventListener("click", () => {
      hqSort.sales = hqSort.sales === "desc" ? "asc" : "desc";
      renderHQSales();
    });
    $("#expenseSortBtn").addEventListener("click", () => {
      hqSort.expenses = hqSort.expenses === "desc" ? "asc" : "desc";
      renderHQExpenses();
    });
    $("#pendingSortBtn").addEventListener("click", () => {
      hqSort.pending = hqSort.pending === "desc" ? "asc" : "desc";
      renderHQPending();
    });
    $("#monthlyPicker").addEventListener("change", renderMonthly);

    // v3.6: 月次締め / 解除 ボタン
    $("#monthCloseBtn").addEventListener("click", monthClose);
    $("#monthUnlockBtn").addEventListener("click", monthUnlock);

    // CSV (一覧のクイックボタン: 既定は今月)
    $("#exportSalesCsv").addEventListener("click",  () => exportSalesCSV("month"));
    $("#exportExpenseCsv").addEventListener("click",() => exportExpenseCSV("month"));
    $("#exportMonthlyCsv").addEventListener("click",() => exportMonthlyCSV());

    // CSV出力センター
    $("#csvSalesBtn").addEventListener("click",   () => exportSalesCSV($("#csvSalesRange").value));
    $("#csvExpenseBtn").addEventListener("click", () => exportExpenseCSV($("#csvExpenseRange").value));
    $("#csvMonthlyBtn").addEventListener("click", () => exportMonthlyCSV($("#csvMonthlyMonth").value));

    // データ初期化
    $("#resetDataBtn").addEventListener("click", () => {
      if (!confirm("デモデータを初期状態に戻します。よろしいですか？")) return;
      localStorage.removeItem(STORAGE_KEY);
      records = loadAll();
      renderAll();
      toast("デモデータを初期化しました");
    });
  }

  // ================== 起動 ==================
  function init() {
    bindGlobal();
    setupVoiceUI();
    setupSalesConfirm();
    setupExpenseUpload();
    setupExpenseConfirm();
    setupRejectModal();
    setupImageZoomModal();
    setupCategoryChangeModal();
    setupStoreEditModal();
    setupSalesReport();
    setRole("store");
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
