/* global SillyTavern, toastr */

const EXTENSION_FOLDER = 'third-party/sololeveling-extension';
const SETTINGS_KEY = 'the_system';
const DEFAULT_SETTINGS = Object.freeze({
    showWandLauncher: true,
});

const TABS = [
    { id: 'status', label: 'Status', icon: 'fa-solid fa-user' },
    { id: 'stats', label: 'Stats', icon: 'fa-solid fa-chart-simple' },
    { id: 'skills', label: 'Skills', icon: 'fa-solid fa-bolt' },
    { id: 'quests', label: 'Quests', icon: 'fa-solid fa-scroll' },
    { id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-box-open' },
];

const SYSTEM_DATA = Object.freeze({
    level: 1,
    rank: 'E',
    experience: 0,
    experienceRequired: 100,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    stats: [
        { id: 'strength', label: 'Strength', short: 'STR', value: 10, icon: 'fa-solid fa-hand-fist' },
        { id: 'agility', label: 'Agility', short: 'AGI', value: 10, icon: 'fa-solid fa-person-running' },
        { id: 'sense', label: 'Sense', short: 'SEN', value: 10, icon: 'fa-solid fa-eye' },
        { id: 'vitality', label: 'Vitality', short: 'VIT', value: 10, icon: 'fa-solid fa-heart-pulse' },
        { id: 'intelligence', label: 'Intelligence', short: 'INT', value: 10, icon: 'fa-solid fa-brain' },
    ],
});

let initialized = false;
let menuObserver = null;
let settingsObserver = null;
let previousFocusedElement = null;
let activeTab = 'status';

function context() {
    return globalThis.SillyTavern?.getContext?.() || {};
}

function notify(type, message) {
    const handler = globalThis.toastr?.[type];
    if (typeof handler === 'function') handler(message);
    else console[type === 'error' ? 'error' : 'info'](`[The System] ${message}`);
}

function getSettings() {
    const currentContext = context();
    currentContext.extensionSettings ||= {};
    currentContext.extensionSettings[SETTINGS_KEY] ||= { ...DEFAULT_SETTINGS };

    const settings = currentContext.extensionSettings[SETTINGS_KEY];
    if (typeof settings.showWandLauncher !== 'boolean') settings.showWandLauncher = DEFAULT_SETTINGS.showWandLauncher;
    return settings;
}

function saveSettings() {
    context().saveSettingsDebounced?.();
}

function html(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function tabButton(tab, isActive) {
    return `<button class="sl-system-tab${isActive ? ' is-active' : ''}" type="button" role="tab"
        data-sl-tab="${tab.id}" aria-selected="${isActive}" aria-controls="sl-system-panel-${tab.id}">
        <i class="${tab.icon}" aria-hidden="true"></i><span>${html(tab.label)}</span></button>`;
}

function renderStatus() {
    const xpPercent = Math.round((SYSTEM_DATA.experience / SYSTEM_DATA.experienceRequired) * 100);
    return `
        <section class="sl-system-status-hero">
            <div class="sl-system-status-mark"><i class="fa-solid fa-bolt" aria-hidden="true"></i></div>
            <div class="sl-system-status-copy">
                <span class="sl-system-eyebrow">Player status</span>
                <h3>System User</h3>
                <p>Awaiting awakening data</p>
            </div>
            <div class="sl-system-level">
                <span>LV.</span><strong>${SYSTEM_DATA.level}</strong>
            </div>
        </section>

        <section class="sl-system-xp-card">
            <div class="sl-system-card-heading"><span>Experience</span><strong>${SYSTEM_DATA.experience} / ${SYSTEM_DATA.experienceRequired} XP</strong></div>
            <div class="sl-system-meter" aria-label="Experience ${xpPercent}%"><i style="width:${xpPercent}%"></i></div>
            <small>Progression will be linked to the active chat state in the next layer.</small>
        </section>

        <div class="sl-system-resource-grid">
            <article class="sl-system-resource-card sl-system-resource-hp">
                <div class="sl-system-resource-icon"><i class="fa-solid fa-heart-pulse" aria-hidden="true"></i></div>
                <div><span>Health</span><strong>${SYSTEM_DATA.hp} <small>/ ${SYSTEM_DATA.maxHp}</small></strong></div>
                <div class="sl-system-resource-meter"><i style="width:${(SYSTEM_DATA.hp / SYSTEM_DATA.maxHp) * 100}%"></i></div>
            </article>
            <article class="sl-system-resource-card sl-system-resource-mp">
                <div class="sl-system-resource-icon"><i class="fa-solid fa-droplet" aria-hidden="true"></i></div>
                <div><span>Mana</span><strong>${SYSTEM_DATA.mp} <small>/ ${SYSTEM_DATA.maxMp}</small></strong></div>
                <div class="sl-system-resource-meter"><i style="width:${(SYSTEM_DATA.mp / SYSTEM_DATA.maxMp) * 100}%"></i></div>
            </article>
        </div>

        <section class="sl-system-rank-card">
            <div class="sl-system-rank-emblem"><span>RANK</span><strong>${html(SYSTEM_DATA.rank)}</strong></div>
            <div><span class="sl-system-eyebrow">Current classification</span><h4>Unawakened Hunter</h4><p>Your rank will change as the system records confirmed progress.</p></div>
        </section>`;
}

function renderStats() {
    return `
        <section class="sl-system-section-heading"><span class="sl-system-eyebrow">Attributes</span><h3>Core statistics</h3><p>Every point has a purpose.</p></section>
        <section class="sl-system-stat-grid">
            ${SYSTEM_DATA.stats.map(stat => `<article class="sl-system-stat-card">
                <div class="sl-system-stat-icon"><i class="${stat.icon}" aria-hidden="true"></i></div>
                <div><span>${html(stat.short)}</span><h4>${html(stat.label)}</h4></div>
                <strong>${stat.value}</strong>
            </article>`).join('')}
        </section>
        <div class="sl-system-empty-note"><i class="fa-solid fa-lock" aria-hidden="true"></i><span>Stat allocation will become available when player state is connected.</span></div>`;
}

function renderSkills() {
    return `
        <section class="sl-system-section-heading"><span class="sl-system-eyebrow">Skill storage</span><h3>Acquired skills</h3><p>Abilities registered by The System appear here.</p></section>
        <section class="sl-system-empty-state"><div><i class="fa-solid fa-bolt" aria-hidden="true"></i></div><h4>No skills unlocked</h4><p>The System is ready to register your first skill.</p><button class="sl-system-secondary-button" type="button" data-sl-action="notify-coming-soon"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add later</button></section>`;
}

function renderQuests() {
    return `
        <section class="sl-system-section-heading"><span class="sl-system-eyebrow">Quest log</span><h3>Active quests</h3><p>Objectives and rewards will be tracked per chat.</p></section>
        <section class="sl-system-quest-card">
            <div class="sl-system-quest-top"><span class="sl-system-quest-badge"><i class="fa-solid fa-scroll" aria-hidden="true"></i> Daily quest</span><span class="sl-system-quest-state">Locked</span></div>
            <h4>Prepare for the next challenge</h4><p>Quest tracking will be generated from confirmed role-play events.</p>
            <div class="sl-system-quest-progress"><span>0 / 3 objectives</span><i><b></b></i></div>
        </section>`;
}

function renderInventory() {
    return `
        <section class="sl-system-section-heading"><span class="sl-system-eyebrow">Item storage</span><h3>Inventory</h3><p>Equipment, consumables, and rewards collected by the player.</p></section>
        <section class="sl-system-empty-state"><div><i class="fa-solid fa-box-open" aria-hidden="true"></i></div><h4>Inventory empty</h4><p>Items will appear here when the state engine is connected.</p></section>`;
}

function renderTab(tabId) {
    const panel = document.getElementById(`sl-system-panel-${tabId}`);
    if (!panel) return;
    const renderers = { status: renderStatus, stats: renderStats, skills: renderSkills, quests: renderQuests, inventory: renderInventory };
    panel.innerHTML = renderers[tabId]?.() || '';
}

function activateTab(tabId) {
    if (!TABS.some(tab => tab.id === tabId)) return;
    activeTab = tabId;
    document.querySelectorAll('[data-sl-tab]').forEach(button => {
        const active = button.dataset.slTab === tabId;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-sl-panel]').forEach(panel => {
        const active = panel.dataset.slPanel === tabId;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
    });
    renderTab(tabId);
}

function buildInterface() {
    if (document.getElementById('sl-system-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'sl-system-overlay';
    overlay.className = 'sl-system-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <button class="sl-system-backdrop" type="button" aria-label="Close The System"></button>
        <section id="sl-system-panel" class="sl-system-panel" role="dialog" aria-modal="true" aria-labelledby="sl-system-title" tabindex="-1">
            <header class="sl-system-header">
                <div class="sl-system-brand"><span class="sl-system-brand-mark"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span><div><span class="sl-system-eyebrow">Solo Leveling interface</span><h2 id="sl-system-title">The System</h2></div></div>
                <div class="sl-system-online"><i class="fa-solid fa-circle" aria-hidden="true"></i> Online</div>
                <button id="sl-system-close" class="menu_button menu_button_icon" type="button" aria-label="Close The System"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </header>
            <div class="sl-system-body">
                <nav class="sl-system-tabs" aria-label="The System sections" role="tablist">
                    ${TABS.map((tab, index) => tabButton(tab, index === 0)).join('')}
                </nav>
                <main class="sl-system-content">
                    ${TABS.map((tab, index) => `<section id="sl-system-panel-${tab.id}" class="sl-system-tab-panel${index === 0 ? ' is-active' : ''}" data-sl-panel="${tab.id}" role="tabpanel" ${index ? 'hidden' : ''}></section>`).join('')}
                </main>
            </div>
            <footer class="sl-system-footer"><span><i class="fa-solid fa-link" aria-hidden="true"></i> Interface shell online</span><span>v0.1.0</span></footer>
        </section>`;

    document.body.appendChild(overlay);
    overlay.querySelector('.sl-system-backdrop')?.addEventListener('click', closeInterface);
    overlay.querySelector('#sl-system-close')?.addEventListener('click', closeInterface);
    overlay.querySelectorAll('[data-sl-tab]').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.slTab)));
    overlay.addEventListener('click', event => {
        if (event.target.closest('[data-sl-action="notify-coming-soon"]')) notify('info', 'This system module will be connected in the next layer.');
    });
    renderTab(activeTab);
}

function openInterface() {
    buildInterface();
    const overlay = document.getElementById('sl-system-overlay');
    const panel = document.getElementById('sl-system-panel');
    if (!overlay || !panel) return;

    previousFocusedElement = document.activeElement;
    activateTab(activeTab);
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sl-system-open');
    requestAnimationFrame(() => panel.focus());
}

function closeInterface() {
    const overlay = document.getElementById('sl-system-overlay');
    if (!overlay?.classList.contains('is-open')) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sl-system-open');
    if (previousFocusedElement instanceof HTMLElement) previousFocusedElement.focus({ preventScroll: true });
}

function syncLauncherVisibility() {
    const launcher = document.getElementById('sl-system-wand-launcher');
    if (!launcher) return;
    const visible = getSettings().showWandLauncher;
    launcher.hidden = !visible;
    launcher.setAttribute('aria-hidden', String(!visible));
}

function createWandLauncher() {
    if (document.getElementById('sl-system-wand-launcher')) return true;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;

    const launcher = document.createElement('div');
    launcher.id = 'sl-system-wand-launcher';
    launcher.className = 'list-group-item flex-container flexGap5 interactable';
    launcher.tabIndex = 0;
    launcher.setAttribute('role', 'button');
    launcher.title = 'Open The System';
    launcher.innerHTML = '<i class="fa-solid fa-bolt" aria-hidden="true"></i><span>The System</span>';

    const activate = event => {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openInterface();
    };
    launcher.addEventListener('click', activate);
    launcher.addEventListener('keydown', activate);
    menu.appendChild(launcher);
    syncLauncherVisibility();
    return true;
}

function observeWandMenu() {
    if (createWandLauncher() || menuObserver) return;
    menuObserver = new MutationObserver(() => {
        if (createWandLauncher()) {
            menuObserver.disconnect();
            menuObserver = null;
        }
    });
    menuObserver.observe(document.body, { childList: true, subtree: true });
}

function bindSettingsDrawer() {
    const showLauncher = document.getElementById('sl-system-show-launcher');
    if (showLauncher instanceof HTMLInputElement) {
        showLauncher.checked = getSettings().showWandLauncher;
        showLauncher.addEventListener('change', () => {
            getSettings().showWandLauncher = showLauncher.checked;
            saveSettings();
            syncLauncherVisibility();
        });
    }
    document.getElementById('sl-system-open-from-settings')?.addEventListener('click', openInterface);
}

async function addSettingsDrawer() {
    if (document.getElementById('sl-system-settings')) return true;
    const container = document.getElementById('extensions_settings2');
    if (!container) return false;

    const rendered = await context().renderExtensionTemplateAsync?.(EXTENSION_FOLDER, 'settings');
    if (!rendered) throw new Error('SillyTavern did not return the The System settings template.');
    container.insertAdjacentHTML('beforeend', rendered);
    bindSettingsDrawer();
    return true;
}

function observeSettingsDrawer() {
    if (settingsObserver) return;
    settingsObserver = new MutationObserver(async () => {
        try {
            if (await addSettingsDrawer()) {
                settingsObserver.disconnect();
                settingsObserver = null;
            }
        } catch (error) {
            console.error('[The System] Could not add the Extensions drawer.', error);
        }
    });
    settingsObserver.observe(document.body, { childList: true, subtree: true });
}

function handleKeydown(event) {
    if (event.key === 'Escape') closeInterface();
}

async function initialize() {
    if (initialized) return;
    initialized = true;
    try {
        getSettings();
        buildInterface();
        if (!(await addSettingsDrawer())) observeSettingsDrawer();
        observeWandMenu();
        document.addEventListener('keydown', handleKeydown);
        console.info('[The System] Interface v0.1.0 loaded.');
    } catch (error) {
        initialized = false;
        console.error('[The System] Failed to initialize.', error);
        notify('error', 'The System could not load. Check the browser console.');
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else void initialize();
