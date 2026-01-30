/**
 * ココフォリアのログHTMLを解析する関数
 * (x4分割対応 + 誤検知防止強化版)
 */
function parseCCFoliaLog(doc) {
    const results = [];
    const paragraphs = doc.querySelectorAll('p');
    
    paragraphs.forEach((p, index) => {
        const spans = p.querySelectorAll('span');
        if (spans.length < 3) return; 

        // 1. タブ名
        let rawTab = spans[0].textContent.trim();
        rawTab = rawTab.replace(/^\[|\]$/g, '').trim(); 
        const tabId = rawTab; 
        parsedTabNames[tabId] = rawTab;

        // 2. キャラ名
        let charName = spans[1].textContent.trim();
        charName = charName.replace(/[:：]$/, '').trim();
        if (!charName) return;

        // 3. 内容
        const contentSpan = spans[2];
        const contentText = contentSpan.textContent.trim();

        // 厳密なダイスロール判定 (半角矢印、シークレット系コマンド対応)
        
        // A. 矢印の直後に数値 (＞ > -> →)
        const hasArrowNumber = /(?:[＞→>]|->)\s*\d+/.test(contentText);
        
        // B. ダイス展開式がある (例: (1D100<=70))
        const hasDiceFormula = /\(\d+D\d+/.test(contentText);
        
        // C. 繰り返しロール記号がある (例: #1)
        const hasRepeat = /#\d+/.test(contentText);
        
        // D. 明らかなBCDiceコマンドが含まれる (CCB, RES, 1D100, x数字, SCC, SRES, SCBR)
        const hasCommand = /(?:S?CC|S?RES|S?CBR|SCC|1D100|x\d+)/i.test(contentText);

        // いずれにも該当しない場合は「ただのチャット」とみなして除外
        if (!hasArrowNumber && !hasDiceFormula && !hasRepeat && !hasCommand) return;

        // キャラ名登録
        parsedCharNames.add(charName);
        const color = extractColorStyle(p);
        if (color) charColors[charName] = color;

        // --- コマンドと結果の分離 ---
        let command = "";
        let result = "";

        const hashOneIndex = contentText.indexOf('#1');
        
        if (hashOneIndex !== -1) {
            command = contentText.substring(0, hashOneIndex).trim();
            result = contentText.substring(hashOneIndex).trim();
        } else {
            // 矢印も半角対応
            const arrowMatch = contentText.match(/[＞→>]|->/);
            if (arrowMatch) {
                const arrowIndex = arrowMatch.index;
                const preArrowText = contentText.substring(0, arrowIndex);
                const lastParenIndex = preArrowText.lastIndexOf('(');
                
                if (lastParenIndex !== -1) {
                    command = contentText.substring(0, lastParenIndex).trim();
                    result = contentText.substring(lastParenIndex).trim();
                } else {
                    command = contentText.substring(0, arrowIndex).trim();
                    result = contentText.substring(arrowIndex).trim();
                }
            } else {
                return; // 解析不能
            }
        }

        if (!command) command = "ダイスロール";

        // --- 分割登録 ---
        if (result.startsWith('#1')) {
            const matches = result.match(/#\d+[\s\S]*?(?=(#\d+|$))/g);

            if (matches) {
                matches.forEach(subRes => {
                    const trimmedRes = subRes.trim();
                    results.push({
                        type: 'ccfolia',
                        tabId: tabId,
                        tabName: rawTab,
                        charName: charName,
                        command: command, 
                        result: trimmedRes, 
                        originalIndex: index
                    });
                });
            }
        } else {
            results.push({
                type: 'ccfolia',
                tabId: tabId,
                tabName: rawTab,
                charName: charName,
                command: command,
                result: result, 
                originalIndex: index
            });
        }
    });

    return results;
}