import type { ProfessionalCard } from '../types'

// Card names and effect text read directly from card art.
// Note: the file "Gallant Greeter.png" shows "Polite Promoter" on the card;
//       "Spontaneous Summoner.png" shows "Spirited Summoner".
export const PROFESSIONAL_CARDS: ProfessionalCard[] = [
  {
    id: 'p01',
    name: 'Alluring Alchemist',
    effect: 'Trade 3, refresh all your Active tokens, repair all your windows.',
    flavour: 'When in doubt, just shake things up and see what happens.',
    imageFile: '/cards/professionals/Alluring Alchemist.png',
  },
  {
    id: 'p02',
    name: 'Brazen Bounty Hunter',
    effect: 'Choose 1 player; they give you 2 coins OR 1 resource from their Hoard (their choice).',
    flavour: "If it's shiny and unguarded, it's mine.",
    imageFile: '/cards/professionals/Brazen  Bounty Hunter.png',
  },
  {
    id: 'p03',
    name: 'Charismatic Clerk',
    effect: 'Distribute 1, gain the reputation and 2 coins.',
    flavour: 'A little smile goes a long way!',
    imageFile: '/cards/professionals/Charismatic Clerk.png',
  },
  {
    id: 'p04',
    name: 'Polite Promoter',
    effect: 'Reset Flea Market. Take 1, then Trade 2.',
    flavour: "I've got deals for days!",
    imageFile: '/cards/professionals/Gallant Greeter.png',
  },
  {
    id: 'p05',
    name: 'Marvellous Mascot',
    effect: 'Gather half your roll; gain 1 Reputation for each different type drawn.',
    flavour: "It's not bribery, it's just... adorable negotiation!",
    imageFile: '/cards/professionals/Marvellous Mascot.png',
  },
  {
    id: 'p06',
    name: 'Resourceful Recruiter',
    effect: 'Launder 1 per expended active token. (Max 4)',
    flavour: 'Why reinvent the wheel when you can just borrow the cart?',
    imageFile: '/cards/professionals/Resourceful Recruiter.png',
  },
  {
    id: 'p07',
    name: 'Shady Saboteur',
    effect: 'Break 1, gain 1 Reputation of the broken card\'s type.',
    flavour: "It's not stealing, it's strategic acquisition.",
    imageFile: '/cards/professionals/Shady Saboteur.png',
  },
  {
    id: 'p08',
    name: 'Skilful Stocker',
    effect: 'Draw until you get a resource with reputation.',
    flavour: 'The key to success is knowing where to look... and when to stop.',
    imageFile: '/cards/professionals/Skilful Stocker.png',
  },
  {
    id: 'p09',
    name: 'Spirited Summoner',
    effect: 'Appraise 3.',
    flavour: 'The answers are out there. You just need to know where to look.',
    imageFile: '/cards/professionals/Spontaneous Summoner.png',
  },
]
