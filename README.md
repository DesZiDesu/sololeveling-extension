# The System

The System is a Solo Leveling-inspired SillyTavern extension shell for a persistent role-play interface.

## Current build

Version 0.2.2 uses persistent delegated launch handling so SillyTavern can rebuild its Extensions drawer or wand menu without disconnecting The System buttons. It also includes a runtime visibility fallback independent of the extension stylesheet.

- Adds a **The System** drawer to the SillyTavern Extensions page.
- Adds a **The System** launcher to the wand menu.
- Opens a framed, animated system interface with a wide PC layout and a stacked mobile layout.
- Shows a first-open quest notification with Accept / Decline behavior and remembers acceptance.
- Includes the first Status interface plus foundations for Stats, Skills, Quests, and Inventory.
- Uses SillyTavern's active provider/model through `generateQuietPrompt` and `setExtensionPrompt` when available.
- Stores accepted onboarding in extension settings and role-play state in the active chat metadata.

The current release is the Status/interface foundation. Additional state modules will be layered onto the same prompt and metadata architecture next.

## Installation

Install the repository as a SillyTavern third-party extension using:

```text
https://github.com/DesZiDesu/sololeveling-extension
```

After installation, open **Extensions → The System**, or open the wand menu and choose **The System**.
