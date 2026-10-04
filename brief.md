# Shopkeeper Showdown — Browser Playtest App

## What we're building

A browser-based digital playtest tool for my custom 2-6 player tabletop board game called Shopkeeper Showdown. Real-time multiplayer, runs in a browser, each player on their own computer. It's a playtest tool — it does NOT need to enforce game rules. Players manage their own state honestly. The app's job is to display the board state, manage shared decks/cards, sync everyone's view, and provide private hands.

This is a playtest tool, not a finished product. Prioritise speed of build and ease of iteration over polish.

## Game summary

Shopkeeper Showdown is a competitive game where players are retired adventurers running shops. They gather resources, stock their shop windows, sell to incoming Visitors for coins and Reputation tokens. Some players steal from others. After 6 rounds, highest coins + Rep score wins.

## Core technical requirements

- **Multiplayer real-time sync.** All players see the same shared board state in real time. Use something simple like Liveblocks, Yjs, Supabase Realtime, or PartyKit — your choice.
- **Private hands.** Each player has resources that only they can see (Hoard, optional held cards). Other players see card backs.
- **Persistent room.** Game state survives if someone refreshes their browser. Shareable URL to join a room.
- **No accounts.** Players just enter a name and pick a seat. Up to 6 players per room.
- **Mobile-friendly is nice but not essential.** Desktop browser is the primary target.
- **Modern stack.** React, TypeScript, Tailwind for styling. Vite or Next.js. Whatever's fastest to deploy.

## Game components the app must support

### Shared board
A single image (PNG/SVG) of the Town board with 6 location labels: Guildhall, Tavern, Wilderness, Barracks, Workshop, Thieves' Guild. Players can drop pawn-tokens onto locations to indicate they're there. Right now this is just visual — no enforcement.

### Decks (shared, shuffleable, drawable)
1. **Resource deck — 92 cards** in 4 types (Armament, Consumable, Trinket, Trade Good). Each card has: name, type, coin value ($1-$8), optional Reputation icon (0, 1, or 2 rep). When sold/discarded, goes to discard pile.
2. **Visitor deck — 34 cards.** Each Visitor has a name, title, art, and a resource demand (e.g. "2 ARM, 1 CON"). 3 are face-up on the board at all times.
3. **Professional deck — 9 cards.** 3 are face-up at the Guildhall for the whole game.
4. **Work Order deck — 20 cards.** 3 are face-up on the board; any player can Craft any of them. A completed order is replaced from the deck.
5. **Counterfeit deck — 8 cards.** Rogue class only; player-specific deck.
6. **Renown deck — 10 cards.** Paladin class only; player draws 4 at game start.

### Tokens (small drag-and-drop items)
- Coins (numeric, players have totals)
- Reputation tokens (4 types — Armament Rep, Consumable Rep, Trinket Rep, Trade Good Rep — players collect them)
- Active tokens (2 per player, can be spent/refreshed)
- Broken tokens (placed on broken windows)
- Stolen markers (placed on stolen resources)
- Night Watcher badge (1 total, held by one player)
- Debt tokens (Warlock-related)
- Momentum tokens (Monk-only counter, 0-8)
- Clan marker (Barbarian-only)

### Per-player area
Each player has:
- A class card (chosen at game start)
- 5 window slots (resources placed here are "in shop")
- A Hoard zone (max 8 resources, private to that player)
- Coin total (numeric)
- Rep token collection (visible to all)
- Active tokens (2, can be spent or refreshed)

### Shared zones on the table
- Resource deck (face-down)
- Resource discard pile
- Flea Market (5 face-up resources)
- 3 Visitor slots
- 3 Professional slots
- Visitor discard pile
- Work Order deck

## What players need to do digitally

- Move resources between deck/hand/windows/hoard/discard
- Roll a d6 for various actions (Gather, Auction, Clash)
- Mark windows as Broken / Shuttered
- Mark resources as Stolen
- Place/move tokens onto cards and zones
- Increment/decrement coin totals
- Pick up Rep tokens (drag from a shared pool to their personal collection)
- Mark/unmark the Night Watcher badge holder
- Manage their class-specific decks (Counterfeits/Renown/etc.)

## What I have ready

All card art is already designed in Canva. I will export them as PNGs:
- 92 resource card PNGs
- 34 Visitor card PNGs
- 9 Professional card PNGs
- 20 Work Order card PNGs
- 8 Counterfeit card PNGs
- 10 Renown card PNGs
- 8 class card PNGs
- 1 board PNG
- A card-back PNG (one shared back design)

I can drop all these into a `public/cards/` folder for the app to load.

## Game data I'll provide

I'll provide JSON files for all card data:
- resources.json — 92 entries with {id, name, type, value, repTokens}
- visitors.json — 34 entries with {id, name, title, demand}
- professionals.json — 9 entries with {id, name, effect text}
- workorders.json — 20 entries with {id, name, recipe, price, tagline}
- counterfeits.json — 8 entries
- renown.json — 10 entries
- classes.json — 8 entries

These tell the app what cards exist and their key properties. The art is referenced by filename.

## V1 scope (start here)

For the first playable version, build:
1. A landing page where you create a new game or join one via room code
2. Up to 6 player seats, each picks a name and a class
3. The shared board image with the 6 locations
4. The resource deck, Visitor deck, Professional deck — set up with their cards
5. Per-player areas with windows (5 slots) and hoard zone
6. Drag-and-drop card movement between zones (deck → hand → window → discard, etc.)
7. Coin counter and Rep token tracker per player (clickable + / - buttons)
8. Dice roller (d6) accessible to all players
9. Real-time sync so everyone sees changes instantly
10. A simple chat/log showing recent actions ("Alice drew a card", "Bob rolled 4")

## Visual style preferences

- Clean, modern, warm
- Tabletop game vibe — cards should feel like cards
- Cards readable at table view, but allow hover-to-zoom for detail
- Colour palette pulled from the existing card art (warm browns, golds, deep reds — fantasy adventure)

## What I need help with

- Setting up the project structure
- Choosing the right multiplayer sync solution
- Building the UI for the shared board and player areas
- Importing the card images and data
- Deploying so my friends can join via a URL

I have a Vercel account (or Netlify, whichever is easier). Cards are sitting in Canva ready to export.

Start by asking me what's missing or unclear, then propose a tech stack and project structure before writing any code.