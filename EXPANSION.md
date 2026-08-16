# The System Expansion v1.4.0

This release adds the extended Solo Leveling RPG layer without replacing the stable 1.3.2 core renderer.

## Safety architecture

- `bootstrap.js` loads the existing core first, then the expansion modules.
- The expansion waits for `TheSystemExtension` to finish initializing before binding SillyTavern chat events.
- Extended state is stored under its own per-chat metadata key so the core normalizer cannot discard it.
- Extended AI tracking uses a second invisible patch **inside the same normal role-play reply**. It never invokes quiet generation or a separate provider request.
- Automatic Player unlock detection is local and bilingual (English/Thai). It never calls the model.
- All loops are bounded. The startup wait is capped, patch operations are capped, history/snapshots are capped, and UI mutation observation is disconnected during expansion-owned DOM writes.

## Added systems

- Context-sensitive automatic System unlock with Accept/Decline
- Mission categories: Ongoing / Completed / Failed / Daily Quest
- Automatic once-per-roleplay-day Daily Quest through Level 49
- Gate and Dungeon records
- Conditional Combat encounter tracking
- Persistent status effects with reply-based duration settlement
- Job/Class progression and advancement choices
- Skill evolution choices
- Official Hunter rank / re-evaluation tracking
- Equipment enhancement, affixes, set bonuses, and effective-stat calculation
- Title effects and local milestone achievements
- Quest chains and hidden-objective support
- Summon squads and command actions
- Bestiary
- System history
- Manual bounded snapshots and rollback
- Standard / Hardcore / Power balance profiles
- Crafting recipes and local material consumption
- Hunter and Guild roster records

## Daily Quest behavior

The extension looks at the **role-play scene day**, not the real-world date. When the core scene advances to a new day, one Daily Quest is created if the Player is below Level 50. The previous automatically-issued Daily Quest is marked Failed when a new role-play day begins and it was still Active.

At Level 50 and above, no new automatic Daily Quest is issued.
