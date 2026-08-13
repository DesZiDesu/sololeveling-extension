# The System

The System is a Solo Leveling-inspired persistent role-play interface for SillyTavern.

## Current build

Version 1.0.0 is a complete information-first visual redesign. It replaces the accumulated game-HUD styling with a restrained black/violet professional interface, improves mobile reflow, and preserves the full Solo Leveling progression feature set.

- The first per-chat record uses the active SillyTavern user persona as the Player name, while Administrator Mode can still override it later.
- Status and Scene are formal data dossiers with text codes, clear information hierarchy, accessible meters, labeled records, and far fewer decorative icons or SVGs.
- Summon records expose HP and MP directly in the registry. Full unit dossiers include condition, authority, mana cost, registration time, experience progression, five combat attributes, abilities, deployment state, and permanent soul dismissal.
- Equipment is now an informative loadout ledger with slot state, item mechanic, active effects, and summarized attribute bonuses instead of a decorative character silhouette.
- Item and skill sheets use structured metadata and mechanical-effect grids. Skill aura colors use compact circular wells rather than pill-shaped controls.
- The response channel, milestone alert, and optional side launcher share one formal visual language. Opening the holographic launcher darkens and softly blurs chat behind animated scan lines and rotating orbital elements.
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
- Animated particles, responsive selection motion, and a subtly animated profile frame.
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

## Installation

Install the repository as a SillyTavern third-party extension using:

```text
https://github.com/DesZiDesu/sololeveling-extension
```

After installation, open **Extensions → The System**, or open the wand menu and choose **The System**. Existing users can update the extension from SillyTavern's extension manager to receive v1.0.0.
