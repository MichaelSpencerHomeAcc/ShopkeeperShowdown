# Shopkeeper Showdown — Scoring Rules

## When scoring happens

The game ends after the final turn of Round 6. Each player then takes one **final Sell Phase** in turn order before scoring begins.

### Final Sell Phase
- Each player, in turn order, takes one last Sell Phase.
- Standard sell rules apply: you MUST sell if able, you choose the order in which to sell to Visitors, sell 1 resource at a time to each Visitor whose order you can fulfil from your windows.
- During the final Sell Phase, players take NO actions (no location visits, no class abilities, no Clashes).
- Reputation icons on sold resources still grant Rep tokens as normal.
- Visitor completion bonuses still trigger as normal.

After all final Sell Phases are complete, total scores are calculated.

---

## Final Score = Coins + Reputation Points

Each player's final score is the sum of:
1. Their total coins held
2. Their Reputation points (calculated from collected Rep tokens)
3. Set bonuses

The player with the highest final score wins.

---

## Coins

Each coin is worth 1 point. Total all coins in a player's supply (not coins owed by Debt tokens, not coins in the bank).

---

## Reputation Points

Players collect Reputation tokens throughout the game. There are 4 types of Rep tokens, one per resource type:
- **Armament Rep** (orange)
- **Consumable Rep** (blue)
- **Trinket Rep** (green)
- **Trade Good Rep** (pink)

Rep tokens are scored **per type**, using this scaling table:

| Tokens of one type | Points |
|---|---|
| 1 | 1 |
| 2 | 3 |
| 3 | 5 |
| 4 | 8 |
| 5 | 11 |
| 6 | 14 |
| 7 | 18 |
| 8 | 22 |

Each type is scored separately, then totalled.

### Example
Alice ends with:
- 4 Armament Rep tokens → 8 points
- 2 Consumable Rep tokens → 3 points
- 5 Trinket Rep tokens → 11 points
- 1 Trade Good Rep token → 1 point

Alice's Reputation points = 8 + 3 + 11 + 1 = **23 points**

---

## Set Bonus

For each complete set of all four Reputation types (at least 1 of each: Armament, Consumable, Trinket, Trade Good), gain **+6 points**.

You can score multiple set bonuses if you have multiple of each type. The number of complete sets equals the lowest count across all four types.

### Examples

**Example 1 — One complete set:**
Bob has 4 Armament, 2 Consumable, 5 Trinket, 1 Trade Good.
Minimum across types = 1 (Trade Good).
Number of sets = 1.
Set bonus = **+6 points**

**Example 2 — Multiple sets:**
Charlie has 3 Armament, 2 Consumable, 4 Trinket, 2 Trade Good.
Minimum across types = 2 (Consumable and Trade Good).
Number of sets = 2.
Set bonus = **+12 points**

**Example 3 — No complete set:**
Diana has 5 Armament, 3 Consumable, 4 Trinket, 0 Trade Good.
Minimum across types = 0 (no Trade Good).
Number of sets = 0.
Set bonus = **+0 points**

---

## Worked end-game scoring example

After the final Sell Phase, Alice has:
- **38 coins** in her supply
- **4 Armament Rep, 2 Consumable Rep, 5 Trinket Rep, 1 Trade Good Rep** tokens

Calculate:
- Coins: **38 points**
- Armament Rep (4): **8 points**
- Consumable Rep (2): **3 points**
- Trinket Rep (5): **11 points**
- Trade Good Rep (1): **1 point**
- Set bonus: minimum across types = 1, so **+6 points**

**Alice's final score = 38 + 8 + 3 + 11 + 1 + 6 = 67 points**

---

## Tiebreakers

If two or more players are tied on final score, apply these tiebreakers in order:

1. **Most Reputation tokens** — count total Rep tokens across all 4 types. Highest wins.
2. **Fewest Broken windows** — count Broken tokens currently on the player's windows. Fewest wins.
3. **Shared victory** — if still tied, declare a shared victory. Optionally, run a friendly Clash roll-off: each tied player rolls d6, highest wins.

---

## What does NOT count toward score

- Resources still in windows or hoard (these are NOT converted to coins at end of game)
- Resources held back for a public Work Order that was never crafted (these are wasted effort)
- Coins owed to other players (Warlock Debt tokens — these still count as held coins for the holder)
- Active tokens, Momentum tokens (Monk's Momentum DOES convert — see below)

---

## Monk-specific scoring

The Monk does not have Active tokens; they use Momentum instead.

**At game end, the Monk converts any unspent Momentum to coins at a rate of 1 coin per 1 Momentum.** This is added to their coin total before scoring.

Example: Monk ends with 32 coins + 5 unspent Momentum = 37 coins for scoring.

---

## Implementation notes (for the app)

For automated scoring, the app should:

1. **Display final Sell Phase first.** Show each player in turn order taking their final sell, with all standard sell-phase UI active.
2. **After all final sells are done, calculate scores per player:**
   - Sum coins
   - For each of the 4 Rep token types, look up scaling table value
   - Calculate set bonus: `min(armRep, conRep, triRep, trdRep) * 6`
   - For Monk: add unspent Momentum to coin total
   - Total = coins + sum(rep points) + set bonus
3. **Show a final scoreboard** with breakdown per player:
   - Coins
   - Each Rep type and its points
   - Set bonus
   - Total
4. **Highlight the winner.** Apply tiebreakers if needed and prompt the host to confirm if a shared victory is the outcome.

### Suggested data structure for scoring

```javascript
const scoringTable = [0, 1, 3, 5, 8, 11, 14, 18, 22]; // index = token count

function scorePlayer(player) {
  const coins = player.coins + (player.class === 'Monk' ? player.momentum : 0);

  const repPoints =
    scoringTable[Math.min(player.repArm, 8)] +
    scoringTable[Math.min(player.repCon, 8)] +
    scoringTable[Math.min(player.repTri, 8)] +
    scoringTable[Math.min(player.repTrd, 8)];

  const sets = Math.min(player.repArm, player.repCon, player.repTri, player.repTrd);
  const setBonus = sets * 6;

  return {
    coins,
    repPoints,
    setBonus,
    total: coins + repPoints + setBonus,
    totalRepTokens: player.repArm + player.repCon + player.repTri + player.repTrd,
    brokenWindows: player.brokenCount
  };
}

function compareForTiebreak(a, b) {
  if (a.total !== b.total) return b.total - a.total;
  if (a.totalRepTokens !== b.totalRepTokens) return b.totalRepTokens - a.totalRepTokens;
  if (a.brokenWindows !== b.brokenWindows) return a.brokenWindows - b.brokenWindows;
  return 0; // tied — shared victory
}
```

---

## Open clarifications (flag during playtest)

These are edge cases that have not been definitively resolved in design and should be confirmed via playtest:

- **What about resources saved for a public Work Order at game end?** Currently: no value unless sold in the final Sell Phase. Work Orders are public, so nobody owns an unfinished one.
- **Are Counterfeits in windows worth their printed coin value at end of game?** Currently: only if sold during the final Sell Phase. Otherwise no value.
- **What if the resource deck runs out mid-final-Sell-Phase?** Reshuffle the discard pile. Worth noting in case the app needs to handle this.
- **Does the player with the Night Watcher badge at game end gain any bonus?** No. The badge has no end-game value.