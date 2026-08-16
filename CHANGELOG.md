# Changelog

All notable changes to **The System** SillyTavern extension are documented here.

## 1.4.0 — System Expansion

### Added — System Unlocking

- Added automatic Player-qualification detection from the main SillyTavern role-play before The System has been accepted.
- Added bilingual unlock detection for English and Thai role-play text.
- Added local recognition of severe/critical survival events such as near-death, fatal injury, critical condition, collapse, major blood loss, and similar story-confirmed qualification moments.
- Added a pending System unlock state so the same qualifying scene cannot repeatedly trigger the unlock sequence.
- Added a context-aware unlock notification that uses the current role-play scene/excerpt rather than a fixed generic message.
- Added explicit **Accept** and **Decline** interaction for automatic unlocks.
- Accepting the unlock authorizes the current chat as a Player record and opens The System immediately.
- Declining an automatic unlock does not force System usage; the normal wand-menu onboarding remains available.
- Automatic unlock detection is local and does not create an additional AI/API generation.

### Added — Mission Organization

- Reorganized the Missions interface into clear filters/categories:
  - Ongoing
  - Completed
  - Failed
  - Daily Quest
- Added category counts and filtering so completed/failed missions no longer crowd active objectives.
- Preserved the existing detailed mission dossier, independent objective progress, reward selection, deadlines, and penalties.

### Added — Automatic Daily Quest Protocol

- Added one automatic Daily Quest for each new **role-play day** while the Player is below Level 50.
- Role-play day detection uses canonical scene/day tracking rather than the device's real-world date.
- Added persistent per-day issuance tracking so re-rendering, reopening the interface, or repeated chat events cannot create duplicate Daily Quests for the same RP day.
- Added automatic failure handling for an unfinished auto-generated Daily Quest when the story advances to a new role-play day.
- Automatic Daily Quest generation stops once Player Level 50 is reached.
- Added standard daily training objectives for push-ups, sit-ups, squats, and running.
- Added guaranteed EXP and exactly three locally constructed reward choices for automatic daily missions.
- Daily reward strength scales with Player level and the active balance profile.
- Daily Quest creation is local and does not use a separate AI/API request.

### Added — Gate and Dungeon System

- Added persistent Gate records with rank, location, status, danger/state information, and role-play tracking support.
- Added Dungeon records for active/known dungeon environments, progression, clearing state, and related story data.
- Added support for cleared-dungeon detection used by achievements and history.
- Expanded the normal role-play state patch instructions so Gate/Dungeon changes can be recorded alongside the rest of The System state in the same assistant reply.

### Added — Combat Encounter System

- Added persistent combat encounter state.
- Added enemy tracking for active encounters.
- Added support for enemy HP/MP, rank/level, abilities, status, targeting, boss state, and multi-phase encounter data.
- Added conditional Combat UI behavior so the combat module is only shown when encounter/status information exists instead of permanently occupying the interface.
- Combat changes are tracked through the normal consolidated role-play response rather than a dedicated generation call.

### Added — Status Effect Engine

- Added persistent positive, negative, and neutral status effects.
- Status effects can store name, source, description, stack count, removability, mechanical effects, and remaining reply duration.
- Added reply-based local duration settlement for effects with `remainingReplies`.
- Effects automatically deactivate when their local duration reaches zero.
- Added history records when temporary effects expire.

### Added — Job / Class Advancement

- Added expanded Job state with Job level, Job EXP, Job EXP requirement, description, and available advancement paths.
- Added support for story-driven class/job evolution and advancement requirements.
- Job progression is now separate from the basic Player level field.

### Added — Skill Evolution

- Added persistent skill-evolution records.
- Added support for evolved skills, branching upgrades, prerequisites, and story-confirmed advancement paths.
- Preserved existing skill level, mastery, voice command, Summoning, and Buff behavior.

### Added — Hunter Rank Evaluation

- Added official Hunter evaluation data separate from Player/System level.
- Added rank evaluation state including current official rank, mana score, evaluation date, eligibility, and special designation.
- Supports re-evaluation and special classifications without forcing Hunter rank to follow System level automatically.

### Added — Equipment Enhancement and Derived Stats

- Added equipment enhancement records without replacing the existing equipment/inventory system.
- Added support for enhancement levels, affixes, and item-specific progression metadata.
- Added equipment set records and set-bonus support.
- Added derived/effective stat calculation support so extended modifiers can be represented without permanently overwriting the Player's canonical base stats.
- Existing equip/unequip mechanics remain handled by the stable core.

### Added — Titles and Achievements

- Added title-effect records so titles can carry gameplay effects rather than being display-only metadata.
- Added achievements with unlock timestamps and reward metadata.
- Added built-in milestone achievements for level progression, dungeon clearing, summon-army size, and skill mastery.
- Added automatic achievement notifications and System history entries.

### Added — Quest Chains

- Added quest-chain state for linked missions, chapters, branches, and hidden-objective progression.
- Added support for longer progression arcs without replacing existing individual mission records.

### Added — Summon Squads and Commands

- Added summon squad records for organizing larger Shadow/Summon armies.
- Added squad/command metadata support for deployment groups and army-management behavior.
- Existing individual summon HP, MP, stats, level, condition, storage/deployment, and permanent dismissal behavior remains intact.

### Added — Bestiary

- Added persistent Bestiary records for encountered monsters and bosses.
- Supports species/rank information, discovered abilities, weaknesses/resistances, drops, encounters, and kill/defeat progression when provided by the story patch.

### Added — System History and Snapshots

- Added a bounded System event history for important changes such as level changes, rank changes, HP/MP changes, acquired skills/items/titles/summons, mission state changes, achievements, effect expiration, and Daily Quest events.
- Added bounded snapshots to support recovery/rollback-oriented workflows without allowing unlimited metadata growth.
- History and snapshots are capped to avoid uncontrolled per-chat storage expansion.

### Added — Balance Profiles

- Added extended balance configuration with a default `standard` profile.
- Added configurable EXP growth, stat points per level, reward multiplier, and enhancement-cost multiplier support.
- Added local adjustment support so non-standard balance rules can coexist with the stable core progression behavior.

### Added — Crafting

- Added crafting state and recipe records.
- Added support for materials, recipe requirements, and story-driven crafted outputs.
- Crafting data remains part of the expansion state and does not require its own generation pipeline.

### Added — Hunter and Guild Records

- Added persistent Hunter records for important role-play characters.
- Added Guild records for organizations, membership, status, and related world information.
- These records are optional world-state modules and do not replace the core Player interface.

### Changed — State and Generation Architecture

- Upgraded the extension manifest from **1.3.2** to **1.4.0**.
- Replaced the manifest entry point from direct `index.js` loading to `bootstrap.js`.
- `bootstrap.js` loads the existing stable core first, then loads expansion modules in dependency order:
  1. `index.js`
  2. `expansion-foundation.js`
  3. `expansion-engine.js`
  4. `expansion-ui.js`
  5. `systems-expansion.js`
- The original `index.js` core is intentionally preserved rather than rewritten wholesale.
- Added a separate per-chat expansion metadata namespace so extended v1.4.0 records do not collide with or get discarded by the existing core normalizer.
- Added a separate expansion prompt/patch namespace while preserving the original `solo_system_patch` behavior.
- Extended systems are designed to be returned in the same normal assistant response using `solo_system_expansion_patch` rather than issuing one request per subsystem.
- Automatic unlock detection, Daily Quest generation, status-duration ticking, achievement checks, history capture, and other deterministic mechanics run locally.

### Changed — UI Integration

- Added expansion UI components without replacing the existing core panels.
- Added mission-category controls for easier navigation.
- Added conditional extended modules to reduce permanent interface clutter.
- Added responsive expansion styling through `styles/expansion.css` and imported it from the existing stylesheet entry point.
- Extended UI writes are isolated from the core renderer where possible.

### Changed — Reliability and Loop Protection

- Added guarded expansion event handlers so expansion failures are isolated from the original System core.
- Added bounded startup polling instead of indefinite initialization polling.
- Added maximum expansion patch operation limits.
- Added bounded collection sizes for expansion records, history, snapshots, Bestiary, and other potentially long-running state.
- Added stable normalization/defaults for all expansion state.
- Added render signatures to avoid unnecessary repeated extended UI rendering.
- Added MutationObserver protection: the expansion observer disconnects while expansion-owned DOM updates are applied and reconnects afterward, preventing observer feedback/render loops.
- Added local one-per-day Daily Quest signatures to prevent repeated mission creation from duplicate SillyTavern events.
- Added one-time pending unlock signatures/status to prevent repeated unlock notifications from the same scene.
- Expansion modules do not call `generateQuietPrompt`, preventing the new features from creating recursive/secondary generation chains.
- Existing Smart Fallback behavior from the 1.3.2 core is preserved and was not silently rewritten.

### Compatibility

- Existing Player state, missions, skills, summons, inventory, equipment, shop, scene tracking, notifications, launcher modes, Buff MP drain, reward claiming, stat allocation, and other 1.3.2 core behavior are retained.
- Existing saved core state remains readable because expanded data is stored separately.
- The wand-menu manual onboarding remains available even with automatic unlocking enabled.
- English and Thai role-play input are supported for the new automatic unlock behavior and Daily Quest presentation.

### Validation

- `node --check` passed for all new JavaScript modules:
  - `bootstrap.js`
  - `expansion-foundation.js`
  - `expansion-engine.js`
  - `expansion-ui.js`
  - `systems-expansion.js`
- Runtime smoke validation passed for:
  - English automatic unlock detection
  - Thai automatic unlock detection
  - Daily Quest construction
  - four Daily Quest objectives
  - exactly three Daily Quest reward choices
  - expansion patch parsing/upsert behavior
- Expansion CSS passed structural brace-balance validation.
- The repository currently has no GitHub Actions workflow, so there was no repository CI job to execute for this release.
