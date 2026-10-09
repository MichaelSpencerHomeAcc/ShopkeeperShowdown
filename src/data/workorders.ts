import type { WorkOrderCard } from '../types'

// Recipe icons on the cards: orange=ARM, blue=CON, green=TRI, pink=TRG
// Data read directly from card art.
export const WORK_ORDER_CARDS: WorkOrderCard[] = [
  { id: 'wo01', name: "Artisan's Shield",   recipe: '1 ARM + 1 TRI + 3 TRG', price: 14, tagline: "Its last owner only perished when he put it down to rest his arm.", imageFile: "/cards/workorders/Artisan's Shield.png" },
  { id: 'wo02', name: 'Cliffwatch Lenses',  recipe: '1 CON + 2 TRI + 1 TRG', price: 11, tagline: "I can see for miles. Mostly trees. Lot of trees, actually.",           imageFile: '/cards/workorders/Cliffwatch Lenses.png' },
  { id: 'wo03', name: 'Dragonbane',         recipe: '2 ARM + 1 CON + 1 TRI', price: 11, tagline: "Named before it was trialled.",                                          imageFile: '/cards/workorders/Dragonbane.png' },
  { id: 'wo04', name: 'Endless Paintbrush', recipe: '2 TRI + 2 TRG',         price: 10, tagline: "Endless inspiration never includes 'I'.",                               imageFile: '/cards/workorders/Endless Paintbrush.png' },
  { id: 'wo05', name: 'Hartswood Carrier',  recipe: '2 ARM + 1 TRG',         price: 8, tagline: "Can carry other types of wood as well.",                                imageFile: '/cards/workorders/Hartswood Carrier.png' },
  { id: 'wo06', name: 'Heartsong',          recipe: '2 ARM + 2 CON + 1 TRI', price: 14, tagline: "True music always comes from the heart.",                               imageFile: '/cards/workorders/Heartsong.png' },
  { id: 'wo07', name: 'Hopesplinter',       recipe: '3 ARM + 1 CON + 1 TRG', price: 16, tagline: "It's the hope that kills them.",                                        imageFile: '/cards/workorders/Hopesplinter.png' },
  { id: 'wo08', name: 'Mystic Compass',     recipe: '2 CON + 1 TRI',         price: 8, tagline: "Even the Lost City can't hide from this device.",                       imageFile: '/cards/workorders/Mystic Compass.png' },
  { id: 'wo09', name: 'Seaheart Diviner',   recipe: '1 CON + 4 TRI',         price: 15, tagline: "All I see in your future is water... oh and fish... lots of fish.",     imageFile: '/cards/workorders/Seaheart Diviner.png' },
  { id: 'wo10', name: 'Seared Drake Feast', recipe: '1 CON + 2 TRG',         price: 8, tagline: "Now they know how it feels to get toasted by flames.",                  imageFile: '/cards/workorders/Seared Drake Feast.png' },
  { id: 'wo11', name: "Seeker's Gaze",      recipe: '1 CON + 2 TRI + 1 TRG', price: 11, tagline: "Remember to return it to the Seeker when you're done with it.",         imageFile: "/cards/workorders/Seeker's Gaze.png" },
  { id: 'wo12', name: 'Starforge Steel',    recipe: '2 CON + 1 TRI + 2 TRG', price: 14, tagline: "Forged under starlight. Delivered under deadline.",                     imageFile: '/cards/workorders/Starforge Steel.png' },
  { id: 'wo13', name: 'Starpetal Infusion', recipe: '3 CON + 1 TRI',         price: 10, tagline: "Cures almost all ailments... almost all...",                            imageFile: '/cards/workorders/Starpetal Infusion.png' },
  { id: 'wo14', name: 'The Last Word',      recipe: '3 ARM + 1 CON',         price: 12, tagline: "Never lose an argument with this in your pocket.",                      imageFile: '/cards/workorders/The Last Word.png' },
  { id: 'wo15', name: 'The Negotiator',     recipe: '2 ARM + 2 TRG',         price: 11, tagline: "Sometimes when words don't do the trick, you need a little negotiation.", imageFile: '/cards/workorders/The Negotiator.png' },
  { id: 'wo16', name: 'Truthringer',        recipe: '3 TRI + 1 TRG',         price: 11, tagline: "Hasn't rang during council sessions for years now.",                    imageFile: '/cards/workorders/Truthringer.png' },
  { id: 'wo17', name: 'Velvet Sting',       recipe: '2 ARM + 1 TRG',         price: 8, tagline: "Named after the first thing it cut: too fancy for opening a biscuit.",  imageFile: '/cards/workorders/Velvet Sting.png' },
  { id: 'wo18', name: 'Vial of Blessings',  recipe: '2 CON + 2 TRI',         price: 11, tagline: "Do not drink around heavy sneezes.",                                    imageFile: '/cards/workorders/Vial of Blessings.png' },
  { id: 'wo19', name: 'Winter Stockpile',   recipe: '1 CON + 4 TRG',         price: 14, tagline: "Keep the tavern stocked and open all day of winter.",                   imageFile: '/cards/workorders/Winter Stockpile.png' },
  { id: 'wo20', name: 'Wintercourt Mantle', recipe: '2 ARM + 1 CON + 1 TRI', price: 12, tagline: "Great for dramatic exits, better for dramatic weather.",                imageFile: '/cards/workorders/Wintercourt Mantle.png' },
]
