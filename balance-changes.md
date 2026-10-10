# Balance & Economy Changes

Everything that changed on top of `main` (PR #15, e20842c), in two parts:

1. **Warlock rework and class tuning** (branch `claude/curses-imp-paladin`)
2. **Halved economy** (branch `claude/half-economy`, which builds on part 1)

All numbers were checked in hard-bot simulations: 8,000 games per test across 2–6 player tables. "Win index" means 1.00 = a fair share of wins.

---

## At a glance

| | Before (`main`) | After |
|---|---|---|
| Average final score | 230 | 124 |
| Typical winning score | 229–302 | 122–161 |
| Coins per player at game end | 146 | 79 |
| Coins changing hands per 4-player game | 590 | 320 |
| Coin pieces handled per 4-player game (with 1/5/10 pieces) | 173 | 146 |
| Win index range across all 8 classes (hard bots) | 0.89 – 1.19 | 0.92 – 1.07 |
| Gap between strongest and weakest class | 0.30 | 0.16 |

---

## 1. Economy

Card values and income were roughly halved. Small fixed coin effects from abilities (tolls, curses, Twist, Bounty Hunter…) were **kept the same on purpose**, so they now matter twice as much relative to a player's score.

### Resource cards — sell value

Every resource card's value is half its printed value, rounded (minimum 1). The card art still shows the old numbers and will need reprinting. The full card list is in the Appendix.

| Old value | New value | Cards |
|---|---|---|
| 8 | 4 | 9 |
| 7 | 4 | 12 |
| 6 | 3 | 13 |
| 5 | 3 | 19 |
| 4 | 2 | 14 |
| 3 | 2 | 9 |
| 2 | 1 | 8 |
| 1 | 1 | 8 |

Average card value: **4.74 → 2.63**. Counterfeit cards are unchanged ($1–2).

### Work Orders — price

| Work Order | Recipe | Old | New |
|---|---|---|---|
| Artisan's Shield | 1 ARM + 1 TRI + 3 TRG | 27 | 14 |
| Cliffwatch Lenses | 1 CON + 2 TRI + 1 TRG | 21 | 11 |
| Dragonbane | 2 ARM + 1 CON + 1 TRI | 21 | 11 |
| Endless Paintbrush | 2 TRI + 2 TRG | 20 | 10 |
| Hartswood Carrier | 2 ARM + 1 TRG | 15 | 8 |
| Heartsong | 2 ARM + 2 CON + 1 TRI | 28 | 14 |
| Hopesplinter | 3 ARM + 1 CON + 1 TRG | 32 | 16 |
| Mystic Compass | 2 CON + 1 TRI | 15 | 8 |
| Seaheart Diviner | 1 CON + 4 TRI | 29 | 15 |
| Seared Drake Feast | 1 CON + 2 TRG | 16 | 8 |
| Seeker's Gaze | 1 CON + 2 TRI + 1 TRG | 22 | 11 |
| Starforge Steel | 2 CON + 1 TRI + 2 TRG | 27 | 14 |
| Starpetal Infusion | 3 CON + 1 TRI | 19 | 10 |
| The Last Word | 3 ARM + 1 CON | 23 | 12 |
| The Negotiator | 2 ARM + 2 TRG | 21 | 11 |
| Truthringer | 3 TRI + 1 TRG | 21 | 11 |
| Velvet Sting | 2 ARM + 1 TRG | 16 | 8 |
| Vial of Blessings | 2 CON + 2 TRI | 22 | 11 |
| Winter Stockpile | 1 CON + 4 TRG | 28 | 14 |
| Wintercourt Mantle | 2 ARM + 1 CON + 1 TRI | 24 | 12 |

### Other prices and payouts

| Rule | Old | New |
|---|---|---|
| Starting coins | 3 | 2 |
| Auction (Tavern) payout | coins = d6 roll (1–6) | half the d6 roll, rounded up (1–3) |
| Rogue's Guild Contacts auction | coins = d6 roll | half the d6 roll, rounded up |
| Consultation (Guildhall): +1 Rep | pay 3 coins | pay 2 coins |
| Hire Bodyguard (Barracks): take the Night Watcher | pay 2 coins | pay 1 coin |
| Fence (Thieves' Guild): sell 1 Stolen resource, no Rep | its coin value | **double** its coin value (bots used it 0.05 → ~3 times a game) |

### Visitor contribution prizes

Only the **Coins** prize changed. Prizes are listed as 1st place / 2nd place.

Prizes are no longer dealt at random: each Visitor now has a fixed 1st and 2nd prize printed on it (full list in asset-changes.md).

| Prize | Small Visitor | Large Visitor |
|---|---|---|
| **Coins** | **4 / 2 → 2 / 1** | **6 / 3 → 3 / 2** |
| Rep (your choice of type) | 1 / 1 | 2 / 1 |
| Refresh | 1 / 1 | 2 / 1 |
| Take (from the Flea Market) | 1 / 1 | 2 / 1 |
| Draw | 2 / 1 | 3 / 2 |
| Steal | 1 / 1 | 2 / 1 |
| Break | 1 / 1 | 2 / 1 |

### Kept the same on purpose (small coin effects)

Clan toll 1 · Twist of Fate +1 coin · Misfortune 2 coins · Brazen Bounty Hunter takes 2 coins · Negotiate gives both players +2 coins · Merchant of Saltholm +3 coins · Shadow of Vel'sha +2 coins · Forge of Ironpeak +2 coins · Assorted Seeds return effect 2 coins · Gold Rain surge · unspent Momentum still scores 1 coin each.

---

## 2. Scoring

The Reputation table and set bonus were halved so that coins and Reputation keep the same share of the score (about 64% coins / 36% Rep).

| Tokens of one type | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Old points | 1 | 3 | 5 | 8 | 11 | 14 | 18 | 22 |
| **New points** | **1** | **2** | **3** | **4** | **6** | **7** | **9** | **11** |

| | Old (`main`) | Part 1 | **Final** |
|---|---|---|---|
| Bonus per full set of all four Rep types | 6 | 10 | **5** |

Part 1 raised the set bonus from 6 to 10 (it narrowed the gap between classes from 0.19 to 0.13 at full prices). The halved economy then halves that, giving 5.

---

## 3. Class changes

| Class | Change | Old | New |
|---|---|---|---|
| **Barbarian** | — | no change (a cut to 1 coin was tried, then undone after the location rework) | 1 coin per Broken window, max 2, as before |
| **Paladin** | Forge of Ironpeak (Renown) passive | +3 coins when you complete a Work Order | +2 coins |
| **Paladin** | Honourable Trade | +1 Rep for a Negotiate, a Work Order, or Report the Crime repairing 1+ windows | +1 Rep for a Work Order, or a **Fortify that repairs 2+ windows** |
| **Ranger** | Master of the Wilderness free gather | half your d6, rounded **down** (min 1) | half your d6, rounded **up**, **minimum 2** |
| **Rogue** | — | no change (a 5th starting Counterfeit was tried, then undone once Fence paid double) | 4 cards, as before |
| **Shaman** | Call Lightning | you Draw 1 | you Draw 2 |
| **Sorcerer** | Arcane Charge to shift a Surge ±1 | 2 Charge | 1 Charge (re-roll still 1) |
| **Warlock** | Hex / curse deck | see below | see below |
| **Warlock** | Summon Imp | see below | see below |
| **Monk** | Momentum for completing a Visitor | 2 | 3 |

### Warlock — Hex (curse deck)

**Old:** curses were hidden timers. Each triggered on the victim's *next* matching action (next roll, next sale, next location…) or fizzled at the end of their next turn.

**New:** a curse is laid **face-up** in front of a player. At the **start of their next turn** they resolve it, then hand the card back to the bottom of the Warlock's deck. Where possible, the victim chooses what to give up.

| Old curse | Old effect | New curse | New effect (at the start of the victim's next turn) |
|---|---|---|---|
| Tithe | Their next Visitor sale pays the Warlock 1 coin | **Tithe** | Pay the Warlock **2 coins** |
| Leaky Pockets | Cheapest hoard card discarded | **Leaky Pockets** | Discard 1 hoard card (**their choice**) |
| Jinx | Their next die roll is 1 lower | **Sticky Fingers** | Give the Warlock 1 hoard card (their choice) |
| Butterfingers | Next Gather/Mascot draws 1 fewer | **Hexed Shutters** | Shutter 1 of their open windows (their choice) until their following turn |
| Unsettled Shelves | A random window card returns to hoard | **Unsettled Shelves** | Move 1 window card back to hoard (**their choice**) |
| Toll of Shadows | Next location action costs 1 coin to the Warlock | **Weariness** | Exhaust 1 Active token (a Monk loses 1 Momentum) |
| Hexed Goods | Next Visitor sale earns no Rep | **Misfortune** | Roll a d6: on 1–3 pay the Warlock 2 coins (the Warlock may Twist the roll) |
| Bad Omen | Warlock bottles a 1 | **Bad Omen** | No change: the Warlock bottles a 1 straight away |

### Warlock — Summon Imp

| | Old | New |
|---|---|---|
| How long it stays | until the Warlock's next turn | **until someone banishes it** |
| Who it hits | the **first** other player to use the location | **every** other player who uses the location |
| Roll 1–2 | steals a card **for the Warlock** | **eats** a random hoard card (discarded) |
| Roll 3–4 | breaks one of their windows | breaks one of their windows (unchanged) |
| Roll 5–6 | banished | banished (unchanged) |
| Night Watcher holder | (not specified) | ignored by the Imp |
| Using Summon Imp again | — | moves the Imp to a new location (costs a token) |

The Warlock can still Twist the Imp's roll.

---

## 3b. Locations

Every location keeps 3 spaces. Dead spaces were replaced with combinations of existing keywords, so there are no new mechanics to learn.

| Location | Old space | New space |
|---|---|---|
| Guildhall | Consultation: pay coins for 1 Rep | **Consultation:** spend 1 resource from your hoard → 1 Rep of its type + 2 coins |
| Guildhall | Negotiate | **Town Crier** (moved from Barracks): swap in a Visitor from the top 3, then sell up to 2 cards into it |
| Tavern | Refresh Actives | **Rest:** Refresh all Active tokens, then Repair 1 window |
| Wilderness | Pitch Camp | **Quest:** name a Rep type, roll 2d6 (2–4 lose a card · 5–6 draw 3 · 7–8 4 coins + draw 1 · 9–10 2 Rep + 2 coins · 11–12 3 Rep + 4 coins) |
| Barracks | Report the Crime: repair all, or +1 Rep and a rival discards a Stolen card (reporter picked it) | **Report the Crime:** a rival discards a Stolen card of **their** choice; +1 Rep of your choice (repair moved to Fortify) |
| Barracks | Hire Bodyguard | **Fortify:** Repair all your windows and take the Night Watcher |
| Barracks | Town Crier | **Recover Goods:** take 1 Stolen card from a rival's hoard (it stays Stolen) |
| Workshop | Sell to a Visitor | **Appraise 2:** look at the top 4 resources, keep up to 2 (what Workshop had before Sell to a Visitor) |

Bot usage per 4-player game (hard bots, 12,000 games):

| Space | Before | After |
|---|---|---|
| Report the Crime | 11.2 | 8.3 |
| Consultation | 0.2 | 1.0 |
| Town Crier | 0.0 | 4.2 |
| Rest (was Refresh) | 0.1 | 0.5 |
| Quest (was Pitch Camp) | 0.02 | 1.4 |
| Fortify (was Bodyguard + repair) | 0.03 + 0.5 | 1.4 |
| Recover Goods | — | 2.0 |
| Appraise 2 (was Sell to a Visitor) | 5.2 | 2.5 |

## 4. Bots

- Bot valuations were recalibrated for the halved economy. Every hand-set worth that isn't a real coin amount now goes through one `VALUE_SCALE` (0.5) in `src/bots/evaluate.ts`, and the bots expect an average auction payout of 2.
  - With the economy halved but the bots left alone, the gap between classes was 0.74.
  - Recalibrated, before class tuning, it was 0.43.
  - Scales from 0.4 to 0.65 performed the same.
- Bots now handle the new curse choices (they give up their least valuable card or window), Misfortune Twists, the persistent Imp, Call Lightning's 2 cards, and the new Consultation and Bodyguard prices.

---

## 5. Simulation results

Win index by class (1.00 = fair share). 8,000 mixed games of 2–6 players each.

| | Barb | Pal | Ranger | Rogue | Shaman | Monk | Sorc | Warlock | Gap |
|---|---|---|---|---|---|---|---|---|---|
| `main` | 1.01 | 1.19 | 0.89 | 0.95 | 0.99 | 0.93 | 0.98 | 1.07 | 0.30 |
| Part 1 (full prices, set bonus 10) | 0.98 | 1.02 | 0.96 | 1.04 | 0.93 | 1.05 | 0.95 | 1.07 | 0.14 |
| Halved economy, no class tuning | 1.23 | 1.07 | 0.82 | 1.03 | 0.80 | 1.03 | 0.86 | 1.16 | 0.43 |
| **Final (hard bots)** | **0.97** | **1.05** | **0.92** | **0.99** | **1.07** | **1.03** | **1.00** | **0.97** | **0.16** |
| Final (medium bots) | 0.95 | 1.12 | 0.93 | 1.07 | 1.01 | 1.12 | 0.94 | 0.86 | 0.27 |
| + Fence pays double, Rogue back to 4 Counterfeits (hard) | 0.90 | 1.06 | 0.98 | 1.02 | 1.07 | 1.02 | 1.01 | 0.93 | 0.17 |
| **+ Location rework, Monk 3 Momentum, Barbarian max 2, Warlock 3 Omens (hard, 12,000 games)** | **1.05** | **1.00** | **0.90** | **1.04** | **1.02** | **1.00** | **0.97** | **1.01** | **0.15** |

Medium bots play the Warlock less well (0.86); that's expected for a class with this much decision-making.

Options tried and rejected along the way:
- Imp striking only once per round. It balanced, but you preferred an Imp that hits everyone.
- Warlock losing its Twist coin (0.90, too weak).
- Ranger +1 card on its gather (1.20, too strong).
- Shaman dice recharging in round 3 (made the Shaman weaker).
- Paladin starting with 3 Renown cards, or no Rep from repairs (both overshot).

---

## 6. Physical components to update

- Resource card art: new sell values (see Appendix).
- Work Order cards: new prices.
- Warlock: 2 Omen dice (was 3); the new Curse deck text; the Imp figure.
- Player aids:
  - Rep scoring table and set bonus 5.
  - Auction = half the roll, rounded up.
  - Consultation 2 coins, Bodyguard 1 coin, starting coins 2.
- Class boards: the Barbarian, Ranger, Shaman, Sorcerer and Warlock text above, plus the Forge of Ironpeak Renown card.

---

## Appendix: Resource cards, old → new value

### Armaments

| Card | Rep | Old | New |
|---|---|---|---|
| Arcane Powered Musket |  | 8 | 4 |
| Boneplate Pauldrons | 1 | 7 | 4 |
| Dragon Strung Crossbow |  | 6 | 3 |
| Gauntlets of Mild Inconvenience | 1 | 5 | 3 |
| Gnarled Oak Staff |  | 3 | 2 |
| Nature Guardian's Bow |  | 7 | 4 |
| Portal Dagger |  | 4 | 2 |
| Rainbow Gauntlets of Stealth | 1 | 4 | 2 |
| Robes of Invisibility | 1 | 8 | 4 |
| Shark Tooth Dagger | 1 | 3 | 2 |
| Spear of Lightning |  | 5 | 3 |
| Squires Training Sword | 2 | 2 | 1 |
| Sturdy Dragonhide Whip |  | 6 | 3 |
| Sword of the Burning Banana |  | 6 | 3 |
| The Dark Masters Scythe |  | 4 | 2 |
| The Driftwood of Defense | 1 | 1 | 1 |
| The Engineers Masterpiece |  | 7 | 4 |
| The Hide of the Bear |  | 5 | 3 |
| The Hood of the Manatee |  | 5 | 3 |
| The Lumberjacks Axe | 1 | 2 | 1 |
| The Orphans Deadeye | 2 | 1 | 1 |
| The Siege Breaker |  | 8 | 4 |
| Winged Boots |  | 4 | 2 |

### Consumables

| Card | Rep | Old | New |
|---|---|---|---|
| Ancient Lava Juice |  | 6 | 3 |
| Bag of Dripping Entrails | 1 | 1 | 1 |
| Beholders Eyeball |  | 4 | 2 |
| Bottled Thunderstorm |  | 5 | 3 |
| Concentrated Existential Dread |  | 7 | 4 |
| Fizzy potion of Refreshment |  | 4 | 2 |
| Gnoll Saliva |  | 3 | 2 |
| Gnomes Beard | 1 | 2 | 1 |
| Jar of Concentrated Moonlight | 1 | 6 | 3 |
| Kraken's Tentacle |  | 5 | 3 |
| Medusa Snake Venom |  | 7 | 4 |
| Potion of Dark Vision |  | 5 | 3 |
| Potion of Faerie Essence |  | 7 | 4 |
| Potion of Twilight |  | 5 | 3 |
| Refined Void Residue |  | 6 | 3 |
| Slimy Frog Legs | 1 | 3 | 2 |
| Solid Water Blocks of the Northern Cold Springs | 2 | 1 | 1 |
| Suspension of Disbelief | 1 | 5 | 3 |
| The Great Peacocks Feather | 1 | 4 | 2 |
| The Last Unicorn Horn |  | 8 | 4 |
| The Scent of Purity |  | 6 | 3 |
| Wyrmwood Seeds | 2 | 2 | 1 |
| Wyverns Poison | 1 | 8 | 4 |

### Trinkets

| Card | Rep | Old | New |
|---|---|---|---|
| A Tooth of Uncertain Origin |  | 4 | 2 |
| Compass of Mild Suggestion | 1 | 5 | 3 |
| Crown of Fiery Rage |  | 8 | 4 |
| Deck of Forbidden Tarots | 1 | 6 | 3 |
| Earrings of Deftness | 2 | 6 | 3 |
| Forgotten Naga Skull |  | 4 | 2 |
| Grimoire of Dwarven Insults | 1 | 4 | 2 |
| Insignia of the Silver Knight |  | 5 | 3 |
| Pendant of Unrequited Love |  | 5 | 3 |
| Pocket Watch of Punctuality | 1 | 8 | 4 |
| Ring of Barriers |  | 5 | 3 |
| Sand-less Hourglass of Opportunity |  | 7 | 4 |
| Solemn Heart of the Forboding Queen |  | 7 | 4 |
| The Chalice of Eternal Liquid |  | 7 | 4 |
| The Coin of Certainty |  | 4 | 2 |
| The Fate-weavers Decision Maker |  | 6 | 3 |
| The Key to Nowhere | 1 | 2 | 1 |
| The Misguided Soldiers Relic |  | 3 | 2 |
| The Pennant of the Lost Kingdom | 2 | 2 | 1 |
| The Rock of Companionship | 2 | 1 | 1 |
| The Scroll of Ancient Tongue | 1 | 3 | 2 |
| The Scryers Prediction Orb |  | 5 | 3 |
| The Tavern Keepers Shawl | 1 | 1 | 1 |

### Trade Goods

| Card | Rep | Old | New |
|---|---|---|---|
| Manticore's Milk | 1 | 2 | 1 |
| Chromatic Bar |  | 8 | 4 |
| Invisible Ink |  | 5 | 3 |
| Bolt of Darkwood Fur |  | 6 | 3 |
| Bolt of Moonspun Silk | 1 | 5 | 3 |
| Cactus Honey |  | 5 | 3 |
| Catch of the Day |  | 3 | 2 |
| Crate of Enchanted Nails |  | 5 | 3 |
| Curdled Manticore Cheese |  | 4 | 2 |
| Elven Wine |  | 7 | 4 |
| Enchanted Wood |  | 4 | 2 |
| Flower Flour | 2 | 2 | 1 |
| Giant Purple Carrots | 1 | 3 | 2 |
| Goldvein Spellthread |  | 7 | 4 |
| Ironstout Keg |  | 6 | 3 |
| Mistveil Wool |  | 7 | 4 |
| Murloc Eggs |  | 4 | 2 |
| Mushroom Bread | 1 | 1 | 1 |
| Rump of Delicious Dragon | 1 | 8 | 4 |
| Silverveil Bricks | 1 | 6 | 3 |
| Singing Wheat | 2 | 1 | 1 |
| Slightly Haunted Lumber |  | 3 | 2 |
| Strung Lions Mane |  | 5 | 3 |
