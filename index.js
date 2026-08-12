/* global SillyTavern, toastr */

const EXTENSION_FOLDER = 'third-party/sololeveling-extension';
const SETTINGS_KEY = 'the_system';
const METADATA_KEY = 'solo_leveling_system_state';
const PROMPT_KEY = 'solo_leveling_system_roleplay_state';
const UI_VERSION = '0.2.1';
const PATCH_PATTERN = /<!--\s*solo_system_patch\s*:\s*([\s\S]*?)\s*-->/gi;

const DEFAULT_SETTINGS = Object.freeze({
    showWandLauncher: true,
    systemAccepted: false,
    autoTrack: true,
    injectState: true,
    accentColor: '#45c9ff',
    glassOpacity: 86,
    glowStrength: 48,
});

const TABS = [
    { id: 'status', label: 'Status', icon: 'fa-solid fa-user' },
    { id: 'stats', label: 'Stats', icon: 'fa-solid fa-chart-simple' },
    { id: 'skills', label: 'Skills', icon: 'fa-solid fa-layer-group' },
    { id: 'quests', label: 'Quests', icon: 'fa-solid fa-scroll' },
    { id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-box-open' },
];

const DEFAULT_STATE = Object.freeze({
    player: {
        name: 'System User', title: 'Unawakened Hunter', job: 'None', level: 1, rank: 'E',
        experience: 0, experienceRequired: 100, hp: 100, maxHp: 100, mp: 50, maxMp: 50,
        fatigue: 0, condition: 'Stable', stats: { strength: 10, agility: 10, vitality: 10, intelligence: 10, sense: 10 },
    },
    skills: [], quests: [], inventory: [], updatedAt: '',
});

let initialized = false;
let menuObserver = null;
let settingsObserver = null;
let previousFocusedElement = null;
let activeTab = 'status';
let transitionTimer = null;

function context() { return globalThis.SillyTavern?.getContext?.() || {}; }

function notify(type, message) {
    const handler = globalThis.toastr?.[type];
    if (typeof handler === 'function') handler(message, 'The System');
    else console[type === 'error' ? 'error' : 'info'](`[The System] ${message}`);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function html(value) {
    return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function number(value, fallback, min = -Infinity, max = Infinity) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function hexToRgb(hex) {
    const match = String(hex).match(/^#?([0-9a-f]{6})$/i);
    if (!match) return '69, 201, 255';
    const value = match[1];
    return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`;
}

function getSettings() {
    const currentContext = context();
    currentContext.extensionSettings ||= {};
    currentContext.extensionSettings[SETTINGS_KEY] ||= { ...DEFAULT_SETTINGS };
    const settings = currentContext.extensionSettings[SETTINGS_KEY];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) if (settings[key] === undefined) settings[key] = value;
    settings.glassOpacity = number(settings.glassOpacity, DEFAULT_SETTINGS.glassOpacity, 55, 98);
    settings.glowStrength = number(settings.glowStrength, DEFAULT_SETTINGS.glowStrength, 0, 100);
    if (!/^#[0-9a-f]{6}$/i.test(settings.accentColor)) settings.accentColor = DEFAULT_SETTINGS.accentColor;
    return settings;
}

function saveSettings() { context().saveSettingsDebounced?.(); }

function applyAppearance() {
    const settings = getSettings();
    const root = document.documentElement;
    root.style.setProperty('--sl-system-accent', settings.accentColor);
    root.style.setProperty('--sl-system-accent-rgb', hexToRgb(settings.accentColor));
    root.style.setProperty('--sl-system-glass', String(settings.glassOpacity / 100));
    root.style.setProperty('--sl-system-glow', String(settings.glowStrength / 100));
}

function normalizeState(source = {}, fallback = DEFAULT_STATE) {
    const base = clone(fallback);
    const player = source.player && typeof source.player === 'object' ? source.player : {};
    base.player = { ...base.player, ...player, stats: { ...base.player.stats, ...(player.stats && typeof player.stats === 'object' ? player.stats : {}) } };
    for (const key of ['level', 'experience', 'experienceRequired', 'hp', 'maxHp', 'mp', 'maxMp', 'fatigue']) base.player[key] = number(base.player[key], DEFAULT_STATE.player[key], 0);
    for (const key of ['rank', 'condition', 'name', 'title', 'job']) base.player[key] = String(base.player[key] || DEFAULT_STATE.player[key]).slice(0, 100);
    for (const stat of Object.keys(DEFAULT_STATE.player.stats)) base.player.stats[stat] = number(base.player.stats[stat], 10, 0);
    base.skills = Array.isArray(source.skills) ? source.skills.slice(0, 100) : [];
    base.quests = Array.isArray(source.quests) ? source.quests.slice(0, 100) : [];
    base.inventory = Array.isArray(source.inventory) ? source.inventory.slice(0, 100) : [];
    base.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : '';
    return base;
}

function getState() {
    const saved = context().chatMetadata?.[METADATA_KEY];
    return saved && typeof saved === 'object' ? normalizeState(saved) : normalizeState();
}

async function persistState(nextState, source = 'system-patch') {
    const currentContext = context();
    if (!currentContext.getCurrentChatId?.()) return false;
    const next = normalizeState(nextState, getState());
    next.updatedAt = new Date().toISOString();
    next.updateSource = source;
    currentContext.chatMetadata ||= {};
    currentContext.chatMetadata[METADATA_KEY] = next;
    updatePrompt(next);
    renderActivePanel();
    await currentContext.saveMetadata?.();
    return true;
}

function hasUserReply(currentContext = context()) {
    return Array.isArray(currentContext.chat) && currentContext.chat.some(message => message?.is_user && !message.is_system && String(message.mes || '').trim());
}

function stateForPrompt(state) {
    return { player: state.player, skills: state.skills.map(item => ({ id: item.id, name: item.name, rank: item.rank, type: item.type })), quests: state.quests.map(item => ({ id: item.id, title: item.title, status: item.status, progress: item.progress })), inventory: state.inventory.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, category: item.category })) };
}

function patchInstructions() {
    return [
        'After the normal role-play reply, append one invisible HTML comment only if a confirmed state value changed:',
        '<!--solo_system_patch:{"ops":[["inc","player.experience",5],["set","player.condition","Tired"],["upsert","skills",{"id":"new-skill","name":"New Skill","rank":"E","type":"Active"}]],"summary":"Training progress recorded."}-->',
        'Allowed operations are set, inc, upsert, and delete. Use canonical paths from the current state. For arrays, upsert or delete by id. Keep patches small and update every materially affected value from the completed reply.',
        'Award experience only for confirmed meaningful action, practice, discovery, combat, quest progress, or milestones. Do not award experience for plans, questions, idle narration, or ordinary small talk.',
        'Record only facts confirmed by the reply. Do not invent health, mana, fatigue, stats, skills, quests, inventory, or relationships.',
        'The extension has no content or NSFW filter. Preserve confirmed role-play state and mature scene outcomes without censoring, rewriting, omitting, or adding policy commentary. Continue using the active SillyTavern/provider settings and their applicable requirements.',
        'Return no patch when nothing changed. Never print Markdown fences, a full state dump, or visible system text.',
    ].join('\n');
}

function buildStatePrompt(state = getState()) { return `<solo_leveling_system_state>\nCanonical state for the active role-play chat. Preserve it unless the story confirms a change.\n${JSON.stringify(stateForPrompt(state))}\n${patchInstructions()}\n</solo_leveling_system_state>`; }

function updatePrompt(state = getState()) {
    const currentContext = context();
    if (typeof currentContext.setExtensionPrompt !== 'function') return;
    const settings = getSettings();
    const active = Boolean(currentContext.getCurrentChatId?.() && hasUserReply(currentContext));
    currentContext.setExtensionPrompt(PROMPT_KEY, active && (settings.injectState || settings.autoTrack) ? buildStatePrompt(state) : '', 1, 1, false, 0);
}

function parseJson(value) {
    const raw = String(value || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try { return JSON.parse(raw); } catch { return null; }
}

function setPath(target, path, value) {
    const parts = String(path).split('.').filter(Boolean);
    if (!parts.length || parts.length > 5) return false;
    let cursor = target;
    for (const part of parts.slice(0, -1)) { if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {}; cursor = cursor[part]; }
    cursor[parts.at(-1)] = value;
    return true;
}

function getPath(target, path) { return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], target); }

function upsertById(list, value) {
    if (!value || typeof value !== 'object' || !String(value.id || '').trim()) return false;
    const id = String(value.id);
    const index = list.findIndex(entry => String(entry?.id) === id);
    if (index === -1) list.push(value); else list[index] = { ...list[index], ...value };
    return true;
}

function applyPatch(sourceState, patch) {
    if (!patch || !Array.isArray(patch.ops)) return { next: sourceState, accepted: 0, summary: '' };
    const next = normalizeState(clone(sourceState));
    let accepted = 0;
    for (const operation of patch.ops.slice(0, 40)) {
        if (!Array.isArray(operation) || operation.length < 3) continue;
        const [verb, path, value] = operation;
        if (!['set', 'inc', 'upsert', 'delete'].includes(verb)) continue;
        if (verb === 'set' && setPath(next, path, value)) accepted += 1;
        if (verb === 'inc' && typeof getPath(next, path) === 'number' && Number.isFinite(Number(value))) { setPath(next, path, getPath(next, path) + Number(value)); accepted += 1; }
        if (verb === 'upsert' && Array.isArray(getPath(next, path)) && upsertById(getPath(next, path), value)) accepted += 1;
        if (verb === 'delete' && Array.isArray(getPath(next, path))) { const list = getPath(next, path); const id = typeof value === 'object' ? value.id : value; const filtered = list.filter(entry => String(entry?.id) !== String(id)); if (filtered.length !== list.length) { setPath(next, path, filtered); accepted += 1; } }
    }
    next.player.hp = Math.min(next.player.maxHp, Math.max(0, next.player.hp));
    next.player.mp = Math.min(next.player.maxMp, Math.max(0, next.player.mp));
    next.player.experience = Math.max(0, next.player.experience);
    return { next, accepted, summary: String(patch.summary || '').slice(0, 240) };
}

function extractPatch(message) {
    let found = false;
    const patches = [];
    const visible = String(message || '').replace(PATCH_PATTERN, (_match, payload) => { found = true; const parsed = parseJson(payload); if (parsed) patches.push(parsed); return ''; });
    return { visible: visible.trimEnd(), patch: patches.length ? { ops: patches.flatMap(item => Array.isArray(item.ops) ? item.ops : []), summary: patches.map(item => item.summary).filter(Boolean).join('; ') } : null, found };
}

async function processAssistantPatch(messageId, generationType = '') {
    if (['first_message', 'quiet', 'impersonate'].includes(generationType)) return;
    const settings = getSettings();
    const currentContext = context();
    if (!settings.autoTrack || !Number.isInteger(messageId) || !hasUserReply(currentContext)) return;
    const message = currentContext.chat?.[messageId];
    if (!message || message.is_user || message.is_system || typeof message.mes !== 'string') return;
    const extracted = extractPatch(message.mes);
    if (!extracted.found) return;
    message.mes = extracted.visible;
    if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && message.swipes[message.swipe_id] !== undefined) message.swipes[message.swipe_id] = extracted.visible;
    if (!extracted.patch) return;
    const result = applyPatch(getState(), extracted.patch);
    if (result.accepted) { await persistState(result.next, 'assistant-patch'); notify('success', `${result.accepted} system value${result.accepted === 1 ? '' : 's'} updated.`); }
}

function analyzerPrompt(state, transcript) { return `Review only the latest completed role-play turn and return JSON for the state patch.\nCURRENT STATE:\n${JSON.stringify(stateForPrompt(state))}\nLATEST TURN:\n${transcript}\n${patchInstructions()}\nReturn only {"ops":[],"summary":"..."}.`; }

async function syncLatestTurn() {
    const currentContext = context();
    if (!currentContext.getCurrentChatId?.()) return notify('warning', 'Open a chat before synchronizing The System.');
    if (typeof currentContext.generateQuietPrompt !== 'function') return notify('error', 'This SillyTavern build does not expose its configured model call.');
    const transcript = (currentContext.chat || []).filter(message => message?.mes && !message.is_system).slice(-2).map(message => `${message.is_user ? 'User' : 'Character'}: ${message.mes}`).join('\n\n');
    if (!transcript) return notify('info', 'There are no completed role-play turns to synchronize.');
    try {
        const response = await currentContext.generateQuietPrompt({ quietPrompt: analyzerPrompt(getState(), transcript), skipWIAN: true, responseLength: 700, removeReasoning: true });
        const result = applyPatch(getState(), parseJson(response));
        if (result.accepted) await persistState(result.next, 'manual-ai-sync');
        notify('success', result.accepted ? `${result.accepted} system value${result.accepted === 1 ? '' : 's'} updated.` : 'No confirmed state changes found.');
    } catch (error) { console.error('[The System] Model synchronization failed.', error); notify('error', `The System could not synchronize: ${error.message}`); }
}

function tabButton(tab, active) { return `<button class="sl-system-tab${active ? ' is-active' : ''}" type="button" role="tab" data-sl-tab="${tab.id}" aria-selected="${active}" aria-controls="sl-system-panel-${tab.id}"><i class="${tab.icon}" aria-hidden="true"></i><span>${html(tab.label)}</span></button>`; }

function renderStatus() {
    const state = getState();
    const player = state.player;
    const name = context().name1 || player.name;
    const hp = Math.round((player.hp / Math.max(1, player.maxHp)) * 100);
    const mp = Math.round((player.mp / Math.max(1, player.maxMp)) * 100);
    const xp = Math.round((player.experience / Math.max(1, player.experienceRequired)) * 100);
    const stats = [['STR', 'Strength', player.stats.strength, 'fa-hand-fist'], ['AGI', 'Agility', player.stats.agility, 'fa-person-running'], ['VIT', 'Vitality', player.stats.vitality, 'fa-heart-pulse'], ['INT', 'Intelligence', player.stats.intelligence, 'fa-brain'], ['SEN', 'Sense', player.stats.sense, 'fa-eye']];
    return `<section class="sl-status-identity-card"><div class="sl-status-level-orbit"><span>LEVEL</span><strong>${player.level}</strong><small>PLAYER</small></div><div class="sl-status-identity-copy"><span class="sl-system-eyebrow">Player status</span><h3>${html(name)}</h3><p>Job: <b>${html(player.job)}</b> · Title: <b>${html(player.title)}</b></p><span class="sl-status-connection"><i class="fa-solid fa-circle"></i> State linked to active chat</span></div><div class="sl-status-rank-plate"><span>RANK</span><strong>${html(player.rank)}</strong><small>${html(player.condition)}</small></div></section><section class="sl-status-resource-card"><div class="sl-status-card-title"><span class="sl-system-eyebrow">System resources</span><strong>Current condition</strong></div><div class="sl-status-resource-row"><i class="fa-solid fa-heart-pulse"></i><span>HP</span><b>${player.hp} / ${player.maxHp}</b><div class="sl-status-meter sl-status-meter-hp"><i style="width:${hp}%"></i></div></div><div class="sl-status-resource-row"><i class="fa-solid fa-droplet"></i><span>MP</span><b>${player.mp} / ${player.maxMp}</b><div class="sl-status-meter sl-status-meter-mp"><i style="width:${mp}%"></i></div></div><div class="sl-status-resource-row"><i class="fa-solid fa-gauge-high"></i><span>EXP</span><b>${player.experience} / ${player.experienceRequired}</b><div class="sl-status-meter"><i style="width:${xp}%"></i></div></div></section><div class="sl-status-columns"><section class="sl-status-panel-card"><div class="sl-status-card-title"><span class="sl-system-eyebrow">Attributes</span><strong>Core statistics</strong></div><div class="sl-status-stat-grid">${stats.map(([short, label, value, icon]) => `<article><i class="fa-solid ${icon}"></i><span>${short}<small>${label}</small></span><b>${value}</b></article>`).join('')}</div></section><section class="sl-status-panel-card"><div class="sl-status-card-title"><span class="sl-system-eyebrow">System record</span><strong>Active modules</strong></div><div class="sl-status-record-list"><div><i class="fa-solid fa-scroll"></i><span>Quests<small>${state.quests.length ? `${state.quests.length} active` : 'No active quests'}</small></span><b>${state.quests.length}</b></div><div><i class="fa-solid fa-layer-group"></i><span>Skills<small>${state.skills.length ? `${state.skills.length} registered` : 'No skills unlocked'}</small></span><b>${state.skills.length}</b></div><div><i class="fa-solid fa-box-open"></i><span>Inventory<small>${state.inventory.length ? `${state.inventory.length} item types` : 'Inventory empty'}</small></span><b>${state.inventory.length}</b></div></div></section></div><div class="sl-status-footer-note"><i class="fa-solid fa-circle-info"></i><span>The System checks the active provider/model through SillyTavern. No separate API key or external endpoint is used.</span></div>`;
}

function renderPlaceholder(tabId) { const tab = TABS.find(item => item.id === tabId); return `<section class="sl-system-coming-soon"><div><i class="${tab?.icon || 'fa-solid fa-circle-nodes'}"></i></div><span class="sl-system-eyebrow">Module ready</span><h3>${html(tab?.label || 'System')}</h3><p>This module is reserved for the next system layer. Status is the active foundation for now.</p></section>`; }

function renderActivePanel() {
    const panel = document.getElementById(`sl-system-panel-${activeTab}`);
    if (panel) panel.innerHTML = activeTab === 'status' ? renderStatus() : renderPlaceholder(activeTab);
}

function activateTab(tabId) {
    if (!TABS.some(tab => tab.id === tabId)) return;
    activeTab = tabId;
    document.querySelectorAll('[data-sl-tab]').forEach(button => { const active = button.dataset.slTab === tabId; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
    document.querySelectorAll('[data-sl-panel]').forEach(panel => { const active = panel.dataset.slPanel === tabId; panel.hidden = !active; panel.classList.toggle('is-active', active); });
    renderActivePanel();
}

function buildInterface() {
    const existing = document.getElementById('sl-system-overlay');
    if (existing?.dataset.slUiVersion === UI_VERSION && existing.querySelector('#sl-system-frame')) return;
    if (existing) {
        console.info('[The System] Replacing a stale interface from an earlier extension build.');
        existing.remove();
    }
    const overlay = document.createElement('div');
    overlay.id = 'sl-system-overlay'; overlay.className = 'sl-system-overlay'; overlay.dataset.slUiVersion = UI_VERSION; overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<button class="sl-system-backdrop" type="button" aria-label="Close The System"></button><section id="sl-system-frame" class="sl-system-frame" role="dialog" aria-modal="true" aria-labelledby="sl-system-title" tabindex="-1"><div id="sl-system-notification" class="sl-system-phase sl-system-notification" hidden><div class="sl-system-notification-frame"><aside class="sl-system-vertical-label">NOTIFICATION</aside><div class="sl-system-notification-icon"><i class="fa-solid fa-circle-exclamation"></i></div><div class="sl-system-notification-copy"><span class="sl-system-eyebrow">Quest initialization</span><h2>New quest detected</h2><p class="sl-system-quote">“Your heart will stop in 0.02 seconds if you choose not to accept.”</p><p>Will you accept the system and become a Player?</p><div class="sl-system-choice-row"><button class="sl-system-choice-button is-accept" type="button" data-sl-action="accept"><span>YES</span><small>ACCEPT</small></button><button class="sl-system-choice-button is-decline" type="button" data-sl-action="decline"><span>NO</span><small>DECLINE</small></button></div></div></div></div><div id="sl-system-acknowledgement" class="sl-system-phase sl-system-acknowledgement" hidden><div class="sl-system-notification-frame"><aside class="sl-system-vertical-label">NOTIFICATION</aside><div class="sl-system-notification-icon"><i class="fa-solid fa-circle-check"></i></div><div class="sl-system-notification-copy"><span class="sl-system-eyebrow">System response</span><h2>Congratulations, Player.</h2><p class="sl-system-quote">You are now connected to The System.</p><p class="sl-system-ack-small">Initializing Status interface…</p></div></div></div><div id="sl-system-main" class="sl-system-phase sl-system-main" hidden><header class="sl-system-main-header"><div class="sl-system-main-brand"><span class="sl-system-sys-mark">SYS</span><div><span class="sl-system-eyebrow">Solo Leveling interface</span><h2 id="sl-system-title">The System</h2></div></div><div class="sl-system-main-state"><i class="fa-solid fa-circle"></i> ONLINE</div><button class="sl-system-close" type="button" data-sl-action="close" aria-label="Close The System"><i class="fa-solid fa-xmark"></i></button></header><div class="sl-system-workspace"><nav class="sl-system-nav" aria-label="The System sections" role="tablist">${TABS.map((tab, index) => tabButton(tab, index === 0)).join('')}</nav><main class="sl-system-content">${TABS.map((tab, index) => `<section id="sl-system-panel-${tab.id}" class="sl-system-tab-panel${index === 0 ? ' is-active' : ''}" data-sl-panel="${tab.id}" role="tabpanel" ${index ? 'hidden' : ''}></section>`).join('')}</main></div><footer class="sl-system-main-footer"><span><i class="fa-solid fa-link"></i> Active chat state</span><button type="button" data-sl-action="sync"><i class="fa-solid fa-rotate"></i> Sync latest turn</button><span>v${UI_VERSION}</span></footer></div></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.sl-system-backdrop')?.addEventListener('click', closeInterface);
    overlay.querySelectorAll('[data-sl-tab]').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.slTab)));
    overlay.addEventListener('click', event => { const action = event.target.closest('[data-sl-action]')?.dataset.slAction; if (action === 'accept') acceptSystem(); if (action === 'decline') declineSystem(); if (action === 'close') closeInterface(); if (action === 'sync') syncLatestTurn(); });
    overlay.addEventListener('pointerdown', event => { const control = event.target.closest('button'); if (!control) return; control.classList.remove('is-pulsing'); void control.offsetWidth; control.classList.add('is-pulsing'); setTimeout(() => control.classList.remove('is-pulsing'), 500); });
    applyAppearance();
}

function showPhase(phase) {
    const overlay = document.getElementById('sl-system-overlay');
    if (!overlay) return;
    overlay.dataset.phase = phase;
    for (const id of ['notification', 'acknowledgement', 'main']) document.getElementById(`sl-system-${id}`)?.toggleAttribute('hidden', id !== phase);
    if (phase === 'main') { activateTab(activeTab); renderActivePanel(); }
}

function acceptSystem() {
    getSettings().systemAccepted = true; saveSettings(); showPhase('acknowledgement'); clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => { if (document.getElementById('sl-system-overlay')?.classList.contains('is-open')) showPhase('main'); }, 1900);
}

function declineSystem() {
    const overlay = document.getElementById('sl-system-overlay');
    if (!overlay) return;
    overlay.classList.add('is-declining'); clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => { overlay.classList.remove('is-declining'); closeInterface(); }, 520);
}

function openInterface() {
    try {
        buildInterface();
        const overlay = document.getElementById('sl-system-overlay'); const frame = document.getElementById('sl-system-frame');
        if (!overlay || !frame) throw new Error('The interface frame was not created.');
        previousFocusedElement = document.activeElement; clearTimeout(transitionTimer); overlay.classList.add('is-open'); overlay.setAttribute('aria-hidden', 'false'); document.body.classList.add('sl-system-open'); showPhase(getSettings().systemAccepted ? 'main' : 'notification'); requestAnimationFrame(() => frame.focus());
    } catch (error) {
        console.error('[The System] Could not open the interface.', error);
        notify('error', 'The System could not open. Reload SillyTavern and try again.');
    }
}

function closeInterface() {
    const overlay = document.getElementById('sl-system-overlay');
    if (!overlay?.classList.contains('is-open')) return;
    clearTimeout(transitionTimer); overlay.classList.remove('is-open', 'is-declining'); overlay.setAttribute('aria-hidden', 'true'); document.body.classList.remove('sl-system-open');
    if (previousFocusedElement instanceof HTMLElement) previousFocusedElement.focus({ preventScroll: true });
}

function syncLauncherVisibility() {
    const launcher = document.getElementById('sl-system-wand-launcher'); if (!launcher) return;
    const visible = getSettings().showWandLauncher; launcher.hidden = !visible; launcher.setAttribute('aria-hidden', String(!visible));
}

function createWandLauncher() {
    const menu = document.getElementById('extensionsMenu'); if (!menu) return false;
    let launcher = document.getElementById('sl-system-wand-launcher');
    if (launcher?.dataset.slUiVersion !== UI_VERSION) {
        const replacement = document.createElement('div'); replacement.id = 'sl-system-wand-launcher'; replacement.className = 'list-group-item flex-container flexGap5 interactable'; replacement.tabIndex = 0; replacement.setAttribute('role', 'button'); replacement.title = 'Open The System'; replacement.innerHTML = '<i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>The System</span>';
        if (launcher) launcher.replaceWith(replacement); else menu.appendChild(replacement);
        launcher = replacement;
    }
    if (!launcher) return false;
    launcher.dataset.slUiVersion = UI_VERSION;
    const activate = event => { if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); openInterface(); };
    launcher.onclick = activate; launcher.onkeydown = activate; syncLauncherVisibility(); return true;
}

function observeWandMenu() {
    if (createWandLauncher() || menuObserver) return;
    menuObserver = new MutationObserver(() => { if (createWandLauncher()) { menuObserver.disconnect(); menuObserver = null; } });
    menuObserver.observe(document.body, { childList: true, subtree: true });
}

function bindCheckbox(id, key, callback) {
    const control = document.getElementById(id); if (!(control instanceof HTMLInputElement)) return;
    control.checked = Boolean(getSettings()[key]); control.addEventListener('change', () => { getSettings()[key] = control.checked; saveSettings(); callback?.(); });
}

function bindSettingControl(id, key, callback) {
    const control = document.getElementById(id); if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
    control.value = String(getSettings()[key]); const update = () => { getSettings()[key] = control.type === 'range' ? Number(control.value) : control.value; saveSettings(); callback?.(); };
    control.addEventListener(control.type === 'range' || control.type === 'color' ? 'input' : 'change', update);
}

function bindSettingsDrawer() {
    bindCheckbox('sl-system-show-launcher', 'showWandLauncher', syncLauncherVisibility); bindCheckbox('sl-system-auto-track', 'autoTrack', updatePrompt); bindCheckbox('sl-system-inject-state', 'injectState', updatePrompt); bindSettingControl('sl-system-accent', 'accentColor', applyAppearance); bindSettingControl('sl-system-glass', 'glassOpacity', applyAppearance); bindSettingControl('sl-system-glow', 'glowStrength', applyAppearance);
    const openButton = document.getElementById('sl-system-open-from-settings');
    const syncButton = document.getElementById('sl-system-sync-from-settings');
    if (openButton) openButton.onclick = openInterface;
    if (syncButton) syncButton.onclick = syncLatestTurn;
    applyAppearance();
}

async function addSettingsDrawer() {
    if (document.getElementById('sl-system-settings')) { bindSettingsDrawer(); return true; }
    const container = document.getElementById('extensions_settings2'); if (!container) return false;
    const rendered = await context().renderExtensionTemplateAsync?.(EXTENSION_FOLDER, 'settings'); if (!rendered) throw new Error('SillyTavern did not return The System settings template.');
    container.insertAdjacentHTML('beforeend', rendered); bindSettingsDrawer(); return true;
}

function observeSettingsDrawer() {
    if (settingsObserver) return;
    settingsObserver = new MutationObserver(async () => { try { if (await addSettingsDrawer()) { settingsObserver.disconnect(); settingsObserver = null; } } catch (error) { console.error('[The System] Could not add the Extensions drawer.', error); } });
    settingsObserver.observe(document.body, { childList: true, subtree: true });
}

function bindChatEvents() {
    const currentContext = context(); if (!currentContext.eventSource?.on || !currentContext.eventTypes) return;
    const { eventSource, eventTypes } = currentContext;
    if (eventTypes.CHAT_CHANGED) eventSource.on(eventTypes.CHAT_CHANGED, () => { updatePrompt(); renderActivePanel(); });
    if (eventTypes.MESSAGE_SENT) eventSource.on(eventTypes.MESSAGE_SENT, updatePrompt);
    if (eventTypes.MESSAGE_RECEIVED) eventSource.on(eventTypes.MESSAGE_RECEIVED, processAssistantPatch);
}

async function initialize() {
    if (initialized) return; initialized = true;
    try { getSettings(); applyAppearance(); buildInterface(); if (!(await addSettingsDrawer())) observeSettingsDrawer(); observeWandMenu(); bindChatEvents(); updatePrompt(); document.addEventListener('keydown', event => { if (event.key === 'Escape') closeInterface(); }); console.info(`[The System] Interface v${UI_VERSION} loaded.`); }
    catch (error) { initialized = false; console.error('[The System] Failed to initialize.', error); notify('error', 'The System could not load. Check the browser console.'); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else void initialize();
