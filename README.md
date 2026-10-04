# ShopkeeperShowdown

Browser playtest tool for the Shopkeeper Showdown board game (Vite + React + TypeScript + Zustand).

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc — the Vite build does not type-check
npm run build
```

## Game modes

- **Play vs Bots** — you plus 1–5 computer players on one screen.
- **Pass & Play** — several humans sharing one screen; any seat can still be a bot.
- **Play Online** — rooms via Supabase. The host can add bot seats in the waiting room;
  bots run on the host's browser, so the host must keep the tab open.

Online play needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`
(see `.env.example`). Local and bot games work without them.

## Bots

Bots live in `src/bots/`:

- `brain.ts` picks the next step for any bot: answering prompts, selling, placing windows,
  location actions, professionals and class abilities.
- `evaluate.ts` holds the heuristics that value cards, Reputation and opponents.
- `useBotDriver.ts` runs one step at a time with a readable delay (Slow / Normal / Fast in the game header).

| Difficulty | Plays like |
|---|---|
| Easy | Basic actions, lots of randomness, no class abilities |
| Medium | Plans sales and Work Orders, uses class abilities when clearly worth it |
| Hard | Chases Work Orders and Reputation sets, targets the leader, avoids bad Clashes, plays the endgame |

Bots use every implemented class ability. WIP classes (Monk, Sorcerer, Warlock) have no ability UI yet,
so bots playing them only use location actions.
