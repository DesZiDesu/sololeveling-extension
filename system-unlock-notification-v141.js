// The System v1.4.1 — install the Player qualification renderer before
// expansion-ui.js / systems-expansion.js capture their expansion dependencies.
const R = globalThis.__SLX_SYSTEM_EXPANSION__;

if (R) {
    R.V = '1.4.1';
    R.unlockUI = function unlockWithSystemNotification(expansion) {
        if (expansion?.unlock?.status !== 'pending') return false;
        const localThai = expansion.unlock.language === 'th';
        const excerpt = String(expansion.unlock.excerpt || '').trim().slice(0, 340);
        const api = globalThis.TheSystemUiChannel;
        if (!api?.showDecision) return false;
        return api.showDecision({
            id: `unlock-${String(expansion.unlock.signature || 'pending').slice(0, 120)}`,
            mode: 'level',
            title: localThai ? 'ตรวจพบผู้มีคุณสมบัติเป็น Player' : 'PLAYER QUALIFICATION DETECTED',
            detail: localThai
                ? `${excerpt ? `${excerpt}\n\n` : ''}ตรวจพบเงื่อนไขที่เข้าเกณฑ์ Player ต้องการยอมรับการเชื่อมต่อกับ The System หรือไม่?`
                : `${excerpt ? `${excerpt}\n\n` : ''}A Player qualification condition has been detected. Accept connection to The System?`,
            acceptLabel: localThai ? 'ยอมรับ' : 'ACCEPT',
            declineLabel: localThai ? 'ปฏิเสธ' : 'DECLINE',
        }, {
            accept: () => R.accept?.(),
            decline: async () => {
                await R.decline?.();
                globalThis.TheSystemExtension?.notify?.(
                    'stat',
                    localThai ? 'ปฏิเสธการเชื่อมต่อแล้ว' : 'PLAYER DESIGNATION DECLINED',
                    localThai ? 'สามารถเปิด The System จากเมนู Wand ได้ภายหลัง' : 'The System can still be opened manually from the Wand menu later.',
                    { event: true },
                );
            },
        });
    };
}
