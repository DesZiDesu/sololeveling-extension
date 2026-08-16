/* global SillyTavern */

// The System v1.4.1 — UI-only System communication channel.
// System-originated messages stay out of visible role-play prose and are routed
// through the extension's established notification UI. No extra AI generation.

const CORE_KEY = 'solo_leveling_system_state';
const CHANNEL_KEY = 'solo_leveling_system_ui_channel_v141';
const PROMPT_KEY = 'solo_leveling_system_ui_channel_prompt_v141';
const UI_RE = /<!--\s*solo_system_ui\s*:\s*([\s\S]*?)\s*-->/gi;
const VERSION = '1.4.1';
const MODES = new Set(['level','reward','quest','skill','title','item','equipment','shop','danger','heal','mana','stat','scene']);
const MAX_PROCESSED = 240;
const SYSTEM_START = /^(?:system\b|the\s+system\b|awakening\b|class\b|rank\b|level\b|warning\b|quest\b|mission\b|skill\b|title\b|status\b|player\b|job\b|recovery\b|reward\b|penalty\b|hp\b|mp\b|exp\b|ระบบ|การปลุกพลัง|ปลุกพลัง|คลาส|แรงก์|ระดับ|เลเวล|คำเตือน|ภารกิจ|สกิล|ฉายา|สถานะ|ผู้เล่น|อาชีพ|การฟื้นฟู|ฟื้นฟู|รางวัล|บทลงโทษ)/i;

let initialized = false;
let eventsBound = false;
let promptTimer = null;
let messageTimer = null;
let processing = false;

const context = () => globalThis.SillyTavern?.getContext?.() || {};
const txt = (value, fallback = '', max = 1000) => {
    const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    return (raw || fallback).slice(0, max);
};
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const th = value => /[\u0E00-\u0E7F]/.test(String(value || ''));
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

function channelState(create = true) {
    const c = context();
    if (!c.getCurrentChatId?.()) return null;
    c.chatMetadata ||= {};
    if (create) c.chatMetadata[CHANNEL_KEY] ||= { version: 1, pendingDecision: null, processed: {} };
    const state = c.chatMetadata[CHANNEL_KEY];
    if (!state || typeof state !== 'object') return null;
    state.version = 1;
    state.pendingDecision = state.pendingDecision && typeof state.pendingDecision === 'object' ? state.pendingDecision : null;
    state.processed = state.processed && typeof state.processed === 'object' ? state.processed : {};
    return state;
}

function coreState() {
    try { if (globalThis.TheSystemExtension?.state) return globalThis.TheSystemExtension.state(); }
    catch (error) { console.warn('[The System Channel] Core state read failed safely.', error); }
    return context().chatMetadata?.[CORE_KEY] || null;
}

async function persistMetadata() {
    try { await context().saveMetadata?.(); }
    catch (error) { console.warn('[The System Channel] Metadata save skipped safely.', error); }
}

async function persistChat() {
    const c = context();
    try {
        if (typeof c.saveChat === 'function') await c.saveChat();
        else if (typeof c.saveChatConditional === 'function') await c.saveChatConditional();
    } catch (error) { console.warn('[The System Channel] Chat cleanup save skipped safely.', error); }
}

function notify(mode, title, detail = '', destination = {}) {
    try {
        globalThis.TheSystemExtension?.notify?.(
            MODES.has(mode) ? mode : 'stat',
            txt(title, 'SYSTEM INFORMATION', 120),
            txt(detail, '', 300),
            { event: true, ...destination },
        );
    } catch (error) { console.warn('[The System Channel] Notification failed safely.', error); }
}

const labelFor = mode => ({level:'LEVEL ALERT',reward:'REWARD ALERT',quest:'MISSION ALERT',skill:'SKILL ALERT',title:'TITLE ALERT',item:'ITEM ALERT',equipment:'EQUIPMENT ALERT',shop:'SHOP ALERT',danger:'DANGER ALERT',heal:'RECOVERY ALERT',mana:'MANA ALERT',stat:'SYSTEM INFORMATION',scene:'SCENE ALERT'})[mode] || 'SYSTEM INFORMATION';
const iconFor = mode => ({level:'fa-arrow-up',reward:'fa-gift',quest:'fa-scroll',skill:'fa-bolt',title:'fa-crown',item:'fa-box-open',equipment:'fa-shield-halved',shop:'fa-cart-shopping',danger:'fa-triangle-exclamation',heal:'fa-heart-pulse',mana:'fa-droplet',stat:'fa-circle-info',scene:'fa-location-crosshairs'})[mode] || 'fa-circle-info';

function closeDecision() { document.getElementById('sl-system-decision-notice')?.remove(); }

function normalizeDecision(source = {}) {
    if (!source || typeof source !== 'object') return null;
    const title = txt(source.title, '', 120), detail = txt(source.detail || source.message, '', 700);
    if (!title && !detail) return null;
    return {
        id: txt(source.id, uid('decision'), 120), mode: MODES.has(source.mode) ? source.mode : 'stat',
        title: title || 'SYSTEM DECISION', detail,
        acceptLabel: txt(source.acceptLabel, 'ACCEPT', 60), declineLabel: txt(source.declineLabel, 'DECLINE', 60),
        actionType: txt(source.actionType, 'system-decision', 100),
        acceptSummary: txt(source.acceptSummary, `Accepted: ${title || detail}`, 300),
        declineSummary: txt(source.declineSummary, `Declined: ${title || detail}`, 300),
        payload: source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload) ? source.payload : {},
    };
}

function showDecision(source, handlers = {}) {
    const d = normalizeDecision(source);
    if (!d) return false;
    closeDecision();
    document.getElementById('slx-unlock-notice')?.remove();
    const localThai = th(`${d.title} ${d.detail}`);
    const panel = document.createElement('aside');
    panel.id = 'sl-system-decision-notice';
    panel.className = 'sl-system-event-notice sl-system-decision-notice is-visible is-armed';
    panel.dataset.mode = d.mode;
    panel.setAttribute('role','alertdialog');
    panel.setAttribute('aria-live','assertive');
    panel.innerHTML = `<span class="sl-event-corner corner-a"></span><span class="sl-event-corner corner-b"></span><span class="sl-event-corner corner-c"></span><span class="sl-event-corner corner-d"></span>
<header><span class="sl-event-brand"><b>SYS</b><span>DECISION RECORD</span></span><span class="sl-event-queue">01</span><i class="fa-solid fa-diamond sl-event-drag-icon"></i></header>
<div class="sl-event-body"><span class="sl-event-alarm"><i class="fa-solid ${iconFor(d.mode)}"></i><b>${esc(labelFor(d.mode))}</b></span><strong>${esc(d.title)}</strong><small>${esc(d.detail)}</small><em>${localThai ? 'ต้องการคำยืนยันจากผู้เล่น' : 'PLAYER CONFIRMATION REQUIRED'}</em></div>
<footer><button type="button" data-slc-decision="decline">${esc(d.declineLabel || (localThai ? 'ปฏิเสธ' : 'DECLINE'))}</button><button type="button" data-slc-decision="accept">${esc(d.acceptLabel || (localThai ? 'ยอมรับ' : 'ACCEPT'))}</button></footer><span class="sl-event-scan"></span>`;
    panel.addEventListener('click', event => {
        const button = event.target.closest?.('[data-slc-decision]');
        if (!button) return;
        panel.querySelectorAll('button').forEach(item => { item.disabled = true; });
        const callback = button.dataset.slcDecision === 'accept' ? handlers.accept : handlers.decline;
        Promise.resolve(callback?.()).catch(error => console.warn('[The System Channel] Decision action failed safely.', error)).finally(closeDecision);
    });
    document.body.appendChild(panel);
    return true;
}

async function recordDecision(d, accepted) {
    const c = context(), core = coreState();
    if (core && c.getCurrentChatId?.()) {
        c.chatMetadata ||= {};
        core.pendingActions = Array.isArray(core.pendingActions) ? core.pendingActions : [];
        core.pendingActions.push({ id: uid('action'), type: d.actionType, summary: accepted ? d.acceptSummary : d.declineSummary, payload: { ...d.payload, decisionId: d.id, accepted }, at: new Date().toISOString() });
        core.pendingActions = core.pendingActions.slice(-30);
        c.chatMetadata[CORE_KEY] = core;
    }
    const state = channelState(true);
    if (state?.pendingDecision?.id === d.id) state.pendingDecision = null;
    await persistMetadata();
    notify('stat', accepted ? 'DECISION ACCEPTED' : 'DECISION DECLINED', accepted ? d.acceptSummary : d.declineSummary);
}

function renderPendingDecision() {
    const d = normalizeDecision(channelState(false)?.pendingDecision);
    if (!d) return false;
    return showDecision(d, { accept: () => recordDecision(d,true), decline: () => recordDecision(d,false) });
}

function renderUnlockDecision(expansion) {
    if (expansion?.unlock?.status !== 'pending') return false;
    const localThai = expansion.unlock.language === 'th';
    const excerpt = txt(expansion.unlock.excerpt,'',340);
    return showDecision({
        id: `unlock-${txt(expansion.unlock.signature,'pending',120)}`, mode:'level',
        title: localThai ? 'ตรวจพบผู้มีคุณสมบัติเป็น Player' : 'PLAYER QUALIFICATION DETECTED',
        detail: localThai
            ? `${excerpt ? `${excerpt}\n\n` : ''}ตรวจพบเงื่อนไขที่เข้าเกณฑ์ Player ต้องการยอมรับการเชื่อมต่อกับ The System หรือไม่?`
            : `${excerpt ? `${excerpt}\n\n` : ''}A Player qualification condition has been detected. Accept connection to The System?`,
        acceptLabel: localThai ? 'ยอมรับ' : 'ACCEPT', declineLabel: localThai ? 'ปฏิเสธ' : 'DECLINE',
    }, {
        accept: () => globalThis.__SLX_SYSTEM_EXPANSION__?.accept?.(),
        decline: async () => {
            await globalThis.__SLX_SYSTEM_EXPANSION__?.decline?.();
            notify('stat', localThai ? 'ปฏิเสธการเชื่อมต่อแล้ว' : 'PLAYER DESIGNATION DECLINED', localThai ? 'สามารถเปิด The System จากเมนู Wand ได้ภายหลัง' : 'The System can still be opened manually from the Wand menu later.');
        },
    });
}

function buildPrompt() {
    const c = context();
    if (!c.getCurrentChatId?.()) return '';
    const accepted = Boolean(coreState()?.accepted);
    return `<solo_leveling_system_ui_channel version="${VERSION}">
THE SYSTEM OWNS ITS OWN PRESENTATION UI.
VISIBLE ROLE-PLAY RULE — MANDATORY:
- Never print System windows, status messages, stat readouts, warnings, mission notices, awakening notices, class/rank notices, rewards, recovery notices, confirmations, or ACCEPT/DECLINE choices as visible prose.
- This includes visible bracket lines such as [System ...], [ระบบ ...], [Awakening Complete], [การปลุกพลัง...], [Class: ...], [คลาส: ...], [Rank: ...], [ระดับ: ...], [Warning: ...], [คำเตือน: ...], HP/MP/EXP/status dumps, and similar System text.
- Visible output is world narration and character dialogue only. Characters may react naturally to a System event, but do not quote or duplicate the System UI message in prose.
- Canonical changes belong in the existing invisible solo_system_patch and solo_system_expansion_patch comments. The extension renders change notifications itself.
${accepted ? '- The Player is authorized; use the normal System state protocols.' : '- The Player is not yet authorized. Do not force acceptance or print onboarding text. Qualification and Accept/Decline are rendered locally by the extension.'}
EXTRA UI CHANNEL:
Only for System information that is not already represented by a canonical state change, append at most one invisible comment:
<!--solo_system_ui:{"notices":[{"mode":"stat","title":"SYSTEM INFORMATION","detail":"concise message"}],"decision":null}-->
Allowed notice modes: level,reward,quest,skill,title,item,equipment,shop,danger,heal,mana,stat,scene. Do not duplicate notifications already caused by state patches.
If the Player must explicitly confirm/refuse a System action, never print choices in visible prose. Use:
<!--solo_system_ui:{"notices":[],"decision":{"id":"stable-id","mode":"stat","title":"decision title","detail":"what the Player is deciding","acceptLabel":"ACCEPT","declineLabel":"DECLINE","actionType":"system-decision","acceptSummary":"what acceptance means","declineSummary":"what refusal means","payload":{}}}-->
The extension displays the decision with its normal notification UI and writes the selected result into pendingActions. Initial Player qualification is handled locally; do not create a generic decision for it.
Match Thai/English to the role-play. Never use Markdown fences for these hidden comments.
</solo_leveling_system_ui_channel>`;
}

function updatePrompt() {
    promptTimer = null;
    try { if (typeof context().setExtensionPrompt === 'function') context().setExtensionPrompt(PROMPT_KEY, buildPrompt(), 1, 0, false, 0); }
    catch (error) { console.warn('[The System Channel] Prompt refresh failed safely.', error); }
}
function schedulePrompt(delay=30){ clearTimeout(promptTimer); promptTimer=setTimeout(updatePrompt,delay); }

function parseUi(raw) {
    const notices=[]; let decision=null, found=false;
    UI_RE.lastIndex=0;
    const visible=String(raw||'').replace(UI_RE,(_all,payload)=>{
        found=true;
        try {
            const parsed=JSON.parse(payload);
            for(const item of (Array.isArray(parsed?.notices)?parsed.notices:[]).slice(0,6)){
                if(!item||typeof item!=='object')continue;
                const title=txt(item.title,'',120), detail=txt(item.detail||item.message,'',300);
                if(title||detail)notices.push({mode:MODES.has(item.mode)?item.mode:'stat',title:title||'SYSTEM INFORMATION',detail,destination:item.destination&&typeof item.destination==='object'?item.destination:{}});
            }
            decision ||= normalizeDecision(parsed?.decision);
        } catch(error){ console.warn('[The System Channel] Invalid solo_system_ui payload ignored.',error); }
        return '';
    });
    return {visible:visible.trimEnd(),notices,decision,found};
}

function systemLine(line) {
    let value=String(line||'').trim().replace(/^>\s*/,'');
    if((value.startsWith('**')&&value.endsWith('**'))||(value.startsWith('__')&&value.endsWith('__')))value=value.slice(2,-2).trim();
    const bracket=value.match(/^\[([\s\S]{1,500})\][.!。]?$/);
    if(bracket){const inside=bracket[1].trim();return SYSTEM_START.test(inside)?inside:'';}
    const direct=value.match(/^(?:SYSTEM|THE SYSTEM|ระบบ)\s*[:：-]\s*(.+)$/i);
    return direct?value:'';
}

function stripPlainSystem(raw) {
    const source=String(raw||''), removed=[], kept=[]; let collecting=null;
    for(const line of source.split('\n')){
        if(collecting){collecting.push(line);if(line.includes(']')){const joined=collecting.join('\n'), hit=systemLine(joined);hit?removed.push(hit):kept.push(...collecting);collecting=null;}else if(collecting.length>=5){kept.push(...collecting);collecting=null;}continue;}
        const trimmed=line.trim();
        if((trimmed.startsWith('[')||trimmed.startsWith('**[')||trimmed.startsWith('__['))&&!trimmed.includes(']')){collecting=[line];continue;}
        const hit=systemLine(line);hit?removed.push(hit):kept.push(line);
    }
    if(collecting)kept.push(...collecting);
    const visible=kept.join('\n').replace(/\n{3,}/g,'\n\n').trimEnd();
    return {visible,removed,changed:visible!==source.trimEnd()};
}

function convertedNotice(lines) {
    if(!lines.length)return null;
    const all=lines.join(' '), detail=lines.map(v=>txt(v,'',180)).filter(Boolean).join(' · ').slice(0,300);
    if(/warning|คำเตือน|penalty|บทลงโทษ/i.test(all))return{mode:'danger',title:th(all)?'คำเตือนจากระบบ':'SYSTEM WARNING',detail};
    if(/recovery|heal|ฟื้นฟู/i.test(all))return{mode:'heal',title:th(all)?'การฟื้นฟูจากระบบ':'RECOVERY PROTOCOL',detail};
    if(/awakening|ปลุกพลัง/i.test(all))return{mode:'level',title:th(all)?'การปลุกพลังเสร็จสมบูรณ์':'AWAKENING COMPLETE',detail};
    if(/quest|mission|ภารกิจ/i.test(all))return{mode:'quest',title:th(all)?'ข้อมูลภารกิจ':'MISSION INFORMATION',detail};
    if(/skill|สกิล/i.test(all))return{mode:'skill',title:th(all)?'ข้อมูลสกิล':'SKILL INFORMATION',detail};
    return{mode:'stat',title:th(all)?'ข้อมูลผู้เล่นอัปเดต':'PLAYER RECORD UPDATED',detail};
}

function fingerprint(value){let h=2166136261;for(const c of String(value||'')){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return`${String(value||'').length}:${(h>>>0).toString(16)}`;}
function wasProcessed(id,raw){return channelState(false)?.processed?.[String(id)]===fingerprint(raw);}
function markProcessed(id,raw){const state=channelState(true);if(!state)return;state.processed[String(id)]=fingerprint(raw);const keys=Object.keys(state.processed);if(keys.length>MAX_PROCESSED)for(const key of keys.slice(0,keys.length-MAX_PROCESSED))delete state.processed[key];}

async function processMessage(messageId) {
    if(processing)return;
    const id=Number(messageId), c=context(), message=c.chat?.[id];
    if(!Number.isInteger(id)||!message||message.is_user||message.is_system||typeof message.mes!=='string')return;
    const original=message.mes;if(wasProcessed(id,original))return;processing=true;
    try{
        const ui=parseUi(original), plain=stripPlainSystem(ui.visible);let changed=ui.found||plain.changed;
        if(Array.isArray(message.swipes)&&Number.isInteger(message.swipe_id)&&typeof message.swipes[message.swipe_id]==='string'){
            const a=parseUi(message.swipes[message.swipe_id]), b=stripPlainSystem(a.visible);if(a.found||b.changed){message.swipes[message.swipe_id]=b.visible;changed=true;}
        }
        if(typeof message.extra?.display_text==='string'){
            const a=parseUi(message.extra.display_text), b=stripPlainSystem(a.visible);if(a.found||b.changed){message.extra.display_text=b.visible;changed=true;}
        }
        if(changed){message.mes=plain.visible;markProcessed(id,plain.visible);await persistChat();try{c.updateMessageBlock?.(id,message);}catch{}}
        else markProcessed(id,original);
        for(const n of ui.notices)notify(n.mode,n.title,n.detail,n.destination);
        const converted=convertedNotice(plain.removed);if(converted)notify(converted.mode,converted.title,converted.detail);
        if(ui.decision){const state=channelState(true);if(state){state.pendingDecision=ui.decision;await persistMetadata();renderPendingDecision();}}
    }catch(error){console.error('[The System Channel] Message processing failed safely.',error);}finally{processing=false;}
}
function scheduleMessage(id,delay=180){clearTimeout(messageTimer);messageTimer=setTimeout(()=>void processMessage(id),delay);}

function bindEvents(){
    if(eventsBound)return true;const c=context(),e=c.eventSource,t=c.eventTypes||{};if(!e?.on)return false;eventsBound=true;
    if(t.CHAT_CHANGED)e.on(t.CHAT_CHANGED,()=>{closeDecision();schedulePrompt(20);setTimeout(renderPendingDecision,100);});
    if(t.MESSAGE_SENT)e.on(t.MESSAGE_SENT,()=>schedulePrompt(20));
    if(t.MESSAGE_RECEIVED)e.on(t.MESSAGE_RECEIVED,id=>{scheduleMessage(id,180);schedulePrompt(80);});
    if(t.MESSAGE_EDITED)e.on(t.MESSAGE_EDITED,id=>scheduleMessage(id,120));
    if(t.MESSAGE_SWIPED)e.on(t.MESSAGE_SWIPED,id=>scheduleMessage(id,120));
    return true;
}

async function initialize(){
    if(initialized)return;initialized=true;
    try{
        if(globalThis.__SLX_SYSTEM_EXPANSION__)globalThis.__SLX_SYSTEM_EXPANSION__.unlockUI=renderUnlockDecision;
        if(!bindEvents())for(let i=0;i<40&&!eventsBound;i++){await new Promise(r=>setTimeout(r,50));bindEvents();}
        updatePrompt();setTimeout(renderPendingDecision,80);
        globalThis.TheSystemUiChannel=Object.freeze({version:VERSION,refreshPrompt:updatePrompt,processMessage,showDecision,closeDecision});
        console.info(`[The System Channel] v${VERSION} UI-only System communication active.`);
    }catch(error){initialized=false;console.error('[The System Channel] Initialization failed safely.',error);}
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void initialize(),{once:true});else void initialize();
