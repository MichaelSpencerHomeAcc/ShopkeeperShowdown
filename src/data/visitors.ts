import type { VisitorCard } from '../types'

// Demands use the same resource type codes as resource cards:
//   ARM=Armament  CON=Consumable  TRI=Trinket  TRG=Trade Good
// prizes: [1st place, 2nd place] contribution prize kinds, printed on the card.
// Amounts come from VISITOR_PRIZE_AMOUNTS by size (e.g. Small Coins = 2 / 1).
// Icon colours on the cards: orange=ARM, blue=CON, green=TRI, pink=TRG
export const VISITOR_CARDS: VisitorCard[] = [
  { id: 'v01', name: 'Alianna Lunagrove',   title: 'The Villager',            demand: '3 TRG',               size: 'Small', prizes: ['coins', 'coins'], imageFile: '/cards/visitors/Alianna Lunagrove - Small.png' },
  { id: 'v02', name: 'Barry Cycez',         title: 'The Collector',           demand: '5 ANY',               size: 'Large', prizes: ['take', 'take'], imageFile: '/cards/visitors/Barry Cycez - Large.png' },
  { id: 'v03', name: 'Bruceland Whisper',   title: 'The Half-Orc',            demand: '1 ARM, 1 TRI, 1 TRG', size: 'Small', prizes: ['break', 'break'], imageFile: '/cards/visitors/Bruceland Whisper - Small.png' },
  { id: 'v04', name: 'Caroline Spender',    title: 'The Profiteer',           demand: '1 ARM, 2 TRG',        size: 'Small', prizes: ['coins', 'draw'], imageFile: '/cards/visitors/Caroline Spender - Small.png' },
  { id: 'v05', name: 'Charley Barkinson',   title: 'The Volunteer',           demand: '3 CON, 1 TRG',        size: 'Small', prizes: ['refresh', 'refresh'], imageFile: '/cards/visitors/Charley Barkinson - Small.png' },
  { id: 'v06', name: 'Charley Malina',      title: 'The Enchantress',         demand: '3 CON, 2 TRI',        size: 'Large', prizes: ['refresh', 'refresh'], imageFile: '/cards/visitors/Charley Malina - Large.png' },
  { id: 'v07', name: 'Davinda Pendragon',   title: 'The Mystic',              demand: '1 CON, 2 TRI',        size: 'Small', prizes: ['draw', 'rep'], imageFile: '/cards/visitors/Davinda Pendragon - Small.png' },
  { id: 'v08', name: 'Dextren Maurice',     title: 'The Outsider',            demand: '2 TRI, 2 TRG',        size: 'Large', prizes: ['steal', 'coins'], imageFile: '/cards/visitors/Dextren Maurice - Large.png' },
  { id: 'v09', name: 'Elliot Caule',        title: 'The Ruffian',             demand: '3 ARM, 2 CON',        size: 'Large', prizes: ['break', 'break'], imageFile: '/cards/visitors/Elliot Caule - Large.png' },
  { id: 'v10', name: 'Emily Reight',        title: 'The Wildcard',            demand: '2 ARM, 1 TRI, 1 CON, 1 TRG', size: 'Large', prizes: ['draw', 'steal'], imageFile: '/cards/visitors/Emily Reight - Large.png' },
  { id: 'v11', name: 'Hayden Boyd',         title: 'The Hoarder',             demand: '5 TRI',               size: 'Small', prizes: ['steal', 'take'], imageFile: '/cards/visitors/Hayden Boyd - Small.png' },
  { id: 'v12', name: 'Jaida Marizon',       title: 'The Bard',                demand: '1 ARM, 4 TRI',        size: 'Large', prizes: ['rep', 'draw'], imageFile: '/cards/visitors/Jaida Marizon - Large.png' },
  { id: 'v13', name: 'James Macmalen',      title: 'The Researcher',          demand: '2 CON, 2 TRI, 1 TRG', size: 'Large', prizes: ['draw', 'rep'], imageFile: '/cards/visitors/James Macmalen - Large.png' },
  { id: 'v14', name: 'Jamie Overforest',    title: 'The Adventurer',          demand: '1 ARM, 1 CON, 1 TRI', size: 'Small', prizes: ['take', 'draw'], imageFile: '/cards/visitors/Jamie Overforest - Small.png' },
  { id: 'v15', name: 'Jon Rusher',          title: 'The Healer',              demand: '3 CON, 1 TRI',        size: 'Small', prizes: ['refresh', 'coins'], imageFile: '/cards/visitors/Jon Rusher - Small.png' },
  { id: 'v16', name: 'Karlos Marty',        title: 'The Hunter',              demand: '3 ARM, 2 CON',        size: 'Large', prizes: ['steal', 'break'], imageFile: '/cards/visitors/Karlos Marty - Large.png' },
  { id: 'v17', name: 'Kat Macmalen',        title: 'The Herbalist',           demand: '3 CON, 2 TRG',        size: 'Large', prizes: ['draw', 'refresh'], imageFile: '/cards/visitors/Kat Macmalen - Large.png' },
  { id: 'v18', name: 'Looner Woophly',      title: 'The Maniac',              demand: '1 ARM, 1 TRI, 1 CON, 1 TRG', size: 'Small', prizes: ['break', 'coins'], imageFile: '/cards/visitors/Looner Woophly - Small.png' },
  { id: 'v19', name: 'Loretta Bailsee',     title: 'The Explorer',            demand: '2 TRI, 2 TRG',        size: 'Small', prizes: ['take', 'steal'], imageFile: '/cards/visitors/Loretta Bailsee - Small.png' },
  { id: 'v20', name: 'Louie Waddle',        title: 'The Haggler',             demand: '2 TRI, 3 TRG',        size: 'Large', prizes: ['coins', 'coins'], imageFile: '/cards/visitors/Louie Waddle - Large.png' },
  { id: 'v21', name: 'Luka Griginey',       title: 'The Specialist',          demand: '2 CON, 2 TRI, 1 TRG', size: 'Large', prizes: ['take', 'draw'], imageFile: '/cards/visitors/Luka Griginey - Large.png' },
  { id: 'v22', name: 'Maizen Brikbrach',    title: 'The Lone Wolf',           demand: '2 ARM, 1 CON',        size: 'Large', prizes: ['break', 'steal'], imageFile: '/cards/visitors/Maizen Brikbrach - Large.png' },
  { id: 'v23', name: 'Philly Svecorin',     title: 'The Warden',              demand: '3 ARM',               size: 'Small', prizes: ['break', 'refresh'], imageFile: '/cards/visitors/Philly Svecorin - Small.png' },
  { id: 'v24', name: 'Romano Vertovin',     title: 'The Travelling Merchant', demand: '4 ANY',               size: 'Small', prizes: ['coins', 'refresh'], imageFile: '/cards/visitors/Romano Vertovin - Small.png' },
  { id: 'v25', name: 'Rose Sunguard',       title: 'The Scout',               demand: '2 ARM, 2 CON, 1 TRI', size: 'Large', prizes: ['refresh', 'take'], imageFile: '/cards/visitors/Rose Sunguard - Large.png' },
  { id: 'v26', name: 'Saint Casien Klawus', title: 'The Cleric',              demand: '2 CON, 1 TRI',        size: 'Small', prizes: ['rep', 'refresh'], imageFile: '/cards/visitors/Saint Casien Klawus - Small.png' },
  { id: 'v27', name: 'Stephano Morsin',     title: 'The Bodyguard',           demand: '3 ARM, 1 CON',        size: 'Small', prizes: ['refresh', 'break'], imageFile: '/cards/visitors/Stephano Morsin - Small.png' },
  { id: 'v28', name: 'Terry Brickbranch',   title: 'The Town Crier',          demand: '1 CON, 2 TRG',        size: 'Small', prizes: ['rep', 'coins'], imageFile: '/cards/visitors/Terry Brickbranch - Small.png' },
  { id: 'v29', name: 'Thomson Sperean',     title: 'The Worker',              demand: '1 CON, 2 TRG',        size: 'Small', prizes: ['draw', 'coins'], imageFile: '/cards/visitors/Thomson Sperean - Small.png' },
  { id: 'v30', name: 'Timon Kaphutais',     title: 'The Highwayman',          demand: '2 ARM, 1 CON',        size: 'Small', prizes: ['steal', 'steal'], imageFile: '/cards/visitors/Timon Kaphutais - Small.png' },
  { id: 'v31', name: 'Timothy Percivil',    title: 'The Craftsman',           demand: '2 ARM, 1 CON, 2 TRG', size: 'Large', prizes: ['coins', 'take'], imageFile: '/cards/visitors/Timothy Percivil - Large.png' },
  { id: 'v32', name: 'Willy Wildheart',     title: 'The Hermit',              demand: '2 CON, 2 TRG',        size: 'Small', prizes: ['draw', 'take'], imageFile: '/cards/visitors/Willy Wildheart - Small.png' },
  { id: 'v33', name: 'Yanneth Spierela',    title: 'The Noble',               demand: '2 ARM, 3 TRI',        size: 'Large', prizes: ['rep', 'coins'], imageFile: '/cards/visitors/Yanneth Spierela - Large.png' },
  { id: 'v34', name: 'Yasmin Maris',        title: 'The Painter',             demand: '2 CON, 1 TRG',        size: 'Small', prizes: ['rep', 'draw'], imageFile: '/cards/visitors/Yasmin Maris - Small.png' },
]
