/**
 * TekeyのログHTMLを解析する関数
 * (x4分割対応 + 誤検知防止強化版)
 */
function parseTekeyLog(doc) {
    const results = [];
    
    // 1. タブ情報取得
    const tabLabels = doc.querySelectorAll('.tab-list label.tab-checkbox');
    let hasTabs = false;

    if (tabLabels.length > 0) {
        tabLabels.forEach(label => {
            const input = label.querySelector('input');
            if (input && input.id) {
                parsedTabNames[input.id] = label.textContent.trim();
                hasTabs = true;
            }
        });
    } else {
        doc.querySelectorAll('.chatlog > div').forEach(node => {
            node.classList.forEach(cls => { 
                if(cls.startsWith('tab')) {
                    parsedTabNames[cls] = cls; 
                    hasTabs = true;
                }
            });
        });
    }

    if (!hasTabs) {
        parsedTabNames["unknown"] = "メイン";
    }

    // 2. ログ要素の収集
    let logNodes = doc.querySelectorAll('.chat-log-item');
    let mode = 'v2';

    if (logNodes.length === 0) {
        // ★修正: .diceroll クラスが無い行（公開されたシークレットダイス等）も拾うため、
        // .diceroll だけでなく、.chatlog 直下のすべての div を取得して中身を判定させる
        logNodes = doc.querySelectorAll('.chatlog > div');
        mode = 'legacy';
    }

    // クリーニング用正規表現
    const timeRegex = /\[?\s*\d{1,2}:\d{2}\s*\]?/g;
    const botNameRegex = /(?:Cthulhu|System|DiceBot)\s*[:：]\s*/ig;

    logNodes.forEach((node, index) => {
        if (node.classList.contains('system')) return;

        // --- 基本情報の抽出 ---
        let tabId = "unknown";
        let charName = "不明";
        let fullText = "";
        let time = "";

        if (mode === 'v2') {
            const tabEl = node.querySelector('.tab-name');
            if (tabEl) {
                const tName = tabEl.textContent.trim();
                tabId = tName; 
                if (!parsedTabNames[tabId]) parsedTabNames[tabId] = tName;
            } else {
                for (const cls of node.classList) {
                    if (parsedTabNames[cls]) { tabId = cls; break; }
                }
            }
            
            const nameEl = node.querySelector('.name');
            charName = nameEl ? nameEl.textContent.trim() : "不明";
            
            const timeEl = node.querySelector('.date');
            time = timeEl ? timeEl.textContent.trim() : "";

            const bodyEl = node.querySelector('.body');
            if (!bodyEl) return;
            fullText = bodyEl.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
            
        } else {
            for (const cls of node.classList) {
                if (parsedTabNames[cls]) { tabId = cls; break; }
            }
            const nameEl = node.querySelector('b');
            if (!nameEl) return;
            charName = nameEl.textContent.replace(/[：:]\s*$/, '').trim();
            
            let rawHtml = node.innerHTML;
            const nameHtml = nameEl.outerHTML;
            const splitName = rawHtml.split(nameHtml);
            let contentHtml = splitName.length > 1 ? splitName[1] : rawHtml;
            fullText = contentHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
        }

        const txt = document.createElement("textarea");
        txt.innerHTML = fullText;
        fullText = txt.value;

        // --- コマンドと結果の分離 ---
        let commandLine = "";
        let resultLine = "";

        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

        if (lines.length >= 2) {
            commandLine = lines[0];
            resultLine = lines.slice(1).join(' ');
        } else if (lines.length === 1) {
            resultLine = lines[0];
            commandLine = "ダイスロール"; 
        } else {
            return; 
        }

        // --- クリーニング ---
        commandLine = commandLine.replace(timeRegex, '').replace(botNameRegex, '').trim();
        resultLine = resultLine.replace(timeRegex, '').replace(botNameRegex, '').trim();

        // --- 繰り返しロール境界 ---
        const combinedText = (commandLine === "ダイスロール" ? "" : commandLine) + " " + resultLine;
        const hashOneIndex = combinedText.indexOf('#1');

        if (hashOneIndex !== -1) {
            commandLine = combinedText.substring(0, hashOneIndex).trim();
            resultLine = combinedText.substring(hashOneIndex).trim();
        }

        // ★修正: 厳密なダイスロール判定 (半角矢印、シークレット系コマンド対応)
        // A. 矢印の直後に数値 (＞ > -> →)
        const hasArrowNumber = /(?:[＞→>]|->)\s*\d+/.test(resultLine);
        // B. ダイス展開式 ((1D100<=...))
        const hasDiceFormula = /\(\d+D\d+/.test(resultLine);
        // C. 繰り返しロール (#1)
        const hasRepeat = /#\d+/.test(resultLine);
        // D. コマンドラインにダイス系コマンドがある (1D100, x4, S?CC, S?RES, S?CBR, SCCなど)
        const hasCommand = /(?:S?CC|S?RES|S?CBR|SCC|1D100|x\d+)/i.test(commandLine);

        // いずれも無い場合はスキップ
        if (!hasArrowNumber && !hasDiceFormula && !hasRepeat && !hasCommand) return;

        parsedCharNames.add(charName);
        const color = extractColorStyle(node);
        if (color) charColors[charName] = color;

        // --- 分割登録 ---
        if (resultLine.startsWith('#1')) {
            const matches = resultLine.match(/#\d+[\s\S]*?(?=(#\d+|$))/g);

            if (matches) {
                matches.forEach(subRes => {
                    const trimmedRes = subRes.trim();
                    results.push({
                        type: 'tekey',
                        tabId: tabId,
                        tabName: parsedTabNames[tabId] || tabId,
                        charName: charName,
                        time: time,
                        command: commandLine,
                        result: trimmedRes, 
                        originalIndex: index
                    });
                });
            }
        } else {
            results.push({
                type: 'tekey',
                tabId: tabId,
                tabName: parsedTabNames[tabId] || tabId,
                charName: charName,
                time: time,
                command: commandLine,
                result: resultLine, 
                originalIndex: index
            });
        }
    });

    return results;
}