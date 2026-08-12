# The System

The System is a Solo Leveling-inspired SillyTavern extension shell for a persistent role-play interface.

## Current build

Version 0.5.0 expands the complete per-chat Player interface with world tracking, daily quest consequences, Administrator controls, touch image editing, and a more animated Solo Leveling-inspired visual system.

- Per-chat acceptance, avatar crop, inventory, equipment, shop, stats, currency, and action batches.
- Horizontal Status, Quest, Inventory, Equipment, and System Shop navigation.
- Profile and item image editors with position and zoom controls.
- Paginated item storage, item detail sheets, consumables, equippable gear, and equipment slots.
- AI-powered shop refill and item search through the active SillyTavern provider.
- Custom Dynamic Island notifications for level, HP, MP, skills, titles, items, stats, and synchronization.
- Animated particles, responsive selection motion, and a subtly animated profile frame.
- Independent main, background, and particle colors with compact circular color controls.
- Scene tracking for date, day, year, time, place, location, position, temperature, weather, and season.
- Daily quests with deadlines and one-time HP, MP, EXP, or System Credit penalties.
- System Credits for purchases, rewards, and penalties.
- Administrator Mode for complete per-chat state editing and a built-in Player guide.
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
