/* global SillyTavern */

const EXTENSION_FOLDER = 'third-party/sololeveling-extension';
const SETTINGS_KEY = 'the_system';
const METADATA_KEY = 'solo_leveling_system_state';
const PROMPT_KEY = 'solo_leveling_system_roleplay_state';
const UI_VERSION = '0.4.0';
const PAGE_SIZE = 8;
const PATCH_PATTERN = /<!--\s*solo_system_patch\s*:\s*([\s\S]*?)\s*-->/gi;

const DEFAULT_SETTINGS = Object.freeze({
    showWandLauncher: true,
    autoTrack: true,
    injectState: true,
    accentColor: '#35bfff',
    glassOpacity: 90,
    glowStrength: 58,
    notificationPosition: 'top-center',
});

const TABS = [
    { id: 'status', label: 'Status', icon: 'fa-solid fa-user' },
    { id: 'quest', label: 'Quest', icon: 'fa-solid fa-scroll' },
    { id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-box-open' },
    { id: 'equipment', label: 'Equipment', icon: 'fa-solid fa-shield-halved' },
    { id: 'shop', label: 'System Shop', icon: 'fa-solid fa-cart-shopping' },
];

const EQUIPMENT_SLOTS = [
    ['weapon', 'Weapon', 'fa-khanda'], ['head', 'Head', 'fa-helmet-safety'],
    ['chest', 'Chest', 'fa-shirt'], ['hands', 'Hands', 'fa-hand-fist'],
    ['legs', 'Legs', 'fa-person'], ['feet', 'Feet', 'fa-shoe-prints'],
    ['accessory', 'Accessory', 'fa-gem'],
];

const DEFAULT_STATE = Object.freeze({
    accepted: false,
    profile: { image: '', positionX: 50, positionY: 50, zoom: 1 },
    player: {
        name: 'System User', title: 'Unawakened Hunter', titles: [], job: 'None', level: 1, rank: 'E',
        experience: 0, experienceRequired: 100, hp: 100, maxHp: 100, mp: 50, maxMp: 50,
        fatigue: 0, condition: 'Stable', statPoints: 0, gold: 1000,
        stats: { strength: 10, agility: 10, vitality: 10, intelligence: 10, perception: 10 },
    },
    skills: [], quests: [], inventory: [],
    equipment: { weapon: null, head: null, chest: null, hands: null, legs: null, feet: null, accessory: null },
    shop: [], pendingActions: [], updatedAt: '', updateSource: 'initial',
});

let initialized = false;
let menuObserver = null;
let settingsObserver = null;
let previousFocusedElement = null;
let activeTab = 'status';
let transitionTimer = null;
let islandTimer = null;
let islandQueue = [];
let islandBusy = false;
let inventoryPage = 1;
let shopPage = 1;
let selectedItemId = '';
let imageEditorTarget = null;
let imageEditorDraft = null;
let shopGenerating = false;

function context() { return globalThis.SillyTavern?.getContext?.() || {}; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function uid(prefix = 'id') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function html(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function number(value, fallback, min = -Infinity, max = Infinity) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function text(value, fallback = '', max = 240) { const result = String(value ?? fallback).trim(); return (result || fallback).slice(0, max); }
function percent(value, maximum) { return Math.max(0, Math.min(100, Math.round((number(value, 0) / Math.max(1, number(maximum, 1))) * 100))); }

function hexToRgb(hex) {
    const match = String(hex).match(/^#?([0-9a-f]{6})$/i);
    if (!match) return '53, 191, 255';
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
    if (!['top-center', 'top-left', 'top-right', 'bottom-center'].includes(settings.notificationPosition)) settings.notificationPosition = DEFAULT_SETTINGS.notificationPosition;
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
    document.getElementById('sl-system-island')?.setAttribute('data-position', settings.notificationPosition);
}

function normalizeImage(source = {}) {
    return {
        image: typeof source.image === 'string' && source.image.startsWith('data:image/') ? source.image.slice(0, 4000000) : '',
        positionX: number(source.positionX, 50, 0, 100), positionY: number(source.positionY, 50, 0, 100), zoom: number(source.zoom, 1, 1, 3),
    };
}

function inferSlot(category) {
    const value = String(category).toLowerCase();
    if (value.includes('weapon')) return 'weapon';
    if (value.includes('helmet') || value.includes('head')) return 'head';
    if (value.includes('armor') || value.includes('chest')) return 'chest';
    if (value.includes('glove') || value.includes('hand')) return 'hands';
    if (value.includes('leg') || value.includes('pants')) return 'legs';
    if (value.includes('boot') || value.includes('shoe')) return 'feet';
    if (value.includes('accessory') || value.includes('ring') || value.includes('necklace')) return 'accessory';
    return '';
}

function normalizeItem(source = {}, fallbackCategory = 'Misc') {
    if (!source || typeof source !== 'object' || !text(source.name)) return null;
    const category = text(source.category, fallbackCategory, 40);
    return {
        id: text(source.id, uid('item'), 100), name: text(source.name, 'Unknown Item', 100), category,
        rarity: text(source.rarity, 'Common', 30), quantity: number(source.quantity, 1, 0, 99999),
        description: text(source.description, 'No description recorded.', 1200), price: number(source.price, 0, 0, 999999999),
        slot: text(source.slot, inferSlot(category), 30), usable: Boolean(source.usable || ['Potion', 'Consumable', 'Food'].includes(category)),
        effects: source.effects && typeof source.effects === 'object' ? {
            hp: number(source.effects.hp, 0, -999999, 999999), mp: number(source.effects.mp, 0, -999999, 999999),
            description: text(source.effects.description, '', 300),
        } : { hp: 0, mp: 0, description: '' },
        icon: normalizeImage(source.icon || source),
    };
}

function normalizeQuest(source = {}) {
    if (!source || typeof source !== 'object' || !text(source.title || source.name)) return null;
    return {
        id: text(source.id, uid('quest'), 100), title: text(source.title || source.name, 'Unnamed Quest', 120),
        type: text(source.type, 'Normal', 40), status: text(source.status, 'Active', 40),
        description: text(source.description, 'No objective details recorded.', 1000),
        progress: number(source.progress, 0, 0, 999999), goal: number(source.goal, 1, 1, 999999),
        rewards: text(source.rewards, 'Unknown reward', 300),
    };
}

function normalizeSkill(source = {}) {
    if (!source || typeof source !== 'object' || !text(source.name)) return null;
    return {
        id: text(source.id, uid('skill'), 100), name: text(source.name, '', 100), rank: text(source.rank, 'E', 20),
        type: text(source.type, 'Active', 30), description: text(source.description, '', 500),
        uses: number(source.uses, 0, 0, 999999), lastUsedAt: text(source.lastUsedAt, '', 80),
    };
}

function normalizeState(source = {}, fallback = DEFAULT_STATE) {
    const base = clone(fallback);
    base.accepted = Boolean(source.accepted);
    base.profile = normalizeImage(source.profile);
    const player = source.player && typeof source.player === 'object' ? source.player : {};
    base.player = { ...base.player, ...player, stats: { ...base.player.stats, ...(player.stats && typeof player.stats === 'object' ? player.stats : {}) } };
    if (base.player.stats.sense !== undefined && base.player.stats.perception === DEFAULT_STATE.player.stats.perception) base.player.stats.perception = base.player.stats.sense;
    for (const key of ['level', 'experience', 'experienceRequired', 'hp', 'maxHp', 'mp', 'maxMp', 'fatigue', 'statPoints', 'gold']) base.player[key] = number(base.player[key], DEFAULT_STATE.player[key], 0, 999999999);
    for (const key of ['rank', 'condition', 'name', 'title', 'job']) base.player[key] = text(base.player[key], DEFAULT_STATE.player[key], 100);
    base.player.titles = Array.isArray(player.titles) ? player.titles.map(value => text(value, '', 100)).filter(Boolean).slice(0, 100) : [];
    for (const stat of Object.keys(DEFAULT_STATE.player.stats)) base.player.stats[stat] = number(base.player.stats[stat], 10, 0, 999999);
    base.skills = Array.isArray(source.skills) ? source.skills.map(normalizeSkill).filter(Boolean).slice(0, 300) : [];
    base.quests = Array.isArray(source.quests) ? source.quests.map(normalizeQuest).filter(Boolean).slice(0, 300) : [];
    base.inventory = Array.isArray(source.inventory) ? source.inventory.map(item => normalizeItem(item)).filter(Boolean).slice(0, 500) : [];
    base.shop = Array.isArray(source.shop) ? source.shop.map(item => normalizeItem(item, 'Misc')).filter(Boolean).slice(0, 100) : [];
    base.equipment = { ...base.equipment, ...(source.equipment && typeof source.equipment === 'object' ? source.equipment : {}) };
    for (const slot of Object.keys(base.equipment)) base.equipment[slot] = base.inventory.some(item => item.id === base.equipment[slot]) ? base.equipment[slot] : null;
    base.pendingActions = Array.isArray(source.pendingActions) ? source.pendingActions.filter(action => action && typeof action === 'object').slice(-30) : [];
    base.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : '';
    base.updateSource = text(source.updateSource, 'initial', 80);
    return base;
}

function getState() {
    const saved = context().chatMetadata?.[METADATA_KEY];
    return saved && typeof saved === 'object' ? normalizeState(saved) : normalizeState();
}

async function persistState(nextState, source = 'ui-action', options = {}) {
    const currentContext = context();
    if (!currentContext.getCurrentChatId?.()) { systemNotice('warning', 'Open a chat before changing The System.'); return false; }
    const previous = getState();
    const next = normalizeState(nextState, previous);
    next.updatedAt = new Date().toISOString(); next.updateSource = source;
    currentContext.chatMetadata ||= {}; currentContext.chatMetadata[METADATA_KEY] = next;
    updatePrompt(next); renderAll(); await currentContext.saveMetadata?.();
    if (options.detect !== false) announceChanges(previous, next, source);
    return true;
}

function queueAction(state, type, summary, payload = {}) {
    state.pendingActions ||= [];
    state.pendingActions.push({ id: uid('action'), type, summary: text(summary, '', 300), payload, at: new Date().toISOString() });
    state.pendingActions = state.pendingActions.slice(-30);
}

function hasUserReply(currentContext = context()) { return Array.isArray(currentContext.chat) && currentContext.chat.some(message => message?.is_user && !message.is_system && text(message.mes)); }

function stateForPrompt(state) {
    return {
        player: state.player, skills: state.skills, quests: state.quests,
        inventory: state.inventory.map(({ icon, ...item }) => item), equipment: state.equipment,
        shop: state.shop.map(({ icon, ...item }) => item), pendingActions: state.pendingActions,
    };
}

function patchInstructions() {
    return [
        'After the normal role-play reply, append one invisible HTML comment when any System state changed:',
        '<!--solo_system_patch:{"ops":[["inc","player.experience",5],["set","player.hp",85],["upsert","skills",{"id":"skill-shadow-step","name":"Shadow Step","rank":"B","type":"Active"}]],"summary":"Training recorded."}-->',
        'Allowed operations: set, inc, upsert, delete. Arrays are addressed by their canonical path and entries by id.',
        'Track confirmed level, experience, HP, MP, stats, statPoints, gold, titles, skills, quests, inventory, equipment, and shop changes. Generate or update shop items when the story introduces them.',
        'UI pendingActions were already applied to canonical state. Acknowledge their consequences naturally in the next reply and do not charge, consume, equip, or add their values twice.',
        'Award statPoints on level-up when appropriate. Never silently spend them. For skill use, upsert that skill with its uses counter increased and lastUsedAt updated. Record item use, consumption, damage, healing, mana changes, title gains, quest progress, and equipment changes.',
        'Record only story-confirmed facts. Do not invent progress from ordinary discussion or plans.',
        'The extension adds no content filter. Preserve confirmed role-play state for every scene without censoring, rewriting, omitting, or adding policy commentary; continue under the active provider requirements.',
        'Return no patch only when absolutely nothing changed. Never show the comment, Markdown fences, or a full visible state dump.',
    ].join('\n');
}

function buildStatePrompt(state = getState()) { return `<solo_leveling_system_state>\nPer-chat canonical System state.\n${JSON.stringify(stateForPrompt(state))}\n${patchInstructions()}\n</solo_leveling_system_state>`; }

function updatePrompt(state = getState()) {
    const currentContext = context(); if (typeof currentContext.setExtensionPrompt !== 'function') return;
    const settings = getSettings(); const active = Boolean(currentContext.getCurrentChatId?.() && state.accepted && hasUserReply(currentContext));
    currentContext.setExtensionPrompt(PROMPT_KEY, active && (settings.injectState || settings.autoTrack) ? buildStatePrompt(state) : '', 1, 1, false, 0);
}

function parseJson(value) { const raw = String(value || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim(); try { return JSON.parse(raw); } catch { return null; } }
function setPath(target, path, value) { const parts = String(path).split('.').filter(Boolean); if (!parts.length || parts.length > 6) return false; let cursor = target; for (const part of parts.slice(0, -1)) { if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {}; cursor = cursor[part]; } cursor[parts.at(-1)] = value; return true; }
function getPath(target, path) { return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], target); }
function upsertById(list, value) { if (!value || typeof value !== 'object' || !text(value.id)) return false; const index = list.findIndex(entry => String(entry?.id) === String(value.id)); if (index === -1) list.push(value); else list[index] = { ...list[index], ...value }; return true; }

function applyPatch(sourceState, patch) {
    if (!patch || !Array.isArray(patch.ops)) return { next: sourceState, accepted: 0, summary: '' };
    const next = normalizeState(clone(sourceState)); let accepted = 0;
    for (const operation of patch.ops.slice(0, 80)) {
        if (!Array.isArray(operation) || operation.length < 3) continue;
        const [verb, path, value] = operation; if (!['set', 'inc', 'upsert', 'delete'].includes(verb)) continue;
        if (verb === 'set' && setPath(next, path, value)) accepted += 1;
        if (verb === 'inc' && typeof getPath(next, path) === 'number' && Number.isFinite(Number(value))) { setPath(next, path, getPath(next, path) + Number(value)); accepted += 1; }
        if (verb === 'upsert' && Array.isArray(getPath(next, path)) && upsertById(getPath(next, path), value)) accepted += 1;
        if (verb === 'delete' && Array.isArray(getPath(next, path))) { const list = getPath(next, path); const id = typeof value === 'object' ? value.id : value; const filtered = list.filter(entry => String(entry?.id) !== String(id)); if (filtered.length !== list.length) { setPath(next, path, filtered); accepted += 1; } }
    }
    next.pendingActions = [];
    return { next: normalizeState(next), accepted, summary: text(patch.summary, '', 300) };
}

function extractPatch(message) {
    let found = false; const patches = [];
    const visible = String(message || '').replace(PATCH_PATTERN, (_match, payload) => { found = true; const parsed = parseJson(payload); if (parsed) patches.push(parsed); return ''; });
    return { visible: visible.trimEnd(), patch: patches.length ? { ops: patches.flatMap(item => Array.isArray(item.ops) ? item.ops : []), summary: patches.map(item => item.summary).filter(Boolean).join('; ') } : null, found };
}

async function processAssistantPatch(messageId, generationType = '') {
    if (['first_message', 'quiet', 'impersonate'].includes(generationType)) return;
    const currentContext = context(); const state = getState();
    if (!getSettings().autoTrack || !state.accepted || !Number.isInteger(messageId) || !hasUserReply(currentContext)) return;
    const message = currentContext.chat?.[messageId]; if (!message || message.is_user || message.is_system || typeof message.mes !== 'string') return;
    const extracted = extractPatch(message.mes);
    if (!extracted.found) { renderAll(); systemNotice('sync', 'System synchronized', 'No confirmed state change'); return; }
    message.mes = extracted.visible;
    if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && message.swipes[message.swipe_id] !== undefined) message.swipes[message.swipe_id] = extracted.visible;
    if (!extracted.patch) { systemNotice('sync', 'System synchronized', 'No valid state update'); return; }
    const result = applyPatch(state, extracted.patch);
    if (result.accepted) await persistState(result.next, 'assistant-patch'); else systemNotice('sync', 'System synchronized', 'No confirmed state change');
}

function analyzerPrompt(state, transcript) { return `Review only the latest completed role-play turn and return JSON for The System.\nCURRENT STATE:\n${JSON.stringify(stateForPrompt(state))}\nLATEST TURN:\n${transcript}\n${patchInstructions()}\nReturn only {"ops":[],"summary":"..."}.`; }

async function syncLatestTurn() {
    const currentContext = context();
    if (!currentContext.getCurrentChatId?.()) return systemNotice('warning', 'Open a chat first');
    if (typeof currentContext.generateQuietPrompt !== 'function') return systemNotice('error', 'Model connection unavailable');
    const transcript = (currentContext.chat || []).filter(message => message?.mes && !message.is_system).slice(-2).map(message => `${message.is_user ? 'User' : 'Character'}: ${message.mes}`).join('\n\n');
    if (!transcript) return systemNotice('info', 'Nothing to synchronize');
    systemNotice('working', 'Analyzing latest turn…');
    try {
        const response = await currentContext.generateQuietPrompt({ quietPrompt: analyzerPrompt(getState(), transcript), skipWIAN: true, responseLength: 1000, removeReasoning: true });
        const result = applyPatch(getState(), parseJson(response));
        if (result.accepted) await persistState(result.next, 'manual-ai-sync'); else systemNotice('sync', 'System synchronized', 'No confirmed state change');
    } catch (error) { console.error('[The System] Sync failed.', error); systemNotice('error', 'System sync failed', error.message); }
}

function buildIsland() {
    if (document.getElementById('sl-system-island')) return;
    const island = document.createElement('button'); island.id = 'sl-system-island'; island.className = 'sl-system-island'; island.type = 'button'; island.dataset.position = getSettings().notificationPosition;
    island.innerHTML = '<span class="sl-island-sigil"><i class="fa-solid fa-diamond"></i></span><span class="sl-island-copy"><strong>THE SYSTEM</strong><small>Interface initialized</small></span><span class="sl-island-progress"></span>';
    island.addEventListener('click', openInterface); document.body.appendChild(island);
}

function systemNotice(mode, title, detail = '') { islandQueue.push({ mode, title: text(title, 'System update', 120), detail: text(detail, '', 180) }); playNextNotice(); }

function playNextNotice() {
    if (islandBusy || !islandQueue.length) return;
    buildIsland(); const island = document.getElementById('sl-system-island'); if (!island) return;
    islandBusy = true; const item = islandQueue.shift(); island.dataset.mode = item.mode;
    island.querySelector('strong').textContent = item.title; island.querySelector('small').textContent = item.detail || 'The System has been updated'; island.classList.add('is-visible');
    clearTimeout(islandTimer); islandTimer = setTimeout(() => { island.classList.remove('is-visible'); setTimeout(() => { islandBusy = false; playNextNotice(); }, 320); }, item.mode === 'working' ? 1800 : 3000);
}

function announceChanges(before, after, source) {
    const notices = [];
    if (after.player.level > before.player.level) notices.push(['level', `LEVEL UP — ${after.player.level}`, `Stat points available: ${after.player.statPoints}`]);
    if (after.player.hp !== before.player.hp) notices.push([after.player.hp < before.player.hp ? 'danger' : 'heal', `HP ${after.player.hp < before.player.hp ? 'DECREASED' : 'RECOVERED'}`, `${before.player.hp} → ${after.player.hp}`]);
    if (after.player.mp !== before.player.mp) notices.push([after.player.mp < before.player.mp ? 'mana' : 'heal', `MP ${after.player.mp < before.player.mp ? 'CONSUMED' : 'RECOVERED'}`, `${before.player.mp} → ${after.player.mp}`]);
    if (after.player.statPoints > before.player.statPoints) notices.push(['reward', 'STAT POINTS EARNED', `+${after.player.statPoints - before.player.statPoints}`]);
    after.player.titles.filter(value => !before.player.titles.includes(value)).forEach(value => notices.push(['title', 'TITLE ACQUIRED', value]));
    after.skills.filter(item => !before.skills.some(old => old.id === item.id)).forEach(item => notices.push(['skill', 'SKILL ACQUIRED', `${item.name} · Rank ${item.rank}`]));
    after.skills.forEach(item => { const old = before.skills.find(entry => entry.id === item.id); if (old && item.uses > old.uses) notices.push(['skill', 'SKILL ACTIVATED', `${item.name} · Use ${item.uses}`]); });
    after.inventory.forEach(item => { const old = before.inventory.find(entry => entry.id === item.id); if (!old) notices.push(['item', 'ITEM ACQUIRED', `${item.name} ×${item.quantity}`]); else if (item.quantity < old.quantity) notices.push(['item', 'ITEM CONSUMED', `${item.name} ×${old.quantity - item.quantity}`]); });
    Object.keys(after.player.stats).forEach(stat => { if (after.player.stats[stat] > before.player.stats[stat]) notices.push(['stat', `${stat.toUpperCase()} INCREASED`, `${before.player.stats[stat]} → ${after.player.stats[stat]}`]); });
    if (!notices.length && source === 'assistant-patch') notices.push(['sync', 'SYSTEM UPDATED', 'State synchronized with the latest reply']);
    notices.slice(0, 6).forEach(item => systemNotice(...item));
}

function categorySvg(category) {
    const key = String(category).toLowerCase(); let paths = '<path d="M32 9 46 23 32 55 18 23Z"/><path d="M18 23h28"/>';
    if (key.includes('weapon')) paths = '<path d="m15 49 34-34 4-7-7 4-34 34Z"/><path d="m10 54 9-9M16 50l-5-5"/>';
    else if (key.includes('potion') || key.includes('consum')) paths = '<path d="M25 8h14v9l7 9v25H18V26l7-9Z"/><path d="M20 34h24M25 13h14"/>';
    else if (key.includes('material')) paths = '<path d="m32 7 9 15 16 3-11 12 3 17-17-7-17 7 3-17L7 25l16-3Z"/>';
    else if (key.includes('armor') || key.includes('gear') || inferSlot(category)) paths = '<path d="M16 13 25 8h14l9 5 8 14-9 5v22H17V32l-9-5Z"/><path d="M25 8v14h14V8"/>';
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}

function imageFrame(image, category = 'Misc', className = '') {
    const style = image?.image ? `style="--image:url('${image.image}');--x:${image.positionX ?? 50}%;--y:${image.positionY ?? 50}%;--zoom:${image.zoom ?? 1}"` : '';
    return `<span class="sl-image-frame ${className}${image?.image ? ' has-image' : ''}" ${style}>${image?.image ? '<i></i>' : categorySvg(category)}<b></b></span>`;
}

function pageItems(items, page) { const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE)); const safePage = Math.min(pages, Math.max(1, page)); return { items: items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), page: safePage, pages }; }
function pagination(page, pages, target) { if (pages <= 1) return ''; return `<nav class="sl-pagination"><button type="button" data-sl-page="${target}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button><span>PAGE <b>${page}</b> / ${pages}</span><button type="button" data-sl-page="${target}" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button></nav>`; }
function tabButton(tab, active) { return `<button class="sl-system-tab${active ? ' is-active' : ''}" type="button" role="tab" data-sl-tab="${tab.id}" aria-selected="${active}" aria-controls="sl-system-panel-${tab.id}"><i class="${tab.icon}"></i><span>${html(tab.label)}</span></button>`; }

function renderStatus() {
    const state = getState(); const player = state.player; const name = context().name1 || player.name;
    const stats = [['strength', 'STR', 'Strength', 'fa-hand-fist'], ['agility', 'AGI', 'Agility', 'fa-person-running'], ['vitality', 'VIT', 'Vitality', 'fa-heart-pulse'], ['intelligence', 'INT', 'Intelligence', 'fa-brain'], ['perception', 'PER', 'Perception', 'fa-eye']];
    return `<section class="sl-player-dossier"><button class="sl-profile-avatar" type="button" data-sl-action="edit-profile">${imageFrame(state.profile, 'Profile', 'is-profile')}<span><i class="fa-solid fa-camera"></i> EDIT</span></button><div class="sl-player-identity"><span class="sl-system-eyebrow">PLAYER IDENTIFICATION</span><h3>${html(name)}</h3><p>${html(player.title)} <i></i> ${html(player.job)}</p><div class="sl-identity-tags"><span>RANK ${html(player.rank)}</span><span>${html(player.condition)}</span><span>LV. ${player.level}</span></div></div><div class="sl-level-core"><small>LEVEL</small><strong>${player.level}</strong><span>${html(player.rank)}-RANK</span></div></section>
    <section class="sl-vitals-deck"><div class="sl-dual-vitals"><article><header><span><i class="fa-solid fa-heart-pulse"></i> HP</span><b>${player.hp}<small> / ${player.maxHp}</small></b></header><div class="sl-neon-meter hp"><i style="width:${percent(player.hp, player.maxHp)}%"></i></div></article><article><header><span><i class="fa-solid fa-droplet"></i> MP</span><b>${player.mp}<small> / ${player.maxMp}</small></b></header><div class="sl-neon-meter mp"><i style="width:${percent(player.mp, player.maxMp)}%"></i></div></article></div></section>
    <section class="sl-exp-deck"><header><span><i class="fa-solid fa-arrow-trend-up"></i> EXPERIENCE</span><b>${player.experience} / ${player.experienceRequired} EXP</b></header><div class="sl-exp-track"><i style="width:${percent(player.experience, player.experienceRequired)}%"></i><b style="left:${percent(player.experience, player.experienceRequired)}%"></b></div><small>${Math.max(0, player.experienceRequired - player.experience)} EXP until next level</small></section>
    <div class="sl-status-grid"><section class="sl-system-card sl-attributes-card"><header><div><span class="sl-system-eyebrow">ABILITY MATRIX</span><h4>Attributes</h4></div><div class="sl-stat-points"><span>AVAILABLE POINTS</span><b>${player.statPoints}</b></div></header><div class="sl-attribute-list">${stats.map(([key, short, label, icon]) => `<article><i class="fa-solid ${icon}"></i><span><b>${short}</b><small>${label}</small></span><strong>${player.stats[key]}</strong><button type="button" data-sl-upgrade="${key}" ${player.statPoints < 1 ? 'disabled' : ''}><i class="fa-solid fa-plus"></i></button></article>`).join('')}</div></section><section class="sl-system-card sl-record-card"><header><div><span class="sl-system-eyebrow">SYSTEM RECORD</span><h4>Current Data</h4></div></header><div class="sl-record-list"><article><i class="fa-solid fa-scroll"></i><span>Active Quests<small>Objectives under surveillance</small></span><b>${state.quests.filter(q => q.status.toLowerCase() === 'active').length}</b></article><article><i class="fa-solid fa-layer-group"></i><span>Acquired Skills<small>Registered abilities</small></span><b>${state.skills.length}</b></article><article><i class="fa-solid fa-box-open"></i><span>Stored Items<small>Total item types</small></span><b>${state.inventory.length}</b></article><article><i class="fa-solid fa-coins"></i><span>Gold Balance<small>System currency</small></span><b>${player.gold.toLocaleString()}</b></article></div></section></div>`;
}

function renderQuest() {
    const state = getState();
    if (!state.quests.length) return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">OBJECTIVE ARCHIVE</span><h3>Quest</h3></div><strong>0 ACTIVE</strong></section><section class="sl-empty-module"><i class="fa-solid fa-scroll"></i><h4>No quest detected</h4><p>The System will register objectives generated by the main chat.</p></section>`;
    return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">OBJECTIVE ARCHIVE</span><h3>Quest</h3></div><strong>${state.quests.filter(q => q.status.toLowerCase() === 'active').length} ACTIVE</strong></section><div class="sl-quest-list">${state.quests.map(quest => `<article class="sl-quest-card" data-status="${html(quest.status.toLowerCase())}"><div class="sl-quest-rank"><span>${html(quest.type)}</span><b>${html(quest.status)}</b></div><div><h4>${html(quest.title)}</h4><p>${html(quest.description)}</p><div class="sl-quest-progress"><i style="width:${percent(quest.progress, quest.goal)}%"></i></div><small>${quest.progress} / ${quest.goal} · Reward: ${html(quest.rewards)}</small></div></article>`).join('')}</div>`;
}

function renderInventory() {
    const state = getState(); const paged = pageItems(state.inventory, inventoryPage); inventoryPage = paged.page;
    if (!state.inventory.length) return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">DIMENSIONAL STORAGE</span><h3>Inventory</h3></div><strong>0 ITEMS</strong></section><section class="sl-empty-module"><i class="fa-solid fa-box-open"></i><h4>Inventory empty</h4><p>Items acquired in chat or purchased from the System Shop appear here.</p></section>`;
    return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">DIMENSIONAL STORAGE</span><h3>Inventory</h3></div><strong>${state.inventory.reduce((sum, item) => sum + item.quantity, 0)} ITEMS</strong></section><div class="sl-item-list">${paged.items.map(item => `<button type="button" class="sl-item-row" data-sl-item="${html(item.id)}">${imageFrame(item.icon, item.category)}<span class="sl-item-copy"><span>${html(item.rarity)} · ${html(item.category)}</span><strong>${html(item.name)}</strong><small>${html(item.description)}</small></span><span class="sl-item-quantity">×${item.quantity}</span><i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div>${pagination(paged.page, paged.pages, 'inventory')}`;
}

function renderEquipment() {
    const state = getState();
    return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">COMBAT LOADOUT</span><h3>Equipment</h3></div><strong>${Object.values(state.equipment).filter(Boolean).length} / ${EQUIPMENT_SLOTS.length}</strong></section><div class="sl-equipment-layout"><section class="sl-equipment-silhouette"><div class="sl-equipment-core"><i class="fa-solid fa-person-rays"></i><span>PLAYER</span></div>${EQUIPMENT_SLOTS.map(([slot, label, icon], index) => { const item = state.inventory.find(entry => entry.id === state.equipment[slot]); return `<button type="button" class="sl-equipment-slot slot-${index + 1}${item ? ' is-equipped' : ''}" ${item ? `data-sl-item="${html(item.id)}"` : ''}><span><i class="fa-solid ${icon}"></i></span><b>${html(label)}</b><small>${item ? html(item.name) : 'EMPTY'}</small></button>`; }).join('')}</section><section class="sl-system-card sl-equipment-summary"><header><div><span class="sl-system-eyebrow">EQUIPPED EFFECTS</span><h4>Loadout Summary</h4></div></header>${Object.entries(state.equipment).filter(([, id]) => id).map(([slot, id]) => { const item = state.inventory.find(entry => entry.id === id); return item ? `<article>${imageFrame(item.icon, item.category)}<span><b>${html(item.name)}</b><small>${html(slot)} · ${html(item.effects.description || item.description)}</small></span></article>` : ''; }).join('') || '<p class="sl-muted-copy">No equipment is currently registered.</p>'}</section></div>`;
}

function renderShop() {
    const state = getState(); const paged = pageItems(state.shop, shopPage); shopPage = paged.page;
    return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">AUTHORIZED EXCHANGE</span><h3>System Shop</h3></div><strong><i class="fa-solid fa-coins"></i> ${state.player.gold.toLocaleString()}</strong></section><section class="sl-shop-console"><form id="sl-shop-search"><label><i class="fa-solid fa-magnifying-glass"></i><input id="sl-shop-query" type="text" maxlength="160" placeholder="Search for an item to generate…"></label><button type="submit" ${shopGenerating ? 'disabled' : ''}>${shopGenerating ? '<i class="fa-solid fa-spinner fa-spin"></i>' : '<i class="fa-solid fa-wand-magic-sparkles"></i>'} SEARCH</button></form><button type="button" data-sl-action="refill-shop" ${shopGenerating ? 'disabled' : ''}><i class="fa-solid fa-rotate"></i> REFILL RANDOM ITEMS</button><small>Uses your active SillyTavern provider and model. No separate API key.</small></section>${state.shop.length ? `<div class="sl-shop-grid">${paged.items.map(item => `<article class="sl-shop-item">${imageFrame(item.icon, item.category)}<span class="sl-shop-rarity">${html(item.rarity)}</span><h4>${html(item.name)}</h4><p>${html(item.description)}</p><footer><b><i class="fa-solid fa-coins"></i> ${item.price.toLocaleString()}</b><button type="button" data-sl-buy="${html(item.id)}" ${state.player.gold < item.price ? 'disabled' : ''}>BUY</button></footer></article>`).join('')}</div>${pagination(paged.page, paged.pages, 'shop')}` : '<section class="sl-empty-module is-shop"><i class="fa-solid fa-cart-shopping"></i><h4>Shop inventory unavailable</h4><p>Refill the shop or search for a specific item.</p></section>'}`;
}

function renderActivePanel() { const panel = document.getElementById(`sl-system-panel-${activeTab}`); if (!panel) return; const renderers = { status: renderStatus, quest: renderQuest, inventory: renderInventory, equipment: renderEquipment, shop: renderShop }; panel.innerHTML = renderers[activeTab]?.() || ''; }
function renderAll() { renderActivePanel(); updatePendingBadge(); }

function activateTab(tabId) {
    if (!TABS.some(tab => tab.id === tabId)) return; activeTab = tabId;
    document.querySelectorAll('[data-sl-tab]').forEach(button => { const active = button.dataset.slTab === tabId; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
    document.querySelectorAll('[data-sl-panel]').forEach(panel => { const active = panel.dataset.slPanel === tabId; panel.hidden = !active; panel.classList.toggle('is-active', active); }); renderActivePanel();
}

function updatePendingBadge() { const badge = document.getElementById('sl-pending-actions'); const count = getState().pendingActions.length; if (badge) { badge.textContent = `${count} PENDING ACTION${count === 1 ? '' : 'S'}`; badge.dataset.active = String(count > 0); } }

function buildInterface() {
    const existing = document.getElementById('sl-system-overlay'); if (existing?.dataset.slUiVersion === UI_VERSION && existing.querySelector('#sl-system-panel')) return; existing?.remove();
    const overlay = document.createElement('div'); overlay.id = 'sl-system-overlay'; overlay.className = 'sl-system-overlay'; overlay.dataset.slUiVersion = UI_VERSION; overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<button class="sl-system-backdrop" type="button" aria-label="Close The System"></button><section id="sl-system-panel" class="sl-system-panel" role="dialog" aria-modal="true" aria-labelledby="sl-system-title" tabindex="-1">
      <div id="sl-system-notification" class="sl-system-phase sl-system-onboarding" hidden><div class="sl-onboarding-grid"><aside><span>QUEST</span><b>?</b><small>PLAYER AUTHORIZATION</small></aside><main><div class="sl-onboarding-alert"><i class="fa-solid fa-triangle-exclamation"></i><span>URGENT QUEST</span></div><p class="sl-system-eyebrow">SYSTEM ACCESS REQUEST</p><h2>Will you accept<br><em>The System?</em></h2><blockquote>“Your heart will stop in 0.02 seconds if you choose not to accept.”</blockquote><p>Authorization transforms this chat into an independent Player record. All progress remains bound to this chat.</p><div class="sl-system-choice-row"><button type="button" data-sl-action="accept"><b>ACCEPT</b><span>Become a Player</span></button><button type="button" data-sl-action="decline"><b>DECLINE</b><span>Return to chat</span></button></div></main></div></div>
      <div id="sl-system-acknowledgement" class="sl-system-phase sl-system-acknowledgement" hidden><div class="sl-ack-core"><i class="fa-solid fa-diamond"></i><span class="sl-system-eyebrow">AUTHORIZATION COMPLETE</span><h2>WELCOME, PLAYER.</h2><p>This chat is now connected to The System.</p><div><i></i></div></div></div>
      <div id="sl-system-main" class="sl-system-phase sl-system-main" hidden><header class="sl-system-main-header"><div class="sl-system-main-brand"><span class="sl-system-sys-mark"><i class="fa-solid fa-diamond"></i></span><div><span class="sl-system-eyebrow">PLAYER INTERFACE</span><h2 id="sl-system-title">THE SYSTEM</h2></div></div><span id="sl-pending-actions" class="sl-pending-actions">0 PENDING ACTIONS</span><div class="sl-system-main-state"><i></i> ONLINE</div><button class="sl-system-close" type="button" data-sl-action="close"><i class="fa-solid fa-xmark"></i></button></header><nav class="sl-system-nav" role="tablist">${TABS.map((tab, index) => tabButton(tab, index === 0)).join('')}</nav><main class="sl-system-content">${TABS.map((tab, index) => `<section id="sl-system-panel-${tab.id}" class="sl-system-tab-panel${index === 0 ? ' is-active' : ''}" data-sl-panel="${tab.id}" role="tabpanel" ${index ? 'hidden' : ''}></section>`).join('')}</main><footer class="sl-system-main-footer"><span><i class="fa-solid fa-link"></i> PER-CHAT RECORD</span><button type="button" data-sl-action="sync"><i class="fa-solid fa-rotate"></i> SYNC LATEST TURN</button><span>v${UI_VERSION}</span></footer></div>
      <div id="sl-item-modal" class="sl-submodal" hidden></div><div id="sl-image-editor" class="sl-submodal" hidden></div>
    </section>`;
    document.body.appendChild(overlay); overlay.querySelector('.sl-system-backdrop')?.addEventListener('click', closeInterface); overlay.querySelectorAll('[data-sl-tab]').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.slTab))); overlay.addEventListener('click', handleInterfaceClick); overlay.addEventListener('submit', handleInterfaceSubmit); overlay.addEventListener('input', handleInterfaceInput); applyAppearance(); renderAll();
}

function showPhase(phase) { const overlay = document.getElementById('sl-system-overlay'); if (!overlay) return; overlay.dataset.phase = phase; for (const id of ['notification', 'acknowledgement', 'main']) { const section = document.getElementById(`sl-system-${id}`); if (section) section.hidden = id !== phase; } if (phase === 'main') { activateTab(activeTab); renderAll(); } }

async function acceptSystem() {
    const currentContext = context(); if (!currentContext.getCurrentChatId?.()) return systemNotice('warning', 'Open a chat before accepting The System');
    const state = getState(); state.accepted = true; await persistState(state, 'system-accepted', { detect: false }); showPhase('acknowledgement'); systemNotice('system', 'PLAYER AUTHORIZED', 'Per-chat System record created'); clearTimeout(transitionTimer); transitionTimer = setTimeout(() => { if (document.getElementById('sl-system-overlay')?.classList.contains('is-open')) showPhase('main'); }, 1550);
}

function declineSystem() { const overlay = document.getElementById('sl-system-overlay'); if (!overlay) return; overlay.classList.add('is-declining'); clearTimeout(transitionTimer); transitionTimer = setTimeout(() => { overlay.classList.remove('is-declining'); closeInterface(); }, 420); }

function openInterface() {
    try { buildInterface(); const overlay = document.getElementById('sl-system-overlay'); const panel = document.getElementById('sl-system-panel'); if (!overlay || !panel) throw new Error('Interface panel unavailable.'); previousFocusedElement = document.activeElement; clearTimeout(transitionTimer); overlay.classList.add('is-open'); overlay.setAttribute('aria-hidden', 'false'); document.body.classList.add('sl-system-open'); const state = getState(); showPhase(state.accepted ? 'main' : 'notification'); requestAnimationFrame(() => panel.focus()); }
    catch (error) { console.error('[The System] Could not open.', error); systemNotice('error', 'The System could not open', error.message); }
}

function closeInterface() { const overlay = document.getElementById('sl-system-overlay'); if (!overlay?.classList.contains('is-open')) return; closeSubmodals(); clearTimeout(transitionTimer); overlay.classList.remove('is-open', 'is-declining'); overlay.setAttribute('aria-hidden', 'true'); document.body.classList.remove('sl-system-open'); if (previousFocusedElement instanceof HTMLElement) previousFocusedElement.focus({ preventScroll: true }); }

async function upgradeStat(stat) { const state = getState(); if (!Object.hasOwn(state.player.stats, stat) || state.player.statPoints < 1) return; state.player.stats[stat] += 1; state.player.statPoints -= 1; queueAction(state, 'upgrade-stat', `${stat} increased to ${state.player.stats[stat]}`, { stat, value: state.player.stats[stat] }); await persistState(state, 'ui-stat-upgrade'); }

async function equipItem(itemId) { const state = getState(); const item = state.inventory.find(entry => entry.id === itemId); if (!item) return; const slot = item.slot || inferSlot(item.category); if (!slot || !Object.hasOwn(state.equipment, slot)) return systemNotice('warning', 'This item cannot be equipped', item.category); state.equipment[slot] = item.id; queueAction(state, 'equip-item', `Equipped ${item.name} in ${slot}`, { itemId: item.id, slot }); await persistState(state, 'ui-equip'); closeSubmodals(); systemNotice('equipment', 'ITEM EQUIPPED', item.name); }
async function unequipSlot(slot) { const state = getState(); const item = state.inventory.find(entry => entry.id === state.equipment[slot]); if (!item) return; state.equipment[slot] = null; queueAction(state, 'unequip-item', `Unequipped ${item.name} from ${slot}`, { itemId: item.id, slot }); await persistState(state, 'ui-unequip'); systemNotice('equipment', 'ITEM UNEQUIPPED', item.name); }

async function useItem(itemId) {
    const state = getState(); const item = state.inventory.find(entry => entry.id === itemId); if (!item || item.quantity < 1) return; if (!item.usable) return systemNotice('warning', 'Item cannot be consumed', item.name);
    item.quantity -= 1; state.player.hp = Math.min(state.player.maxHp, Math.max(0, state.player.hp + item.effects.hp)); state.player.mp = Math.min(state.player.maxMp, Math.max(0, state.player.mp + item.effects.mp));
    if (item.quantity === 0) { state.inventory = state.inventory.filter(entry => entry.id !== item.id); for (const slot of Object.keys(state.equipment)) if (state.equipment[slot] === item.id) state.equipment[slot] = null; }
    queueAction(state, 'use-item', `Used ${item.name}`, { itemId: item.id, effects: item.effects }); await persistState(state, 'ui-use-item'); closeSubmodals(); systemNotice('item', 'ITEM USED', item.name);
}

async function buyItem(itemId) { const state = getState(); const item = state.shop.find(entry => entry.id === itemId); if (!item || state.player.gold < item.price) return; state.player.gold -= item.price; const existing = state.inventory.find(entry => entry.name.toLowerCase() === item.name.toLowerCase()); if (existing) existing.quantity += 1; else state.inventory.push({ ...clone(item), id: uid('item'), quantity: 1 }); queueAction(state, 'shop-purchase', `Purchased ${item.name} for ${item.price} gold`, { shopItemId: item.id, price: item.price }); await persistState(state, 'ui-shop-purchase'); systemNotice('item', 'PURCHASE COMPLETE', `${item.name} · ${item.price} gold`); }

function shopPrompt(query = '') { const request = query ? `Generate exactly one item matching this request: ${query}` : 'Generate 8 varied random items appropriate for the current story and player level.'; return `${request}\nReturn only JSON: {"items":[{"id":"unique-id","name":"...","category":"Weapon|Gear|Potion|Material|Consumable|Misc","rarity":"Common|Uncommon|Rare|Epic|Legendary","quantity":1,"description":"...","price":100,"slot":"weapon|head|chest|hands|legs|feet|accessory|","usable":false,"effects":{"hp":0,"mp":0,"description":"..."}}]}.\nPlayer/state context: ${JSON.stringify(stateForPrompt(getState()))}\nKeep it coherent with Solo Leveling-style progression and the active role-play. No Markdown.`; }

async function generateShop(query = '') {
    const currentContext = context(); if (shopGenerating) return; if (typeof currentContext.generateQuietPrompt !== 'function') return systemNotice('error', 'Shop generation unavailable', 'Active provider does not expose quiet generation');
    shopGenerating = true; renderActivePanel(); systemNotice('working', query ? 'SEARCHING SYSTEM SHOP…' : 'REFILLING SYSTEM SHOP…');
    try { const response = await currentContext.generateQuietPrompt({ quietPrompt: shopPrompt(query), skipWIAN: true, responseLength: query ? 700 : 2000, removeReasoning: true }); const parsed = parseJson(response); const generated = Array.isArray(parsed?.items) ? parsed.items.map(item => normalizeItem(item)).filter(Boolean) : []; if (!generated.length) throw new Error('The model returned no valid shop items.'); const state = getState(); state.shop = query ? [...generated, ...state.shop.filter(old => !generated.some(item => item.name.toLowerCase() === old.name.toLowerCase()))].slice(0, 100) : generated; await persistState(state, 'shop-generation', { detect: false }); shopPage = 1; systemNotice('shop', query ? 'ITEM LOCATED' : 'SHOP REFILLED', `${generated.length} item${generated.length === 1 ? '' : 's'} generated`); }
    catch (error) { console.error('[The System] Shop generation failed.', error); systemNotice('error', 'SHOP GENERATION FAILED', error.message); } finally { shopGenerating = false; renderActivePanel(); }
}

function showItemModal(itemId) {
    const state = getState(); const item = state.inventory.find(entry => entry.id === itemId) || state.shop.find(entry => entry.id === itemId); if (!item) return; selectedItemId = item.id; const modal = document.getElementById('sl-item-modal'); if (!modal) return;
    const equippedSlot = Object.keys(state.equipment).find(slot => state.equipment[slot] === item.id); const canEquip = Boolean(item.slot || inferSlot(item.category)); const owned = state.inventory.some(entry => entry.id === item.id);
    modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-modal"></button><article class="sl-item-sheet"><header><span>ITEM INFORMATION</span><button type="button" data-sl-action="close-modal"><i class="fa-solid fa-xmark"></i></button></header><div class="sl-item-sheet-hero">${imageFrame(item.icon, item.category, 'is-large')}<div><span>${html(item.rarity)} · ${html(item.category)}</span><h3>${html(item.name)}</h3><p>Quantity: ${item.quantity}</p></div></div><section><h4>DESCRIPTION</h4><p>${html(item.description)}</p></section><section><h4>EFFECT</h4><p>${html(item.effects.description || `${item.effects.hp ? `HP ${item.effects.hp > 0 ? '+' : ''}${item.effects.hp}` : ''}${item.effects.hp && item.effects.mp ? ' · ' : ''}${item.effects.mp ? `MP ${item.effects.mp > 0 ? '+' : ''}${item.effects.mp}` : ''}` || 'No registered effect.')}</p></section><footer>${owned ? `<button type="button" data-sl-action="edit-item-image"><i class="fa-solid fa-image"></i> IMAGE</button>${item.usable ? '<button type="button" data-sl-action="use-item">USE</button>' : ''}${equippedSlot ? `<button type="button" data-sl-unequip="${html(equippedSlot)}">UNEQUIP</button>` : canEquip ? '<button type="button" data-sl-action="equip-item">EQUIP</button>' : ''}` : `<button type="button" data-sl-buy="${html(item.id)}" ${state.player.gold < item.price ? 'disabled' : ''}>BUY · ${item.price}</button>`}</footer></article>`; modal.hidden = false;
}

function openImageEditor(target) {
    const state = getState(); let current; if (target === 'profile') current = state.profile; else { const item = state.inventory.find(entry => entry.id === target); if (!item) return; current = item.icon; }
    imageEditorTarget = target; imageEditorDraft = clone(current); const modal = document.getElementById('sl-image-editor'); if (!modal) return;
    modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-image-editor"></button><article class="sl-image-editor-card"><header><span>${target === 'profile' ? 'PROFILE IMAGE' : 'ITEM IMAGE'}</span><button type="button" data-sl-action="close-image-editor"><i class="fa-solid fa-xmark"></i></button></header><div id="sl-image-editor-preview" class="sl-image-editor-preview">${imageFrame(imageEditorDraft, 'Profile', 'is-editor')}</div><label class="sl-file-button"><input id="sl-image-file" type="file" accept="image/*"><i class="fa-solid fa-upload"></i> SELECT IMAGE</label><div class="sl-image-controls"><label><span>Horizontal <output id="sl-image-x-output">${imageEditorDraft.positionX}%</output></span><input id="sl-image-x" type="range" min="0" max="100" value="${imageEditorDraft.positionX}"></label><label><span>Vertical <output id="sl-image-y-output">${imageEditorDraft.positionY}%</output></span><input id="sl-image-y" type="range" min="0" max="100" value="${imageEditorDraft.positionY}"></label><label><span>Zoom <output id="sl-image-zoom-output">${imageEditorDraft.zoom.toFixed(2)}×</output></span><input id="sl-image-zoom" type="range" min="1" max="3" step="0.05" value="${imageEditorDraft.zoom}"></label></div><footer><button type="button" data-sl-action="remove-image">REMOVE</button><button type="button" data-sl-action="save-image">SAVE TO CHAT</button></footer></article>`; modal.hidden = false;
}

function refreshImageEditorPreview() { const preview = document.getElementById('sl-image-editor-preview'); if (!preview || !imageEditorDraft) return; preview.innerHTML = imageFrame(imageEditorDraft, 'Profile', 'is-editor'); [['sl-image-x-output', `${imageEditorDraft.positionX}%`], ['sl-image-y-output', `${imageEditorDraft.positionY}%`], ['sl-image-zoom-output', `${imageEditorDraft.zoom.toFixed(2)}×`]].forEach(([id, value]) => { const output = document.getElementById(id); if (output) output.textContent = value; }); }

async function saveImageEditor() { if (!imageEditorTarget || !imageEditorDraft) return; const state = getState(); if (imageEditorTarget === 'profile') state.profile = normalizeImage(imageEditorDraft); else { const item = state.inventory.find(entry => entry.id === imageEditorTarget); if (!item) return; item.icon = normalizeImage(imageEditorDraft); } await persistState(state, 'ui-image-update', { detect: false }); closeSubmodals(); systemNotice('system', 'IMAGE SAVED', 'Stored in this chat only'); }
function closeSubmodals() { document.querySelectorAll('.sl-submodal').forEach(modal => { modal.hidden = true; modal.innerHTML = ''; }); selectedItemId = ''; imageEditorTarget = null; imageEditorDraft = null; }

function handleInterfaceClick(event) {
    const action = event.target.closest('[data-sl-action]')?.dataset.slAction; const tab = event.target.closest('[data-sl-tab]')?.dataset.slTab; const item = event.target.closest('[data-sl-item]')?.dataset.slItem; const upgrade = event.target.closest('[data-sl-upgrade]')?.dataset.slUpgrade; const buy = event.target.closest('[data-sl-buy]')?.dataset.slBuy; const unequip = event.target.closest('[data-sl-unequip]')?.dataset.slUnequip; const pager = event.target.closest('[data-sl-page]');
    if (tab) activateTab(tab); else if (upgrade) upgradeStat(upgrade); else if (buy) buyItem(buy); else if (unequip) unequipSlot(unequip); else if (pager) { const page = number(pager.dataset.page, 1, 1); if (pager.dataset.slPage === 'inventory') inventoryPage = page; else shopPage = page; renderActivePanel(); } else if (item && !event.target.closest('[data-sl-buy]')) showItemModal(item); else if (action === 'accept') acceptSystem(); else if (action === 'decline') declineSystem(); else if (action === 'close') closeInterface(); else if (action === 'sync') syncLatestTurn(); else if (action === 'edit-profile') openImageEditor('profile'); else if (action === 'edit-item-image') openImageEditor(selectedItemId); else if (action === 'close-modal' || action === 'close-image-editor') closeSubmodals(); else if (action === 'save-image') saveImageEditor(); else if (action === 'remove-image') { if (imageEditorDraft) { imageEditorDraft.image = ''; refreshImageEditorPreview(); } } else if (action === 'equip-item') equipItem(selectedItemId); else if (action === 'use-item') useItem(selectedItemId); else if (action === 'refill-shop') generateShop();
}

function handleInterfaceSubmit(event) { if (event.target.id !== 'sl-shop-search') return; event.preventDefault(); const query = text(document.getElementById('sl-shop-query')?.value, '', 160); if (query) generateShop(query); }

function handleInterfaceInput(event) {
    if (!imageEditorDraft) return;
    if (event.target.id === 'sl-image-x') imageEditorDraft.positionX = number(event.target.value, 50, 0, 100); else if (event.target.id === 'sl-image-y') imageEditorDraft.positionY = number(event.target.value, 50, 0, 100); else if (event.target.id === 'sl-image-zoom') imageEditorDraft.zoom = number(event.target.value, 1, 1, 3); else if (event.target.id === 'sl-image-file' && event.target.files?.[0]) { const file = event.target.files[0]; if (!file.type.startsWith('image/')) return systemNotice('warning', 'Select an image file'); if (file.size > 3500000) return systemNotice('warning', 'Image is too large', 'Maximum 3.5 MB'); const reader = new FileReader(); reader.onload = () => { imageEditorDraft.image = String(reader.result); refreshImageEditorPreview(); }; reader.readAsDataURL(file); return; } else return; refreshImageEditorPreview();
}

function launchFromEvent(event) { if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); openInterface(); }
function syncLauncherVisibility() { const launcher = document.getElementById('sl-system-wand-launcher'); if (launcher) launcher.hidden = !getSettings().showWandLauncher; }
function createWandLauncher() { if (document.getElementById('sl-system-wand-launcher')) return true; const menu = document.getElementById('extensionsMenu'); if (!menu) return false; const launcher = document.createElement('div'); launcher.id = 'sl-system-wand-launcher'; launcher.className = 'list-group-item flex-container flexGap5 interactable'; launcher.tabIndex = 0; launcher.setAttribute('role', 'button'); launcher.title = `Open The System v${UI_VERSION}`; launcher.innerHTML = '<i class="fa-solid fa-diamond"></i><span>The System</span>'; launcher.addEventListener('click', launchFromEvent); launcher.addEventListener('keydown', launchFromEvent); menu.appendChild(launcher); syncLauncherVisibility(); return true; }
function observeWandMenu() { if (createWandLauncher() || menuObserver) return; menuObserver = new MutationObserver(() => { if (createWandLauncher()) { menuObserver.disconnect(); menuObserver = null; } }); menuObserver.observe(document.body, { childList: true, subtree: true }); }
function bindCheckbox(id, key, callback) { const control = document.getElementById(id); if (!(control instanceof HTMLInputElement)) return; control.checked = Boolean(getSettings()[key]); control.onchange = () => { getSettings()[key] = control.checked; saveSettings(); callback?.(); }; }
function bindSettingControl(id, key, callback) { const control = document.getElementById(id); if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return; control.value = String(getSettings()[key]); const update = () => { getSettings()[key] = control.type === 'range' ? Number(control.value) : control.value; saveSettings(); callback?.(); }; if (control.type === 'range' || control.type === 'color') control.oninput = update; else control.onchange = update; }

function bindSettingsDrawer() { bindCheckbox('sl-system-show-launcher', 'showWandLauncher', syncLauncherVisibility); bindCheckbox('sl-system-auto-track', 'autoTrack', updatePrompt); bindCheckbox('sl-system-inject-state', 'injectState', updatePrompt); bindSettingControl('sl-system-accent', 'accentColor', applyAppearance); bindSettingControl('sl-system-glass', 'glassOpacity', applyAppearance); bindSettingControl('sl-system-glow', 'glowStrength', applyAppearance); bindSettingControl('sl-system-notification-position', 'notificationPosition', applyAppearance); const version = document.getElementById('sl-system-current-version'); if (version) version.textContent = `v${UI_VERSION}`; const open = document.getElementById('sl-system-open-from-settings'); const sync = document.getElementById('sl-system-sync-from-settings'); if (open) open.onclick = openInterface; if (sync) sync.onclick = syncLatestTurn; applyAppearance(); }

async function addSettingsDrawer() { if (document.getElementById('sl-system-settings')) { bindSettingsDrawer(); return true; } const container = document.getElementById('extensions_settings2'); if (!container) return false; const rendered = await context().renderExtensionTemplateAsync?.(EXTENSION_FOLDER, 'settings'); if (!rendered) return false; container.insertAdjacentHTML('beforeend', rendered); bindSettingsDrawer(); return true; }
function observeSettingsDrawer() { if (settingsObserver) return; settingsObserver = new MutationObserver(async () => { try { if (await addSettingsDrawer()) { settingsObserver.disconnect(); settingsObserver = null; } } catch (error) { console.error('[The System] Settings drawer failed.', error); } }); settingsObserver.observe(document.body, { childList: true, subtree: true }); }

function bindChatEvents() {
    const currentContext = context(); if (!currentContext.eventSource?.on || !currentContext.eventTypes) return; const { eventSource, eventTypes } = currentContext;
    if (eventTypes.CHAT_CHANGED) eventSource.on(eventTypes.CHAT_CHANGED, () => { closeSubmodals(); activeTab = 'status'; updatePrompt(); renderAll(); if (document.getElementById('sl-system-overlay')?.classList.contains('is-open')) showPhase(getState().accepted ? 'main' : 'notification'); });
    if (eventTypes.MESSAGE_SENT) eventSource.on(eventTypes.MESSAGE_SENT, () => { updatePrompt(); renderAll(); if (getState().accepted) systemNotice('working', 'SYSTEM MONITORING', 'Waiting for the next reply…'); });
    if (eventTypes.MESSAGE_RECEIVED) eventSource.on(eventTypes.MESSAGE_RECEIVED, processAssistantPatch);
}

async function initialize() {
    if (initialized) return; initialized = true;
    try { getSettings(); applyAppearance(); buildIsland(); buildInterface(); if (!(await addSettingsDrawer())) observeSettingsDrawer(); observeWandMenu(); bindChatEvents(); updatePrompt(); document.addEventListener('keydown', event => { if (event.key === 'Escape') { if ([...document.querySelectorAll('.sl-submodal')].some(modal => !modal.hidden)) closeSubmodals(); else closeInterface(); } }); globalThis.TheSystemExtension = { version: UI_VERSION, open: openInterface, close: closeInterface, state: getState }; console.info(`[The System] Interface v${UI_VERSION} loaded.`); }
    catch (error) { initialized = false; console.error('[The System] Failed to initialize.', error); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else void initialize();
