// --- 初期値リスト (COC6版) ---
const SKILL_BASE_VALUES = {
    "回避": "DEX*2", "キック": 25, "組み付き": 25, "こぶし": 50, "頭突き": 10, 
    "投擲": 25, "マーシャルアーツ": 1, "拳銃": 20, "サブマシンガン": 15, 
    "ショットガン": 30, "マシンガン": 15, "ライフル": 25,
    "応急手当": 30, "鍵開け": 1, "隠す": 15, "隠れる": 10, "聞き耳": 25, 
    "忍び歩き": 10, "写真術": 10, "精神分析": 1, "追跡": 10, "登攀": 40, 
    "図書館": 25, "目星": 25,
    "運転": 20, "機械修理": 20, "重機械操作": 1, "乗馬": 5, "水泳": 25, 
    "製作": 5, "制作": 5, "操縦": 1, "跳躍": 25, "電気修理": 10, "ナビゲート": 10, "変装": 1,
    "言いくるめ": 5, "信用": 15, "説得": 15, "値切り": 5, "母国語": "EDU*5", "ほかの言語": 1, "他の言語": 1,
    "医学": 5, "オカルト": 5, "化学": 1, "クトゥルフ神話": 0, "芸術": 5, 
    "経理": 10, "考古学": 1, "コンピューター": 1, "心理学": 5, "人類学": 1, 
    "生物学": 1, "地質学": 1, "電子工学": 1, "天文学": 1, "博物学": 10, 
    "物理学": 1, "法律": 5, "薬学": 1, "歴史": 20,
    "ナイフ": 25, "サーベル": 15, "杖": 25, "剣": 20, "斧": 20, "青龍刀": 10, "薙刀": 10, "鎖鎌": 5, "ムチ": 5, "日本刀": 15, "弓": 10 
};

// サブ名称を保持すべき技能（前方一致しても切り捨てない技能）
const VARIABLE_SKILLS = [
    "運転", "製作", "制作", "操縦", "芸術", 
    "母国語", "ほかの言語", "他の言語", 
    "サバイバル", "科学"
];

// ステータス系キーワード
const STATUS_KEYWORDS = ["SAN", "正気度", "アイデア", "幸運", "知識", "INT", "POW", "EDU", "STR", "DEX", "APP", "SIZ", "CON"];

// グローバル変数
let globalLogContent = "";
let parsedTabNames = {};
let parsedCharNames = new Set();
let charColors = {}; 
let currentSortMode = "time"; 
let globalParsedRolls = []; 

// --- データリセット関数 (新規読み込み時に使用) ---
function resetGlobalData() {
    globalLogContent = "";
    parsedTabNames = {};
    parsedCharNames = new Set();
    charColors = {};
    globalParsedRolls = [];
    
    const tabDiv = document.getElementById('tab-checkboxes');
    const charDiv = document.getElementById('char-checkboxes');
    if(tabDiv) tabDiv.innerHTML = "";
    if(charDiv) charDiv.innerHTML = "";
    
    const resDiv = document.getElementById('result-area');
    if(resDiv) resDiv.innerHTML = "";
}

// --- 共通ヘルパー関数 ---
function colorToRgba(colorStr, alpha) {
    if(!colorStr) return null;
    const rgbMatch = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if(rgbMatch) return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    if(colorStr.startsWith('#')) {
        let hex = colorStr.slice(1);
        if(hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        const r = parseInt(hex.substring(0,2), 16);
        const g = parseInt(hex.substring(2,4), 16);
        const b = parseInt(hex.substring(4,6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return colorStr;
}

function extractColorStyle(element) {
    if (!element) return null;
    if (element.style && element.style.color) return element.style.color;
    
    const styleAttr = element.getAttribute('style');
    if (styleAttr) {
        const match = styleAttr.match(/color\s*:\s*([^;]+)/i);
        if (match) return match[1].trim();
    }
    
    const b = element.querySelector('b');
    if (b && b.style.color) return b.style.color;
    if (b) {
        const child = b.querySelector('[style*="color"], font[color]');
        if (child) return child.style.color || child.getAttribute('color');
    }
    return null;
}

// ・基本技能は前方一致で統一（拳銃FN→拳銃）
// ・可変技能（芸術等）は、閉じ括弧以降のチャット文字を削除して統一
function normalizeSkillName(rawName) {
    if (!rawName) return "";
    
    // 1. まず基本的なクリーニング（全角半角、記号除去）
    let name = rawName.trim();
    
    // 【】の除去
    name = name.replace(/[【】]/g, '');
    
    // 全角英数字を半角に
    name = name.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    
    // 末尾の計算式(+10, -5など)を除去
    name = name.replace(/([+\-*\/]\d+)+$/, '').trim();
    
    // 末尾の単なる数字を除去 (拳銃2 -> 拳銃) ※スペース区切りがない場合も考慮
    name = name.replace(/\s*\d+$/, '').trim();

    // 2. 技能リストに基づいた「強力な名寄せ」
    const baseSkills = Object.keys(SKILL_BASE_VALUES).sort((a, b) => b.length - a.length);

    for (const base of baseSkills) {
        // 先頭が基本技能名で始まっているかチェック
        if (name.startsWith(base)) {
            // 例外リスト（可変技能）に含まれているか？
            if (VARIABLE_SKILLS.includes(base)) {
                // ★追加ロジック: 閉じ括弧以降をカットする
                // 例: "製作（料理）おいしい！" -> "製作（料理）"
                // 閉じ括弧「）」または「)」がある場合、そこまでを抽出
                const parenMatch = name.match(/^(.+?[）)])/);
                if (parenMatch) {
                    return parenMatch[1].trim();
                }
                
                // 括弧がない場合はそのまま（例：「芸術：絵画」など）
                return name; 
            }
            
            // 固定技能（拳銃、回避など）なら、後ろに何がついていようと基本名に統一
            // 例: "拳銃FN" -> "拳銃"
            return base;
        }
    }

    // リストになければ、クリーニング後の名前をそのまま返す
    return name;
}

function normalizeTabName(rawTab) {
    if (!rawTab) return "不明";
    if (/メイン|main/i.test(rawTab)) return "メイン";
    if (/情報/.test(rawTab)) return "情報";
    return rawTab;
}

function getSkillBaseValue(skillName) {
    if (!skillName) return null;
    if (skillName.includes("回避") || skillName.includes("母国語")) return null;
    for (const [key, val] of Object.entries(SKILL_BASE_VALUES)) {
        if (typeof val === 'number' && skillName.includes(key)) return val;
    }
    // デフォルト値のフォールバック
    if (skillName.includes("製作") || skillName.includes("制作") || skillName.includes("芸術")) return 5;
    if (skillName.includes("運転") || skillName.includes("機械修理")) return 20;
    if (skillName.includes("操縦")) return 1;
    if (skillName.includes("言語") || skillName.includes("語")) return 1;
    return null; 
}

function isStatusRoll(skillName) {
    if(!skillName) return false;
    const upper = skillName.toUpperCase();
    return STATUS_KEYWORDS.some(k => upper.includes(k));
}
function isMultiplierRoll(skillName) {
    if(!skillName) return false;
    return /[*×]\s*\d+/.test(skillName);
}