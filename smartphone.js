const PHONE_DB = 'the-system-media';
const PHONE_DB_VERSION = 1;
const MUSIC_STORE = 'music';

const phoneRuntime = { api: null, root: null, view: 'home', selectedContact: '', selectedThread: '', activeCall: null, audio: null, audioUrl: '', tracks: [] };

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const phoneState = () => phoneRuntime.api.getState().phone;

function openMediaDb() {
    return new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) return reject(new Error('Local media storage is unavailable in this browser.'));
        const request = indexedDB.open(PHONE_DB, PHONE_DB_VERSION);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(MUSIC_STORE)) request.result.createObjectStore(MUSIC_STORE, { keyPath: 'id' }); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
}

async function mediaStore(mode, callback) {
    const db = await openMediaDb();
    return new Promise((resolve, reject) => { const tx = db.transaction(MUSIC_STORE, mode); const store = tx.objectStore(MUSIC_STORE); let result; try { result = callback(store); } catch (error) { reject(error); return; } tx.oncomplete = () => { db.close(); resolve(result); }; tx.onerror = () => { db.close(); reject(tx.error); }; });
}

async function listTracks() {
    try {
        const db = await openMediaDb(); const records = await new Promise((resolve, reject) => { const tx = db.transaction(MUSIC_STORE, 'readonly'); const request = tx.objectStore(MUSIC_STORE).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); tx.oncomplete = () => db.close(); });
        const chatId = phoneRuntime.api.getChatId(); phoneRuntime.tracks = records.filter(track => track.scope === 'global' || track.chatId === chatId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch { phoneRuntime.tracks = []; }
    return phoneRuntime.tracks;
}

async function saveTrack(file, scope) {
    if (!file?.type?.startsWith('audio/')) throw new Error('Choose an audio file.');
    if (file.size > 100 * 1024 * 1024) throw new Error('Audio files must be 100 MB or smaller.');
    scope = scope === 'global' ? 'global' : 'chat';
    const record = { id: id('track'), name: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, type: file.type, size: file.size, blob: file, scope, chatId: scope === 'chat' ? phoneRuntime.api.getChatId() : '', createdAt: now() };
    await mediaStore('readwrite', store => store.put(record)); await listTracks(); return record;
}

async function deleteTrack(trackId) { await mediaStore('readwrite', store => store.delete(trackId)); if (phoneRuntime.audio?.dataset.trackId === trackId) stopTrack(); await listTracks(); }

function playTrack(trackId) {
    const track = phoneRuntime.tracks.find(entry => entry.id === trackId); if (!track) return;
    stopTrack(); phoneRuntime.audioUrl = URL.createObjectURL(track.blob); phoneRuntime.audio = new Audio(phoneRuntime.audioUrl); phoneRuntime.audio.dataset.trackId = track.id; phoneRuntime.audio.play().catch(() => {}); phoneRuntime.audio.onended = stopTrack; render();
}
function stopTrack() { const wasOpen = phoneRuntime.root?.classList.contains('is-open'); phoneRuntime.audio?.pause(); phoneRuntime.audio = null; if (phoneRuntime.audioUrl) URL.revokeObjectURL(phoneRuntime.audioUrl); phoneRuntime.audioUrl = ''; if (wasOpen) render(); }

function avatar(contact) { return contact?.image ? `<span class="sl-phone-avatar has-image" style="--avatar:url('${contact.image}')"></span>` : `<span class="sl-phone-avatar"><i class="fa-solid fa-user"></i></span>`; }
function contactName(contact) { return contact?.nickname || contact?.name || 'Unknown'; }
function contactById(contactId) { return phoneState().contacts.find(contact => contact.id === contactId); }
function threadTitle(thread) { if (thread.title) return thread.title; return thread.participants.map(value => contactName(contactById(value))).filter(Boolean).join(', ') || 'Conversation'; }

function shell(content, title = 'Home') {
    const state = phoneState(); const profile = state.profile; const background = profile.background ? `style="--phone-wallpaper:url('${profile.background}')"` : '';
    return `<section class="sl-phone-device" data-model="${esc(profile.model)}" data-island="${esc(profile.islandStyle)}" ${background}><div class="sl-phone-hardware"><i></i><i></i><i></i></div><div class="sl-phone-screen"><header class="sl-phone-status"><span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><b class="sl-phone-dynamic-island"><i class="fa-solid fa-wave-square"></i><em>${esc(title)}</em></b><span><i class="fa-solid fa-signal"></i> <i class="fa-solid fa-wifi"></i> <i class="fa-solid fa-battery-three-quarters"></i></span></header><main>${content}</main><nav class="sl-phone-dock"><button data-phone-view="home"><i class="fa-solid fa-house"></i></button><button data-phone-view="contacts"><i class="fa-solid fa-address-book"></i></button><button data-phone-view="messages"><i class="fa-solid fa-comment-dots"></i></button><button data-phone-view="music"><i class="fa-solid fa-music"></i></button><button data-phone-close><i class="fa-solid fa-xmark"></i></button></nav></div></section>`;
}

function homeView() {
    const state = phoneState(); const apps = [
        ['contacts', 'fa-address-book', 'Contacts'], ['messages', 'fa-comment-dots', 'Messages'], ['calls', 'fa-phone', 'Phone'], ['music', 'fa-music', 'Music'], ['stickers', 'fa-note-sticky', 'Stickers'], ['settings', 'fa-gear', 'Settings'],
    ];
    return shell(`<section class="sl-phone-home"><header>${state.profile.image ? `<span class="sl-phone-owner-photo" style="--owner:url('${state.profile.image}')"></span>` : '<span class="sl-phone-owner-photo"><i class="fa-solid fa-user"></i></span>'}<div><small>WELCOME BACK</small><h2>${esc(state.profile.name)}</h2><p>${esc(state.profile.phoneNumber || 'Number not configured')}</p></div></header><div class="sl-phone-app-grid">${apps.map(([view, icon, label]) => `<button data-phone-view="${view}"><span><i class="fa-solid ${icon}"></i></span><b>${label}</b></button>`).join('')}</div><footer><span>${state.contacts.length} CONTACTS</span><span>${state.threads.filter(thread => thread.unread).reduce((sum, thread) => sum + thread.unread, 0)} UNREAD</span></footer></section>`, 'SMARTPHONE');
}

function contactsView() {
    const state = phoneState(); const selected = contactById(phoneRuntime.selectedContact);
    const editor = selected ? `<form class="sl-phone-form" data-phone-contact-form><input type="hidden" name="id" value="${esc(selected.id)}"><label>Name<input name="name" value="${esc(selected.name)}" required></label><label>Nickname<input name="nickname" value="${esc(selected.nickname)}"></label><label>Phone number<input name="phoneNumber" value="${esc(selected.phoneNumber)}"></label><label>Description<textarea name="description">${esc(selected.description)}</textarea></label><div><button type="submit">SAVE</button><button type="button" data-phone-contact-block="${esc(selected.id)}">${selected.blocked ? 'UNBLOCK' : 'BLOCK'}</button><button type="button" data-phone-contact-delete="${esc(selected.id)}">DELETE</button></div></form>` : `<form class="sl-phone-form" data-phone-contact-form><label>Name<input name="name" required placeholder="NPC name"></label><label>Nickname<input name="nickname" placeholder="Optional nickname"></label><label>Phone number<input name="phoneNumber" placeholder="AI can assign one later"></label><label>Description<textarea name="description" placeholder="Relationship or notes"></textarea></label><button type="submit">ADD CONTACT</button></form>`;
    return shell(`<section class="sl-phone-app"><header><button data-phone-view="home"><i class="fa-solid fa-chevron-left"></i></button><div><small>DIRECTORY</small><h2>Contacts</h2></div><button data-phone-new-contact><i class="fa-solid fa-user-plus"></i></button></header><div class="sl-phone-split"><div class="sl-phone-list">${state.contacts.map(contact => `<button data-phone-contact="${esc(contact.id)}" class="${contact.id === phoneRuntime.selectedContact ? 'is-active' : ''}">${avatar(contact)}<span><b>${esc(contactName(contact))}</b><small>${esc(contact.phoneNumber || contact.name)}${contact.blocked ? ' · BLOCKED' : ''}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join('') || '<p class="sl-phone-empty">No contacts yet. Add an NPC manually or let the role-play register one.</p>'}</div><div class="sl-phone-detail">${editor}${selected ? `<div class="sl-phone-contact-actions"><button data-phone-message-contact="${esc(selected.id)}"><i class="fa-solid fa-message"></i> MESSAGE</button><button data-phone-call-contact="${esc(selected.id)}" ${selected.blocked ? 'disabled' : ''}><i class="fa-solid fa-phone"></i> CALL</button></div>` : ''}</div></div></section>`, 'CONTACTS');
}

function messagesView() {
    const state = phoneState(); const sorted = values => [...values].sort((a, b) => Number(b.pinned) - Number(a.pinned)); const threads = sorted(state.threads.filter(thread => !thread.archived)); const archived = sorted(state.threads.filter(thread => thread.archived)); const thread = state.threads.find(entry => entry.id === phoneRuntime.selectedThread);
    if (thread) return threadView(thread);
    const rows = values => values.map(entry => { const last = entry.messages.at(-1); return `<button data-phone-thread="${esc(entry.id)}"><span class="sl-phone-thread-icon"><i class="fa-solid ${entry.group ? 'fa-user-group' : 'fa-user'}"></i></span><span><b>${esc(threadTitle(entry))}${entry.pinned ? ' · PINNED' : ''}</b><small>${esc(last?.text || (last?.stickerId ? 'Sticker' : 'No messages'))}</small></span>${entry.unread ? `<em>${entry.unread}</em>` : ''}</button>`; }).join('');
    return shell(`<section class="sl-phone-app"><header><button data-phone-view="home"><i class="fa-solid fa-chevron-left"></i></button><div><small>CONNECTED CHAT</small><h2>Messages</h2></div><button data-phone-new-group><i class="fa-solid fa-people-group"></i></button></header><div class="sl-phone-thread-list">${rows(threads) || '<p class="sl-phone-empty">No conversations yet. Open a contact to start one.</p>'}${archived.length ? `<details class="sl-phone-archive"><summary>ARCHIVED · ${archived.length}</summary>${rows(archived)}</details>` : ''}</div><form class="sl-phone-group-form" data-phone-group-form hidden><input name="title" placeholder="Group name" required><div>${state.contacts.map(contact => `<label><input type="checkbox" name="participant" value="${esc(contact.id)}"> ${esc(contactName(contact))}</label>`).join('')}</div><button type="submit">CREATE GROUP</button></form></section>`, 'MESSAGES');
}

function threadView(thread) {
    const state = phoneState(); const stickers = state.stickers;
    return shell(`<section class="sl-phone-chat"><header><button data-phone-back-threads><i class="fa-solid fa-chevron-left"></i></button><div><b>${esc(threadTitle(thread))}</b><small>${thread.group ? `${thread.participants.length} MEMBERS` : 'CONTACT'}</small></div><button data-phone-thread-options><i class="fa-solid fa-ellipsis"></i></button></header><div class="sl-phone-thread-controls" hidden><button data-phone-thread-pin="${esc(thread.id)}"><i class="fa-solid fa-thumbtack"></i> ${thread.pinned ? 'UNPIN' : 'PIN'}</button><button data-phone-thread-archive="${esc(thread.id)}"><i class="fa-solid fa-box-archive"></i> ${thread.archived ? 'UNARCHIVE' : 'ARCHIVE'}</button></div><div class="sl-phone-bubbles">${thread.messages.map(message => `<article class="${message.senderId === 'user' ? 'is-user' : 'is-npc'}">${message.stickerId ? `<img src="${esc(stickers.find(sticker => sticker.id === message.stickerId)?.image || '')}" alt="Sticker">` : `<p>${esc(message.text)}</p>`}<small>${message.senderId === 'user' ? 'YOU' : esc(contactName(contactById(message.senderId)))} · ${new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></article>`).join('') || '<p class="sl-phone-empty">Start the conversation. Queued messages use no API until the next normal reply or Generate now.</p>'}</div><div class="sl-phone-sticker-strip" hidden>${stickers.map(sticker => `<button data-phone-send-sticker="${esc(sticker.id)}"><img src="${esc(sticker.image)}" alt="${esc(sticker.name)}"></button>`).join('') || '<small>Add stickers in the Stickers app.</small>'}</div><form class="sl-phone-composer" data-phone-message-form><button type="button" data-phone-toggle-stickers><i class="fa-solid fa-face-smile"></i></button><textarea name="message" placeholder="Type messages; Enter queues without generation"></textarea><button type="submit" name="queue"><i class="fa-solid fa-plus"></i></button><button type="button" data-phone-generate><i class="fa-solid fa-wand-magic-sparkles"></i></button></form><footer><small>ENTER = QUEUE · WAND = GENERATE NOW</small></footer></section>`, threadTitle(thread));
}

function callsView() {
    const state = phoneState(); const contact = contactById(phoneRuntime.selectedContact);
    if (phoneRuntime.activeCall && contact) return callView(contact);
    return shell(`<section class="sl-phone-app"><header><button data-phone-view="home"><i class="fa-solid fa-chevron-left"></i></button><div><small>VOICE NETWORK</small><h2>Phone</h2></div><i></i></header><div class="sl-phone-call-list"><h3>CONTACTS</h3>${state.contacts.filter(entry => !entry.blocked).map(entry => `<button data-phone-call-contact="${esc(entry.id)}">${avatar(entry)}<span><b>${esc(contactName(entry))}</b><small>${esc(entry.phoneNumber || 'No number')}</small></span><i class="fa-solid fa-phone"></i></button>`).join('') || '<p class="sl-phone-empty">No callable contacts.</p>'}<h3>RECENT</h3>${[...state.callLogs].reverse().slice(0, 20).map(log => `<article><i class="fa-solid ${log.direction === 'incoming' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i><span><b>${esc(contactName(contactById(log.contactId)))}</b><small>${esc(log.status)} · ${new Date(log.startedAt).toLocaleString()}</small></span></article>`).join('')}</div></section>`, 'PHONE');
}

function callView(contact) {
    const call = phoneRuntime.activeCall;
    return shell(`<section class="sl-phone-call-screen"><header>${avatar(contact)}<small>${esc(call.status.toUpperCase())}</small><h2>${esc(contactName(contact))}</h2><p>${esc(contact.phoneNumber || 'Unknown number')}</p></header><div class="sl-phone-call-transcript">${call.transcript.map(line => `<p class="${line.senderId === 'user' ? 'is-user' : ''}"><b>${line.senderId === 'user' ? 'YOU' : esc(contactName(contact))}</b>${esc(line.text)}</p>`).join('') || '<p class="sl-phone-empty">Waiting for the call to connect. Queue everything you want to say, then confirm once.</p>'}</div><div class="sl-phone-call-tools"><button class="is-toggle"><i class="fa-solid fa-microphone-slash"></i><small>MUTE</small></button><button class="is-toggle"><i class="fa-solid fa-volume-high"></i><small>SPEAKER</small></button><button data-phone-end-call><i class="fa-solid fa-phone-slash"></i><small>END</small></button></div><form class="sl-phone-call-composer" data-phone-call-form><textarea name="line" placeholder="Add spoken lines to this call batch"></textarea><button type="submit">ADD</button><button type="button" data-phone-call-generate>CONFIRM & CALL</button></form></section>`, 'CALL');
}

function musicView() {
    const playing = phoneRuntime.audio?.dataset.trackId;
    return shell(`<section class="sl-phone-app"><header><button data-phone-view="home"><i class="fa-solid fa-chevron-left"></i></button><div><small>LOCAL AUDIO</small><h2>Music</h2></div><i></i></header><form class="sl-phone-music-upload" data-phone-music-form><input type="file" name="file" accept="audio/*" required><select name="scope"><option value="chat">This chat only</option><option value="global">Global library</option></select><button type="submit">ADD TRACK</button></form><div class="sl-phone-track-list">${phoneRuntime.tracks.map(track => `<article><span><i class="fa-solid fa-music"></i></span><div><b>${esc(track.name)}</b><small>${track.scope.toUpperCase()} · ${(track.size / 1048576).toFixed(1)} MB</small></div><button data-phone-track="${esc(track.id)}"><i class="fa-solid ${playing === track.id ? 'fa-stop' : 'fa-play'}"></i></button><button data-phone-track-delete="${esc(track.id)}"><i class="fa-solid fa-trash"></i></button></article>`).join('') || '<p class="sl-phone-empty">Add audio files from this app or the extension drawer. Files stay in this browser.</p>'}</div></section>`, 'MUSIC');
}

function stickersView() {
    const state = phoneState();
    return shell(`<section class="sl-phone-app"><header><button data-phone-view="home"><i class="fa-solid fa-chevron-left"></i></button><div><small>REACTION LIBRARY</small><h2>Stickers</h2></div><i></i></header><form class="sl-phone-sticker-upload" data-phone-sticker-form><input type="file" name="file" accept="image/*" required><input name="name" placeholder="Sticker name"><button type="submit">ADD</button></form><div class="sl-phone-sticker-grid">${state.stickers.map(sticker => `<article><img src="${esc(sticker.image)}" alt="${esc(sticker.name)}"><small>${esc(sticker.name)}</small><button data-phone-sticker-delete="${esc(sticker.id)}"><i class="fa-solid fa-xmark"></i></button></article>`).join('') || '<p class="sl-phone-empty">Upload stickers here, then send them from any phone conversation.</p>'}</div></section>`, 'STICKERS');
}

function settingsView() {
    const state = phoneState(); const profile = state.profile;
    return shell(`<section class="sl-phone-app"><header><button data-phone-view="home"><i class="fa-solid fa-chevron-left"></i></button><div><small>DEVICE CONTROL</small><h2>Settings</h2></div><i></i></header><form class="sl-phone-settings" data-phone-settings-form><section><h3>YOUR PHONE PROFILE</h3><label>Name<input name="name" value="${esc(profile.name)}"></label><label>Phone number<input name="phoneNumber" value="${esc(profile.phoneNumber)}"></label><label>Profile photo<input type="file" name="profileImage" accept="image/*"></label><label>Wallpaper<input type="file" name="background" accept="image/*"></label></section><section><h3>DEVICE STYLE</h3><label>Phone series<select name="model"><option value="iphone" ${profile.model === 'iphone' ? 'selected' : ''}>iPhone inspired</option><option value="galaxy" ${profile.model === 'galaxy' ? 'selected' : ''}>Galaxy inspired</option><option value="pixel" ${profile.model === 'pixel' ? 'selected' : ''}>Pixel inspired</option><option value="classic" ${profile.model === 'classic' ? 'selected' : ''}>Classic smartphone</option></select></label><label>Dynamic Island<select name="islandStyle"><option value="modern" ${profile.islandStyle === 'modern' ? 'selected' : ''}>Modern</option><option value="pill" ${profile.islandStyle === 'pill' ? 'selected' : ''}>Wide pill</option><option value="compact" ${profile.islandStyle === 'compact' ? 'selected' : ''}>Compact</option><option value="none" ${profile.islandStyle === 'none' ? 'selected' : ''}>Hidden</option></select></label></section><section><h3>NPC PERMISSIONS</h3><label class="sl-phone-switch"><input type="checkbox" name="allowNpcCalls" ${state.allowNpcCalls ? 'checked' : ''}><span>NPCs may call when the story justifies it</span></label><label class="sl-phone-switch"><input type="checkbox" name="allowNpcMessages" ${state.allowNpcMessages ? 'checked' : ''}><span>NPCs may message when the story justifies it</span></label></section><button type="submit">SAVE PHONE SETTINGS</button></form></section>`, 'SETTINGS');
}

function render() {
    if (!phoneRuntime.root) return;
    const views = { home: homeView, contacts: contactsView, messages: messagesView, calls: callsView, music: musicView, stickers: stickersView, settings: settingsView };
    phoneRuntime.root.innerHTML = `<button class="sl-phone-backdrop" type="button" data-phone-close></button>${(views[phoneRuntime.view] || homeView)()}`;
    phoneRuntime.root.classList.add('is-open'); phoneRuntime.root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { const bubbles = phoneRuntime.root.querySelector('.sl-phone-bubbles,.sl-phone-call-transcript'); if (bubbles) bubbles.scrollTop = bubbles.scrollHeight; });
}

async function persist(mutator, source = 'phone-ui', detect = false) { const state = phoneRuntime.api.getState(); mutator(state.phone, state); await phoneRuntime.api.persistState(state, source, { detect }); render(); }
function findOrCreateThread(phone, participants, title = '') { let thread = phone.threads.find(entry => entry.participants.length === participants.length && participants.every(value => entry.participants.includes(value))); if (!thread) { thread = { id: id('thread'), title, participants, group: participants.length > 1, pinned: false, archived: false, unread: 0, messages: [] }; phone.threads.push(thread); } return thread; }

async function queueMessage(text = '', stickerId = '') {
    const threadId = phoneRuntime.selectedThread; if (!threadId || (!text.trim() && !stickerId)) return;
    await persist((phone, state) => { const thread = phone.threads.find(entry => entry.id === threadId); if (!thread) return; const message = { id: id('message'), senderId: 'user', text: text.trim(), stickerId, at: now(), status: 'queued' }; thread.messages.push(message); phoneRuntime.api.queueAction(state, 'phone-message', `Phone message queued for ${threadTitle(thread)}`, { threadId, participants: thread.participants, message }); }, 'phone-message-queued');
}

async function generateThreadReply() {
    const state = phoneRuntime.api.getState(); const thread = state.phone.threads.find(entry => entry.id === phoneRuntime.selectedThread); if (!thread) return;
    const contacts = thread.participants.map(contactById).filter(Boolean); const response = await phoneRuntime.api.generateQuiet(`Reply as the NPC contact or group members to the queued smartphone messages. Stay in character and use the role-play language. Return only JSON {"messages":[{"senderId":"exact-contact-id","text":"reply"}]}. Contacts: ${JSON.stringify(contacts.map(({ image, ...contact }) => contact))}. Recent phone messages: ${JSON.stringify(thread.messages.slice(-20))}. Main role-play context: ${JSON.stringify(phoneRuntime.api.latestChat().slice(-4))}`, 1200);
    const parsed = phoneRuntime.api.parseModelJson(response); const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
    await persist((phone, fullState) => { const live = phone.threads.find(entry => entry.id === thread.id); for (const message of messages) if (live.participants.includes(message.senderId) && String(message.text || '').trim()) live.messages.push({ id: id('message'), senderId: message.senderId, text: String(message.text).trim().slice(0, 2000), stickerId: '', at: now(), status: 'received' }); fullState.pendingActions = fullState.pendingActions.filter(action => !(action.type === 'phone-message' && action.payload?.threadId === thread.id)); }, 'phone-generated-reply');
}

async function startCall(contactId) { phoneRuntime.selectedContact = contactId; phoneRuntime.activeCall = { id: id('call'), contactId, direction: 'outgoing', status: 'dialing', startedAt: now(), transcript: [] }; phoneRuntime.view = 'calls'; render(); }
async function finishCall(status = 'ended') { const call = phoneRuntime.activeCall; if (!call) return; await persist(phone => { phone.callLogs.push({ ...call, status, endedAt: now() }); }, 'phone-call-ended'); phoneRuntime.activeCall = null; phoneRuntime.view = 'calls'; render(); }
async function generateCall() {
    const call = phoneRuntime.activeCall; const contact = contactById(call?.contactId); if (!call || !contact) return;
    const response = await phoneRuntime.api.generateQuiet(`Resolve this in-world phone call as ${contact.name}. Decide answered, declined, or missed based on current role-play context, then reply to all queued spoken lines if answered. Return only JSON {"status":"answered|declined|missed","replies":["..."]}. Contact: ${JSON.stringify({ ...contact, image: '' })}. User lines: ${JSON.stringify(call.transcript.filter(line => line.senderId === 'user'))}. Recent main chat: ${JSON.stringify(phoneRuntime.api.latestChat().slice(-4))}`, 1400);
    const parsed = phoneRuntime.api.parseModelJson(response) || {}; call.status = ['answered', 'declined', 'missed'].includes(parsed.status) ? parsed.status : 'answered'; if (call.status === 'answered') for (const text of Array.isArray(parsed.replies) ? parsed.replies : []) call.transcript.push({ senderId: contact.id, text: String(text).slice(0, 2000), at: now() }); render();
}

function readFile(file, maxBytes = 1500000) { return new Promise((resolve, reject) => { if (!file) return resolve(''); if (!file.type.startsWith('image/') || file.size > maxBytes) return reject(new Error(`Image must be under ${(maxBytes / 1000000).toFixed(1)} MB.`)); const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }

async function handleSubmit(event) {
    const form = event.target; event.preventDefault(); const data = new FormData(form);
    if (form.matches('[data-phone-contact-form]')) await persist(phone => { const contact = { id: data.get('id') || id('contact'), name: String(data.get('name') || '').trim(), nickname: String(data.get('nickname') || '').trim(), phoneNumber: String(data.get('phoneNumber') || '').trim(), description: String(data.get('description') || '').trim() }; const index = phone.contacts.findIndex(entry => entry.id === contact.id); if (index >= 0) phone.contacts[index] = { ...phone.contacts[index], ...contact }; else phone.contacts.push({ ...contact, blocked: false, favorite: false, createdAt: now() }); phoneRuntime.selectedContact = contact.id; }, 'phone-contact-save');
    if (form.matches('[data-phone-group-form]')) { const participants = data.getAll('participant').map(String); if (participants.length < 2) return; await persist(phone => { const thread = findOrCreateThread(phone, participants, String(data.get('title') || 'Group')); phoneRuntime.selectedThread = thread.id; }, 'phone-group-create'); phoneRuntime.view = 'messages'; }
    if (form.matches('[data-phone-message-form]')) { await queueMessage(String(data.get('message') || '')); form.reset(); }
    if (form.matches('[data-phone-call-form]')) { const line = String(data.get('line') || '').trim(); if (line && phoneRuntime.activeCall) phoneRuntime.activeCall.transcript.push({ senderId: 'user', text: line, at: now() }); render(); }
    if (form.matches('[data-phone-music-form]')) { await saveTrack(data.get('file'), String(data.get('scope'))); render(); }
    if (form.matches('[data-phone-sticker-form]')) { const image = await readFile(data.get('file'), 1000000); await persist(phone => phone.stickers.push({ id: id('sticker'), name: String(data.get('name') || data.get('file')?.name || 'Sticker').slice(0, 80), image }), 'phone-sticker-add'); }
    if (form.matches('[data-phone-settings-form]')) { const profileImage = await readFile(data.get('profileImage')); const background = await readFile(data.get('background'), 2500000); await persist(phone => { phone.profile.name = String(data.get('name') || 'Player').slice(0, 100); phone.profile.phoneNumber = String(data.get('phoneNumber') || '').slice(0, 40); phone.profile.model = String(data.get('model')); phone.profile.islandStyle = String(data.get('islandStyle')); if (profileImage) phone.profile.image = profileImage; if (background) phone.profile.background = background; phone.allowNpcCalls = data.has('allowNpcCalls'); phone.allowNpcMessages = data.has('allowNpcMessages'); }, 'phone-settings-save'); }
}

async function handleClick(event) {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.phoneClose !== undefined) return close();
    if (button.dataset.phoneView) { phoneRuntime.view = button.dataset.phoneView; phoneRuntime.selectedThread = ''; phoneRuntime.activeCall = null; if (phoneRuntime.view === 'music') await listTracks(); return render(); }
    if (button.dataset.phoneNewContact !== undefined) { phoneRuntime.selectedContact = ''; return render(); }
    if (button.dataset.phoneContact) { phoneRuntime.selectedContact = button.dataset.phoneContact; return render(); }
    if (button.dataset.phoneContactBlock) return persist(phone => { const contact = phone.contacts.find(entry => entry.id === button.dataset.phoneContactBlock); if (contact) contact.blocked = !contact.blocked; }, 'phone-contact-block');
    if (button.dataset.phoneContactDelete) return persist(phone => { phone.contacts = phone.contacts.filter(entry => entry.id !== button.dataset.phoneContactDelete); phone.threads = phone.threads.filter(thread => !thread.participants.includes(button.dataset.phoneContactDelete)); phoneRuntime.selectedContact = ''; }, 'phone-contact-delete');
    if (button.dataset.phoneMessageContact) return persist(phone => { const thread = findOrCreateThread(phone, [button.dataset.phoneMessageContact]); phoneRuntime.selectedThread = thread.id; phoneRuntime.view = 'messages'; }, 'phone-thread-open');
    if (button.dataset.phoneCallContact) return startCall(button.dataset.phoneCallContact);
    if (button.dataset.phoneThread) { phoneRuntime.selectedThread = button.dataset.phoneThread; await persist(phone => { const thread = phone.threads.find(entry => entry.id === button.dataset.phoneThread); if (thread) thread.unread = 0; }, 'phone-thread-read'); phoneRuntime.view = 'messages'; return render(); }
    if (button.dataset.phoneBackThreads !== undefined) { phoneRuntime.selectedThread = ''; return render(); }
    if (button.dataset.phoneNewGroup !== undefined) { const form = phoneRuntime.root.querySelector('[data-phone-group-form]'); if (form) form.hidden = !form.hidden; return; }
    if (button.dataset.phoneThreadOptions !== undefined) { const controls = phoneRuntime.root.querySelector('.sl-phone-thread-controls'); if (controls) controls.hidden = !controls.hidden; return; }
    if (button.dataset.phoneThreadPin) return persist(phone => { const thread = phone.threads.find(entry => entry.id === button.dataset.phoneThreadPin); if (thread) thread.pinned = !thread.pinned; }, 'phone-thread-pin');
    if (button.dataset.phoneThreadArchive) return persist(phone => { const thread = phone.threads.find(entry => entry.id === button.dataset.phoneThreadArchive); if (thread) thread.archived = !thread.archived; }, 'phone-thread-archive');
    if (button.dataset.phoneToggleStickers !== undefined) { const strip = phoneRuntime.root.querySelector('.sl-phone-sticker-strip'); if (strip) strip.hidden = !strip.hidden; return; }
    if (button.dataset.phoneSendSticker) return queueMessage('', button.dataset.phoneSendSticker);
    if (button.dataset.phoneGenerate !== undefined) return generateThreadReply();
    if (button.dataset.phoneEndCall !== undefined) return finishCall('ended');
    if (button.dataset.phoneCallGenerate !== undefined) return generateCall();
    if (button.dataset.phoneTrack) return phoneRuntime.audio?.dataset.trackId === button.dataset.phoneTrack ? stopTrack() : playTrack(button.dataset.phoneTrack);
    if (button.dataset.phoneTrackDelete) { await deleteTrack(button.dataset.phoneTrackDelete); return render(); }
    if (button.dataset.phoneStickerDelete) return persist(phone => { phone.stickers = phone.stickers.filter(sticker => sticker.id !== button.dataset.phoneStickerDelete); }, 'phone-sticker-delete');
    if (button.classList.contains('is-toggle')) button.classList.toggle('is-active');
}

function build() {
    if (phoneRuntime.root) return; const root = document.createElement('div'); root.id = 'sl-phone-overlay'; root.className = 'sl-phone-overlay'; root.setAttribute('aria-hidden', 'true'); root.addEventListener('click', event => { handleClick(event).catch(error => phoneRuntime.api.notify('error', 'Phone action failed', error.message)); }); root.addEventListener('submit', event => { handleSubmit(event).catch(error => phoneRuntime.api.notify('error', 'Phone action failed', error.message)); }); root.addEventListener('keydown', event => { if (event.target.matches('[data-phone-message-form] textarea') && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.target.form.requestSubmit(); } }); document.body.appendChild(root); phoneRuntime.root = root;
}

async function open(view = 'home') { build(); phoneRuntime.view = view; phoneRuntime.selectedThread = ''; await listTracks(); render(); document.body.classList.add('sl-phone-open'); }
function close() { if (!phoneRuntime.root) return; phoneRuntime.root.classList.remove('is-open'); phoneRuntime.root.setAttribute('aria-hidden', 'true'); document.body.classList.remove('sl-phone-open'); }

export function initializePhone(api) { phoneRuntime.api = api; build(); globalThis.TheSystemPhone = { open, close, refresh: () => { if (phoneRuntime.root?.classList.contains('is-open')) render(); }, addMusic: saveTrack, music: () => open('music'), settings: () => open('settings'), contacts: () => open('contacts') }; return globalThis.TheSystemPhone; }
