export function CheatSheetModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[520] flex items-center justify-center bg-black/70 p-3">
      <div className="bg-ink-900 border-2 border-gold-500/50 rounded-xl shadow-2xl w-full max-w-3xl max-h-[86vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-ink-900 border-b border-gold-700/30 px-4 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gold-400 font-semibold">Quick Reference</div>
            <div className="font-display font-bold text-parchment-100 text-lg">Shopkeeper Showdown Guide</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-parchment-500 hover:text-parchment-100 text-2xl leading-none px-1"
            title="Close guide"
          >
            x
          </button>
        </div>
        <div className="p-4 grid md:grid-cols-2 gap-3 text-sm text-parchment-300">
          <GuideSection title="Aim Of The Game">
            <p>Build the best shop by collecting resources, placing them in windows, selling to Visitors, crafting the public Work Orders, and scoring coins plus Reputation.</p>
            <p>Reputation scores by type, and balanced sets are valuable at the end. Coins still matter, but a strong rep spread can swing the game.</p>
          </GuideSection>

          <GuideSection title="On Your Turn">
            <ul className="space-y-1">
              <li>The first player passes one seat to the left each round, so everyone gets a turn at first pick of the new Work Orders.</li>
              <li>From round 2 onward, resolve your Sell Phase first if visitors can buy from your windows.</li>
              <li>You normally have 3 actions. Pick town locations to gather, trade, repair, steal, craft, or use Guild options.</li>
              <li>Each location can usually be used once per turn. Class abilities may spend active tokens or happen off-turn.</li>
              <li>End your turn only after checking your usable windows and hoard limit.</li>
            </ul>
          </GuideSection>

          <GuideSection title="Setting Up Windows">
            <ul className="space-y-1">
              <li>Put resources in open windows so visitors can buy them during Sell Phase. You can sell up to 2 into each Visitor.</li>
              <li>Try to cover active Visitor needs: ARM, CON, TRI, TRG, or ANY.</li>
              <li>Cards in windows are visible and useful, but they can be stolen, broken, or disrupted.</li>
              <li>Empty open windows cannot sell, so fill them before ending if you can.</li>
            </ul>
          </GuideSection>

          <GuideSection title="What To Look For">
            <ul className="space-y-1">
              <li>Visitor demand: match the symbols they still need.</li>
              <li>Card value: higher values pay more coins when sold.</li>
              <li>Star rep: cards with rep icons give bonus rep when sold.</li>
              <li>Work Orders are public: anyone can Craft them at the Workshop, so finish a big one before a rival does.</li>
              <li>Visitor prizes: when a Visitor is satisfied, whoever sold it the most cards wins its 1st prize and the runner-up wins 2nd. Ties go to whoever got there first.</li>
              <li>You can also sell into Visitors outside the Sell Phase: Auction at the Tavern (d6 coins) or Sell to a Visitor at the Workshop (printed value, up to 2 cards).</li>
            </ul>
          </GuideSection>

          <GuideSection title="Useful Reminders">
            <ul className="space-y-1">
              <li>Hoard limit is 8 cards. If you go over, you must discard or place cards into windows.</li>
              <li>Broken windows do not sell until repaired.</li>
              <li>Shuttered windows are temporarily closed and cannot receive normal sales.</li>
              <li>The Flea Market is often the fastest way to fix a missing resource type.</li>
            </ul>
          </GuideSection>

          <GuideSection title="Simple First Plan">
            <ol className="space-y-1 list-decimal list-inside">
              <li>Check visitors.</li>
              <li>Fill windows with matching resources.</li>
              <li>Use actions to patch gaps or build toward one of the public Work Orders.</li>
              <li>End with windows filled and your hoard under control.</li>
            </ol>
          </GuideSection>
        </div>
      </div>
    </div>
  )

function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-parchment-800/40 bg-ink-800/50 p-3 space-y-2">
      <h4 className="text-gold-300 font-display font-bold text-base leading-tight">{title}</h4>
      <div className="space-y-2 leading-relaxed">{children}</div>
    </section>
  )
}
}
