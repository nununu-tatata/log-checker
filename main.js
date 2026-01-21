// DOM要素
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const settingsArea = document.getElementById('settings-area');
const resultArea = document.getElementById('result-area');
const btnRecalc = document.getElementById('btn-recalc');
const btnTheme = document.getElementById('btn-theme-toggle');

const btnSortTime = document.getElementById('btn-sort-time');
const btnSortClFb = document.getElementById('btn-sort-clfb');
const btnSort1Cl100Fb = document.getElementById('btn-sort-1cl100fb');

const tabCheckboxesDiv = document.getElementById('tab-checkboxes');
const charCheckboxesDiv = document.getElementById('char-checkboxes');

// --- メイン処理 ---

function processFile(file) {
    if (file.type !== 'text/html') { alert('HTMLファイルを選択してください。'); return; }
    
    // データリセット
    resetGlobalData();
    
    const reader = new FileReader();
    reader.onload = (e) => {
        globalLogContent = e.target.result;
        const parser = new DOMParser();
        const doc = parser.parseFromString(globalLogContent, 'text/html');
        
        // Tekeyかココフォリアか判定
        if (doc.querySelector('.chatlog')) {
            globalParsedRolls = parseTekeyLog(doc);
        } else {
            globalParsedRolls = parseCCFoliaLog(doc);
        }
        
        generateCheckboxes();
        analyzeLog();
    };
    reader.readAsText(file);
}

function generateCheckboxes() {
    tabCheckboxesDiv.innerHTML = "";
    for (const [tabId, tabName] of Object.entries(parsedTabNames)) {
        const label = document.createElement('label');
        label.className = 'chip-checkbox';
        const isMain = /メイン|main/i.test(tabName);
        label.innerHTML = `<input type="checkbox" value="${tabId}" ${isMain ? 'checked' : ''}><span class="chip-label">${tabName}</span>`;
        tabCheckboxesDiv.appendChild(label);
    }
    charCheckboxesDiv.innerHTML = "";
    parsedCharNames.forEach(charName => {
        const label = document.createElement('label');
        label.className = 'chip-checkbox';
        label.innerHTML = `<input type="checkbox" value="${charName}" checked><span class="chip-label">${charName}</span>`;
        charCheckboxesDiv.appendChild(label);
    });
    settingsArea.style.display = 'flex';
}

function calculateSortScore(roll) {
    const val = roll.value;
    const res = roll.resultType; 

    if (currentSortMode === "1cl100fb") {
        if (res === "決定的成功" && val === 1) return 10;
        if (res === "致命的失敗" && val === 100) return 20;
        if (res === "決定的成功") return 30 + val; 
        if (res === "致命的失敗") return 40 + (val - 95); 
        if (res === "スペシャル") return 50;
        if (res === "成功") return 60;
        if (res === "失敗") return 70;
        if (roll.isTargetMatch) return 80;
        return 90;
    }
    
    if (currentSortMode === "clfb") {
        if (res === "決定的成功") return 10;
        if (res === "致命的失敗") return 20;
        if (res === "スペシャル") return 30;
        if (res === "成功") return 40;
        if (res === "失敗") return 50;
        if (roll.isTargetMatch) return 60;
        return 70;
    }

    return 999;
}

function analyzeLog() {
    if (globalParsedRolls.length === 0) return;

    const checkedTabs = Array.from(tabCheckboxesDiv.querySelectorAll('input:checked')).map(cb => cb.value);
    const checkedChars = Array.from(charCheckboxesDiv.querySelectorAll('input:checked')).map(cb => cb.value);
    
    const dedupEnabled = document.getElementById('toggle-deduplicate').checked;
    const excludeStatusAll = document.getElementById('toggle-exclude-status').checked;
    const excludeMultiAll = document.getElementById('toggle-exclude-multi').checked;
    const successExcludeStatus = document.getElementById('chk-success-exclude-status').checked;
    const checkAbilityGrowth = document.getElementById('toggle-ability-growth').checked;
    
    const inpTargetValue = document.getElementById('inp-target-value');
    let targetRollNum = null;
    if (document.getElementById('toggle-target-roll').checked && inpTargetValue.value) {
        targetRollNum = parseInt(inpTargetValue.value, 10);
    }
    
    const inpSuccessMaxTarget = document.getElementById('inp-success-max-target');
    let successMaxTarget = null;
    if (document.getElementById('toggle-max-target').checked && inpSuccessMaxTarget.value) {
        successMaxTarget = parseInt(inpSuccessMaxTarget.value, 10);
    }

    const allowCrit = document.getElementById('chk-filter-crit').checked;
    const allowFatal = document.getElementById('chk-filter-fatal').checked;
    const allowSpecial = document.getElementById('chk-filter-special').checked;
    const allowSuccess = document.getElementById('chk-filter-success').checked;
    const allowFailure = document.getElementById('chk-filter-failure').checked;
    const allow1d100 = document.getElementById('chk-filter-1d100').checked;
    const range1d100 = document.getElementById('chk-1d100-filter').checked;

    const characterData = {}; 
    let orderIndex = 0;

    // クリーニング用正規表現
    const cleanupRegex = /(?:Cthulhu|System|DiceBot)\s*[:：]\s*/ig;
    const timeCleanupRegex = /\[?\s*\d{1,2}:\d{2}\s*\]?/g;
    
    // 1d100系ロールの判定用正規表現 (出目指定用)
    const systemRollRegex = /(?:S?CC|S?RES|S?CBR|1D100)/i;

    globalParsedRolls.forEach(data => {
        if (!checkedTabs.includes(data.tabId)) return;
        if (!checkedChars.includes(data.charName)) return;

        // データ受け取り時に再クリーニング
        let commandLine = data.command.replace(cleanupRegex, '').replace(timeCleanupRegex, '').trim();
        let resultLine = data.result.replace(cleanupRegex, '').replace(timeCleanupRegex, '').trim();

        // 結果判定
        let resultType = "その他"; 
        if (resultLine.includes("決定的成功")) resultType = "決定的成功";
        else if (resultLine.includes("スペシャル")) resultType = "スペシャル";
        else if (resultLine.includes("致命的失敗")) resultType = "致命的失敗";
        else if (resultLine.includes("成功")) resultType = "成功";
        else if (resultLine.includes("失敗")) resultType = "失敗";

        // 数値抽出
        let formula = "";
        let rolledValue = null;
        let parsedTargets = [];
        
        // 数値抽出正規表現: 矢印は > -> ＞ → のいずれかに対応
        const formulaMatch = resultLine.match(/\((.+?)\)\s*(?:[＞→>]|->)\s*(\d+)/);
        
        if (formulaMatch) {
            formula = formulaMatch[1];
            rolledValue = parseInt(formulaMatch[2], 10);
            
            const targetPartMatch = formula.match(/<=([\d,]+)/);
            if (targetPartMatch) {
                parsedTargets = targetPartMatch[1].split(',').map(n => parseInt(n, 10));
            }
        } else {
            const simpleMatch = resultLine.match(/(?:[＞→>]|->)\s*(\d+)/);
            if (simpleMatch) {
                formula = resultLine;
                rolledValue = parseInt(simpleMatch[1], 10);
            }
        }

        // --- 技能名抽出 (強化版) ---
        let skillName = commandLine;

        // 1. 先頭の "x4 " などを削除
        skillName = skillName.replace(/^x\d+\s+/i, '');

        // 2. ダイス式・対抗ロール式の削除 (正規表現強化)
        // パターンA: 比較式 (CCB<=60, CCB<=(18*5), 1D100<=50)
        const comparisonRegex = /[a-zA-Z0-9]+[<>=]+[\d\+\-\*\/\(\)]+/g;
        
        // パターンB: 関数式 (RESB(16-12), CBRB(80,30))
        // ★修正: カンマを含めるように変更
        const functionRegex = /[a-zA-Z0-9]+\([\d\+\-\*\/\s,]+\)/g;

        let cleanedName = skillName
            .replace(comparisonRegex, '') // CCB<=(18*5) 等を削除
            .replace(functionRegex, '')   // RESB(16-12), CBRB(80,30) 等を削除
            .trim();
        
        // 3. ボット名除去
        cleanedName = cleanedName.replace(cleanupRegex, '').trim();

        // 削除して空にならなければ採用 (式しかない場合は元のままにする)
        if (cleanedName.length > 0) {
            skillName = cleanedName;
        }

        // 4. 繰り返しロール (#1, #2...) の番号付与
        const repeatMatch = resultLine.match(/^(#\d+)/);
        if (repeatMatch) {
            skillName = `${skillName} ${repeatMatch[1]}`;
        }

        // --- フィルタリング ---
        let shouldInclude = false;
        let isTargetMatch = false;

        // 出目指定時、1d100系のロールであるかチェックする
        if (targetRollNum !== null && rolledValue === targetRollNum) {
            const isSystemRoll = systemRollRegex.test(commandLine) || systemRollRegex.test(formula);
            if (isSystemRoll) {
                shouldInclude = true;
                isTargetMatch = true;
            }
        }

        // 能力値成長
        let isAbilityGrowth = false;
        if (checkAbilityGrowth && rolledValue === 1) {
            if (isStatusRoll(skillName) || isMultiplierRoll(skillName)) {
                const upperRaw = (commandLine + formula).toUpperCase();
                if (upperRaw.includes("1D100") || upperRaw.includes("CC")) {
                    isAbilityGrowth = true;
                    shouldInclude = true; 
                }
            }
        }

        if (!shouldInclude) {
            if (excludeStatusAll && isStatusRoll(skillName)) return;
            if (excludeMultiAll && isMultiplierRoll(skillName)) return;

            if (resultType === "決定的成功" && allowCrit) shouldInclude = true;
            else if (resultType === "致命的失敗" && allowFatal) shouldInclude = true;
            else if (resultType === "スペシャル" && allowSpecial) shouldInclude = true;
            else if (resultType === "成功" && allowSuccess) {
                let keep = true;
                if (successMaxTarget !== null && parsedTargets.length > 0) {
                    if (parsedTargets.every(val => val > successMaxTarget)) keep = false;
                }
                if (successExcludeStatus && (isStatusRoll(skillName) || isMultiplierRoll(skillName))) keep = false;
                shouldInclude = keep;
            }
            else if (resultType === "失敗" && allowFailure) shouldInclude = true;
            else if (resultType === "その他" && allow1d100) {
                const upper = (commandLine + formula).toUpperCase();
                const is1d100 = upper.includes("1D100");
                if (is1d100 && rolledValue !== null) {
                    if (range1d100) {
                        if (rolledValue <= 5 || rolledValue >= 96) shouldInclude = true;
                    } else {
                        shouldInclude = true;
                    }
                }
            }
        }

        if (!shouldInclude) return;

        let isInitial = false;
        if (parsedTargets.length === 1 && ["成功", "スペシャル", "決定的成功"].includes(resultType)) {
            const baseValue = getSkillBaseValue(skillName);
            if (typeof baseValue === 'number' && parsedTargets[0] === baseValue) isInitial = true;
        }

        let isPartialGrowth = false;
        if (shouldInclude && successMaxTarget !== null && parsedTargets.length > 1 && ["成功", "スペシャル", "決定的成功"].includes(resultType)) {
             const hasBelowLimit = parsedTargets.some(v => v <= successMaxTarget);
             const hasAboveLimit = parsedTargets.some(v => v > successMaxTarget);
             if (hasBelowLimit && hasAboveLimit) {
                 isPartialGrowth = true;
             }
        }

        if (!characterData[data.charName]) characterData[data.charName] = [];
        
        characterData[data.charName].push({
            skill: skillName,
            resultType: resultType,
            formula: formula,
            command: commandLine, 
            resultText: resultLine, 
            value: rolledValue,
            isInitial: isInitial,
            isTargetMatch: isTargetMatch,
            isPartialGrowth: isPartialGrowth,
            isAbilityGrowth: isAbilityGrowth,
            originalIndex: orderIndex++,
            tabName: data.tabName
        });
    });

    for (const name in characterData) {
        if (currentSortMode !== "time") {
            characterData[name].sort((a, b) => {
                const scoreA = calculateSortScore(a);
                const scoreB = calculateSortScore(b);
                if (scoreA !== scoreB) return scoreA - scoreB;
                return a.originalIndex - b.originalIndex;
            });
        } else {
            characterData[name].sort((a, b) => a.originalIndex - b.originalIndex);
        }
    }

    renderResults(characterData, dedupEnabled);
}

function generateCounts(rolls, split1_100) {
    const counts = {
        "1CL": {}, "100FB": {},
        "CL": {}, "FB": {}, "S": {}, "成功": {}, "失敗": {}, "1d100": {}, "能力値成長": {}
    };

    rolls.forEach(roll => {
        let cleanName = normalizeSkillName(roll.skill);
        if (!cleanName) cleanName = roll.skill;

        if (roll.resultType === "成功") {
            if (roll.isInitial) cleanName += "(初期値)";
            else if (roll.isPartialGrowth) cleanName += "(片方成長)";
        }

        let cat = "";
        if (roll.resultType === "決定的成功") {
            if (split1_100 && roll.value === 1) cat = "1CL";
            else cat = "CL";
        }
        else if (roll.resultType === "致命的失敗") {
            if (split1_100 && roll.value === 100) cat = "100FB";
            else cat = "FB";
        }
        else if (roll.resultType === "スペシャル") cat = "S";
        else if (roll.resultType === "成功") cat = "成功";
        else if (roll.resultType === "失敗") cat = "失敗";
        else cat = "1d100";

        counts[cat][cleanName] = (counts[cat][cleanName] || 0) + 1;

        if (roll.isAbilityGrowth) {
            let abName = normalizeSkillName(roll.skill);
            if (!abName) abName = roll.skill;
            counts["能力値成長"][abName] = (counts["能力値成長"][abName] || 0) + 1;
        }
    });
    return counts;
}

function generateTextBody(counts, name, isDiscord) {
    const categoryOrder = ["1CL", "100FB", "CL", "FB", "S", "成功", "失敗", "1d100", "能力値成長"];
    
    const generateItemList = (catObj) => {
        return Object.keys(catObj).map(skill => {
            const num = catObj[skill];
            return num > 1 ? `${skill}*${num}` : skill;
        });
    };

    let text = "";
    if (isDiscord) {
        text = `### 対象者：${name}\n\`\`\`\n`;
        categoryOrder.forEach(cat => {
            const items = generateItemList(counts[cat]);
            if (items.length > 0) {
                text += `【${cat}】${items.join("｜")}\n\n`;
            }
        });
        text = text.trim() + "\n\`\`\`";
    } else {
        text = `対象者：${name}\n\n`;
        categoryOrder.forEach(cat => {
            const items = generateItemList(counts[cat]);
            if (items.length > 0) {
                text += `【${cat}】${items.join("｜")}\n\n`;
            }
        });
        text = text.trim();
    }
    return text;
}

function renderResults(data, dedupEnabled) {
    resultArea.innerHTML = "";
    const showDetail = document.getElementById('toggle-detail-log').checked;
    
    if (Object.keys(data).length === 0) {
        resultArea.innerHTML = `<div class="placeholder-text">条件に一致するログは見つかりませんでした</div>`;
        return;
    }

    const split1_100 = false; 

    parsedCharNames.forEach(name => {
        const rolls = data[name];
        if (!rolls || rolls.length === 0) return;

        const charCard = document.createElement('div');
        charCard.className = 'character-card';

        const userColor = charColors[name];
        let headerStyle = "";
        let nameStyle = "";
        
        if (userColor) {
            const rgbaBg = colorToRgba(userColor, 0.5);
            headerStyle = `background-color: ${rgbaBg}; border-bottom-color: ${userColor};`;
            nameStyle = `color: ${userColor};`;
        }

        const seenSkills = new Set();
        let displayRolls = [];
        let stats = { crit: 0, special: 0, fatal: 0 };

        rolls.forEach(roll => {
            if (roll.resultType === "決定的成功") stats.crit++;
            if (roll.resultType === "スペシャル") stats.special++;
            if (roll.resultType === "致命的失敗") stats.fatal++;

            if (dedupEnabled && roll.resultType === "成功" && !roll.isTargetMatch) {
                const normalized = normalizeSkillName(roll.skill);
                if (seenSkills.has(normalized)) return;
                seenSkills.add(normalized);
            }
            displayRolls.push(roll);
        });

        if (displayRolls.length === 0) return;

        const header = document.createElement('div');
        header.className = 'card-header';
        if (headerStyle) header.style.cssText = headerStyle;
        header.onclick = function() { this.parentElement.classList.toggle('collapsed'); };

        header.innerHTML = `
            <span class="char-name" style="${nameStyle}">${name}</span>
            <div class="header-right">
                <span class="hit-count">${displayRolls.length}件</span>
                <span class="accordion-icon"></span>
            </div>
        `;
        charCard.appendChild(header);

        const list = document.createElement('ul');
        list.className = 'log-list';

        displayRolls.forEach(roll => {
            const item = document.createElement('li');
            item.className = 'log-item';
            
            let tagsHtml = "";
            if (roll.isTargetMatch) tagsHtml += `<span class="tag bg-target">指定:${roll.value}</span>`;
            if (roll.isAbilityGrowth) tagsHtml += `<span class="tag bg-ability">能力値成長かも！</span>`;
            if (roll.isInitial) tagsHtml += `<span class="tag bg-initial">初期値</span>`;
            if (roll.isPartialGrowth) tagsHtml += `<span class="tag bg-partial">片方成長</span>`;

            if (roll.resultType === "決定的成功") tagsHtml += `<span class="tag bg-crit">決定的成功</span>`;
            else if (roll.resultType === "スペシャル") tagsHtml += `<span class="tag bg-special">スペシャル</span>`;
            else if (roll.resultType === "成功") tagsHtml += `<span class="tag bg-success">成功</span>`;
            else if (roll.resultType === "致命的失敗") tagsHtml += `<span class="tag bg-fatal">致命的失敗</span>`;
            else if (roll.resultType === "失敗") tagsHtml += `<span class="tag bg-fail">失敗</span>`;
            else if (roll.resultType === "その他") tagsHtml += `<span class="tag bg-normal">1D100</span>`;

            // ログ詳細の整形 (改行削除)
            const cleanCommand = roll.command.replace(/[\r\n]+/g, '').trim();
            const cleanResult = roll.resultText.replace(/[\r\n]+/g, '').trim();
            const fullLogText = `${cleanCommand} ${cleanResult}`;
            
            const detailHtml = showDetail 
                ? `<div class="dice-formula">${fullLogText}</div>` 
                : '';

            const displayTabName = normalizeTabName(roll.tabName);
            const tabBadge = `<span class="tab-badge">${displayTabName}</span>`;

            item.innerHTML = `
                <div class="log-main">
                    <div class="skill-row">
                        ${tabBadge}
                        <span class="skill-name" title="${roll.skill}">${roll.skill}</span>
                    </div>
                    ${detailHtml}
                </div>
                <div class="log-tags">
                    ${tagsHtml}
                    <div class="dice-val">${roll.value !== null ? roll.value : '?'}</div>
                </div>
            `;
            list.appendChild(item);
        });
        charCard.appendChild(list);

        const footer = document.createElement('div');
        footer.className = 'stats-footer';
        footer.innerHTML = `
            <div class="stat-badge"><div class="stat-dot dot-crit"></div> CL: ${stats.crit}</div>
            <div class="stat-badge"><div class="stat-dot dot-fatal"></div> FB: ${stats.fatal}</div>
            <div class="stat-badge"><div class="stat-dot dot-special"></div> S: ${stats.special}</div>
        `;
        charCard.appendChild(footer);

        // --- テキスト出力 ---
        const countsNormal = generateCounts(displayRolls, false);
        const countsSplit = generateCounts(displayRolls, true);

        const textPlainNormal = generateTextBody(countsNormal, name, false);
        const textPlainSplit = generateTextBody(countsSplit, name, false);
        const textDiscordNormal = generateTextBody(countsNormal, name, true);
        const textDiscordSplit = generateTextBody(countsSplit, name, true);

        const textExportDiv = document.createElement('div');
        textExportDiv.className = 'text-export-accordion';
        textExportDiv.innerHTML = `
            <div class="text-export-header" onclick="this.nextElementSibling.classList.toggle('open')">
                <span>テキスト出力（編集可能）</span>
                <span style="font-size:10px;">▼</span>
            </div>
            <div class="text-export-body">
                <div class="text-export-options">
                    <label class="check-line-small"><input type="checkbox" class="chk-split-trigger" onchange="updateExportText(this)"> 1と100を分ける</label>
                </div>
                <textarea class="export-textarea">${textPlainNormal}</textarea>
                <div class="export-buttons">
                    <button class="copy-text-btn btn-secondary" onclick="toggleTextFormat(this)">Discord形式</button>
                    <button class="copy-text-btn btn-primary" onclick="copyToClipboard(this)">コピー</button>
                </div>
            </div>
        `;
        
        const body = textExportDiv.querySelector('.text-export-body');
        body.dataset.plainNormal = textPlainNormal;
        body.dataset.plainSplit = textPlainSplit;
        body.dataset.discordNormal = textDiscordNormal;
        body.dataset.discordSplit = textDiscordSplit;
        body.dataset.currentFormat = "plain"; 

        const toggleBtn = textExportDiv.querySelector('.btn-secondary');
        toggleBtn.dataset.mode = "plain";

        charCard.appendChild(textExportDiv);

        resultArea.appendChild(charCard);
    });
}

// --- テキスト出力操作関数 ---

window.updateExportText = function(chk) {
    const container = chk.closest('.text-export-body');
    const textarea = container.querySelector('textarea');
    const isSplit = chk.checked;
    const format = container.dataset.currentFormat; 

    if (format === "plain") {
        textarea.value = isSplit ? container.dataset.plainSplit : container.dataset.plainNormal;
    } else {
        textarea.value = isSplit ? container.dataset.discordSplit : container.dataset.discordNormal;
    }
};

window.toggleTextFormat = function(btn) {
    const container = btn.closest('.text-export-body');
    const textarea = container.querySelector('textarea');
    const splitChk = container.querySelector('.chk-split-trigger');
    const isSplit = splitChk.checked;
    const mode = btn.dataset.mode;
    
    if (mode === "plain") {
        container.dataset.currentFormat = "discord";
        textarea.value = isSplit ? container.dataset.discordSplit : container.dataset.discordNormal;
        btn.dataset.mode = "discord";
        btn.textContent = "通常形式";
    } else {
        container.dataset.currentFormat = "plain";
        textarea.value = isSplit ? container.dataset.plainSplit : container.dataset.plainNormal;
        btn.dataset.mode = "plain";
        btn.textContent = "Discord形式";
    }
};

// --- イベントリスナー設定 ---

document.getElementById('toggle-target-roll').addEventListener('change', (e) => {
    const body = document.querySelector('#card-target-roll .opt-body-small');
    const input = document.getElementById('inp-target-value');
    if (e.target.checked) { body.classList.remove('disabled'); input.disabled = false; }
    else { body.classList.add('disabled'); input.disabled = true; }
});
document.getElementById('toggle-max-target').addEventListener('change', (e) => {
    const body = document.querySelector('#card-max-target .opt-body-small');
    const input = document.getElementById('inp-success-max-target');
    if (e.target.checked) { body.classList.remove('disabled'); input.disabled = false; }
    else { body.classList.add('disabled'); input.disabled = true; }
});
document.getElementById('chk-filter-success').addEventListener('change', (e) => {
    const panel = document.getElementById('opt-success-exclude');
    if (e.target.checked) panel.classList.remove('hidden'); else panel.classList.add('hidden');
});
document.getElementById('chk-filter-1d100').addEventListener('change', (e) => {
    const panel = document.getElementById('opt-1d100-range');
    if (e.target.checked) panel.classList.remove('hidden'); else panel.classList.add('hidden');
});

document.getElementById('btn-check-all-tabs').addEventListener('click', () => tabCheckboxesDiv.querySelectorAll('input').forEach(c => c.checked = true));
document.getElementById('btn-uncheck-all-tabs').addEventListener('click', () => tabCheckboxesDiv.querySelectorAll('input').forEach(c => c.checked = false));
document.getElementById('btn-check-all-chars').addEventListener('click', () => charCheckboxesDiv.querySelectorAll('input').forEach(c => c.checked = true));
document.getElementById('btn-uncheck-all-chars').addEventListener('click', () => charCheckboxesDiv.querySelectorAll('input').forEach(c => c.checked = false));

btnTheme.addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? '' : 'dark');
    btnTheme.textContent = isDark ? '🌙' : '☀️';
});

function updateSortButtons(mode) {
    currentSortMode = mode;
    [btnSortTime, btnSortClFb, btnSort1Cl100Fb].forEach(btn => btn.classList.remove('active'));
    if (mode === 'time') btnSortTime.classList.add('active');
    else if (mode === 'clfb') btnSortClFb.classList.add('active');
    else if (mode === '1cl100fb') btnSort1Cl100Fb.classList.add('active');
    if(globalLogContent) analyzeLog();
}
btnSortTime.addEventListener('click', () => updateSortButtons('time'));
btnSortClFb.addEventListener('click', () => updateSortButtons('clfb'));
btnSort1Cl100Fb.addEventListener('click', () => updateSortButtons('1cl100fb'));

btnRecalc.addEventListener('click', () => analyzeLog());

['dragover', 'dragleave'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.toggle('dragover', evt === 'dragover'); });
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if (e.target.files.length) processFile(e.target.files[0]); });

// --- 浮遊ツールチップ制御 ---
const tooltipEl = document.createElement('div');
tooltipEl.className = 'floating-tooltip';
document.body.appendChild(tooltipEl);

document.body.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        const text = target.getAttribute('data-tooltip');
        if (text) {
            tooltipEl.innerHTML = text;
            tooltipEl.classList.add('visible');
            updateTooltipPosition(target);
        }
    }
});

document.body.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        tooltipEl.classList.remove('visible');
    }
});

function updateTooltipPosition(targetElement) {
    const rect = targetElement.getBoundingClientRect();
    const top = rect.top; 
    const left = rect.left + (rect.width / 2);
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
}

window.addEventListener('scroll', () => {
     tooltipEl.classList.remove('visible');
}, { capture: true, passive: true });


// --- UI制御 ---
function openModal(modalId) { const m = document.getElementById(modalId); if(m) m.classList.add('open'); }
function closeModal(modalId) { const m = document.getElementById(modalId); if(m) m.classList.remove('open'); }
window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });

function toggleShareMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('shareMenu');
    if (menu) menu.classList.toggle('show');
}
window.addEventListener('click', () => { const m = document.getElementById('shareMenu'); if(m) m.classList.remove('show'); });

function shareCopyLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        const t = document.getElementById('shareTooltip');
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
    });
}
function shareToX() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(document.title);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
}
function shareToBluesky() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(document.title);
    window.open(`https://bsky.app/intent/compose?text=${text}%0A${url}`, '_blank');
}
function shareToMisskey() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(document.title);
    window.open(`https://misskey-hub.net/share/?text=${text}&url=${url}`, '_blank');
}
function shareToDiscord() {
    shareCopyLink();
    alert("Discordへの直接シェア機能はありません。リンクをコピーしましたので貼り付けてください！");
}

window.copyToClipboard = function(btn) {
    const container = btn.closest('.text-export-body');
    const textarea = container.querySelector('textarea');
    textarea.select();
    document.execCommand('copy'); 
    window.getSelection().removeAllRanges(); 
    textarea.blur();
    navigator.clipboard.writeText(textarea.value).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "コピーしました！";
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    });
};