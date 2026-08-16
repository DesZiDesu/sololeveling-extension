/* global SillyTavern */

// The System v1.4.1 — UI-only System communication channel.
// Keeps System-originated information out of visible role-play prose and routes
// it through the extension's established notification language. No extra AI call.

const CORE_KEY = 'solo_leveling_system_state';
const CHANNEL_KEY = 'solo_leveling_system_ui_channel_v141';
const PROMPT_KEY = 'solo_leveling_system_ui_channel_prompt_v141';
const UI_PATTERN = /<!--\s*solo_system_ui\s*:\s*([\s\S]*?)\s*-->/gi;
const VERSION = '1.4.1';
const MAX_PROCESSED = 240;
const MODES = new Set(['level', 'reward', 'quest', 'skill', 'title', 'item', 'equipment', 'shop', 'danger', 'heal', 'mana', 'stat', 'scene']);

let initialized = false;
let promptTimer = null;
let messageTimer = null;
let processing = false;
let boundEvents = false;

const ctx = () => globalThis.SillyTavern?.getContext?.() || {};
const text = (value, fallback = '', max = 1000) => {
    const next = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    return (next || fallback).slice(0, max);
};
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const thai = value => /[\u0E00-\u0E7F]/.test(String(value || ''));

function channelState(create = true) {
    const context = ctx();
    if (!context?.chatMetadata) return null;
    if (create) context.chatMetadata[CHANNEL_KEY] ||= { version: 1, pendingDecision: null, processed: {} };
    const state = context.chatMetadata[CHANNEL_KEY];
    if (!state || typeof state !== 'object') return null;
    state.version = 1;
    state.pendingDecision = state.pendingDecision && typeof state.pendingDecision === 'object' ? state.pendingDecision : null;
    state.processed = state.processed && typeof state.processed === 'object' ? state.processed : {};
    return state;
}

function coreState() {
    try {
        if (globalThis.TheSystemExtension?.state) return globalThis.TheSystemExtension.state();
    } catch (error) {
        console.warn('[The System Channel] Could not read core state.', error);
    }
    return ctx()?.chatMetadata?.[CORE_KEY] || null;
}

async function saveMetadata() {
    try { await ctx().saveMetadata?.(); }
    catch (error) { console.warn('[The System Channel] Metadata save skipped safely.', error); }
}

async function saveChat() {
    const context = ctx();
    try {
        if (typeof context.saveChat === 'function') await context.saveChat();
        else if (typeof context.saveChatConditional === 'function') await context.saveChatConditional();
    } catch (error) {
        console.warn('[The System Channel] Chat cleanup save skipped safely.', error);
    }
}

function notify(mode, title, detail = '', destination = {}) {
    const safeMode = MODES.has(mode) ? mode : 'stat';
    try {
        globalThis.TheSystemExtension?.notify?.(safeMode, text(title, 'SYSTEM INFORMATION', 120), text(detail, '', 300), { event: true, ...destination });
    } catch (error) {
        console.warn('[The System Channel] Notification failed safely.', error);
    }
}

function notificationLabel(mode) {
    return ({
        level: 'LEVEL ALERT', reward: 'REWARD ALERT', quest: 'MISSION ALERT', skill: 'SKILL ALERT',
        title: 'TITLE ALERT', item: 'ITEM ALERT', equipment: 'EQUIPMENT ALERT', shop: 'SHOP ALERT',
        danger: 'DANGER ALERT', heal: 'RECOVERY ALERT', mana: 'MANA ALERT', stat: 'SYSTEM INFORMATION', scene: 'SCENE ALERT',
    })[mode] || 'SYSTEM INFORMATION';
}

function notificationIcon(mode) {
    return ({
        level: 'fa-arrow-up', reward: 'fa-gift', quest: 'fa-scroll', skill: 'fa-bolt', title: 'fa-crown',
        item: 'fa-box-open', equipment: 'fa-shield-halved', shop: 'fa-cart-shopping', danger: 'fa-triangle-exclamation',
        heal: 'fa-heart-pulse', mana: 'fa-droplet', stat: 'fa-circle-info', scene: 'fa-location-crosshairs',
    })[mode] || 'fa-circle-info';
}

function closeDecision() {
    document.getElementById('sl-system-decision-notice')?.remove();
}

function decisionMarkup(decision) {
    const mode = MODES.has(decision.mode) ? decision.mode : 'stat';
    const title = text(decision.title, 'SYSTEM DECISION', 120);
    const detail = text(decision.detail, 'Confirmation required.', 700);
    const acceptLabel = text(decision.acceptLabel, thai(`${title} ${detail}`) ? 'ยอมรับ' : 'ACCEPT', 60);
    const declineLabel = text(decision.declineLabel, thai(`${title} ${detail}`) ? 'ปฏิเสธ' : 'DECLINE', 60);
    return `<span class="sl-event-corner corner-a"></span><span class="sl-event-corner corner-b"></span><span class="sl-event-corner corner-c"></span><span class="sl-event-corner corner-d"></span>
        <header><span class="sl-event-brand"><b>SYS</b><span>DECISION RECORD</span></span><span class="sl-event-queue">01</span><i class="fa-solid fa-diamond sl-event-drag-icon"></i></header>
        <div class="sl-event-body"><span class="sl-event-alarm"><i class="fa-solid ${notificationIcon(mode)}"></i><b>${escapeHtml(notificationLabel(mode))}</b></span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small><em>${thai(`${title} ${detail}`) ? 'ต้องการคำยืนยันจากผู้เล่น' : 'PLAYER CONFIRMATION REQUIRED'}</em></div>
        <footer><button type="button" data-slc-decision="decline">${escapeHtml(declineLabel)}</button><button type="button" data-slc-decision="accept">${escapeHtml(acceptLabel)}</button></footer><span class="sl-event-scan"></span>`;
}

function showDecision(decision, handlers = {}) {
    if (!decision || typeof decision !== 'object') return false;
    closeDecision();
    document.getElementById('slx-unlock-notice')?.remove();
    const panel = document.createElement('aside');
    panel.id = 'sl-system-decision-notice';
    panel.className = 'sl-system-event-notice sl-system-decision-notice is-visible is-armed';
    panel.dataset.mode = MODES.has(decision.mode) ? decision.mode : 'stat';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-live', 'assertive');
    panel.setAttribute('aria-modal', 'false');
    panel.innerHTML = decisionMarkup(decision);
    panel.addEventListener('click', event => {
        const button = event.target.closest?.('[data-slc-decision]');
        if (!button) return;
        const choice = button.dataset.slcDecision;
        panel.querySelectorAll('button').forEach(item => { item.disabled = true; });
        const callback = choice === 'accept' ? handlers.accept : handlers.decline;
        Promise.resolve(callback?.())
            .catch(error => console.warn('[The System Channel] Decision action failed safely.', error))
            .finally(() => closeDecision());
    });
    document.body.appendChild(panel);
    return true;
}

function normalizeDecision(source = {}) {
    if (!source || typeof source !== 'object') return null;
    const title = text(source.title, '', 120);
    const detail = text(source.detail || source.message, '', 700);
    if (!title && !detail) return null;
    return {
        id: text(source.id, uid('decision'), 120),
        mode: MODES.has(source.mode) ? source.mode : 'stat',
        title: title || 'SYSTEM DECISION',
        detail,
        acceptLabel: text(source.acceptLabel, 'ACCEPT', 60),
        declineLabel: text(source.declineLabel, 'DECLINE', 60),
        actionType: text(source.actionType, 'system-decision', 100),
        acceptSummary: text(source.acceptSummary, `Accepted: ${title || detail}`, 300),
        declineSummary: text(source.declineSummary, `Declined: ${title || detail}`, 300),
        payload: source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload) ? source.payload : {},
    };
}

async function queueDecisionAction(decision, accepted) {
    const context = ctx();
    if (!context?.chatMetadata) return;
    const core = coreState();
    if (core && typeof core === 'object') {
        core.pendingActions = Array.isArray(core.pendingActions) ? core.pendingActions : [];
        core.pendingActions.push({
            id: uid('action'),
            type: decision.actionType || 'system-decision',
            summary: accepted ? decision.acceptSummary : decision.declineSummary,
            payload: { ...decision.payload, decisionId: decision.id, accepted },
            at: new Date().toISOString(),
        });
        core.pendingActions = core.pendingActions.slice(-30);
        context.chatMetadata[CORE_KEY] = core;
    }
    const state = channelState(true);
    if (state?.pendingDecision?.id === decision.id) state.pendingDecision = null;
    await saveMetadata();
    notify('stat', accepted ? 'DECISION ACCEPTED' : 'DECISION DECLINED', accepted ? decision.acceptSummary : decision.declineSummary);
}

function renderPendingDecision() {
    const state = channelState(false);
    const decision = normalizeDecision(state?.pendingDecision);
    if (!decision) return false;
    return showDecision(decision, {
        accept: () => queueDecisionAction(decision, true),
        decline: () => queueDecisionAction(decision, false),
    });
}

function renderUnlockDecision(expansion) {
    if (!expansion?.unlock || expansion.unlock.status !== 'pending') return false;
    const th = expansion.unlock.language === 'th';
    const excerpt = text(expansion.unlock.excerpt, '', 340);
    const detail = th
        ? `${excerpt ? `${excerpt}\n\n` : ''}ตรวจพบเงื่อนไขที่เข้าเกณฑ์ Player ต้องการยอมรับการเชื่อมต่อกับ The System หรือไม่?`
        : `${excerpt ? `${excerpt}\n\n` : ''}A Player qualification condition has been detected. Accept connection to The System?`;
    return showDecision({
        id: `unlock-${text(expansion.unlock.signature, 'pending', 120)}`,
        mode: 'level',
        title: th ? 'ตรวจพบผู้มีคุณสมบัติเป็น Player' : 'PLAYER QUALIFICATION DETECTED',
        detail,
        acceptLabel: th ? 'ยอมรับ' : 'ACCEPT',
        declineLabel: th ? 'ปฏิเสธ' : 'DECLINE',
    }, {
        accept: async () => {
            await globalThis.__SLX_SYSTEM_EXPANSION__?.accept?.();
        },
        decline: async () => {
            await globalThis.__SLX_SYSTEM_EXPANSION__?.decline?.();
            notify('stat', th ? 'ปฏิเสธการเชื่อมต่อแล้ว' : 'PLAYER DESIGNATION DECLINED', th ? 'สามารถเปิด The System จากเมนู Wand ได้ภายหลัง' : 'The System can still be opened manually from the Wand menu later.');
        },
    });
}

function buildPrompt() {
    const context = ctx();
    if (!context?.getCurrentChatId?.()) return '';
    const accepted = Boolean(coreState()?.accepted);
    return `<solo_leveling_system_ui_channel version="${VERSION}">
THE SYSTEM OWNS ITS OWN PRESENTATION UI.

VISIBLE ROLE-PLAY RULE — MANDATORY:
- Do NOT print System windows, status messages, stat readouts, warnings, mission notices, awakening notices, class/rank notices, rewards, recovery notices, or confirmations as visible prose.
- Prohibited visible formats include bracketed lines such as [System ...], [ระบบ ...], [Awakening Complete], [การปลุกพลัง...], [Class: ...], [คลาส: ...], [Rank: ...], [ระดับ: ...], [Warning: ...], [คำเตือน: ...], HP/MP/EXP/status dumps, and visible ACCEPT / DECLINE choices.
- The visible assistant reply must remain world narration and character dialogue only. Characters may naturally react to a System event, but do not quote or reproduce the System UI text in the prose.
- State changes belong in the existing invisible solo_system_patch and solo_system_expansion_patch comments. The extension renders their resulting notifications itself.
${accepted ? '- The Player is authorized. Continue using The System state/patch protocols normally.' : '- The Player is not yet authorized. Do not force acceptance or print a visible System onboarding window. The extension detects qualification locally and presents its own Accept/Decline notification.'}

EXTRA UI MESSAGE CHANNEL:
Only when The System needs to communicate information that is NOT already obvious from a canonical state change, append at most one additional invisible HTML comment after the normal state patches:
<!--solo_system_ui:{"notices":[{"mode":"stat","title":"SYSTEM INFORMATION","detail":"concise message"}],"decision":null}-->
Allowed notice modes: level,reward,quest,skill,title,item,equipment,shop,danger,heal,mana,stat,scene.
Do not duplicate a level/stat/item/quest/etc. notice when the normal state patch already causes the extension to announce that change.

If the Player must explicitly choose Accept/Decline or confirm/refuse a System action, never put the choice in visible prose. Use:
<!--solo_system_ui:{"notices":[],"decision":{"id":"stable-id","mode":"stat","title":"decision title","detail":"what the Player is deciding","acceptLabel":"ACCEPT","declineLabel":"DECLINE","actionType":"system-decision","acceptSummary":"what acceptance means","declineSummary":"what refusal means","payload":{}}}-->
The extension will show that decision using the same System notification UI and record the button result in pendingActions for the next normal reply.
Do not use this generic decision object for initial Player qualification; automatic qualification is handled locally by the extension.
Match Thai/English to the active role-play. Never put solo_system_ui inside Markdown fences.
</solo_leveling_system_ui_channel>`;
}

function updatePrompt() {
    promptTimer = null;
    try {
        const context = ctx();
        if (typeof context.setExtensionPrompt !== 'function') return;
        context.setExtensionPrompt(PROMPT_KEY, buildPrompt(), 1, 0, false, 0);
    } catch (error) {
        console.warn('[The System Channel] Prompt refresh failed safely.', error);
    }
}

function schedulePrompt(delay = 30) {
    clearTimeout(promptTimer);
    promptTimer = setTimeout(updatePrompt, delay);
}

function parseUiPayload(raw) {
    const notices = [];
    let decision = null;
    let found = false;
    UI_PATTERN.lastIndex = 0;
    const visible = String(raw || '').replace(UI_PATTERN, (_match, payload) => {
        found = true;
        try {
            const parsed = JSON.parse(payload);
            const list = Array.isArray(parsed?.notices) ? parsed.notices : [];
            for (const item of list.slice(0, 6)) {
                if (!item || typeof item !== 'object') continue;
                const title = text(item.title, '', 120);
                const detail = text(item.detail || item.message, '', 300);
                if (title || detail) notices.push({ mode: MODES.has(item.mode) ? item.mode : 'stat', title: title || 'SYSTEM INFORMATION', detail, destination: item.destination && typeof item.destination === 'object' ? item.destination : {} });
            }
            decision ||= normalizeDecision(parsed?.decision);
        } catch (error) {
            console.warn('[The System Channel] Invalid solo_system_ui payload ignored.', error);
        }
        return '';
    });
    return { visible: visible.trimEnd(), notices, decision, found };
}

const SYSTEM_LINE_START = /^(?:system\b|the\s+system\b|awakening\b|class\b|rank\b|level\b|warning\b|quest\b|mission\b|skill\b|title\b|status\b|player\b|job\b|recovery\b|reward\b|penalty\b|hp\b|mp\b|exp\b|ระบบ|การปลุกพลัง|ปลุกพลัง|คลาส|แรงก์|ระดับ|เลเวล|คำเตือน|ภารกิจ|สกิล|ฉายา|สถานะ|ผู้เล่น|อาชีพ|การฟื้นฟู|ฟื้นฟู|รางวัล|บทลงโทษ)/i;

function systemLineContent(line) {
    let value = String(line || '').trim();
    value = value.replace(/^>\s*/, '');
    const strong = value.match(/^(?:\*\*|__)([\s\S]*)(?:\*\*|__)$/);
    if (strong) value = strong[1].trim();
    const bracket = value.match(/^\[([\s\S]{1,500})\][.!。]?$/);
    if (bracket) {
        const content = bracket[1].trim();
        return SYSTEM_LINE_START.test(content) ? content : '';
    }
    const direct = value.match(/^(?:SYSTEM|THE SYSTEM|ระบบ)\s*[:：-]\s*(.+)$/i);
    return direct ? `${value.split(/[:：-]/, 1)[0]}: ${direct[1].trim()}` : '';
}

function stripPlainSystemText(raw) {
    const source = String(raw || '');
    const lines = source.split('\n');
    const removed = [];
    const kept = [];
    let collecting = null;

    for (const line of lines) {
        if (collecting) {
            collecting.push(line);
            if (line.includes(']')) {
                const joined = collecting.join('\n');
                const content = systemLineContent(joined);
                if (content) removed.push(content); else kept.push(...collecting);
                collecting = null;
            } else if (collecting.length >= 5) {
                kept.push(...collecting);
                collecting = null;
            }
            continue;
        }
        const trimmed = line.trim();
        if ((trimmed.startsWith('[') || trimmed.startsWith('**[') || trimmed.startsWith('__[')) && !trimmed.includes(']')) {
            collecting = [line];
            continue;
        }
        const content = systemLineContent(line);
        if (content) removed.push(content); else kept.push(line);
    }
    if (collecting) kept.push(...collecting);
    const visible = kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    return { visible, removed, changed: visible !== source.trimEnd() };
}

function removedNotice(lines) {
    if (!lines.length) return null;
    const detail = lines.map(item => text(item, '', 180)).filter(Boolean).join(' · ').slice(0, 300);
    const all = lines.join(' ');
    if (/warning|คำเตือน|penalty|บทลงโทษ/i.test(all)) return { mode: 'danger', title: thai(all) ? 'คำเตือนจากระบบ' : 'SYSTEM WARNING', detail };
    if (/recovery|heal|ฟื้นฟู/i.test(all)) return { mode: 'heal', title: thai(all) ? 'การฟื้นฟูจากระบบ' : 'RECOVERY PROTOCOL', detail };
    if (/awakening|ปลุกพลัง/i.test(all)) return { mode: 'level', title: thai(all) ? 'การปลุกพลังเสร็จสมบูรณ์' : 'AWAKENING COMPLETE', detail };
    if (/quest|mission|ภารกิจ/i.test(all)) return { mode: 'quest', title: thai(all) ? 'ข้อมูลภารกิจ' : 'MISSION INFORMATION', detail };
    if (/skill|สกิล/i.test(all)) return { mode: 'skill', title: thai(all) ? 'ข้อมูลสกิล' : 'SKILL INFORMATION', detail };
    if (/rank|level|class|status|ระดับ|แรงก์|เลเวล|คลาส|สถานะ/i.test(all)) return { mode: 'stat', title: thai(all) ? 'ข้อมูลผู้เล่นอัปเดต' : 'PLAYER RECORD UPDATED', detail };
    return { mode: 'stat', title: thai(all) ? 'ข้อมูลจากระบบ' : 'SYSTEM INFORMATION', detail };
}

function fingerprint(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return `${String(value || '').length}:${(hash >>> 0).toString(16)}`;
}

function markProcessed(messageId, source) {
    const state = channelState(true);
    if (!state) return;
    state.processed[String(messageId)] = fingerprint(source);
    const keys = Object.keys(state.processed);
    if (keys.length > MAX_PROCESSED) for (const key of keys.slice(0, keys.length - MAX_PROCESSED)) delete state.processed[key];
}

function wasProcessed(messageId, source) {
    return channelState(false)?.processed?.[String(messageId)] === fingerprint(source);
}

async function refreshMessage(messageId, message) {
    const context = ctx();
    try {
        if (typeof context.updateMessageBlock === 'function') context.updateMessageBlock(Number(messageId), message);
    } catch (error) {
        console.warn('[The System Channel] Message refresh skipped safely.', error);
    }
}

async function processMessage(messageId) {
    if (processing) return;
    const id = Number(messageId);
    const context = ctx();
    const message = context?.chat?.[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system || typeof message.mes !== 'string') return;
    const original = message.mes;
    if (wasProcessed(id, original)) return;
    processing = true;
    try {
        const ui = parseUiPayload(original);
        const plain = stripPlainSystemText(ui.visible);
        const visible = plain.visible;
        let changed = ui.found || plain.changed;

        if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && typeof message.swipes[message.swipe_id] === 'string') {
            const swipeUi = parseUiPayload(message.swipes[message.swipe_id]);
            const swipePlain = stripPlainSystemText(swipeUi.visible);
            if (swipeUi.found || swipePlain.changed) {
                message.swipes[message.swipe_id] = swipePlain.visible;
                changed = true;
            }
        }
        if (typeof message.extra?.display_text === 'string') {
            const displayUi = parseUiPayload(message.extra.display_text);
            const displayPlain = stripPlainSystemText(displayUi.visible);
            if (displayUi.found || displayPlain.changed) {
                message.extra.display_text = displayPlain.visible;
                changed = true;
            }
        }

        if (changed) {
            message.mes = visible;
            markProcessed(id, visible);
            await saveChat();
            await refreshMessage(id, message);
        } else {
            markProcessed(id, original);
        }

        for (const notice of ui.notices) notify(notice.mode, notice.title, notice.detail, notice.destination);
        const converted = removedNotice(plain.removed);
        if (converted) notify(converted.mode, converted.title, converted.detail);

        if (ui.decision) {
            const state = channelState(true);
            state.pendingDecision = ui.decision;
            await saveMetadata();
            renderPendingDecision();
        }
    } catch (error) {
        console.error('[The System Channel] Message processing failed safely.', error);
    } finally {
        processing = false;
    }
}

function scheduleMessage(messageId, delay = 180) {
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => void processMessage(messageId), delay);
}

function schedulePrompt(delay = 30) {
    clearTimeout(promptTimer);
    promptTimer = setTimeout(updatePrompt, delay);
}

function bindEvents() {
    if (boundEvents) return true;
    const context = ctx();
    const source = context?.eventSource;
    const types = context?.eventTypes || {};
    if (!source?.on) return false;
    boundEvents = true;
    if (types.CHAT_CHANGED) source.on(types.CHAT_CHANGED, () => {
        closeDecision();
        schedulePrompt(20);
        setTimeout(renderPendingDecision, 100);
    });
    if (types.MESSAGE_SENT) source.on(types.MESSAGE_SENT, () => schedulePrompt(20));
    if (types.MESSAGE_RECEIVED) source.on(types.MESSAGE_RECEIVED, id => {
        // Core + expansion consume their hidden patches first; this channel then
        // removes presentation directives/plain System text from the stored reply.
        scheduleMessage(id, 180);
        schedulePrompt(80);
    });
    if (types.MESSAGE_EDITED) source.on(types.MESSAGE_EDITED, id => scheduleMessage(id, 120));
    if (types.MESSAGE_SWIPED) source.on(types.MESSAGE_SWIPED, id => scheduleMessage(id, 120));
    return true;
}

function installUnlockRenderer() {
    const expansion = globalThis.__SLX_SYSTEM_EXPANSION__;
    if (!expansion) return false;
    expansion.unlockUI = renderUnlockDecision;
    return true;
}

async function initialize() {
    if (initialized) return;
    initialized = true;
    try {
        installUnlockRenderer();
        if (!bindEvents()) {
            for (let attempt = 0; attempt < 40 && !boundEvents; attempt += 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
                bindEvents();
            }
        }
        updatePrompt();
        setTimeout(renderPendingDecision, 80);
        globalThis.TheSystemUiChannel = Object.freeze({
            version: VERSION,
            refreshPrompt: updatePrompt,
            processMessage,
            showDecision,
            closeDecision,
        });
        console.info(`[The System Channel] v${VERSION} UI-only System communication active.`);
    } catch (error) {
        initialized = false;
        console.error('[The System Channel] Initialization failed safely.', error);
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void initialize(), { once: true });
else void initialize();
