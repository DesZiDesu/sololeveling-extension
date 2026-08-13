# The System

The System is a Solo Leveling-inspired persistent role-play interface for SillyTavern.

## Current build

Version 1.2.1 anchors pending actions in the empty top-left header area as an opaque, high-contrast status badge, keeping queued actions readable above the animated background on mobile and PC. It builds on the configurable holographic void shell introduced in v1.2.0.

- Background style can be Animated Void, Static Dark, or Transparent Glass. Interface, background, and particle colors remain independently configurable.
- The side launcher is rebuilt as a compact angular holographic access rail with energy traces instead of the previous half-circle/orbit panel.
- Missions now use stable compact cards with wrapping titles and isolated status chips in English and Thai.
- Every missing reward pool is filled locally as soon as a mission is normalized, so completed missions always have three choices without making another model/API call.

- The first per-chat record uses the active SillyTavern user persona as the Player name, while Administrator Mode can still override it later.
- Status and Scene use narrow record headers, compact labeled fields, segmented meters, and restrained bronze hierarchy with far fewer decorative icons or SVGs.
- Summon records expose HP and MP directly in the registry. Every unit now has its own user-selectable portrait; the fallback seal uses the first letter of species, race, or name plus the unit rank.
- Equipment is now an informative loadout ledger with slot state, item mechanic, active effects, and summarized attribute bonuses instead of a decorative character silhouette.
- Item and skill sheets use structured metadata and mechanical-effect grids. Skill aura colors use compact circular wells rather than pill-shaped controls.
- Pure summoning skills no longer receive interface-aura controls. Only real buff, enhancement, aura, and domain skills can temporarily recolor the interface.
- The response channel, milestone alert, and optional side launcher share the same restrained bronze-black visual language. Opening the launcher still darkens and softly blurs chat behind animated scan lines and orbital elements.
- The stylesheet is separated into foundation, interface, notification, and responsive layers so future visual updates stay coherent.

- A multi-message welcome sequence replaces the previous single threatening onboarding message.

- Per-chat acceptance, avatar crop, inventory, equipment, shop, stats, currency, and action batches.
- Horizontal Status, Missions, Skills, Inventory, Equipment, System Shop, and Scene navigation, plus a Summons tab that appears only when a summoning-type skill is owned.
- Profile, item, and skill icon editors with position, zoom, uploads, and skill SVG presets.
- Paginated item storage, item detail sheets, consumables, equippable gear, and equipment slots.
- AI-powered shop refill and item search with support for current and legacy SillyTavern quiet-generation signatures and tolerant JSON parsing.
- A temporary sharp rectangular Dynamic Island with compact/full display modes while the AI is responding or a System operation is running; it clears automatically afterward so SillyTavern’s top controls remain accessible.
- A collapsed half-circle launcher centered on the selected Left or Right screen edge, with inward-swipe and tap/click controls and immediate access to the System on mobile and PC.
- Automatic EXP rollover raises the Player level at the threshold, carries excess EXP into the next level, scales the next requirement, and grants three stat points per level.
- Redesigned segmented HP/MP monitors, progression route, and responsive attribute matrix.
- A separate draggable milestone alert window over the main chat, with animated framing, event themes, queued alerts, tap-to-reveal controls, optional deep links, and manual removal; both notification layers hide while the full System panel is open.
- Chat-confirmed summon, wield, equip, sheathe, dismiss, and unequip actions update canonical equipment state in English or Thai and reconcile registered equipment stat bonuses.
- Animated profile-ring orbits, tab-change sweeps, touch/click acknowledgement pulses, hover responses, and short panel-entry transitions, with reduced-motion support.
- Independent main, background, and particle colors with compact circular color controls.
- A dedicated Scene tab for date, day, year, time, place, location, specific current position, temperature, weather, and season.
- Tap-to-open missions with per-objective progress, deadlines, penalties, structured AI-generated rewards, and one-time reward claiming.
- Skills with rank, level, mastery, usage tracking, customizable icons, and up to ten saved voice activation phrases per skill.
- Shadow Extraction and generic summoning support with level-scaled storage capacity, deployed/stored management, detailed responsive unit records, and a two-step permanent soul dismissal flow.
- Configurable buff-skill interface auras that temporarily recolor the System, consume MP, expire into cooldown, and can be manually disabled.
- System Credits for purchases, rewards, and penalties.
- Administrator Mode with direct profile, progression, attribute, currency, and position controls—no JSON editing required.
- Direct image manipulation with one-finger/mouse dragging and two-finger pinch zoom.
- Adds a **The System** drawer to the SillyTavern Extensions page.
- Adds a **The System** launcher to the wand menu.
- Opens a framed, animated system interface with a wide PC layout and a mobile Equipment slot list.
- Requires Accept / Decline separately for every new chat and stores all Player data in that chat.
- Uses SillyTavern's active provider/model through `generateQuietPrompt` and `setExtensionPrompt` when available.
- Queues interface actions so the next character response can acknowledge them without applying costs or rewards twice.

## Live preview

Compare the responsive PC and mobile layouts, modules, sidebar, Dynamic Island, and alerts in the [interactive v1.2.1 preview](https://raw.githack.com/DesZiDesu/sololeveling-extension/main/preview.html).

## Installation

Install the repository as a SillyTavern third-party extension using:

```text
https://github.com/DesZiDesu/sololeveling-extension
```

After installation, open **Extensions → The System**, or open the wand menu and choose **The System**. Existing users can update the extension from SillyTavern's extension manager to receive v1.2.1.
