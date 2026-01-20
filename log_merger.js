/**
 * log_merger.js
 * 複数のログファイルを結合してダウンロードする機能
 */

const mergerToggle = document.getElementById('merger-toggle');
const mergerBody = document.getElementById('merger-body');
const mergerDropZone = document.getElementById('merger-drop-zone');
const mergerFileInput = document.getElementById('merger-file-input');
const mergerFileListDisplay = document.getElementById('merger-file-list');
const btnMerge = document.getElementById('btn-merge-download');
const mergerStatus = document.getElementById('merger-status');

let accumulatedFiles = [];

// アコーディオン開閉
if (mergerToggle) {
    mergerToggle.addEventListener('click', () => {
        mergerBody.classList.toggle('open');
        const icon = mergerToggle.querySelector('.accordion-icon');
        if(icon) icon.style.transform = mergerBody.classList.contains('open') ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
}

// --- ドラッグ＆ドロップ処理 ---
if (mergerDropZone) {
    mergerDropZone.addEventListener('click', (e) => {
        if (e.target.closest('.merger-remove-btn') || e.target.closest('.merger-clear-btn')) return;
        mergerFileInput.click();
    });

    ['dragover', 'dragenter'].forEach(evt => {
        mergerDropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            mergerDropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        mergerDropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            mergerDropZone.classList.remove('dragover');
        });
    });

    mergerDropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            addFiles(files);
        }
    });
}

if (mergerFileInput) {
    mergerFileInput.addEventListener('change', (e) => {
        if(e.target.files.length > 0) {
            addFiles(e.target.files);
            mergerFileInput.value = ''; 
        }
    });
}

function addFiles(fileList) {
    const newFiles = Array.from(fileList);
    newFiles.forEach(file => {
        const isDuplicate = accumulatedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!isDuplicate) {
            accumulatedFiles.push(file);
        }
    });
    updateFileListUI();
}

function updateFileListUI() {
    if (!mergerFileListDisplay) return;
    mergerFileListDisplay.innerHTML = "";
    
    if (accumulatedFiles.length === 0) {
        mergerStatus.textContent = "";
        return;
    }

    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.marginBottom = '5px';
    headerDiv.innerHTML = `
        <span style="font-size:11px; font-weight:bold;">選択中のファイル: ${accumulatedFiles.length}件</span>
        <button class="merger-clear-btn" style="font-size:10px; cursor:pointer;">全クリア</button>
    `;
    mergerFileListDisplay.appendChild(headerDiv);

    headerDiv.querySelector('.merger-clear-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        accumulatedFiles = [];
        updateFileListUI();
    });

    accumulatedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'merger-file-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        
        item.innerHTML = `
            <span>${file.name}</span>
            <span class="merger-remove-btn" data-index="${index}" style="cursor:pointer; color:#999; font-weight:bold;">×</span>
        `;
        mergerFileListDisplay.appendChild(item);
    });

    document.querySelectorAll('.merger-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(e.target.dataset.index);
            accumulatedFiles.splice(idx, 1);
            updateFileListUI();
        });
    });
    
    mergerStatus.textContent = `${accumulatedFiles.length}個のファイルが待機中...`;
}

if (btnMerge) {
    btnMerge.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        if (accumulatedFiles.length < 2) {
            alert("結合するには2つ以上のファイルを選択してください。");
            return;
        }

        try {
            let processFiles = [...accumulatedFiles];
            
            // 順序チェックロジック
            if (isSequential(processFiles)) {
                mergerStatus.textContent = "並び順通りに結合中...";
            } else {
                mergerStatus.textContent = "ファイル名から自動並び替え中...";
                processFiles = sortFilesSmartly(processFiles);
            }
            
            // ファイル名生成
            const outputFilename = generateSmartFilename(processFiles);

            const combinedHtml = await mergeFilesNative(processFiles);
            downloadMergedLog(combinedHtml, outputFilename);
            
            mergerStatus.textContent = "結合完了！ダウンロードされました。";
        } catch (e) {
            console.error(e);
            mergerStatus.textContent = "エラーが発生しました: " + e.message;
        }
    });
}

/**
 * ファイル名生成関数
 * 日付、日目(漢数字対応)、Day表記、タグを検知して範囲表記にする
 */
function generateSmartFilename(files) {
    if (!files || files.length === 0) return "merged_log.html";

    const firstFile = files[0].name;
    const lastFile = files[files.length - 1].name;

    // 拡張子を除去したベース名
    let newName = firstFile.replace(/\.html$/i, '');

    // 1. 日付範囲 (YYYYMMDD) の処理
    const dateRegex = /^(\d{8})/;
    const dateMatchFirst = firstFile.match(dateRegex);
    const dateMatchLast = lastFile.match(dateRegex);

    if (dateMatchFirst && dateMatchLast) {
        const date1 = dateMatchFirst[1];
        const date2 = dateMatchLast[1];
        if (date1 !== date2) {
            newName = newName.replace(date1, `${date1}-${date2}`);
        }
    }

    // 2. 汎用ナンバリング処理 (Day, 日目, #)
    // 複数のパターンを試行する
    const numberPatterns = [
        // パターンA: 〇日目 (数字は半角/全角/漢数字、前後の記号は任意)
        // キャプチャグループ1: 数字部分
        /(?:【|\[|［|\s|^)([0-9０-９壱弐参四五六七八九十]+)日目(?:】|\]|］|\s|$)/,
        
        // パターンB: Day〇 (スペースや_許容)
        /Day[\s_]*([0-9０-９]+)/i,
        
        // パターンC: #〇
        /#([0-9０-９]+)/
    ];

    for (const pattern of numberPatterns) {
        const matchFirst = newName.match(pattern); // ベース名から検索
        const matchLast = lastFile.match(pattern); // 最後のファイル名から検索

        if (matchFirst && matchLast) {
            const numStr1 = matchFirst[1]; // 数字部分 (例: "1", "壱")
            const numStr2 = matchLast[1]; // 数字部分 (例: "3", "参")

            // 数字部分が異なれば範囲化して置換
            // 全体マッチ文字列 (例: "【1日目】") の中の 数字部分だけ を Start-End に置き換えるのは難しいので、
            // 「数字部分」を「Start-End」に単純置換するアプローチをとる
            // ただし、誤爆を防ぐため matchFirst[0] (全体マッチ) 内で置換する
            
            if (numStr1 !== numStr2) {
                const originalPart = matchFirst[0]; // 例: "【1日目】"
                // "【1日目】" の中の "1" を "1-3" にする
                const newPart = originalPart.replace(numStr1, `${numStr1}-${numStr2}`);
                newName = newName.replace(originalPart, newPart);
                
                // 1つマッチして置換したらループを抜ける（多重置換を防ぐため）
                break; 
            }
        }
    }

    // 3. ココフォリアタグ [main] 等の処理
    const bracketRegex = /\[([^\]]+)\]$/; // 末尾の[...]
    // ベース名からチェック (拡張子除去済み)
    const matchTagFirst = newName.match(bracketRegex);
    const matchTagLast = lastFile.replace(/\.html$/i, '').match(bracketRegex);

    if (matchTagFirst && matchTagLast) {
        const tag1 = matchTagFirst[1];
        const tag2 = matchTagLast[1];
        if (tag1 !== tag2) {
            newName = newName.replace(`[${tag1}]`, `[${tag1}-${tag2}]`);
        }
    }

    return newName + "まとめ.html";
}

function isSequential(files) {
    let previousNum = -1;
    let foundNumber = false;

    for (const file of files) {
        const match = file.name.match(/(\d+)/);
        if (match) {
            foundNumber = true;
            const currentNum = parseInt(match[1], 10);
            if (currentNum < previousNum) return false; 
            previousNum = currentNum;
        } else {
            return false;
        }
    }
    return foundNumber;
}

function sortFilesSmartly(files) {
    const keywordOrder = {
        "事前": -10, "準備": -9, "顔合わせ": -8, "作成": -7,
        "前半": 0.1, "中盤": 0.5, "後半": 0.9, 
        "延長": 100, "感想": 101, "反省": 102
    };

    return files.sort((a, b) => {
        const nameA = a.name;
        const nameB = b.name;

        let scoreA = 0;
        let scoreB = 0;
        for (const [key, score] of Object.entries(keywordOrder)) {
            if (nameA.includes(key)) scoreA = score;
            if (nameB.includes(key)) scoreB = score;
        }
        if (scoreA !== scoreB) return scoreA - scoreB;

        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
}

async function mergeFilesNative(files) {
    const baseText = await readFileAsText(files[0]);
    const parser = new DOMParser();
    const baseDoc = parser.parseFromString(baseText, 'text/html');

    let baseType = 'ccfolia';
    let container = baseDoc.body; 

    if (baseDoc.querySelector('.chatlog')) {
        baseType = 'tekey';
        container = baseDoc.querySelector('.chatlog');
    }

    const tocLinks = [];
    const firstSectionId = 'log-part-0';
    tocLinks.push({ name: files[0].name, id: firstSectionId });

    const firstMarker = baseDoc.createElement('div');
    firstMarker.id = firstSectionId;
    container.insertBefore(firstMarker, container.firstChild);

    for (let i = 1; i < files.length; i++) {
        const file = files[i];
        const text = await readFileAsText(file);
        const subDoc = parser.parseFromString(text, 'text/html');
        const sectionId = `log-part-${i}`;

        const separator = baseDoc.createElement('div');
        separator.id = sectionId;
        separator.style.borderTop = "2px dashed #888"; 
        separator.style.margin = "50px 0 20px";
        separator.style.textAlign = "center";
        separator.style.color = "#888"; 
        separator.style.fontSize = "14px";
        separator.style.fontWeight = "bold";
        separator.style.backgroundColor = "transparent";
        separator.textContent = `▼ ${file.name} ▼`;
        container.appendChild(separator);

        if (baseType === 'tekey') {
            const subChatlog = subDoc.querySelector('.chatlog');
            if (subChatlog) {
                while (subChatlog.firstChild) {
                    container.appendChild(subChatlog.firstChild); 
                }
            }
        } else {
            const subBody = subDoc.body;
            while (subBody.firstChild) {
                container.appendChild(subBody.firstChild);
            }
        }

        tocLinks.push({ name: file.name, id: sectionId });
    }

    const styleTag = baseDoc.createElement('style');
    styleTag.textContent = `
        #merged-toc-fab {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            background-color: #8c7b75;
            color: white;
            border-radius: 50%;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 2147483647;
            font-size: 24px;
            user-select: none;
            transition: transform 0.2s, background-color 0.2s;
            -webkit-tap-highlight-color: transparent;
        }
        #merged-toc-fab:hover {
            transform: scale(1.05);
            background-color: #7a6a65;
        }
        #merged-toc-fab:active {
            transform: scale(0.95);
        }

        #merged-toc-popup {
            display: none;
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 280px;
            max-height: 60vh;
            background-color: #ffffff;
            color: #333333;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 2147483647;
            overflow-y: auto;
            border: 1px solid #ccc;
            font-family: sans-serif;
            animation: tocFadeIn 0.2s ease;
        }
        #merged-toc-popup.show {
            display: block;
        }
        @keyframes tocFadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .toc-header {
            padding: 12px 15px;
            background-color: #f2f2f2;
            border-bottom: 1px solid #ddd;
            font-weight: bold;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
        }
        .toc-close {
            cursor: pointer;
            font-size: 18px;
            color: #666;
            line-height: 1;
        }

        .toc-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .toc-list li {
            border-bottom: 1px solid #eee;
        }
        .toc-list li:last-child {
            border-bottom: none;
        }
        .toc-list a {
            display: block;
            padding: 12px 15px;
            text-decoration: none;
            color: #333;
            font-size: 14px;
            transition: background 0.2s;
        }
        .toc-list a:hover {
            background-color: #e6e6e6;
            color: #8c7b75;
        }

        @media (max-width: 480px) {
            #merged-toc-popup {
                width: 85%;
                right: 50%;
                transform: translateX(50%);
                bottom: 90px;
            }
        }
    `;
    baseDoc.head.appendChild(styleTag);

    const fab = baseDoc.createElement('div');
    fab.id = 'merged-toc-fab';
    fab.innerHTML = '≡';
    fab.title = '目次を開く';

    const popup = baseDoc.createElement('div');
    popup.id = 'merged-toc-popup';
    
    const header = baseDoc.createElement('div');
    header.className = 'toc-header';
    header.innerHTML = `<span>目次 (${tocLinks.length})</span><span class="toc-close">×</span>`;
    popup.appendChild(header);

    const ul = baseDoc.createElement('ul');
    ul.className = 'toc-list';

    tocLinks.forEach(link => {
        const li = baseDoc.createElement('li');
        const a = baseDoc.createElement('a');
        a.href = `#${link.id}`;
        a.textContent = link.name;
        a.className = 'toc-link';
        li.appendChild(a);
        ul.appendChild(li);
    });
    popup.appendChild(ul);

    const scriptTag = baseDoc.createElement('script');
    scriptTag.textContent = `
        (function() {
            var fab = document.getElementById('merged-toc-fab');
            var popup = document.getElementById('merged-toc-popup');
            var closeBtn = popup.querySelector('.toc-close');
            var links = popup.querySelectorAll('.toc-link');

            function togglePopup() {
                popup.classList.toggle('show');
                fab.innerHTML = popup.classList.contains('show') ? '×' : '≡';
            }

            fab.addEventListener('click', togglePopup);
            closeBtn.addEventListener('click', togglePopup);

            for(var i=0; i<links.length; i++) {
                links[i].addEventListener('click', function() {
                    popup.classList.remove('show');
                    fab.innerHTML = '≡';
                });
            }
        })();
    `;

    baseDoc.body.appendChild(fab);
    baseDoc.body.appendChild(popup);
    baseDoc.body.appendChild(scriptTag);

    return baseDoc.documentElement.outerHTML;
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

function downloadMergedLog(htmlContent, filename) {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    if (!filename) {
        const now = new Date();
        const dateStr = now.toISOString().slice(0,10).replace(/-/g, '');
        filename = `merged_log_${dateStr}.html`;
    }
    
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}