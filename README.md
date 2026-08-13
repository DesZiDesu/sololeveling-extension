# The System

The System is a persistent role-play interface for SillyTavern. It retains its Solo Leveling-inspired System modules while supporting modern, fantasy, supernatural, and other settings.

## Current build

Version 0.8.0 adds an optional smartphone and local music library to the centered side launcher, along with a broader first-run welcome sequence. The side launcher can now be placed on either edge or disabled entirely.

- Smartphone home screen with Contacts, Messages, Phone, Music, Stickers, and Settings apps.
- Manual and AI-managed NPC contacts with names, nicknames, phone numbers, notes, blocking, deletion, calling, and messaging.
- One-to-one and group conversations with pinning, archiving, restoration, unread counts, queued messages, and conversation history.
- Enter queues phone messages without generating; the next normal role-play reply can answer them in the same update. An explicit Generate button is available when an immediate extra model call is desired.
- Batched in-world calls with dialing, answered/declined/missed results, transcript logs, and cosmetic mute/speaker controls.
- Incoming NPC calls and messages respect per-phone permission settings and blocked contacts.
- Multiple phone shells and Dynamic Island styles, plus a separate phone profile, number, photo, and wallpaper.
- Original sticker upload and sending flow. No code or assets are copied from another phone extension.
- Browser-local music player supporting global or per-chat audio libraries, with upload controls in both the phone and extension drawer.
- Two-button animated edge tray for opening The System or the smartphone. The edge, visibility, and wand-menu launcher are independently configurable.
- A multi-message, genre-neutral welcome sequence replaces the previous single threatening onboarding message.
- Phone contacts, messages, calls, and pending batches are included in the normal one-pass UI state check so ordinary role-play replies can update them without a second sync request.

- Per-chat acceptance, avatar crop, inventory, equipment, shop, stats, currency, and action batches.
- Horizontal Status, Missions, Skills, Inventory, Equipment, System Shop, and Scene navigation.
- Profile, item, and skill icon editors with position, zoom, uploads, and skill SVG presets.
- Paginated item storage, item detail sheets, consumables, equippable gear, and equipment slots.
- AI-powered shop refill and item search with support for current and legacy SillyTavern quiet-generation signatures and tolerant JSON parsing.
- A temporary sharp rectangular Dynamic Island with compact/full display modes while the AI is responding or a System operation is running; it clears automatically afterward so SillyTavern’s top controls remain accessible.
- A collapsed half-circle launcher centered on the selected Left or Right screen edge, with inward-swipe and tap/click controls and immediate access to the System and phone on mobile and PC.
- Automatic EXP rollover raises the Player level at the threshold, carries excess EXP into the next level, scales the next requirement, and grants three stat points per level.
- Redesigned segmented HP/MP monitors, progression route, and responsive attribute matrix.
- A separate draggable milestone alert window over the main chat, with animated framing, event themes, queued alerts, tap-to-reveal controls, optional deep links, and manual removal; both notification layers hide while the full System panel is open.
- Chat-confirmed summon, wield, equip, sheathe, dismiss, and unequip actions update canonical equipment state in English or Thai and reconcile registered equipment stat bonuses.
- Animated particles, responsive selection motion, and a subtly animated profile frame.
- Independent main, background, and particle colors with compact circular color controls.
- A dedicated Scene tab for date, day, year, time, place, location, specific current position, temperature, weather, and season.
- Tap-to-open missions with per-objective progress, deadlines, penalties, structured AI-generated rewards, and one-time reward claiming.
- Skills with rank, level, mastery, usage tracking, customizable icons, and saved voice activation words.
- Shadow Extraction support with responsive Shadow Army records for name, rank, level, class, status, stats, description, and abilities.
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

After installation, open **Extensions → The System**, or open the wand menu and choose **The System**. Existing users can update the extension from SillyTavern's extension manager to receive v0.8.0.
