# The System

The System is a Solo Leveling-inspired SillyTavern extension shell for a persistent role-play interface.

## Current build

Version 0.6.1 adds automatic per-response System checks, UI-only notifications, usable/equippable shop items with gameplay effects, guaranteed quest EXP with one-of-three item rewards, and English/Thai interface support.

- Per-chat acceptance, avatar crop, inventory, equipment, shop, stats, currency, and action batches.
- Horizontal Status, Missions, Skills, Inventory, Equipment, System Shop, and Scene navigation.
- Profile, item, and skill icon editors with position, zoom, uploads, and skill SVG presets.
- Paginated item storage, item detail sheets, consumables, equippable gear, and equipment slots.
- AI-powered shop refill and item search with support for current and legacy SillyTavern quiet-generation signatures and tolerant JSON parsing.
- Persistent, angular System-interface notifications for level, HP, MP, skills, titles, items, mission progress, rewards, and synchronization.
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

After installation, open **Extensions → The System**, or open the wand menu and choose **The System**.
