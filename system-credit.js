/* global SillyTavern */

const SYSTEM_CREDIT_CORE_KEY = 'solo_leveling_system_state';
const SYSTEM_CREDIT_META_KEY = 'solo_leveling_system_credit_state';
const SYSTEM_CREDIT_PROMPT_KEY = 'solo_leveling_system_credit_isolation';
const SYSTEM_CREDIT_NAME = 'System Credit';
const SYSTEM_CREDIT_SYMBOL = 'SC';

const scContext = () => globalThis.SillyTavern?.getContext?.() || {};
const scNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
let scReconciling = false;
let scLocalTimer = null;

function scCore() {
    return scContext().chatMetadata?.[SYSTEM_CREDIT_CORE_KEY] || null;
}

function scState() {
    const current = scContext();
    const saved = current.chatMetadata?.[SYSTEM_CREDIT_META_KEY];
    if (saved && typeof saved === 'object') {
        return {
            name: SYSTEM_CREDIT_NAME,
            symbol: SYSTEM_CREDIT_SYMBOL,
            amount: scNumber(saved.amount, 1000),
            updatedAt: String(saved.updatedAt || ''),
            source: String(saved.source || 'stored'),
        };
    }
    const core = scCore();
    return {
        name: SYSTEM_CREDIT_NAME,
        symbol: SYSTEM_CREDIT_SYMBOL,
        amount: scNumber(core?.currency?.amount, 1000),
        updatedAt: '',
        source: 'migration',
    };
}

async function scSave(state, source = 'system-credit') {
    const current = scContext();
    if (!current.getCurrentChatId?.()) return false;
    current.chatMetadata ||= {};
    current.chatMetadata[SYSTEM_CREDIT_META_KEY] = {
        name: SYSTEM_CREDIT_NAME,
        symbol: SYSTEM_CREDIT_SYMBOL,
        amount: scNumber(state.amount, 0),
        updatedAt: new Date().toISOString(),
        source,
    };
    await current.saveMetadata?.();
    return true;
}

async function scMirrorToCore(state, source = 'system-credit-mirror') {
    const current = scContext();
    const core = scCore();
    if (!core || !current.getCurrentChatId?.()) return false;
    const amount = scNumber(state.amount, 0);
    const changed = core.currency?.name !== SYSTEM_CREDIT_NAME || core.currency?.symbol !== SYSTEM_CREDIT_SYMBOL || scNumber(core.currency?.amount, amount) !== amount;
    core.currency = { name: SYSTEM_CREDIT_NAME, symbol: SYSTEM_CREDIT_SYMBOL, amount };
    if (changed) {
        core.updatedAt = new Date().toISOString();
        core.updateSource = source;
        await current.saveMetadata?.();
    }
    return changed;
}

function scExplicitSystemEconomy(text) {
    const value = String(text || '');
    return /\b(?:system\s*credits?|system\s*currency|system\s*shop|SC\s*(?:credits?|currency)?|credits?\s*\(SC\))\b/i.test(value)
        || /(?:เครดิตระบบ|เครดิตของระบบ|เงินระบบ|สกุลเงินระบบ|ร้านค้าระบบ|แต้มระบบ)/i.test(value);
}

function scLatestTranscript(messageId) {
    const chat = scContext().chat || [];
    const assistant = Number.isInteger(messageId) ? chat[messageId] : [...chat].reverse().find(message => !message?.is_user && !message?.is_system && message?.mes);
    const index = Number.isInteger(messageId) ? messageId : chat.indexOf(assistant);
    const user = [...chat.slice(0, index >= 0 ? index : chat.length)].reverse().find(message => message?.is_user && !message?.is_system && message?.mes);
    return `${user?.mes || ''}\n${assistant?.mes || ''}`.replace(/<!--[\s\S]*?-->/g, ' ');
}

function scPrompt() {
    const current = scContext();
    if (typeof current.setExtensionPrompt !== 'function') return;
    const core = scCore();
    const active = Boolean(current.getCurrentChatId?.() && core?.accepted);
    const prompt = `<system_credit_isolation>
SYSTEM CREDIT IS A SEPARATE GAME CURRENCY. The core currency object belongs ONLY to System Credit and is permanently named "System Credit" with symbol "SC".
Never change currency.amount, currency.name, or currency.symbol for ordinary real-world or narrative money such as Won/KRW/₩, Dollar/USD/$, Baht/THB/฿, Yen/JPY/¥, Yuan/RMB, Euro/EUR/€, Pound/GBP/£, gold used as normal-world money, cash, bank balances, salary, wallet money, or purchases outside the System Shop.
Real-world money belongs to the role-play and may be tracked by other extensions such as Pocket Phone. This extension must not copy, convert, mirror, or add that money to System Credit.
Only update System Credit when the story explicitly identifies the value as System Credit/System Credits/SC, a System-issued credit reward or penalty, or a purchase/enhancement made through the System Shop.
Do not convert real currency into SC unless the role-play explicitly describes a System conversion mechanic and confirms the resulting System Credit amount.
</system_credit_isolation>`;
    current.setExtensionPrompt(SYSTEM_CREDIT_PROMPT_KEY, active ? prompt : '', 1, 1, false, 0);
}

async function scInitialize() {
    const current = scContext();
    if (!current.getCurrentChatId?.()) {
        scPrompt();
        return;
    }
    const hadLedger = Boolean(current.chatMetadata?.[SYSTEM_CREDIT_META_KEY]);
    const state = scState();
    if (!hadLedger) await scSave(state, 'initial-credit-migration');
    await scMirrorToCore(state, 'system-credit-initialization');
    scPrompt();
}

async function scReconcileAssistant(messageId) {
    if (scReconciling) return;
    scReconciling = true;
    try {
        await new Promise(resolve => setTimeout(resolve, 0));
        const current = scContext();
        const core = scCore();
        if (!current.getCurrentChatId?.() || !core?.accepted) return;
        const ledger = scState();
        const coreAmount = scNumber(core.currency?.amount, ledger.amount);
        if (scExplicitSystemEconomy(scLatestTranscript(messageId))) {
            ledger.amount = coreAmount;
            await scSave(ledger, 'confirmed-system-economy');
            await scMirrorToCore(ledger, 'confirmed-system-economy');
        } else {
            await scMirrorToCore(ledger, 'real-money-isolation');
        }
        scPrompt();
    } catch (error) {
        console.warn('[System Credit] Reconciliation skipped safely.', error);
    } finally {
        scReconciling = false;
    }
}

function scScheduleLocalAdoption(source) {
    clearTimeout(scLocalTimer);
    scLocalTimer = setTimeout(async () => {
        try {
            const core = scCore();
            if (!core?.accepted) return;
            const ledger = scState();
            ledger.amount = scNumber(core.currency?.amount, ledger.amount);
            await scSave(ledger, source);
            await scMirrorToCore(ledger, source);
            scPrompt();
        } catch (error) {
            console.warn('[System Credit] Local balance sync skipped safely.', error);
        }
    }, 180);
}

function scBindEvents() {
    const current = scContext();
    const source = current.eventSource;
    const types = current.eventTypes;
    if (source?.on && types) {
        if (types.CHAT_CHANGED) source.on(types.CHAT_CHANGED, () => void scInitialize());
        if (types.MESSAGE_SENT) source.on(types.MESSAGE_SENT, () => scPrompt());
        if (types.MESSAGE_RECEIVED) source.on(types.MESSAGE_RECEIVED, (...args) => void scReconcileAssistant(...args));
    }

    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-sl-buy]')) scScheduleLocalAdoption('system-shop-purchase');
        else if (target.closest('[data-slx-enhance]')) scScheduleLocalAdoption('system-enhancement');
    });

    document.addEventListener('submit', event => {
        if (event.target?.id === 'sl-admin-form') scScheduleLocalAdoption('administrator-credit-edit');
    });
}

async function scStart() {
    try {
        await scInitialize();
        scBindEvents();
        globalThis.TheSystemCredit = {
            state: scState,
            reconcile: scReconcileAssistant,
            version: '1.4.1',
        };
        console.info('[System Credit] Isolated System Credit ledger loaded.');
    } catch (error) {
        console.error('[System Credit] Initialization failed safely.', error);
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void scStart(), { once: true });
else void scStart();
