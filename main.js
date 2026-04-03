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

// ファイル名表示要素
const fileNameDisplay = document.getElementById('file-name-display');

// グローバル表示状態
let globalStatsViewMode = 'bar';

// --- メイン処理 ---

function processFile(file) {
    if (file.type !== 'text/html') { alert('HTMLファイルを選択してください。'); return; }

    // データリセット
    resetGlobalData();

    // ファイル名を表示
    if (fileNameDisplay) {
        fileNameDisplay.textContent = `📄 ${file.name}`;
        fileNameDisplay.classList.add('show');
    }

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

    const allowInitial = document.getElementById('chk-filter-initial').checked;

    const characterData = {};
    let orderIndex = 0;

    // クリーニング用正規表現
    const cleanupRegex = /(?:Cthulhu|System|DiceBot)\s*[:：]\s*/ig;
    const timeCleanupRegex = /\[?\s*\d{1,2}:\d{2}\s*\]?/g;

    // 1d100系ロールの判定用正規表現 (出目指定用 / S対応)
    const systemRollRegex = /(?:S?CC|S?RES|S?CBR|SCC|1D100)/i;

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

        // 矢印は > -> ＞ → のいずれかに対応
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
        // カンマを含めるように変更
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

        // --- 初期値判定 (フィルタリング前に行う) ---
        let isInitial = false;
        if (parsedTargets.length === 1 && ["成功", "スペシャル", "決定的成功"].includes(resultType)) {
            const baseValue = getSkillBaseValue(skillName);
            if (typeof baseValue === 'number' && parsedTargets[0] === baseValue) isInitial = true;
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

            // 初期値オプションがONなら、初期値成功の場合は強制的に含める
            if (isInitial && allowInitial) {
                shouldInclude = true;
            }
        }

        if (!shouldInclude) return;

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

function generateCounts(rolls, split1_100, mergeSSucc = false) {
    const counts = {
        "1CL": {}, "100FB": {},
        "CL": {}, "FB": {}, "S": {}, "成功": {}, "S/成功": {}, "失敗": {}, "1d100": {}, "能力値成長": {}
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
        else if (mergeSSucc && (roll.resultType === "スペシャル" || roll.resultType === "成功")) {
            cat = "S/成功";
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
    const categoryOrder = ["1CL", "100FB", "CL", "FB", "S/成功", "S", "成功", "失敗", "1d100", "能力値成長"];

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
    const dedupSpecialEnabled = document.getElementById('chk-dedup-special').checked;

    if (Object.keys(data).length === 0) {
        resultArea.innerHTML = `<div class="placeholder-text">条件に一致するログは見つかりませんでした</div>`;
        return;
    }

    const split1_100 = false;
    let overallStats = { total: 0, crit: 0, special: 0, success: 0, failure: 0, fatal: 0, other: 0 };
    let participantsWithRolls = 0;

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

        rolls.forEach(roll => {
            if (dedupEnabled && !roll.isTargetMatch) {
                const normalized = normalizeSkillName(roll.skill);
                if (roll.resultType === "成功") {
                    const key = normalized + "_success";
                    if (seenSkills.has(key)) return;
                    seenSkills.add(key);
                } else if (roll.resultType === "スペシャル" && dedupSpecialEnabled) {
                    const key = normalized + "_special";
                    if (seenSkills.has(key)) return;
                    seenSkills.add(key);
                }
            }
            displayRolls.push(roll);
        });

        if (displayRolls.length === 0) return;

        let stats = { total: 0, crit: 0, special: 0, success: 0, failure: 0, fatal: 0, other: 0 };
        displayRolls.forEach(roll => {
            stats.total++;
            if (roll.resultType === "決定的成功") stats.crit++;
            else if (roll.resultType === "スペシャル") stats.special++;
            else if (roll.resultType === "致命的失敗") stats.fatal++;
            else if (roll.resultType === "成功") stats.success++;
            else if (roll.resultType === "失敗") stats.failure++;
            else stats.other++;
        });

        // 参加者全体の集計に加算
        participantsWithRolls++;
        overallStats.total += stats.total;
        overallStats.crit += stats.crit;
        overallStats.special += stats.special;
        overallStats.success += stats.success;
        overallStats.failure += stats.failure;
        overallStats.fatal += stats.fatal;
        overallStats.other += stats.other;

        const header = document.createElement('div');
        header.className = 'card-header';
        if (headerStyle) header.style.cssText = headerStyle;
        header.onclick = function () { this.parentElement.classList.toggle('collapsed'); };

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

        const getPct = (val) => stats.total > 0 ? (val / stats.total * 100).toFixed(1) : 0;
        charCard.appendChild(createDetailedStatsAccordion(name, stats));

        // --- テキスト出力 ---
        const counts_FF = generateCounts(displayRolls, false, false);
        const counts_TF = generateCounts(displayRolls, true, false);
        const counts_FT = generateCounts(displayRolls, false, true);
        const counts_TT = generateCounts(displayRolls, true, true);

        const textExportDiv = document.createElement('div');
        textExportDiv.className = 'text-export-accordion';
        textExportDiv.innerHTML = `
            <div class="text-export-header" onclick="this.nextElementSibling.classList.toggle('open')">
                <span>テキスト出力（編集可能）</span>
                <span style="font-size:10px;">▼</span>
            </div>
            <div class="text-export-body">
                <div class="text-export-options">
                    <label class="check-line-small" style="margin-right: 15px;"><input type="checkbox" class="chk-split-trigger" onchange="updateExportText(this)"> 1と100を分ける</label>
                    <label class="check-line-small"><input type="checkbox" class="chk-merge-trigger" onchange="updateExportText(this)"> Sと通常成功をまとめる</label>
                </div>
                <textarea class="export-textarea">${generateTextBody(counts_FF, name, false)}</textarea>
                <div class="export-buttons">
                    <button class="copy-text-btn btn-secondary" onclick="toggleTextFormat(this)">Discord形式</button>
                    <button class="copy-text-btn btn-primary" onclick="copyToClipboard(this)">コピー</button>
                </div>
            </div>
        `;

        const body = textExportDiv.querySelector('.text-export-body');
        body.dataset.plainFF = generateTextBody(counts_FF, name, false);
        body.dataset.plainTF = generateTextBody(counts_TF, name, false);
        body.dataset.plainFT = generateTextBody(counts_FT, name, false);
        body.dataset.plainTT = generateTextBody(counts_TT, name, false);

        body.dataset.discordFF = generateTextBody(counts_FF, name, true);
        body.dataset.discordTF = generateTextBody(counts_TF, name, true);
        body.dataset.discordFT = generateTextBody(counts_FT, name, true);
        body.dataset.discordTT = generateTextBody(counts_TT, name, true);
        body.dataset.currentFormat = "plain";

        const toggleBtn = textExportDiv.querySelector('.btn-secondary');
        toggleBtn.dataset.mode = "plain";

        charCard.appendChild(textExportDiv);

        resultArea.appendChild(charCard);
    });

    if (participantsWithRolls > 1 && overallStats.total > 0) {
        const overallCard = document.createElement('div');
        overallCard.className = 'character-card card-overall';
        
        const header = document.createElement('div');
        header.className = 'card-header bg-overall';
        header.onclick = function () { this.parentElement.classList.toggle('collapsed'); };
        header.innerHTML = `
            <span class="char-name">🌐 セッション全体</span>
            <div class="header-right">
                <span class="hit-count">${overallStats.total}件</span>
                <span class="accordion-icon"></span>
            </div>
        `;
        overallCard.appendChild(header);
        
        const accordion = createDetailedStatsAccordion('セッション全体', overallStats);
        overallCard.appendChild(accordion);
        resultArea.appendChild(overallCard);
    }
}

// --- 詳細パネルHTML生成ヘルパー ---
function createDetailedStatsAccordion(name, stats) {
    const getPct = (val) => stats.total > 0 ? (val / stats.total * 100).toFixed(1) : 0;
    const pCrit = getPct(stats.crit);
    const pSpec = getPct(stats.special);
    const pSucc = getPct(stats.success);
    const pFail = getPct(stats.failure);
    const pFatal = getPct(stats.fatal);

    const detailedStatsDiv = document.createElement('div');
    detailedStatsDiv.className = 'detailed-stats-accordion';
    detailedStatsDiv.innerHTML = `
        <div class="detailed-stats-header" onclick="this.nextElementSibling.classList.toggle('open')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            <span>詳細集計・シェアを表示</span>
            <span style="font-size:10px;">▼</span>
        </div>
        <div class="detailed-stats-body">
            <div class="stats-view-controls">
                <button class="view-btn ${globalStatsViewMode === 'bar' ? 'active' : ''}" data-mode="bar" onclick="changeStatsViewMode('bar')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:bottom;"><path d="M4 9h4v11H4zm12 4h4v7h-4zm-6-9h4v16h-4z"/></svg> 棒グラフ</button>
                <button class="view-btn ${globalStatsViewMode === 'pie' ? 'active' : ''}" data-mode="pie" onclick="changeStatsViewMode('pie')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:bottom;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.78L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg> 円グラフ</button>
                <button class="view-btn ${globalStatsViewMode === 'text' ? 'active' : ''}" data-mode="text" onclick="changeStatsViewMode('text')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:bottom;"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg> 数字</button>
                <button class="view-btn ${globalStatsViewMode === 'text-pct' ? 'active' : ''}" data-mode="text-pct" onclick="changeStatsViewMode('text-pct')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:bottom;"><path d="M18.5 3.5l-15 15-.5-.5 15-15 .5.5z M7 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm10 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg> ％のみ</button>
            </div>
            <div class="detailed-stats-container" data-view-mode="${globalStatsViewMode}">
                <div class="stat-total">🎲 ${name === 'セッション全体' ? '全体' : `探索者【${name}】`}の<span class="total-label-counts">総ロール数：${stats.total} 回</span><span class="total-label-pct">ダイスロール</span></div>
                
                <!-- Bar View -->
                <div class="stats-layout-bar">
                    <div class="stat-row"><div class="stat-label">✨ CL</div><div class="stat-bar-container"><div class="stat-bar bg-crit" style="width: ${pCrit}%"></div></div><div class="stat-value">${stats.crit}回 (${pCrit}%)</div></div>
                    <div class="stat-row"><div class="stat-label">💀 FB</div><div class="stat-bar-container"><div class="stat-bar bg-fatal" style="width: ${pFatal}%"></div></div><div class="stat-value">${stats.fatal}回 (${pFatal}%)</div></div>
                    <div class="stat-row"><div class="stat-label">🌟 S</div><div class="stat-bar-container"><div class="stat-bar bg-special" style="width: ${pSpec}%"></div></div><div class="stat-value">${stats.special}回 (${pSpec}%)</div></div>
                    <div class="stat-row"><div class="stat-label">🔵 成功</div><div class="stat-bar-container"><div class="stat-bar bg-success" style="width: ${pSucc}%"></div></div><div class="stat-value">${stats.success}回 (${pSucc}%)</div></div>
                    <div class="stat-row"><div class="stat-label">🔴 失敗</div><div class="stat-bar-container"><div class="stat-bar bg-fail" style="width: ${pFail}%"></div></div><div class="stat-value">${stats.failure}回 (${pFail}%)</div></div>
                </div>

                <!-- Pie View -->
                <div class="stats-layout-pie">
                    <canvas class="pie-chart-canvas" width="280" height="280" style="width:140px; height:140px; border-radius:50%; box-shadow:2px 4px 10px var(--shadow-color);"></canvas>
                    <div class="pie-legend">
                        <div class="legend-item"><span class="legend-dot bg-crit"></span> ✨ CL: ${stats.crit}回 (${pCrit}%)</div>
                        <div class="legend-item"><span class="legend-dot bg-fatal"></span> 💀 FB: ${stats.fatal}回 (${pFatal}%)</div>
                        <div class="legend-item"><span class="legend-dot bg-special"></span> 🌟 S: ${stats.special}回 (${pSpec}%)</div>
                        <div class="legend-item"><span class="legend-dot bg-success"></span> 🔵 成功: ${stats.success}回 (${pSucc}%)</div>
                        <div class="legend-item"><span class="legend-dot bg-fail"></span> 🔴 失敗: ${stats.failure}回 (${pFail}%)</div>
                    </div>
                </div>

                <!-- Text View -->
                <div class="stats-layout-text">
                    <div class="text-stat-box"><div class="stat-emoticon">✨ CL</div><div class="stat-values"><div class="stat-big-val">${stats.crit}<span class="stat-unit">回</span></div><div class="stat-pct">${pCrit}%</div></div></div>
                    <div class="text-stat-box"><div class="stat-emoticon">💀 FB</div><div class="stat-values"><div class="stat-big-val">${stats.fatal}<span class="stat-unit">回</span></div><div class="stat-pct">${pFatal}%</div></div></div>
                    <div class="text-stat-box"><div class="stat-emoticon">🌟 S</div><div class="stat-values"><div class="stat-big-val">${stats.special}<span class="stat-unit">回</span></div><div class="stat-pct">${pSpec}%</div></div></div>
                    <div class="text-stat-box"><div class="stat-emoticon">🔵 成功</div><div class="stat-values"><div class="stat-big-val">${stats.success}<span class="stat-unit">回</span></div><div class="stat-pct">${pSucc}%</div></div></div>
                    <div class="text-stat-box"><div class="stat-emoticon">🔴 失敗</div><div class="stat-values"><div class="stat-big-val">${stats.failure}<span class="stat-unit">回</span></div><div class="stat-pct">${pFail}%</div></div></div>
                </div>
            </div>
            <div class="share-action-buttons">
                <button class="btn-download" onclick="downloadStatsImage(this, '${name}')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> 画像を保存
                </button>
                <button class="btn-share" onclick="shareDetailedStatsToX('${name}', ${stats.total}, ${stats.crit}, ${pCrit}, ${stats.fatal}, ${pFatal}, ${stats.special}, ${pSpec}, ${stats.success}, ${pSucc}, ${stats.failure}, ${pFail})">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> 𝕏でシェア
                </button>
            </div>
        </div>
    `;

    // html2canvas対策: 円グラフは実行時に<canvas>として描画する
    setTimeout(() => {
        const canvas = detailedStatsDiv.querySelector('.pie-chart-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const styles = getComputedStyle(document.documentElement);
        const getCol = (v) => styles.getPropertyValue(v).trim();
        const colors = {
            crit: getCol('--tag-crit') || '#d4af37',
            fatal: getCol('--tag-fatal') || '#333333',
            special: getCol('--tag-special') || '#ff1493',
            success: getCol('--tag-success') || '#4169e1',
            fail: getCol('--tag-fail') || '#808080'
        };
        const cX = canvas.width / 2;
        const cY = canvas.height / 2;
        const r = Math.min(cX, cY);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (stats.total === 0) {
            ctx.fillStyle = "#cccccc";
            ctx.beginPath();
            ctx.arc(cX, cY, r, 0, 2 * Math.PI);
            ctx.fill();
            return;
        }
        
        let currentAngle = -Math.PI / 2; // 12時方向から開始
        const drawSlice = (val, color) => {
            if (val <= 0) return;
            const sliceAngle = (val / stats.total) * 2 * Math.PI;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cX, cY);
            ctx.arc(cX, cY, r, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();
            currentAngle += sliceAngle;
        };
        
        drawSlice(stats.crit, colors.crit);
        drawSlice(stats.fatal, colors.fatal);
        drawSlice(stats.special, colors.special);
        drawSlice(stats.success, colors.success);
        drawSlice(stats.failure, colors.fail);
    }, 10);

    return detailedStatsDiv;
}

// --- テキスト出力操作関数 ---

window.updateExportText = function (el) {
    const container = el.closest('.text-export-body');
    const textarea = container.querySelector('textarea');
    const isSplit = container.querySelector('.chk-split-trigger').checked;
    const isMerge = container.querySelector('.chk-merge-trigger').checked;
    const format = container.dataset.currentFormat;

    const stateStr = (isSplit ? "T" : "F") + (isMerge ? "T" : "F");
    const datasetKey = format + stateStr;

    textarea.value = container.dataset[datasetKey];
};

window.toggleTextFormat = function (btn) {
    const container = btn.closest('.text-export-body');
    const textarea = container.querySelector('textarea');
    const splitChk = container.querySelector('.chk-split-trigger');
    const mergeChk = container.querySelector('.chk-merge-trigger');
    
    const isSplit = splitChk.checked;
    const isMerge = mergeChk.checked;
    const stateStr = (isSplit ? "T" : "F") + (isMerge ? "T" : "F");
    const mode = btn.dataset.mode;

    if (mode === "plain") {
        container.dataset.currentFormat = "discord";
        textarea.value = container.dataset["discord" + stateStr];
        btn.dataset.mode = "discord";
        btn.textContent = "通常形式";
    } else {
        container.dataset.currentFormat = "plain";
        textarea.value = container.dataset["plain" + stateStr];
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
document.getElementById('toggle-deduplicate').addEventListener('change', (e) => {
    const body = document.querySelector('#card-deduplicate .opt-body-small');
    const input = document.getElementById('chk-dedup-special');
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
    if (globalLogContent) analyzeLog();
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
function openModal(modalId) { const m = document.getElementById(modalId); if (m) m.classList.add('open'); }
function closeModal(modalId) { const m = document.getElementById(modalId); if (m) m.classList.remove('open'); }
window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });

async function openChangelogModal() {
    openModal('changelogModal');
    const body = document.getElementById('changelog-body');
    if (!body) return;
    try {
        const res = await fetch('changelog.html');
        if (res.ok) {
            body.innerHTML = await res.text();
        } else {
            body.innerHTML = `<div style="text-align: center; color: var(--sub-text-color); margin: 20px 0;">読み込みに失敗しました（${res.status}）</div>`;
        }
    } catch (e) {
        body.innerHTML = '<div style="text-align: center; color: var(--sub-text-color); margin: 20px 0;">履歴の取得に失敗しました<br>（オフライン環境では表示できない場合があります）</div>';
    }
}

function toggleShareMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('shareMenu');
    if (menu) menu.classList.toggle('show');
}
window.addEventListener('click', () => { const m = document.getElementById('shareMenu'); if (m) m.classList.remove('show'); });

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

window.downloadStatsImage = function(btn, charName) {
    const originalText = btn.innerHTML;
    btn.textContent = "生成中...";
    const container = btn.closest('.detailed-stats-body').querySelector('.detailed-stats-container');
    
    if (typeof html2canvas === "undefined") {
        alert("画像生成ライブラリの読み込みに失敗しました。ページを再読み込みしてお試しください。");
        btn.innerHTML = originalText;
        return;
    }
    
    // 背景色を指定してキャプチャ (CSS変数が効かない場合もあるため取得する)
    let bgColor = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim();
    if (!bgColor) bgColor = "#ffffff";
    
    html2canvas(container, { backgroundColor: bgColor }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${charName}_dice_stats.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        btn.innerHTML = originalText;
    }).catch(e => {
        console.error("生成エラー:", e);
        alert("画像の生成に失敗しました。");
        btn.innerHTML = originalText;
    });
};

window.shareDetailedStatsToX = function(charName, total, c, cp, fb, fbp, s, sp, suc, sucp, f, fp) {
    let isPctOnly = (globalStatsViewMode === 'text-pct');
    let text = charName === 'セッション全体' 
        ? `🎲セッション全体のダイス記録 🎲\n` 
        : `🎲 探索者【${charName}】のダイス記録 🎲\n`;
    
    if (isPctOnly) {
        text += `✨ CL: ${cp}%\n`;
        text += `💀 FB: ${fbp}%\n`;
        text += `🌟 S: ${sp}%\n`;
        text += `🔵 成功: ${sucp}%\n`;
        text += `🔴 失敗: ${fp}%\n`;
    } else {
        text += `総ロール数：${total}回\n`;
        text += `決定的成功 (CL) ✨: ${c}回 (${cp}%)\n`;
        text += `致命的失敗 (FB) 💀: ${fb}回 (${fbp}%)\n`;
        text += `スペシャル (S) 🌟: ${s}回 (${sp}%)\n`;
        text += `成功 🔵: ${suc}回 (${sucp}%)\n`;
        text += `失敗 🔴: ${f}回 (${fp}%)\n`;
    }
    
    text += `#CoC #CoC成長チェックツール\n`;
    
    const url = encodeURIComponent(window.location.href);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${encodeURIComponent(text)}`, '_blank');
};

window.copyToClipboard = function (btn) {
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

window.changeStatsViewMode = function(mode) {
    globalStatsViewMode = mode;
    document.querySelectorAll('.detailed-stats-container').forEach(el => {
        el.setAttribute('data-view-mode', mode);
    });
    document.querySelectorAll('.view-btn').forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};