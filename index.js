/* global SillyTavern */

const EXTENSION_FOLDER = 'third-party/sololeveling-extension';
const SETTINGS_KEY = 'the_system';
const METADATA_KEY = 'solo_leveling_system_state';
const PROMPT_KEY = 'solo_leveling_system_roleplay_state';
const UI_VERSION = '0.6.0';
const PAGE_SIZE = 8;
const PATCH_PATTERN = /<!--\s*solo_system_patch\s*:\s*([\s\S]*?)\s*-->/gi;

const DEFAULT_SETTINGS = Object.freeze({
    showWandLauncher: true,
    autoTrack: true,
    injectState: true,
    accentColor: '#35bfff',
    backgroundColor: '#030e1c',
    particleColor: '#6dd8ff',
    glassOpacity: 90,
    glowStrength: 58,
    notificationPosition: 'top-center',
});

const TABS = [
    { id: 'status', label: 'Status', icon: 'fa-solid fa-user' },
    { id: 'quest', label: 'Missions', icon: 'fa-solid fa-scroll' },
    { id: 'skills', label: 'Skills', icon: 'fa-solid fa-bolt' },
    { id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-box-open' },
    { id: 'equipment', label: 'Equipment', icon: 'fa-solid fa-shield-halved' },
    { id: 'shop', label: 'System Shop', icon: 'fa-solid fa-cart-shopping' },
    { id: 'scene', label: 'Scene', icon: 'fa-solid fa-location-crosshairs' },
];

const SKILL_ICON_PRESETS = [
    ['rune', 'Rune'], ['shadow', 'Shadow'], ['sword', 'Blade'], ['magic', 'Magic'],
    ['speed', 'Speed'], ['shield', 'Guard'], ['eye', 'Sense'], ['crown', 'Authority'],
];

const EQUIPMENT_SLOTS = [
    ['weapon', 'Weapon', 'fa-khanda'], ['head', 'Head', 'fa-helmet-safety'],
    ['chest', 'Chest', 'fa-shirt'], ['hands', 'Hands', 'fa-hand-fist'],
    ['legs', 'Legs', 'fa-person'], ['feet', 'Feet', 'fa-shoe-prints'],
    ['accessory', 'Accessory', 'fa-gem'],
];

const DEFAULT_STATE = Object.freeze({
    accepted: false,
    administratorMode: false,
    profile: { image: '', positionX: 50, positionY: 50, zoom: 1 },
    player: {
        name: 'System User', title: 'Unawakened Hunter', titles: [], job: 'None', level: 1, rank: 'E',
        experience: 0, experienceRequired: 100, hp: 100, maxHp: 100, mp: 50, maxMp: 50,
        fatigue: 0, condition: 'Stable', statPoints: 0,
        stats: { strength: 10, agility: 10, vitality: 10, intelligence: 10, perception: 10 },
    },
    currency: { name: 'System Credit', symbol: 'SC', amount: 1000 },
    scene: {
        date: 'Unknown', day: 'Unknown', dayCount: 1, year: 'Unknown', time: 'Unknown', period: 'Unknown',
        place: 'Unknown', location: 'Unknown', position: 'Unknown', temperature: 'Unknown', weather: 'Unknown', season: 'Unknown',
    },
    skills: [], shadowArmy: [], quests: [], inventory: [],
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
let selectedQuestId = '';
let selectedSkillId = '';
let selectedShadowId = '';
let imageEditorTarget = null;
let imageEditorDraft = null;
let shopGenerating = false;
let imageGesture = null;

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
    for (const key of ['accentColor', 'backgroundColor', 'particleColor']) if (!/^#[0-9a-f]{6}$/i.test(settings[key])) settings[key] = DEFAULT_SETTINGS[key];
    if (!['top-center', 'top-left', 'top-right', 'bottom-center'].includes(settings.notificationPosition)) settings.notificationPosition = DEFAULT_SETTINGS.notificationPosition;
    return settings;
}

function saveSettings() { context().saveSettingsDebounced?.(); }

function applyAppearance() {
    const settings = getSettings();
    const root = document.documentElement;
    root.style.setProperty('--sl-system-accent', settings.accentColor);
    root.style.setProperty('--sl-system-accent-rgb', hexToRgb(settings.accentColor));
    root.style.setProperty('--sl-system-background', settings.backgroundColor);
    root.style.setProperty('--sl-system-background-rgb', hexToRgb(settings.backgroundColor));
    root.style.setProperty('--sl-system-particle', settings.particleColor);
    root.style.setProperty('--sl-system-particle-rgb', hexToRgb(settings.particleColor));
    root.style.setProperty('--sl-system-glass', String(settings.glassOpacity / 100));
    root.style.setProperty('--sl-system-glow', String(settings.glowStrength / 100));
    root.style.setProperty('--sl-system-glow-size', `${Math.round(48 * settings.glowStrength / 100)}px`);
    root.style.setProperty('--sl-system-particle-opacity', String(.22 + (settings.glowStrength / 100) * .52));
    document.getElementById('sl-system-island')?.setAttribute('data-position', settings.notificationPosition);
}

function normalizeImage(source = {}) {
    return {
        image: typeof source.image === 'string' && source.image.startsWith('data:image/') ? source.image.slice(0, 4000000) : '',
        positionX: number(source.positionX, 50, 0, 100), positionY: number(source.positionY, 50, 0, 100), zoom: number(source.zoom, 1, 1, 3),
        preset: text(source.preset, 'rune', 30),
    };
}

function displayValue(value, fallback = 'None') {
    if (typeof value === 'string' || typeof value === 'number') return text(value, fallback, 1000);
    if (Array.isArray(value)) return value.map(entry => displayValue(entry, '')).filter(Boolean).join(', ') || fallback;
    if (value && typeof value === 'object') {
        return Object.entries(value).map(([key, entry]) => `${key}: ${displayValue(entry, '')}`).filter(line => !line.endsWith(': ')).join(' · ') || fallback;
    }
    return fallback;
}

function normalizeObjective(source = {}, index = 0) {
    if (typeof source === 'string') source = { label: source };
    if (!source || typeof source !== 'object') return null;
    const label = text(source.label || source.title || source.description || source.name, `Objective ${index + 1}`, 240);
    const goal = number(source.goal ?? source.target ?? source.required, 1, 1, 999999999);
    const current = number(source.current ?? source.progress ?? source.completedAmount, 0, 0, goal);
    return {
        id: text(source.id, `objective-${index + 1}`, 100), label, current, goal,
        unit: text(source.unit, '', 40), completed: Boolean(source.completed || current >= goal),
    };
}

function normalizeReward(source = {}, index = 0) {
    if (typeof source === 'string') source = { type: 'description', name: source };
    if (!source || typeof source !== 'object') return null;
    const type = text(source.type || source.category, source.item ? 'item' : 'description', 30).toLowerCase();
    const itemSource = source.item && typeof source.item === 'object' ? source.item : (type === 'item' ? source : null);
    const rawName = text(source.name || itemSource?.name || displayValue(source.description, 'Reward'), 'Reward', 120);
    return {
        id: text(source.id, `reward-${index + 1}`, 100), type,
        name: rawName.includes('[object Object]') ? 'Reward details pending sync' : rawName,
        amount: number(source.amount ?? source.quantity ?? source.value, 1, 0, 999999999),
        description: text(source.description || itemSource?.description, '', 500),
        item: itemSource ? normalizeItem(itemSource) : null,
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

function questRewardEntries(source) {
    if (Array.isArray(source)) return source;
    if (!source || typeof source !== 'object') return [source];
    return Object.entries(source).flatMap(([type, value]) => {
        if (Array.isArray(value)) return value.map(entry => (entry && typeof entry === 'object' ? { type: /^items?$/i.test(type) ? 'item' : type, ...( /^items?$/i.test(type) ? { name: entry.name, amount: entry.quantity || 1, item: entry } : entry) } : { type, name: type, amount: entry }));
        if (value && typeof value === 'object') return [{ type: /^items?$/i.test(type) ? 'item' : type, ...( /^items?$/i.test(type) ? { name: value.name, amount: value.quantity || 1, item: value } : value) }];
        return [{ type, name: type, amount: value }];
    });
}

function normalizeQuest(source = {}) {
    if (!source || typeof source !== 'object' || !text(source.title || source.name)) return null;
    const objectiveSource = Array.isArray(source.objectives) ? source.objectives : (source.objectives && typeof source.objectives === 'object' ? Object.entries(source.objectives).map(([id, value]) => (typeof value === 'object' ? { id, ...value } : { id, label: id, current: value })) : (typeof source.objectives === 'string' ? [source.objectives] : []));
    let objectives = objectiveSource.map(normalizeObjective).filter(Boolean);
    if (!objectives.length) objectives = [normalizeObjective({ label: source.description, current: source.progress, goal: source.goal }, 0)].filter(Boolean);
    const rewardSource = questRewardEntries(source.rewards);
    const rewards = rewardSource.map(normalizeReward).filter(Boolean);
    const completedObjectives = objectives.filter(objective => objective.completed).length;
    return {
        id: text(source.id, uid('quest'), 100), title: text(source.title || source.name, 'Unnamed Quest', 120),
        type: text(source.type, 'Normal', 40), status: text(source.status, 'Active', 40),
        description: text(source.description, objectives.map(objective => objective.label).join(' · ') || 'No objective details recorded.', 2000),
        objectives,
        progress: number(source.progress, completedObjectives, 0, 999999), goal: number(source.goal, objectives.length || 1, 1, 999999),
        rewards,
        rewardClaimed: Boolean(source.rewardClaimed),
        daily: Boolean(source.daily || String(source.type).toLowerCase().includes('daily')),
        deadline: text(source.deadline, 'Before the daily reset', 120),
        penalty: source.penalty && typeof source.penalty === 'object' ? {
            hp: number(source.penalty.hp, 0, 0, 999999), mp: number(source.penalty.mp, 0, 0, 999999),
            currency: number(source.penalty.currency, 0, 0, 999999999), experience: number(source.penalty.experience, 0, 0, 999999999),
            description: text(source.penalty.description, 'No penalty registered.', 300),
        } : { hp: 0, mp: 0, currency: 0, experience: 0, description: 'No penalty registered.' },
        penaltyApplied: Boolean(source.penaltyApplied),
    };
}

function normalizeScene(source = {}) {
    const defaults = DEFAULT_STATE.scene;
    return {
        date: text(source.date, defaults.date, 80), day: text(source.day, defaults.day, 80), dayCount: number(source.dayCount, defaults.dayCount, 0, 999999),
        year: text(source.year, defaults.year, 80), time: text(source.time, defaults.time, 80), period: text(source.period, defaults.period, 80),
        place: text(source.place, defaults.place, 120), location: text(source.location, defaults.location, 160), position: text(source.position, defaults.position, 160),
        temperature: text(source.temperature, defaults.temperature, 80), weather: text(source.weather, defaults.weather, 100), season: text(source.season, defaults.season, 100),
    };
}

function normalizeSkill(source = {}) {
    if (!source || typeof source !== 'object' || !text(source.name)) return null;
    const name = text(source.name, '', 100);
    const shadowExtraction = /shadow\s*extraction/i.test(name) || source.system === 'shadow-army';
    return {
        id: text(source.id, uid('skill'), 100), name, rank: text(source.rank, 'E', 20),
        type: text(source.type, 'Active', 30), description: text(source.description, 'No skill description recorded.', 1200),
        level: number(source.level, 1, 1, 999999), mastery: number(source.mastery, 0, 0, 999999999),
        masteryRequired: number(source.masteryRequired, 100, 1, 999999999),
        uses: number(source.uses, 0, 0, 999999), lastUsedAt: text(source.lastUsedAt, '', 80),
        activationRequired: Boolean(source.activationRequired || source.voiceActivation || shadowExtraction),
        activationWord: text(source.activationWord, '', 80), system: shadowExtraction ? 'shadow-army' : text(source.system, '', 60),
        icon: normalizeImage({ preset: shadowExtraction ? 'shadow' : 'rune', ...(source.icon || {}) }),
    };
}

function normalizeShadow(source = {}) {
    if (!source || typeof source !== 'object' || !text(source.name)) return null;
    const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
    return {
        id: text(source.id, uid('shadow'), 100), name: text(source.name, 'Unnamed Shadow', 120),
        rank: text(source.rank, 'E', 20), level: number(source.level, 1, 1, 999999),
        class: text(source.class || source.role, 'Soldier', 80), status: text(source.status, 'Stored', 40),
        description: text(source.description, 'No shadow record available.', 1200),
        stats: {
            strength: number(stats.strength, 10, 0, 999999), agility: number(stats.agility, 10, 0, 999999),
            vitality: number(stats.vitality, 10, 0, 999999), intelligence: number(stats.intelligence, 10, 0, 999999),
            perception: number(stats.perception ?? stats.sense, 10, 0, 999999),
        },
        abilities: Array.isArray(source.abilities) ? source.abilities.map(value => displayValue(value, '')).filter(Boolean).slice(0, 100) : [],
    };
}

function normalizeState(source = {}, fallback = DEFAULT_STATE) {
    const base = clone(fallback);
    base.accepted = Boolean(source.accepted);
    base.administratorMode = Boolean(source.administratorMode);
    base.profile = normalizeImage(source.profile);
    const player = source.player && typeof source.player === 'object' ? source.player : {};
    base.player = { ...base.player, ...player, stats: { ...base.player.stats, ...(player.stats && typeof player.stats === 'object' ? player.stats : {}) } };
    if (base.player.stats.sense !== undefined && base.player.stats.perception === DEFAULT_STATE.player.stats.perception) base.player.stats.perception = base.player.stats.sense;
    for (const key of ['level', 'experience', 'experienceRequired', 'hp', 'maxHp', 'mp', 'maxMp', 'fatigue', 'statPoints']) base.player[key] = number(base.player[key], DEFAULT_STATE.player[key], 0, 999999999);
    for (const key of ['rank', 'condition', 'name', 'title', 'job']) base.player[key] = text(base.player[key], DEFAULT_STATE.player[key], 100);
    base.player.titles = Array.isArray(player.titles) ? player.titles.map(value => text(value, '', 100)).filter(Boolean).slice(0, 100) : [];
    const legacyGold = number(player.gold, DEFAULT_STATE.currency.amount, 0, 999999999);
    const currency = source.currency && typeof source.currency === 'object' ? source.currency : {};
    base.currency = { name: text(currency.name, DEFAULT_STATE.currency.name, 50), symbol: text(currency.symbol, DEFAULT_STATE.currency.symbol, 12), amount: number(currency.amount, legacyGold, 0, 999999999) };
    delete base.player.gold;
    base.scene = normalizeScene(source.scene);
    for (const stat of Object.keys(DEFAULT_STATE.player.stats)) base.player.stats[stat] = number(base.player.stats[stat], 10, 0, 999999);
    base.skills = Array.isArray(source.skills) ? source.skills.map(normalizeSkill).filter(Boolean).slice(0, 300) : [];
    base.shadowArmy = Array.isArray(source.shadowArmy) ? source.shadowArmy.map(normalizeShadow).filter(Boolean).slice(0, 1000) : [];
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

function settleQuestPenalties(state) {
    for (const quest of state.quests) {
        const failed = ['failed', 'expired'].includes(String(quest.status).toLowerCase());
        if (!quest.daily || !failed || quest.penaltyApplied) continue;
        state.player.hp = Math.max(0, state.player.hp - quest.penalty.hp);
        state.player.mp = Math.max(0, state.player.mp - quest.penalty.mp);
        state.player.experience = Math.max(0, state.player.experience - quest.penalty.experience);
        state.currency.amount = Math.max(0, state.currency.amount - quest.penalty.currency);
        quest.penaltyApplied = true;
    }
    return state;
}

async function persistState(nextState, source = 'ui-action', options = {}) {
    const currentContext = context();
    if (!currentContext.getCurrentChatId?.()) { systemNotice('warning', 'Open a chat before changing The System.'); return false; }
    const previous = getState();
    const next = settleQuestPenalties(normalizeState(nextState, previous));
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
        player: state.player, skills: state.skills.map(({ icon, ...skill }) => skill), shadowArmy: state.shadowArmy, quests: state.quests,
        inventory: state.inventory.map(({ icon, ...item }) => item), equipment: state.equipment,
        shop: state.shop.map(({ icon, ...item }) => item), currency: state.currency, scene: state.scene, pendingActions: state.pendingActions,
    };
}

function patchInstructions() {
    return [
        'After the normal role-play reply, append one invisible HTML comment when any System state changed:',
        '<!--solo_system_patch:{"ops":[["inc","player.experience",5],["upsert","quests",{"id":"daily-training","title":"Daily Training","status":"Active","objectives":[{"id":"pushups","label":"Push-ups","current":20,"goal":100,"unit":"reps"}],"rewards":[{"id":"exp","type":"experience","name":"Experience","amount":100}]}],["upsert","skills",{"id":"shadow-extraction","name":"Shadow Extraction","rank":"S","type":"Active","level":1,"mastery":10,"masteryRequired":100,"activationRequired":true}]],"summary":"Training recorded."}-->',
        'Allowed operations: set, inc, upsert, delete. Arrays are addressed by their canonical path and entries by id.',
        'Track confirmed level, experience, HP, MP, stats, statPoints, currency, titles, skills, quests, inventory, equipment, shop, shadowArmy, and every scene field.',
        'A quest must contain objectives as an array of {id,label,current,goal,unit,completed}. Keep every objective and update its current value independently (for example push-ups 20/100, sit-ups 40/100, running 3/10 km). Never replace objective details with only one total progress number.',
        'Quest rewards must be an array of {id,type,name,amount,description,item?}. Supported types are item, currency, experience, statPoints, hp, and mp. For item rewards, include a complete item object. When every objective is complete, set status:"Completed" but leave rewardClaimed:false and do not add rewards to the player; the user claims them in the UI.',
        'Daily quests use daily:true, a deadline string, and penalty {hp,mp,currency,experience,description}. Mark status Failed or Expired only when the story confirms the deadline was missed; the extension applies that penalty once.',
        'When the user asks to view, search, open, or refill the System Shop in main chat, populate shop with coherent items using complete item objects and prices. Do not merely describe a shop without updating shop state.',
        'Skills use {id,name,rank,type,description,level,mastery,masteryRequired,uses,lastUsedAt,activationRequired}. Increase mastery when a skill is successfully used and raise its level when mastery reaches the required amount.',
        'Voice-activated skills must not activate unless the user says that skill\'s saved activationWord. If activationRequired is true and no activationWord is saved, do not activate the skill; direct the user to set it in the Skills tab.',
        'Shadow Extraction uses system:"shadow-army". When extraction succeeds, upsert shadowArmy with {id,name,rank,level,class,status,description,stats:{strength,agility,vitality,intelligence,perception},abilities:[]}. Update individual shadows as they level or change.',
        'Update scene.date, scene.day, scene.dayCount, scene.year, scene.time, scene.period, scene.place, scene.location, scene.position, scene.temperature, scene.weather, and scene.season whenever the story confirms a change. scene.position must say where the user is physically standing plus a nearby reference, such as "Standing beside the dungeon gate, near the eastern guard post." Leave unknown or unchanged values alone.',
        'UI pendingActions were already applied to canonical state. Acknowledge their consequences naturally in the next reply and do not charge, consume, equip, or add their values twice.',
        'Award statPoints on level-up when appropriate. Never silently spend them. Award or deduct currency through currency.amount. For skill use, upsert that skill with its uses counter increased and lastUsedAt updated. Record item use, consumption, damage, healing, mana changes, title gains, quest progress, and equipment changes.',
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
function parseModelJson(value) {
    if (value && typeof value === 'object') return value;
    const raw = String(value || '').trim();
    const direct = parseJson(raw); if (direct) return direct;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fenced) { const parsed = parseJson(fenced[1]); if (parsed) return parsed; }
    const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
    return start >= 0 && end > start ? parseJson(raw.slice(start, end + 1)) : null;
}

async function generateQuiet(prompt, responseLength = 1200, validator = value => Boolean(parseModelJson(value))) {
    const generator = context().generateQuietPrompt;
    if (typeof generator !== 'function') throw new Error('Active provider does not expose quiet generation.');
    const calls = generator.length > 1
        ? [() => generator(prompt, false, true, null, { responseLength, removeReasoning: true }), () => generator({ quietPrompt: prompt, skipWIAN: true, responseLength, removeReasoning: true })]
        : [() => generator({ quietPrompt: prompt, skipWIAN: true, responseLength, removeReasoning: true }), () => generator(prompt, false, true, null, { responseLength, removeReasoning: true })];
    let firstError; let invalidResponse = '';
    for (const call of calls) {
        try {
            const result = await call(); const response = typeof result === 'string' ? result : result?.response;
            if (typeof response === 'string' && response.trim()) {
                if (!validator || validator(response)) return response;
                invalidResponse = response;
            }
        } catch (error) { firstError ||= error; }
    }
    if (invalidResponse) throw new Error('The active model did not return valid System JSON.');
    throw firstError || new Error('The active model returned an empty response.');
}
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
        const response = await generateQuiet(analyzerPrompt(getState(), transcript), 1600);
        const result = applyPatch(getState(), parseModelJson(response));
        if (result.accepted) await persistState(result.next, 'manual-ai-sync'); else systemNotice('sync', 'System synchronized', 'No confirmed state change');
    } catch (error) { console.error('[The System] Sync failed.', error); systemNotice('error', 'System sync failed', error.message); }
}

function buildIsland() {
    if (document.getElementById('sl-system-island')) return;
    const island = document.createElement('button'); island.id = 'sl-system-island'; island.className = 'sl-system-island'; island.type = 'button'; island.dataset.position = getSettings().notificationPosition;
    island.innerHTML = '<span class="sl-island-sigil"><i class="fa-solid fa-diamond"></i></span><span class="sl-island-copy"><strong>THE SYSTEM</strong><small>Interface initialized</small></span><span class="sl-island-progress"></span>';
    island.addEventListener('click', () => {
        openInterface();
        const tab = island.dataset.targetTab;
        if (tab) activateTab(tab);
        if (island.dataset.targetQuest) showQuestModal(island.dataset.targetQuest);
        if (island.dataset.targetSkill) showSkillModal(island.dataset.targetSkill);
    }); document.body.appendChild(island);
}

function systemNotice(mode, title, detail = '', destination = {}) {
    islandQueue.push({ mode, title: text(title, 'System update', 120), detail: text(detail, '', 180), destination });
    playNextNotice();
}

function playNextNotice() {
    if (islandBusy || !islandQueue.length) return;
    buildIsland(); const island = document.getElementById('sl-system-island'); if (!island) return;
    islandBusy = true; const item = islandQueue.shift(); island.dataset.mode = item.mode;
    island.dataset.targetTab = item.destination?.tab || '';
    island.dataset.targetQuest = item.destination?.questId || '';
    island.dataset.targetSkill = item.destination?.skillId || '';
    island.querySelector('strong').textContent = item.title; island.querySelector('small').textContent = item.detail || 'The System has been updated'; island.classList.add('is-visible');
    clearTimeout(islandTimer); islandTimer = setTimeout(() => { islandBusy = false; playNextNotice(); }, item.mode === 'working' ? 1200 : 2600);
}

function announceChanges(before, after, source) {
    const notices = [];
    if (after.player.level > before.player.level) notices.push(['level', `LEVEL UP — ${after.player.level}`, `Stat points available: ${after.player.statPoints}`]);
    if (after.player.hp !== before.player.hp) notices.push([after.player.hp < before.player.hp ? 'danger' : 'heal', `HP ${after.player.hp < before.player.hp ? 'DECREASED' : 'RECOVERED'}`, `${before.player.hp} → ${after.player.hp}`]);
    if (after.player.mp !== before.player.mp) notices.push([after.player.mp < before.player.mp ? 'mana' : 'heal', `MP ${after.player.mp < before.player.mp ? 'CONSUMED' : 'RECOVERED'}`, `${before.player.mp} → ${after.player.mp}`]);
    if (after.player.statPoints > before.player.statPoints) notices.push(['reward', 'STAT POINTS EARNED', `+${after.player.statPoints - before.player.statPoints}`]);
    after.player.titles.filter(value => !before.player.titles.includes(value)).forEach(value => notices.push(['title', 'TITLE ACQUIRED', value]));
    after.skills.filter(item => !before.skills.some(old => old.id === item.id)).forEach(item => {
        notices.push(['skill', 'SKILL ACQUIRED', `${item.name} · Rank ${item.rank}`, { tab: 'skills', skillId: item.id }]);
        if (item.activationRequired && !item.activationWord) notices.push(['warning', 'ACTIVATION WORD REQUIRED', `Tap to configure ${item.name}`, { tab: 'skills', skillId: item.id }]);
    });
    after.skills.forEach(item => { const old = before.skills.find(entry => entry.id === item.id); if (old && item.uses > old.uses) notices.push(['skill', 'SKILL ACTIVATED', `${item.name} · Mastery ${item.mastery}/${item.masteryRequired}`, { tab: 'skills', skillId: item.id }]); });
    after.inventory.forEach(item => { const old = before.inventory.find(entry => entry.id === item.id); if (!old) notices.push(['item', 'ITEM ACQUIRED', `${item.name} ×${item.quantity}`]); else if (item.quantity < old.quantity) notices.push(['item', 'ITEM CONSUMED', `${item.name} ×${old.quantity - item.quantity}`]); });
    Object.keys(after.player.stats).forEach(stat => { if (after.player.stats[stat] > before.player.stats[stat]) notices.push(['stat', `${stat.toUpperCase()} INCREASED`, `${before.player.stats[stat]} → ${after.player.stats[stat]}`]); });
    if (after.currency.amount !== before.currency.amount) notices.push([after.currency.amount > before.currency.amount ? 'reward' : 'shop', `SYSTEM CREDIT ${after.currency.amount > before.currency.amount ? 'ACQUIRED' : 'SPENT'}`, `${before.currency.amount.toLocaleString()} → ${after.currency.amount.toLocaleString()} ${after.currency.symbol}`]);
    after.quests.forEach(quest => {
        const old = before.quests.find(entry => entry.id === quest.id);
        if (quest.penaltyApplied && !old?.penaltyApplied) notices.push(['danger', 'DAILY QUEST PENALTY', `${quest.title} · ${quest.penalty.description}`, { tab: 'quest', questId: quest.id }]);
        if (String(quest.status).toLowerCase() === 'completed' && String(old?.status).toLowerCase() !== 'completed') notices.push(['reward', 'MISSION COMPLETE — REWARD READY', `Tap to claim: ${quest.title}`, { tab: 'quest', questId: quest.id }]);
        else if (old && JSON.stringify(quest.objectives) !== JSON.stringify(old.objectives)) notices.push(['quest', 'MISSION PROGRESS UPDATED', quest.title, { tab: 'quest', questId: quest.id }]);
    });
    after.shadowArmy.filter(shadow => !before.shadowArmy.some(old => old.id === shadow.id)).forEach(shadow => notices.push(['skill', 'SHADOW EXTRACTED', `${shadow.name} · ${shadow.rank}-Rank ${shadow.class}`, { tab: 'skills' }]));
    if (JSON.stringify(after.scene) !== JSON.stringify(before.scene)) notices.push(['scene', 'SCENE UPDATED', `${after.scene.place} · ${after.scene.time}`]);
    if (!notices.length && source === 'assistant-patch') notices.push(['sync', 'SYSTEM UPDATED', 'State synchronized with the latest reply']);
    notices.slice(0, 6).forEach(item => systemNotice(...item));
}

function categorySvg(category, preset = '') {
    const key = String(preset || category).toLowerCase(); let paths = '<path d="M32 9 46 23 32 55 18 23Z"/><path d="M18 23h28"/>';
    if (key.includes('shadow')) paths = '<path d="M13 48c7-16 9-29 19-38 10 9 12 22 19 38-8-5-13-6-19 5-6-11-11-10-19-5Z"/><path d="m24 33 8 7 8-7"/>';
    else if (key.includes('sword') || key.includes('blade')) paths = '<path d="m15 49 34-34 4-7-7 4-34 34Z"/><path d="m10 54 9-9M16 50l-5-5"/>';
    else if (key.includes('magic')) paths = '<circle cx="32" cy="32" r="19"/><path d="m32 9 6 17 17 6-17 6-6 17-6-17-17-6 17-6Z"/>';
    else if (key.includes('speed')) paths = '<path d="M8 35h17L18 53l38-29H38l8-15Z"/><path d="M8 25h13M12 17h15"/>';
    else if (key.includes('shield') || key.includes('guard')) paths = '<path d="M32 7 51 14v15c0 13-8 22-19 28-11-6-19-15-19-28V14Z"/><path d="M32 16v31M20 28h24"/>';
    else if (key.includes('eye') || key.includes('sense')) paths = '<path d="M7 32s9-16 25-16 25 16 25 16-9 16-25 16S7 32 7 32Z"/><circle cx="32" cy="32" r="7"/>';
    else if (key.includes('crown') || key.includes('authority')) paths = '<path d="m10 20 12 9 10-17 10 17 12-9-5 28H15Z"/><path d="M16 48h32"/>';
    if (key.includes('weapon')) paths = '<path d="m15 49 34-34 4-7-7 4-34 34Z"/><path d="m10 54 9-9M16 50l-5-5"/>';
    else if (key.includes('potion') || key.includes('consum')) paths = '<path d="M25 8h14v9l7 9v25H18V26l7-9Z"/><path d="M20 34h24M25 13h14"/>';
    else if (key.includes('material')) paths = '<path d="m32 7 9 15 16 3-11 12 3 17-17-7-17 7 3-17L7 25l16-3Z"/>';
    else if (key.includes('armor') || key.includes('gear') || inferSlot(category)) paths = '<path d="M16 13 25 8h14l9 5 8 14-9 5v22H17V32l-9-5Z"/><path d="M25 8v14h14V8"/>';
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}

function imageFrame(image, category = 'Misc', className = '') {
    const style = image?.image ? `style="--image:url('${image.image}');--x:${image.positionX ?? 50}%;--y:${image.positionY ?? 50}%;--zoom:${image.zoom ?? 1}"` : '';
    return `<span class="sl-image-frame ${className}${image?.image ? ' has-image' : ''}" ${style}>${image?.image ? '<i></i>' : categorySvg(category, image?.preset)}<b></b></span>`;
}

function pageItems(items, page) { const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE)); const safePage = Math.min(pages, Math.max(1, page)); return { items: items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), page: safePage, pages }; }
function pagination(page, pages, target) { if (pages <= 1) return ''; return `<nav class="sl-pagination"><button type="button" data-sl-page="${target}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button><span>PAGE <b>${page}</b> / ${pages}</span><button type="button" data-sl-page="${target}" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button></nav>`; }
function tabButton(tab, active) { return `<button class="sl-system-tab${active ? ' is-active' : ''}" type="button" role="tab" data-sl-tab="${tab.id}" aria-selected="${active}" aria-controls="sl-system-panel-${tab.id}"><i class="${tab.icon}"></i><span>${html(tab.label)}</span></button>`; }

function renderScene(scene) {
    const entries = [
        ['fa-calendar-days', 'DATE', scene.date], ['fa-hashtag', 'DAY', `${scene.day} · ${scene.dayCount}`], ['fa-hourglass-half', 'YEAR', scene.year],
        ['fa-clock', 'TIME', `${scene.time} · ${scene.period}`], ['fa-landmark', 'PLACE', scene.place], ['fa-location-dot', 'LOCATION', scene.location],
        ['fa-crosshairs', 'POSITION', scene.position], ['fa-temperature-half', 'TEMPERATURE', scene.temperature], ['fa-cloud-sun', 'WEATHER', scene.weather], ['fa-leaf', 'SEASON', scene.season],
    ];
    return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">LIVE WORLD READING</span><h3>Scene Tracker</h3></div><strong class="sl-scene-live"><i></i> TRACKING</strong></section><section class="sl-position-beacon"><i class="fa-solid fa-location-crosshairs"></i><div><span>CURRENT POSITION</span><h4>${html(scene.position)}</h4><p>${html(scene.place)} · ${html(scene.location)}</p></div></section><section class="sl-scene-card"><header><div><span class="sl-system-eyebrow">ENVIRONMENTAL RECORD</span><h4>Current Scene</h4></div></header><div class="sl-scene-grid">${entries.filter(([, label]) => label !== 'POSITION').map(([icon, label, value]) => `<article><i class="fa-solid ${icon}"></i><span>${label}</span><b>${html(value)}</b></article>`).join('')}</div></section>`;
}

function renderStatus() {
    const state = getState(); const player = state.player; const name = player.name || context().name1 || 'System User';
    const stats = [['strength', 'STR', 'Strength', 'fa-hand-fist'], ['agility', 'AGI', 'Agility', 'fa-person-running'], ['vitality', 'VIT', 'Vitality', 'fa-heart-pulse'], ['intelligence', 'INT', 'Intelligence', 'fa-brain'], ['perception', 'PER', 'Perception', 'fa-eye']];
    return `<section class="sl-player-dossier"><button class="sl-profile-avatar" type="button" data-sl-action="edit-profile">${imageFrame(state.profile, 'Profile', 'is-profile')}<span><i class="fa-solid fa-camera"></i> EDIT</span></button><div class="sl-player-identity"><span class="sl-system-eyebrow">PLAYER IDENTIFICATION</span><h3>${html(name)}</h3><p>${html(player.title)} <i></i> ${html(player.job)}</p><div class="sl-identity-tags"><span>RANK ${html(player.rank)}</span><span>${html(player.condition)}</span><span>LV. ${player.level}</span></div></div><div class="sl-level-core"><small>LEVEL</small><strong>${player.level}</strong><span>${html(player.rank)}-RANK</span></div></section>
    <section class="sl-vitals-deck"><div class="sl-dual-vitals"><article><header><span><i class="fa-solid fa-heart-pulse"></i> HP</span><b>${player.hp}<small> / ${player.maxHp}</small></b></header><div class="sl-neon-meter hp"><i style="width:${percent(player.hp, player.maxHp)}%"></i></div></article><article><header><span><i class="fa-solid fa-droplet"></i> MP</span><b>${player.mp}<small> / ${player.maxMp}</small></b></header><div class="sl-neon-meter mp"><i style="width:${percent(player.mp, player.maxMp)}%"></i></div></article></div></section>
    <section class="sl-exp-deck"><header><span><i class="fa-solid fa-arrow-trend-up"></i> EXPERIENCE</span><b>${player.experience} / ${player.experienceRequired} EXP</b></header><div class="sl-exp-track"><i style="width:${percent(player.experience, player.experienceRequired)}%"></i><b style="left:${percent(player.experience, player.experienceRequired)}%"></b></div><small>${Math.max(0, player.experienceRequired - player.experience)} EXP until next level</small></section>
    <div class="sl-status-grid"><section class="sl-system-card sl-attributes-card"><header><div><span class="sl-system-eyebrow">ABILITY MATRIX</span><h4>Attributes</h4></div><div class="sl-stat-points"><span>AVAILABLE POINTS</span><b>${player.statPoints}</b></div></header><div class="sl-attribute-list">${stats.map(([key, short, label, icon]) => `<article><i class="fa-solid ${icon}"></i><span><b>${short}</b><small>${label}</small></span><strong>${player.stats[key]}</strong><button type="button" data-sl-upgrade="${key}" ${player.statPoints < 1 ? 'disabled' : ''}><i class="fa-solid fa-plus"></i></button></article>`).join('')}</div></section><section class="sl-system-card sl-record-card"><header><div><span class="sl-system-eyebrow">SYSTEM RECORD</span><h4>Current Data</h4></div></header><div class="sl-record-list"><article><i class="fa-solid fa-scroll"></i><span>Active Missions<small>Objectives under surveillance</small></span><b>${state.quests.filter(q => q.status.toLowerCase() === 'active').length}</b></article><article><i class="fa-solid fa-layer-group"></i><span>Acquired Skills<small>Registered abilities</small></span><b>${state.skills.length}</b></article><article><i class="fa-solid fa-box-open"></i><span>Stored Items<small>Total item types</small></span><b>${state.inventory.length}</b></article><article><i class="fa-solid fa-coins"></i><span>${html(state.currency.name)}<small>System Shop currency</small></span><b>${state.currency.amount.toLocaleString()} ${html(state.currency.symbol)}</b></article></div></section></div>`;
}

function questProgress(quest) {
    if (!quest.objectives.length) return percent(quest.progress, quest.goal);
    const current = quest.objectives.reduce((sum, objective) => sum + Math.min(objective.current, objective.goal), 0);
    const goal = quest.objectives.reduce((sum, objective) => sum + objective.goal, 0);
    return percent(current, goal);
}

function rewardSummary(quest) { return quest.rewards.map(reward => `${reward.name}${reward.amount > 1 ? ` ×${reward.amount}` : ''}`).join(' · ') || 'Reward pending'; }

function renderQuest() {
    const state = getState(); const daily = state.quests.filter(quest => quest.daily); const standard = state.quests.filter(quest => !quest.daily);
    const card = quest => {
        const completed = quest.objectives.filter(objective => objective.completed).length;
        const claimable = quest.status.toLowerCase() === 'completed' && !quest.rewardClaimed;
        return `<button type="button" class="sl-quest-card${quest.daily ? ' is-daily' : ''}${claimable ? ' is-claimable' : ''}" data-sl-quest="${html(quest.id)}" data-status="${html(quest.status.toLowerCase())}"><span class="sl-quest-rank"><span>${quest.daily ? 'DAILY MISSION' : html(quest.type)}</span><b>${html(quest.status)}</b></span><span class="sl-quest-card-copy"><span class="sl-quest-card-top"><span><b>${html(quest.title)}</b><small>${completed} / ${quest.objectives.length} OBJECTIVES</small></span><i class="fa-solid fa-chevron-right"></i></span><span class="sl-quest-progress"><i style="width:${questProgress(quest)}%"></i></span><small>${questProgress(quest)}% · ${html(rewardSummary(quest))}</small>${claimable ? '<strong class="sl-claim-signal"><i class="fa-solid fa-gift"></i> TAP TO CLAIM REWARD</strong>' : ''}</span></button>`;
    };
    return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">OBJECTIVE ARCHIVE</span><h3>Missions</h3></div><strong>${state.quests.filter(q => q.status.toLowerCase() === 'active').length} ACTIVE</strong></section><section class="sl-daily-header"><div><i class="fa-solid fa-clock"></i><span><b>DAILY MISSION PROTOCOL</b><small>Tap a mission to view every objective, reward, deadline, and penalty.</small></span></div><strong>${daily.length} REGISTERED</strong></section>${daily.length ? `<div class="sl-quest-list">${daily.map(card).join('')}</div>` : '<section class="sl-empty-daily"><i class="fa-solid fa-calendar-check"></i><span><b>No daily mission assigned</b><small>The AI can assign detailed training or survival objectives from the main chat.</small></span></section>'}${standard.length ? `<h4 class="sl-section-label">STORY & SIDE MISSIONS</h4><div class="sl-quest-list">${standard.map(card).join('')}</div>` : (!daily.length ? '<section class="sl-empty-module"><i class="fa-solid fa-scroll"></i><h4>No mission detected</h4><p>The System will register detailed objectives generated by the main chat.</p></section>' : '')}`;
}

function renderSkills() {
    const state = getState(); const hasShadowExtraction = state.skills.some(skill => skill.system === 'shadow-army'); const pendingActivation = state.skills.filter(skill => skill.activationRequired && !skill.activationWord);
    const skills = state.skills.length ? `<div class="sl-skill-grid">${state.skills.map(skill => `<article class="sl-skill-card"><button type="button" class="sl-skill-icon-button" data-sl-skill-image="${html(skill.id)}" title="Edit ${html(skill.name)} icon">${imageFrame(skill.icon, 'Skill', 'is-skill')}<span><i class="fa-solid fa-camera"></i></span></button><button type="button" class="sl-skill-copy" data-sl-skill="${html(skill.id)}"><span>${html(skill.type)} · ${html(skill.rank)}-RANK</span><h4>${html(skill.name)}</h4><p>${html(skill.description)}</p><div class="sl-mastery-line"><span><i style="width:${percent(skill.mastery, skill.masteryRequired)}%"></i></span><small>LV. ${skill.level} · MASTERY ${skill.mastery}/${skill.masteryRequired}</small></div>${skill.activationRequired ? `<strong class="sl-activation-state ${skill.activationWord ? 'is-set' : ''}"><i class="fa-solid fa-microphone-lines"></i> ${skill.activationWord ? `“${html(skill.activationWord)}”` : 'SET ACTIVATION WORD'}</strong>` : ''}</button></article>`).join('')}</div>` : '<section class="sl-empty-module"><i class="fa-solid fa-bolt"></i><h4>No skills acquired</h4><p>Skills learned in the story will be registered here.</p></section>';
    const shadows = hasShadowExtraction ? `<section class="sl-shadow-vault"><header><div><span class="sl-system-eyebrow">SHADOW EXTRACTION AUTHORITY</span><h4>Shadow Army Storage</h4></div><strong>${state.shadowArmy.length} SHADOWS</strong></header>${state.shadowArmy.length ? `<div class="sl-shadow-list">${state.shadowArmy.map(shadow => `<button type="button" data-sl-shadow="${html(shadow.id)}"><i class="fa-solid fa-user-ninja"></i><span><b>${html(shadow.name)}</b><small>${html(shadow.rank)}-RANK · LV. ${shadow.level} · ${html(shadow.class)}</small></span><em>${html(shadow.status)}</em><i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div>` : '<p class="sl-muted-copy">No extracted shadows are currently stored.</p>'}</section>` : '';
    return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">ABILITY REGISTRY</span><h3>Skills</h3></div><strong>${state.skills.length} ACQUIRED</strong></section>${pendingActivation.length ? `<button type="button" class="sl-activation-alert" data-sl-skill="${html(pendingActivation[0].id)}"><i class="fa-solid fa-microphone-lines"></i><span><b>VOICE ACTIVATION REQUIRED</b><small>Tap to set the activation word for ${html(pendingActivation[0].name)}${pendingActivation.length > 1 ? ` and ${pendingActivation.length - 1} more skill${pendingActivation.length === 2 ? '' : 's'}` : ''}.</small></span><i class="fa-solid fa-chevron-right"></i></button>` : ''}${skills}${shadows}`;
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
    return `<section class="sl-module-heading"><div><span class="sl-system-eyebrow">AUTHORIZED EXCHANGE</span><h3>System Shop</h3></div><strong><i class="fa-solid fa-coins"></i> ${state.currency.amount.toLocaleString()} ${html(state.currency.symbol)}</strong></section><section class="sl-shop-console"><form id="sl-shop-search"><label><i class="fa-solid fa-magnifying-glass"></i><input id="sl-shop-query" type="text" maxlength="160" placeholder="Search for an item to generate…"></label><button type="submit" ${shopGenerating ? 'disabled' : ''}>${shopGenerating ? '<i class="fa-solid fa-spinner fa-spin"></i>' : '<i class="fa-solid fa-wand-magic-sparkles"></i>'} SEARCH</button></form><button type="button" data-sl-action="refill-shop" ${shopGenerating ? 'disabled' : ''}><i class="fa-solid fa-rotate"></i> REFILL RANDOM ITEMS</button><small>Uses your active SillyTavern provider and model. Purchases use ${html(state.currency.name)} (${html(state.currency.symbol)}).</small></section>${state.shop.length ? `<div class="sl-shop-grid">${paged.items.map(item => `<article class="sl-shop-item">${imageFrame(item.icon, item.category)}<span class="sl-shop-rarity">${html(item.rarity)}</span><h4>${html(item.name)}</h4><p>${html(item.description)}</p><footer><b><i class="fa-solid fa-coins"></i> ${item.price.toLocaleString()} ${html(state.currency.symbol)}</b><button type="button" data-sl-buy="${html(item.id)}" ${state.currency.amount < item.price ? 'disabled' : ''}>BUY</button></footer></article>`).join('')}</div>${pagination(paged.page, paged.pages, 'shop')}` : '<section class="sl-empty-module is-shop"><i class="fa-solid fa-cart-shopping"></i><h4>Shop inventory unavailable</h4><p>Refill the shop or search for a specific item.</p></section>'}`;
}

function renderActivePanel() { const panel = document.getElementById(`sl-system-panel-${activeTab}`); if (!panel) return; const renderers = { status: renderStatus, quest: renderQuest, skills: renderSkills, inventory: renderInventory, equipment: renderEquipment, shop: renderShop, scene: () => renderScene(getState().scene) }; panel.innerHTML = renderers[activeTab]?.() || ''; }
function renderAll() { renderActivePanel(); updatePendingBadge(); updateAdministratorBadge(); }

function activateTab(tabId) {
    if (!TABS.some(tab => tab.id === tabId)) return; activeTab = tabId;
    document.querySelectorAll('[data-sl-tab]').forEach(button => { const active = button.dataset.slTab === tabId; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
    document.querySelectorAll('[data-sl-panel]').forEach(panel => { const active = panel.dataset.slPanel === tabId; panel.hidden = !active; panel.classList.toggle('is-active', active); }); renderActivePanel();
}

function updatePendingBadge() { const badge = document.getElementById('sl-pending-actions'); const count = getState().pendingActions.length; if (badge) { badge.textContent = `${count} PENDING ACTION${count === 1 ? '' : 'S'}`; badge.dataset.active = String(count > 0); } }
function updateAdministratorBadge() { const button = document.querySelector('[data-sl-action="open-admin"]'); if (button) { button.classList.toggle('is-active', getState().administratorMode); button.title = getState().administratorMode ? 'Administrator Mode enabled' : 'Open Administrator Mode'; } }
function particleMarkup() { return `<div class="sl-system-particles" aria-hidden="true">${Array.from({ length: 24 }, (_, index) => `<i style="--n:${index};--x:${(index * 37) % 100};--d:${9 + (index % 7) * 2};--s:${1 + (index % 3)}"></i>`).join('')}</div>`; }

function buildInterface() {
    const existing = document.getElementById('sl-system-overlay'); if (existing?.dataset.slUiVersion === UI_VERSION && existing.querySelector('#sl-system-panel')) return; existing?.remove();
    const overlay = document.createElement('div'); overlay.id = 'sl-system-overlay'; overlay.className = 'sl-system-overlay'; overlay.dataset.slUiVersion = UI_VERSION; overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<button class="sl-system-backdrop" type="button" aria-label="Close The System"></button><section id="sl-system-panel" class="sl-system-panel" role="dialog" aria-modal="true" aria-labelledby="sl-system-title" tabindex="-1">${particleMarkup()}
      <div id="sl-system-notification" class="sl-system-phase sl-system-onboarding" hidden><div class="sl-onboarding-grid"><aside><span>QUEST</span><b>?</b><small>PLAYER AUTHORIZATION</small></aside><main><div class="sl-onboarding-alert"><i class="fa-solid fa-triangle-exclamation"></i><span>URGENT QUEST</span></div><p class="sl-system-eyebrow">SYSTEM ACCESS REQUEST</p><h2>Will you accept<br><em>The System?</em></h2><blockquote>“Your heart will stop in 0.02 seconds if you choose not to accept.”</blockquote><p>Authorization transforms this chat into an independent Player record. All progress remains bound to this chat.</p><div class="sl-system-choice-row"><button type="button" data-sl-action="accept"><b>ACCEPT</b><span>Become a Player</span></button><button type="button" data-sl-action="decline"><b>DECLINE</b><span>Return to chat</span></button></div></main></div></div>
      <div id="sl-system-acknowledgement" class="sl-system-phase sl-system-acknowledgement" hidden><div class="sl-ack-core"><i class="fa-solid fa-diamond"></i><span class="sl-system-eyebrow">AUTHORIZATION COMPLETE</span><h2>WELCOME, PLAYER.</h2><p>This chat is now connected to The System.</p><div><i></i></div></div></div>
      <div id="sl-system-main" class="sl-system-phase sl-system-main" hidden><header class="sl-system-main-header"><div class="sl-system-main-brand"><span class="sl-system-sys-mark"><i class="fa-solid fa-diamond"></i></span><div><span class="sl-system-eyebrow">PLAYER INTERFACE</span><h2 id="sl-system-title">THE SYSTEM</h2></div></div><span id="sl-pending-actions" class="sl-pending-actions">0 PENDING ACTIONS</span><div class="sl-system-main-state"><i></i> ONLINE</div><div class="sl-header-tools"><button type="button" data-sl-action="open-guide" title="System Guide"><i class="fa-solid fa-circle-question"></i></button><button type="button" data-sl-action="open-admin" title="Administrator Mode"><i class="fa-solid fa-user-shield"></i></button></div><button class="sl-system-close" type="button" data-sl-action="close"><i class="fa-solid fa-xmark"></i></button></header><nav class="sl-system-nav" role="tablist">${TABS.map((tab, index) => tabButton(tab, index === 0)).join('')}</nav><main class="sl-system-content">${TABS.map((tab, index) => `<section id="sl-system-panel-${tab.id}" class="sl-system-tab-panel${index === 0 ? ' is-active' : ''}" data-sl-panel="${tab.id}" role="tabpanel" ${index ? 'hidden' : ''}></section>`).join('')}</main><footer class="sl-system-main-footer"><span><i class="fa-solid fa-link"></i> PER-CHAT RECORD</span><button type="button" data-sl-action="open-guide"><i class="fa-solid fa-book-open"></i> GUIDE</button><button type="button" data-sl-action="sync"><i class="fa-solid fa-rotate"></i> SYNC LATEST TURN</button><span>v${UI_VERSION}</span></footer></div>
      <div id="sl-item-modal" class="sl-submodal" hidden></div><div id="sl-image-editor" class="sl-submodal" hidden></div><div id="sl-guide-modal" class="sl-submodal" hidden></div><div id="sl-admin-modal" class="sl-submodal" hidden></div>
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

async function buyItem(itemId) { const state = getState(); const item = state.shop.find(entry => entry.id === itemId); if (!item || state.currency.amount < item.price) return; state.currency.amount -= item.price; const existing = state.inventory.find(entry => entry.name.toLowerCase() === item.name.toLowerCase()); if (existing) existing.quantity += 1; else state.inventory.push({ ...clone(item), id: uid('item'), quantity: 1 }); queueAction(state, 'shop-purchase', `Purchased ${item.name} for ${item.price} ${state.currency.symbol}`, { shopItemId: item.id, price: item.price, currency: state.currency.symbol }); await persistState(state, 'ui-shop-purchase'); systemNotice('item', 'PURCHASE COMPLETE', `${item.name} · ${item.price} ${state.currency.symbol}`); }

function shopPrompt(query = '') { const request = query ? `Generate exactly one item matching this request: ${query}` : 'Generate 8 varied random items appropriate for the current story and player level.'; return `${request}\nReturn only JSON: {"items":[{"id":"unique-id","name":"...","category":"Weapon|Gear|Potion|Material|Consumable|Misc","rarity":"Common|Uncommon|Rare|Epic|Legendary","quantity":1,"description":"...","price":100,"slot":"weapon|head|chest|hands|legs|feet|accessory|","usable":false,"effects":{"hp":0,"mp":0,"description":"..."}}]}.\nPlayer/state context: ${JSON.stringify(stateForPrompt(getState()))}\nKeep it coherent with Solo Leveling-style progression and the active role-play. No Markdown.`; }

async function generateShop(query = '') {
    const currentContext = context(); if (shopGenerating) return; if (typeof currentContext.generateQuietPrompt !== 'function') return systemNotice('error', 'Shop generation unavailable', 'Active provider does not expose quiet generation');
    shopGenerating = true; renderActivePanel(); systemNotice('working', query ? 'SEARCHING SYSTEM SHOP…' : 'REFILLING SYSTEM SHOP…');
    try { const response = await generateQuiet(shopPrompt(query), query ? 900 : 2400); const parsed = parseModelJson(response); const rawItems = Array.isArray(parsed) ? parsed : parsed?.items; const generated = Array.isArray(rawItems) ? rawItems.map(item => normalizeItem(item)).filter(Boolean) : []; if (!generated.length) throw new Error('The model returned no valid shop items. Try a more specific search or check the active provider.'); const state = getState(); state.shop = query ? [...generated, ...state.shop.filter(old => !generated.some(item => item.name.toLowerCase() === old.name.toLowerCase()))].slice(0, 100) : generated; await persistState(state, 'shop-generation', { detect: false }); shopPage = 1; systemNotice('shop', query ? 'ITEM LOCATED' : 'SHOP REFILLED', `${generated.length} item${generated.length === 1 ? '' : 's'} generated`, { tab: 'shop' }); }
    catch (error) { console.error('[The System] Shop generation failed.', error); systemNotice('error', 'SHOP GENERATION FAILED', error.message); } finally { shopGenerating = false; renderActivePanel(); }
}

function showItemModal(itemId) {
    const state = getState(); const item = state.inventory.find(entry => entry.id === itemId) || state.shop.find(entry => entry.id === itemId); if (!item) return; selectedItemId = item.id; const modal = document.getElementById('sl-item-modal'); if (!modal) return;
    const equippedSlot = Object.keys(state.equipment).find(slot => state.equipment[slot] === item.id); const canEquip = Boolean(item.slot || inferSlot(item.category)); const owned = state.inventory.some(entry => entry.id === item.id);
    modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-modal"></button><article class="sl-item-sheet"><header><span>ITEM INFORMATION</span><button type="button" data-sl-action="close-modal"><i class="fa-solid fa-xmark"></i></button></header><div class="sl-item-sheet-hero">${imageFrame(item.icon, item.category, 'is-large')}<div><span>${html(item.rarity)} · ${html(item.category)}</span><h3>${html(item.name)}</h3><p>Quantity: ${item.quantity}</p></div></div><section><h4>DESCRIPTION</h4><p>${html(item.description)}</p></section><section><h4>EFFECT</h4><p>${html(item.effects.description || `${item.effects.hp ? `HP ${item.effects.hp > 0 ? '+' : ''}${item.effects.hp}` : ''}${item.effects.hp && item.effects.mp ? ' · ' : ''}${item.effects.mp ? `MP ${item.effects.mp > 0 ? '+' : ''}${item.effects.mp}` : ''}` || 'No registered effect.')}</p></section><footer>${owned ? `<button type="button" data-sl-action="edit-item-image"><i class="fa-solid fa-image"></i> IMAGE</button>${item.usable ? '<button type="button" data-sl-action="use-item">USE</button>' : ''}${equippedSlot ? `<button type="button" data-sl-unequip="${html(equippedSlot)}">UNEQUIP</button>` : canEquip ? '<button type="button" data-sl-action="equip-item">EQUIP</button>' : ''}` : `<button type="button" data-sl-buy="${html(item.id)}" ${state.currency.amount < item.price ? 'disabled' : ''}>BUY · ${item.price} ${html(state.currency.symbol)}</button>`}</footer></article>`; modal.hidden = false;
}

function showQuestModal(questId) {
    const quest = getState().quests.find(entry => entry.id === questId); if (!quest) return;
    selectedQuestId = quest.id; const modal = document.getElementById('sl-item-modal'); if (!modal) return;
    const claimable = quest.status.toLowerCase() === 'completed' && !quest.rewardClaimed;
    modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-modal"></button><article class="sl-item-sheet sl-quest-sheet"><header><span>MISSION INFORMATION</span><button type="button" data-sl-action="close-modal"><i class="fa-solid fa-xmark"></i></button></header><div class="sl-quest-sheet-hero"><span><i class="fa-solid ${quest.daily ? 'fa-clock' : 'fa-scroll'}"></i></span><div><em>${quest.daily ? 'DAILY MISSION' : html(quest.type)}</em><h3>${html(quest.title)}</h3><p>${html(quest.status)} · ${questProgress(quest)}% COMPLETE</p></div></div><section><h4>MISSION BRIEF</h4><p>${html(quest.description)}</p></section><section><h4>OBJECTIVES</h4><div class="sl-objective-list">${quest.objectives.map(objective => `<article class="${objective.completed ? 'is-complete' : ''}"><i class="fa-solid ${objective.completed ? 'fa-circle-check' : 'fa-crosshairs'}"></i><span><b>${html(objective.label)}</b><small>${objective.current} / ${objective.goal}${objective.unit ? ` ${html(objective.unit)}` : ''}</small></span><strong>${percent(objective.current, objective.goal)}%</strong></article>`).join('')}</div></section><section><h4>REWARDS</h4><div class="sl-reward-list">${quest.rewards.map(reward => `<article><i class="fa-solid ${reward.type === 'item' ? 'fa-gift' : reward.type === 'currency' ? 'fa-coins' : reward.type === 'experience' ? 'fa-arrow-trend-up' : 'fa-star'}"></i><span><b>${html(reward.name)}${reward.amount > 1 ? ` ×${reward.amount}` : ''}</b><small>${html(reward.description || reward.type)}</small></span></article>`).join('') || '<p class="sl-muted-copy">Reward details have not been generated yet.</p>'}</div></section>${quest.daily ? `<section class="sl-penalty-line"><i class="fa-solid fa-triangle-exclamation"></i><span><b>DEADLINE</b> ${html(quest.deadline)}<br><b>PENALTY</b> ${html(quest.penalty.description)}</span></section>` : ''}<footer><button type="button" data-sl-action="close-modal">CLOSE</button>${claimable ? '<button type="button" class="sl-primary-action" data-sl-action="claim-quest"><i class="fa-solid fa-gift"></i> CLAIM REWARDS</button>' : quest.rewardClaimed ? '<button type="button" disabled><i class="fa-solid fa-check"></i> REWARDS CLAIMED</button>' : ''}</footer></article>`;
    modal.hidden = false;
}

async function claimQuestRewards(questId) {
    const state = getState(); const quest = state.quests.find(entry => entry.id === questId);
    if (!quest || quest.status.toLowerCase() !== 'completed' || quest.rewardClaimed) return;
    for (const reward of quest.rewards) {
        const type = reward.type.toLowerCase(); const amount = reward.amount;
        if (type === 'item' && reward.item) {
            const existing = state.inventory.find(item => item.name.toLowerCase() === reward.item.name.toLowerCase());
            if (existing) existing.quantity += Math.max(1, amount); else state.inventory.push({ ...clone(reward.item), id: uid('item'), quantity: Math.max(1, amount) });
        } else if (type === 'currency' || type === 'system credit' || type === 'credits') state.currency.amount += amount;
        else if (type === 'experience' || type === 'exp') state.player.experience += amount;
        else if (type === 'statpoints' || type === 'stat points') state.player.statPoints += amount;
        else if (type === 'hp') state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
        else if (type === 'mp') state.player.mp = Math.min(state.player.maxMp, state.player.mp + amount);
    }
    quest.rewardClaimed = true; queueAction(state, 'claim-mission-rewards', `Claimed rewards for ${quest.title}`, { questId: quest.id, rewards: quest.rewards });
    await persistState(state, 'ui-mission-reward-claim'); closeSubmodals(); systemNotice('reward', 'MISSION REWARDS ACQUIRED', rewardSummary(quest), { tab: 'quest' });
}

function showSkillModal(skillId) {
    const skill = getState().skills.find(entry => entry.id === skillId); if (!skill) return;
    selectedSkillId = skill.id; const modal = document.getElementById('sl-item-modal'); if (!modal) return;
    modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-modal"></button><article class="sl-item-sheet sl-skill-sheet"><header><span>SKILL INFORMATION</span><button type="button" data-sl-action="close-modal"><i class="fa-solid fa-xmark"></i></button></header><div class="sl-item-sheet-hero">${imageFrame(skill.icon, 'Skill', 'is-large')}<div><span>${html(skill.type)} · ${html(skill.rank)}-RANK</span><h3>${html(skill.name)}</h3><p>Level ${skill.level} · Used ${skill.uses} time${skill.uses === 1 ? '' : 's'}</p></div></div><section><h4>DESCRIPTION</h4><p>${html(skill.description)}</p></section><section><h4>MASTERY</h4><div class="sl-skill-sheet-mastery"><div class="sl-quest-progress"><i style="width:${percent(skill.mastery, skill.masteryRequired)}%"></i></div><b>${skill.mastery} / ${skill.masteryRequired}</b></div></section>${skill.activationRequired ? `<section><h4>VOICE ACTIVATION</h4><form id="sl-activation-form" class="sl-activation-form"><label><i class="fa-solid fa-microphone-lines"></i><input id="sl-activation-word" type="text" maxlength="80" value="${html(skill.activationWord)}" placeholder="Example: Arise" ${getState().administratorMode ? '' : ''}></label><button type="submit">SAVE WORD</button></form><p class="sl-muted-copy">This word is stored only for this skill in the current chat. The skill will activate only when you use it.</p></section>` : ''}<footer><button type="button" data-sl-action="edit-selected-skill-image"><i class="fa-solid fa-image"></i> EDIT ICON</button><button type="button" data-sl-action="close-modal">CLOSE</button></footer></article>`;
    modal.hidden = false;
}

async function saveActivationWord() {
    const state = getState(); const skill = state.skills.find(entry => entry.id === selectedSkillId); if (!skill) return;
    const word = text(document.getElementById('sl-activation-word')?.value, '', 80);
    if (!word) return systemNotice('warning', 'ACTIVATION WORD REQUIRED', `Enter a word for ${skill.name}`, { tab: 'skills', skillId: skill.id });
    skill.activationWord = word; queueAction(state, 'set-skill-activation', `Set the activation word for ${skill.name}`, { skillId: skill.id });
    await persistState(state, 'ui-skill-activation', { detect: false }); closeSubmodals(); systemNotice('skill', 'ACTIVATION WORD REGISTERED', `${skill.name} · “${word}”`, { tab: 'skills', skillId: skill.id });
}

function showShadowModal(shadowId) {
    const shadow = getState().shadowArmy.find(entry => entry.id === shadowId); if (!shadow) return;
    selectedShadowId = shadow.id; const modal = document.getElementById('sl-item-modal'); if (!modal) return;
    const labels = { strength: 'STR', agility: 'AGI', vitality: 'VIT', intelligence: 'INT', perception: 'PER' };
    modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-modal"></button><article class="sl-item-sheet sl-shadow-sheet"><header><span>SHADOW ARMY RECORD</span><button type="button" data-sl-action="close-modal"><i class="fa-solid fa-xmark"></i></button></header><div class="sl-shadow-hero"><i class="fa-solid fa-user-ninja"></i><div><span>${html(shadow.rank)}-RANK · ${html(shadow.class)}</span><h3>${html(shadow.name)}</h3><p>Level ${shadow.level} · ${html(shadow.status)}</p></div></div><section><h4>DESCRIPTION</h4><p>${html(shadow.description)}</p></section><section><h4>STATS</h4><div class="sl-shadow-stats">${Object.entries(shadow.stats).map(([key, value]) => `<article><span>${labels[key] || html(key)}</span><b>${value}</b></article>`).join('')}</div></section><section><h4>ABILITIES</h4><div class="sl-shadow-abilities">${shadow.abilities.map(ability => `<span>${html(ability)}</span>`).join('') || '<p class="sl-muted-copy">No abilities recorded.</p>'}</div></section><footer><button type="button" data-sl-action="close-modal">CLOSE</button></footer></article>`;
    modal.hidden = false;
}

function openGuide() {
    const modal = document.getElementById('sl-guide-modal'); if (!modal) return;
    const sections = [
        ['fa-link', 'Per-chat records', 'Accept or decline separately in every chat. The profile, scene, progress, items, equipment, quests, shop, credits, and actions never transfer to another chat.'],
        ['fa-arrow-trend-up', 'EXP and levels', 'EXP is awarded only when the story confirms meaningful combat, training, quest progress, or another achievement. The AI updates EXP after its reply; Sync Latest Turn can re-check the newest turn.'],
        ['fa-chart-simple', 'Stats and stat points', 'Level-ups and appropriate rewards can grant stat points. Spend them with the + buttons in Status. A queued action tells the next reply what you changed without adding it twice.'],
        ['fa-heart-pulse', 'HP, MP, skills, and titles', 'Skills have their own tab with level, mastery, customizable SVG or uploaded icons, activation words, and Shadow Army storage when Shadow Extraction is owned.'],
        ['fa-scroll', 'Missions, progress, and rewards', 'Tap a mission for its full objective list. Progress is tracked per objective, and completed mission rewards are claimed from the mission interface.'],
        ['fa-box-open', 'Inventory and equipment', 'Tap any item for full information. Consumables can be used, gear can be equipped, and owned item images can be customized. Mobile Equipment is displayed as a vertical slot list.'],
        ['fa-coins', 'System Shop and Credits', 'Earn System Credits through confirmed rewards. Buying an item deducts Credits immediately. Refill or search uses the active SillyTavern provider and model.'],
        ['fa-location-crosshairs', 'Scene tracking', 'The Scene tab records date, time, environment, and a specific current position describing where the Player stands and what is nearby.'],
        ['fa-image', 'Images', 'Select an image, drag it with one finger or mouse, pinch with two fingers to zoom, or use the precision sliders. Images are saved only in the active chat.'],
        ['fa-user-shield', 'Administrator Mode', 'Enable Administrator Mode to edit the Player profile, progression, attributes, currency, and position with buttons and form controls—no JSON required.'],
    ];
    modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-modal"></button><article class="sl-guide-card"><header><div><span class="sl-system-eyebrow">PLAYER MANUAL</span><h3>How The System Works</h3></div><button type="button" data-sl-action="close-modal"><i class="fa-solid fa-xmark"></i></button></header><div class="sl-guide-grid">${sections.map(([icon, title, copy]) => `<section><i class="fa-solid ${icon}"></i><div><h4>${title}</h4><p>${copy}</p></div></section>`).join('')}</div></article>`; modal.hidden = false;
}

function openAdministrator() {
    const state = getState(); const modal = document.getElementById('sl-admin-modal'); if (!modal) return;
    const input = (label, name, value, type = 'text', min = '') => `<label><span>${label}</span><input name="${name}" type="${type}" value="${html(value)}" ${min !== '' ? `min="${min}"` : ''} ${state.administratorMode ? '' : 'disabled'}></label>`;
    const statLabels = { strength: 'Strength', agility: 'Agility', vitality: 'Vitality', intelligence: 'Intelligence', perception: 'Perception' };
    modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-modal"></button><article class="sl-admin-card"><header><div><span class="sl-system-eyebrow">SYSTEM OVERRIDE</span><h3>Administrator Mode</h3></div><button type="button" data-sl-action="close-modal"><i class="fa-solid fa-xmark"></i></button></header><section class="sl-admin-switch"><div><i class="fa-solid fa-user-shield"></i><span><b>${state.administratorMode ? 'ADMINISTRATOR ENABLED' : 'ADMINISTRATOR LOCKED'}</b><small>${state.administratorMode ? 'Edit the Player profile using the controls below.' : 'Enable this mode to unlock profile controls.'}</small></span></div><button type="button" data-sl-action="toggle-admin">${state.administratorMode ? 'DISABLE' : 'ENABLE'}</button></section><form id="sl-admin-form" class="sl-admin-form"><section><header><span>PLAYER PROFILE</span><button type="button" data-sl-action="admin-edit-image" ${state.administratorMode ? '' : 'disabled'}><i class="fa-solid fa-camera"></i> PROFILE IMAGE</button></header><div class="sl-admin-grid">${input('Player name', 'player.name', state.player.name)}${input('Title', 'player.title', state.player.title)}${input('Job / Class', 'player.job', state.player.job)}${input('Rank', 'player.rank', state.player.rank)}${input('Condition', 'player.condition', state.player.condition)}${input('Level', 'player.level', state.player.level, 'number', 1)}</div></section><section><header><span>VITALS & PROGRESSION</span></header><div class="sl-admin-grid">${input('HP', 'player.hp', state.player.hp, 'number', 0)}${input('Max HP', 'player.maxHp', state.player.maxHp, 'number', 1)}${input('MP', 'player.mp', state.player.mp, 'number', 0)}${input('Max MP', 'player.maxMp', state.player.maxMp, 'number', 1)}${input('Experience', 'player.experience', state.player.experience, 'number', 0)}${input('Required EXP', 'player.experienceRequired', state.player.experienceRequired, 'number', 1)}${input('Stat points', 'player.statPoints', state.player.statPoints, 'number', 0)}${input('Fatigue', 'player.fatigue', state.player.fatigue, 'number', 0)}</div></section><section><header><span>ATTRIBUTES</span></header><div class="sl-admin-grid is-stats">${Object.entries(statLabels).map(([key, label]) => input(label, `stats.${key}`, state.player.stats[key], 'number', 0)).join('')}</div></section><section><header><span>ECONOMY & POSITION</span></header><div class="sl-admin-grid">${input('Currency name', 'currency.name', state.currency.name)}${input('Symbol', 'currency.symbol', state.currency.symbol)}${input('Amount', 'currency.amount', state.currency.amount, 'number', 0)}${input('Place', 'scene.place', state.scene.place)}${input('Location', 'scene.location', state.scene.location)}${input('Current position', 'scene.position', state.scene.position)}</div></section><p class="sl-admin-note"><i class="fa-solid fa-circle-info"></i> All changes are normalized and saved only to the active chat. No JSON editing is required.</p><footer><button type="button" data-sl-action="close-modal">CANCEL</button><button type="submit" class="sl-primary-action" ${state.administratorMode ? '' : 'disabled'}>SAVE PROFILE</button></footer></form></article>`; modal.hidden = false;
}

async function toggleAdministrator() { const state = getState(); state.administratorMode = !state.administratorMode; await persistState(state, 'administrator-toggle', { detect: false }); openAdministrator(); systemNotice('system', `ADMINISTRATOR ${state.administratorMode ? 'ENABLED' : 'DISABLED'}`, 'This setting belongs to the active chat'); }

async function saveAdministrator() {
    const state = getState(); if (!state.administratorMode) return; const form = document.getElementById('sl-admin-form'); if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form); const stringFields = ['name', 'title', 'job', 'rank', 'condition'];
    stringFields.forEach(key => { state.player[key] = text(data.get(`player.${key}`), state.player[key], 100); });
    ['level', 'hp', 'maxHp', 'mp', 'maxMp', 'experience', 'experienceRequired', 'statPoints', 'fatigue'].forEach(key => { state.player[key] = number(data.get(`player.${key}`), state.player[key], key === 'level' || key === 'maxHp' || key === 'maxMp' || key === 'experienceRequired' ? 1 : 0, 999999999); });
    Object.keys(state.player.stats).forEach(key => { state.player.stats[key] = number(data.get(`stats.${key}`), state.player.stats[key], 0, 999999); });
    state.currency.name = text(data.get('currency.name'), state.currency.name, 50); state.currency.symbol = text(data.get('currency.symbol'), state.currency.symbol, 12); state.currency.amount = number(data.get('currency.amount'), state.currency.amount, 0, 999999999);
    ['place', 'location', 'position'].forEach(key => { state.scene[key] = text(data.get(`scene.${key}`), state.scene[key], 240); });
    queueAction(state, 'administrator-profile-update', 'Administrator updated the Player profile'); await persistState(state, 'administrator-profile-update'); closeSubmodals(); systemNotice('system', 'PROFILE OVERRIDE SAVED', 'Player controls updated without JSON');
}

function openImageEditor(target) {
    const state = getState(); let current; let label = 'ITEM IMAGE'; let category = 'Misc';
    if (target === 'profile') { current = state.profile; label = 'PROFILE IMAGE'; category = 'Profile'; }
    else if (String(target).startsWith('skill:')) { const skill = state.skills.find(entry => entry.id === String(target).slice(6)); if (!skill) return; current = skill.icon; label = 'SKILL ICON'; category = 'Skill'; }
    else { const item = state.inventory.find(entry => entry.id === target); if (!item) return; current = item.icon; category = item.category; }
    imageEditorTarget = target; imageEditorDraft = clone(current); const modal = document.getElementById('sl-image-editor'); if (!modal) return;
    modal.dataset.category = category; modal.innerHTML = `<button class="sl-submodal-backdrop" type="button" data-sl-action="close-image-editor"></button><article class="sl-image-editor-card"><header><span>${label}</span><button type="button" data-sl-action="close-image-editor"><i class="fa-solid fa-xmark"></i></button></header><div id="sl-image-editor-preview" class="sl-image-editor-preview">${imageFrame(imageEditorDraft, category, 'is-editor')}<span class="sl-gesture-guide"><i class="fa-solid fa-hand-pointer"></i> DRAG TO MOVE · PINCH OR SCROLL TO ZOOM</span></div>${category === 'Skill' ? `<section class="sl-svg-presets"><span>SVG FRAME PRESET</span><div>${SKILL_ICON_PRESETS.map(([preset, name]) => `<button type="button" class="${imageEditorDraft.preset === preset ? 'is-active' : ''}" data-sl-preset="${preset}">${categorySvg('Skill', preset)}<small>${name}</small></button>`).join('')}</div></section>` : ''}<label class="sl-file-button"><input id="sl-image-file" type="file" accept="image/*"><i class="fa-solid fa-upload"></i> SELECT IMAGE</label><div class="sl-image-controls"><label><span>Horizontal <output id="sl-image-x-output">${imageEditorDraft.positionX}%</output></span><input id="sl-image-x" type="range" min="0" max="100" value="${imageEditorDraft.positionX}"></label><label><span>Vertical <output id="sl-image-y-output">${imageEditorDraft.positionY}%</output></span><input id="sl-image-y" type="range" min="0" max="100" value="${imageEditorDraft.positionY}"></label><label><span>Zoom <output id="sl-image-zoom-output">${imageEditorDraft.zoom.toFixed(2)}×</output></span><input id="sl-image-zoom" type="range" min="1" max="3" step="0.05" value="${imageEditorDraft.zoom}"></label></div><footer><button type="button" data-sl-action="remove-image">REMOVE UPLOAD</button><button type="button" data-sl-action="save-image">SAVE TO CHAT</button></footer></article>`; modal.hidden = false; bindImageGestures();
}

function refreshImageEditorPreview() { const preview = document.getElementById('sl-image-editor-preview'); if (!preview || !imageEditorDraft) return; const frame = preview.querySelector('.sl-image-frame'); const category = document.getElementById('sl-image-editor')?.dataset.category || 'Profile'; if (frame) { frame.classList.toggle('has-image', Boolean(imageEditorDraft.image)); frame.setAttribute('style', imageEditorDraft.image ? `--image:url('${imageEditorDraft.image}');--x:${imageEditorDraft.positionX}%;--y:${imageEditorDraft.positionY}%;--zoom:${imageEditorDraft.zoom}` : ''); frame.innerHTML = imageEditorDraft.image ? '<i></i><b></b>' : `${categorySvg(category, imageEditorDraft.preset)}<b></b>`; } document.querySelectorAll('[data-sl-preset]').forEach(button => button.classList.toggle('is-active', button.dataset.slPreset === imageEditorDraft.preset)); [['sl-image-x-output', `${Math.round(imageEditorDraft.positionX)}%`], ['sl-image-y-output', `${Math.round(imageEditorDraft.positionY)}%`], ['sl-image-zoom-output', `${imageEditorDraft.zoom.toFixed(2)}×`], ['sl-image-x', imageEditorDraft.positionX], ['sl-image-y', imageEditorDraft.positionY], ['sl-image-zoom', imageEditorDraft.zoom]].forEach(([id, value]) => { const control = document.getElementById(id); if (control) control.value !== undefined ? control.value = String(value) : control.textContent = String(value); }); }

function bindImageGestures() {
    const preview = document.getElementById('sl-image-editor-preview'); if (!preview) return; const pointers = new Map(); imageGesture = { pointers, center: null, distance: 0 };
    const metrics = () => { const values = [...pointers.values()]; if (!values.length) return { center: null, distance: 0 }; const center = values.reduce((sum, point) => ({ x: sum.x + point.x / values.length, y: sum.y + point.y / values.length }), { x: 0, y: 0 }); const distance = values.length > 1 ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) : 0; return { center, distance }; };
    preview.addEventListener('pointerdown', event => { if (!imageEditorDraft?.image) return; event.preventDefault(); preview.setPointerCapture?.(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); Object.assign(imageGesture, metrics()); preview.classList.add('is-gesturing'); });
    preview.addEventListener('pointermove', event => { if (!pointers.has(event.pointerId) || !imageEditorDraft?.image) return; event.preventDefault(); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); const next = metrics(); const rect = preview.getBoundingClientRect(); if (imageGesture.center && next.center) { imageEditorDraft.positionX = number(imageEditorDraft.positionX - ((next.center.x - imageGesture.center.x) / Math.max(1, rect.width)) * 100, 50, 0, 100); imageEditorDraft.positionY = number(imageEditorDraft.positionY - ((next.center.y - imageGesture.center.y) / Math.max(1, rect.height)) * 100, 50, 0, 100); } if (pointers.size > 1 && imageGesture.distance > 0 && next.distance > 0) imageEditorDraft.zoom = number(imageEditorDraft.zoom * (next.distance / imageGesture.distance), 1, 1, 3); Object.assign(imageGesture, next); refreshImageEditorPreview(); });
    const release = event => { pointers.delete(event.pointerId); Object.assign(imageGesture, metrics()); if (!pointers.size) preview.classList.remove('is-gesturing'); };
    preview.addEventListener('pointerup', release); preview.addEventListener('pointercancel', release); preview.addEventListener('wheel', event => { if (!imageEditorDraft?.image) return; event.preventDefault(); imageEditorDraft.zoom = number(imageEditorDraft.zoom + (event.deltaY < 0 ? .08 : -.08), 1, 1, 3); refreshImageEditorPreview(); }, { passive: false });
}

async function saveImageEditor() { if (!imageEditorTarget || !imageEditorDraft) return; const state = getState(); if (imageEditorTarget === 'profile') state.profile = normalizeImage(imageEditorDraft); else if (String(imageEditorTarget).startsWith('skill:')) { const skill = state.skills.find(entry => entry.id === String(imageEditorTarget).slice(6)); if (!skill) return; skill.icon = normalizeImage(imageEditorDraft); } else { const item = state.inventory.find(entry => entry.id === imageEditorTarget); if (!item) return; item.icon = normalizeImage(imageEditorDraft); } await persistState(state, 'ui-image-update', { detect: false }); closeSubmodals(); systemNotice('system', 'IMAGE SAVED', 'Stored in this chat only'); }
function closeSubmodals() { document.querySelectorAll('.sl-submodal').forEach(modal => { modal.hidden = true; modal.innerHTML = ''; }); selectedItemId = ''; selectedQuestId = ''; selectedSkillId = ''; selectedShadowId = ''; imageEditorTarget = null; imageEditorDraft = null; imageGesture = null; }

function handleInterfaceClick(event) {
    const pressed = event.target.closest('button, .sl-shop-item, .sl-quest-card'); if (pressed) { pressed.classList.remove('sl-pressed'); requestAnimationFrame(() => pressed.classList.add('sl-pressed')); setTimeout(() => pressed.classList.remove('sl-pressed'), 360); }
    const action = event.target.closest('[data-sl-action]')?.dataset.slAction; const tab = event.target.closest('[data-sl-tab]')?.dataset.slTab; const item = event.target.closest('[data-sl-item]')?.dataset.slItem; const quest = event.target.closest('[data-sl-quest]')?.dataset.slQuest; const skill = event.target.closest('[data-sl-skill]')?.dataset.slSkill; const skillImage = event.target.closest('[data-sl-skill-image]')?.dataset.slSkillImage; const shadow = event.target.closest('[data-sl-shadow]')?.dataset.slShadow; const preset = event.target.closest('[data-sl-preset]')?.dataset.slPreset; const upgrade = event.target.closest('[data-sl-upgrade]')?.dataset.slUpgrade; const buy = event.target.closest('[data-sl-buy]')?.dataset.slBuy; const unequip = event.target.closest('[data-sl-unequip]')?.dataset.slUnequip; const pager = event.target.closest('[data-sl-page]');
    if (preset && imageEditorDraft) { imageEditorDraft.preset = preset; imageEditorDraft.image = ''; refreshImageEditorPreview(); } else if (tab) activateTab(tab); else if (upgrade) upgradeStat(upgrade); else if (buy) buyItem(buy); else if (unequip) unequipSlot(unequip); else if (pager) { const page = number(pager.dataset.page, 1, 1); if (pager.dataset.slPage === 'inventory') inventoryPage = page; else shopPage = page; renderActivePanel(); } else if (skillImage) openImageEditor(`skill:${skillImage}`); else if (quest) showQuestModal(quest); else if (skill) showSkillModal(skill); else if (shadow) showShadowModal(shadow); else if (item && !event.target.closest('[data-sl-buy]')) showItemModal(item); else if (action === 'accept') acceptSystem(); else if (action === 'decline') declineSystem(); else if (action === 'close') closeInterface(); else if (action === 'sync') syncLatestTurn(); else if (action === 'open-guide') openGuide(); else if (action === 'open-admin') openAdministrator(); else if (action === 'toggle-admin') toggleAdministrator(); else if (action === 'edit-profile') openImageEditor('profile'); else if (action === 'admin-edit-image') { closeSubmodals(); openImageEditor('profile'); } else if (action === 'edit-item-image') openImageEditor(selectedItemId); else if (action === 'edit-selected-skill-image') { const id = selectedSkillId; closeSubmodals(); openImageEditor(`skill:${id}`); } else if (action === 'claim-quest') claimQuestRewards(selectedQuestId); else if (action === 'close-modal' || action === 'close-image-editor') closeSubmodals(); else if (action === 'save-image') saveImageEditor(); else if (action === 'remove-image') { if (imageEditorDraft) { imageEditorDraft.image = ''; refreshImageEditorPreview(); } } else if (action === 'equip-item') equipItem(selectedItemId); else if (action === 'use-item') useItem(selectedItemId); else if (action === 'refill-shop') generateShop();
}

function handleInterfaceSubmit(event) {
    if (event.target.id === 'sl-shop-search') { event.preventDefault(); const query = text(document.getElementById('sl-shop-query')?.value, '', 160); if (query) generateShop(query); }
    else if (event.target.id === 'sl-activation-form') { event.preventDefault(); saveActivationWord(); }
    else if (event.target.id === 'sl-admin-form') { event.preventDefault(); saveAdministrator(); }
}

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

function bindSettingsDrawer() { bindCheckbox('sl-system-show-launcher', 'showWandLauncher', syncLauncherVisibility); bindCheckbox('sl-system-auto-track', 'autoTrack', updatePrompt); bindCheckbox('sl-system-inject-state', 'injectState', updatePrompt); bindSettingControl('sl-system-accent', 'accentColor', applyAppearance); bindSettingControl('sl-system-background', 'backgroundColor', applyAppearance); bindSettingControl('sl-system-particle', 'particleColor', applyAppearance); bindSettingControl('sl-system-glass', 'glassOpacity', applyAppearance); bindSettingControl('sl-system-glow', 'glowStrength', applyAppearance); bindSettingControl('sl-system-notification-position', 'notificationPosition', applyAppearance); const version = document.getElementById('sl-system-current-version'); if (version) version.textContent = `v${UI_VERSION}`; const open = document.getElementById('sl-system-open-from-settings'); const sync = document.getElementById('sl-system-sync-from-settings'); if (open) open.onclick = openInterface; if (sync) sync.onclick = syncLatestTurn; applyAppearance(); }

async function addSettingsDrawer() { if (document.getElementById('sl-system-settings')) { bindSettingsDrawer(); return true; } const container = document.getElementById('extensions_settings2'); if (!container) return false; const rendered = await context().renderExtensionTemplateAsync?.(EXTENSION_FOLDER, 'settings'); if (!rendered) return false; container.insertAdjacentHTML('beforeend', rendered); bindSettingsDrawer(); return true; }
function observeSettingsDrawer() { if (settingsObserver) return; settingsObserver = new MutationObserver(async () => { try { if (await addSettingsDrawer()) { settingsObserver.disconnect(); settingsObserver = null; } } catch (error) { console.error('[The System] Settings drawer failed.', error); } }); settingsObserver.observe(document.body, { childList: true, subtree: true }); }

function bindChatEvents() {
    const currentContext = context(); if (!currentContext.eventSource?.on || !currentContext.eventTypes) return; const { eventSource, eventTypes } = currentContext;
    if (eventTypes.CHAT_CHANGED) eventSource.on(eventTypes.CHAT_CHANGED, () => { closeSubmodals(); activeTab = 'status'; updatePrompt(); renderAll(); const state = getState(); if (document.getElementById('sl-system-overlay')?.classList.contains('is-open')) showPhase(state.accepted ? 'main' : 'notification'); if (state.accepted) systemNotice('system', 'SYSTEM ONLINE', `${state.player.name} · Level ${state.player.level}`); });
    if (eventTypes.MESSAGE_SENT) eventSource.on(eventTypes.MESSAGE_SENT, () => {
        updatePrompt(); renderAll(); const state = getState(); if (!state.accepted) return;
        const latest = [...(context().chat || [])].reverse().find(message => message?.is_user && !message.is_system)?.mes || '';
        const activated = state.skills.find(skill => skill.activationRequired && skill.activationWord && String(latest).toLocaleLowerCase().includes(skill.activationWord.toLocaleLowerCase()));
        if (activated) systemNotice('skill', 'VOICE COMMAND DETECTED', `${activated.name} · “${activated.activationWord}”`, { tab: 'skills', skillId: activated.id });
        else systemNotice('working', 'SYSTEM MONITORING', 'Waiting for the next reply…');
    });
    if (eventTypes.MESSAGE_RECEIVED) eventSource.on(eventTypes.MESSAGE_RECEIVED, processAssistantPatch);
}

async function initialize() {
    if (initialized) return; initialized = true;
    try { getSettings(); applyAppearance(); buildIsland(); buildInterface(); if (!(await addSettingsDrawer())) observeSettingsDrawer(); observeWandMenu(); bindChatEvents(); updatePrompt(); const state = getState(); if (state.accepted && context().getCurrentChatId?.()) systemNotice('system', 'SYSTEM ONLINE', `${state.player.name} · Level ${state.player.level}`); document.addEventListener('keydown', event => { if (event.key === 'Escape') { if ([...document.querySelectorAll('.sl-submodal')].some(modal => !modal.hidden)) closeSubmodals(); else closeInterface(); } }); globalThis.TheSystemExtension = { version: UI_VERSION, open: openInterface, close: closeInterface, state: getState }; console.info(`[The System] Interface v${UI_VERSION} loaded.`); }
    catch (error) { initialized = false; console.error('[The System] Failed to initialize.', error); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else void initialize();
