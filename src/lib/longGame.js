// ═══════════════════════════════════════════════════════════════
// THE LONG GAME, 1450–1800 — all the history lives here.
// The game screen (components/builders/LongGame.js) only reads this file,
// so you can fix a fact, retune a number, or add an era without touching React.
//
// Stats run 0–15. Power = the four stats added together.
// effects: { tech, open, ideas, econ } — numbers to add (negative = lose).
// history: true marks the choice the real empire made.
// ═══════════════════════════════════════════════════════════════

export const STATS = [
  { key: 'tech', label: 'Technology', short: 'Tech' },
  { key: 'open', label: 'Openness', short: 'Open' },
  { key: 'ideas', label: 'Ideas', short: 'Ideas' },
  { key: 'econ', label: 'Economy', short: 'Econ' },
]
export const STAT_MAX = 15

export const EMPIRES = [
  { id: 'ottoman', name: 'Ottoman Empire', color: '#3e8ef7', start: { tech: 6, open: 5, ideas: 4, econ: 7 },
    geo: { label: 'Crossroads', note: 'Controls the land and sea routes between Asia and Europe.' } },
  { id: 'safavid', name: 'Safavid Persia', color: '#2fbf71', start: { tech: 3, open: 4, ideas: 5, econ: 5 },
    geo: { label: 'Crossroads', note: 'Sits on the Silk Road, squeezed between bigger neighbors.' } },
  { id: 'mughal', name: 'Mughal India', color: '#ff8a3d', start: { tech: 3, open: 5, ideas: 4, econ: 8 },
    geo: { label: 'Rich river plains', note: 'Huge farming wealth; mountains guard the north.' } },
  { id: 'china', name: 'Ming & Qing China', color: '#e8436e', start: { tech: 5, open: 4, ideas: 5, econ: 9 },
    geo: { label: 'Giant and self-sufficient', note: 'Makes almost everything it needs at home.' } },
  { id: 'japan', name: 'Japan', color: '#9b6cff', start: { tech: 3, open: 4, ideas: 4, econ: 5 },
    geo: { label: 'Island', note: 'The sea makes invasion hard, and closing the doors easy.' } },
  { id: 'russia', name: 'Russia', color: '#2aaba3', start: { tech: 2, open: 3, ideas: 3, econ: 3 },
    geo: { label: 'Vast and cold', note: 'Hard to conquer, hard to reach the sea.' } },
  { id: 'iberia', name: 'Spain & Portugal', color: '#c9a227', start: { tech: 4, open: 5, ideas: 4, econ: 4 },
    geo: { label: 'Atlantic coast', note: 'No effect yet. Watch what happens in Era 4.' } },
  { id: 'northsea', name: 'England & the Netherlands', color: '#6c63ff', start: { tech: 3, open: 5, ideas: 4, econ: 3 },
    geo: { label: 'Atlantic coast', note: 'No effect yet. Watch what happens in Era 4.' } },
]

export const ERAS = [
  {
    n: 1, years: '1450–1550', title: 'The Gunpowder Era',
    question: 'New weapons are spreading across the world. What will you do with them?',
    lesson: 'Lesson 11',
    cards: {
      ottoman: {
        prompt: 'It is 1453. The walls of Constantinople have stopped attackers for 1,000 years. A Hungarian engineer offers to build you the biggest cannons anyone has ever seen.',
        choices: [
          { id: 'a', label: 'Pay him. Build giant cannons and blast the walls.', effects: { tech: 3, econ: 2 }, history: true, result: 'The walls fall. Constantinople becomes your capital and controls the trade between Asia and Europe.' },
          { id: 'b', label: 'Surround the city and starve it out.', effects: { econ: -1 }, result: 'Ships keep bringing in food. The siege drags on for years.' },
          { id: 'c', label: 'Make peace and trade with the city instead.', effects: { open: 1, econ: 1 }, result: 'Trade grows, but the city stays in Byzantine hands.' },
        ],
        historyNote: 'Mehmed II hired the engineer Orban, battered the walls with cannons for weeks, and took Constantinople in 1453.',
      },
      safavid: {
        prompt: 'It is 1514. Your Qizilbash horsemen are the bravest in the region, and many of them think guns are cowardly. An Ottoman army with cannons is marching toward you.',
        choices: [
          { id: 'a', label: 'Trust your cavalry. Charge them at Chaldiran.', effects: { tech: -1, econ: -2 }, history: true, result: 'Cannons and muskets tear through your charge. You lose badly, and the Ottomans take your capital, Tabriz, for a time.' },
          { id: 'b', label: 'Buy guns and train musketeers, even if it is expensive.', effects: { tech: 2, econ: -1 }, result: 'Your army is ready sooner, but it costs a fortune.' },
          { id: 'c', label: 'Retreat and burn the land so they have nothing to eat.', effects: { econ: -1 }, result: 'The Ottomans go home hungry, but your own people suffer.' },
        ],
        historyNote: 'Shah Ismail charged at Chaldiran in 1514 and lost. Later shahs, above all Abbas I, built musket and cannon units.',
      },
      mughal: {
        prompt: 'It is 1526. You have about 12,000 soldiers in Kabul. The Sultan of Delhi has a huge army and war elephants, and India is rich.',
        choices: [
          { id: 'a', label: 'Copy the Ottoman way: chained carts, cannons, and matchlocks.', effects: { tech: 3, econ: 3 }, history: true, result: 'The guns panic the elephants. You win at Panipat in half a day and found an empire.' },
          { id: 'b', label: 'Attack with your horse archers alone.', effects: { econ: -1 }, result: 'The elephants and the bigger army crush your charge.' },
          { id: 'c', label: 'Stay in Kabul. India is too risky.', effects: {}, result: 'You stay safe, small, and poor.' },
        ],
        historyNote: 'Babur used Ottoman-style carts and guns at Panipat in 1526 and founded the Mughal Empire.',
      },
      china: {
        prompt: 'Your people invented gunpowder, but by the 1520s, Portuguese and Ottoman cannons are better than yours. Portuguese ships have started showing up on your coast.',
        choices: [
          { id: 'a', label: 'Copy the best foreign cannon designs for your army.', effects: { tech: 2, open: 1 }, history: true, result: 'Your armies get better guns, but you keep foreign traders at arm’s length.' },
          { id: 'b', label: 'Trust the Great Wall and your huge army. No changes.', effects: { open: -1 }, result: 'Nothing changes, and the gap with foreign weapons keeps growing.' },
          { id: 'c', label: 'Invite foreign gunmakers and traders to stay.', effects: { tech: 2, open: 2, econ: 1 }, result: 'New ideas and trade flow in, but your officials worry about foreign influence.' },
        ],
        historyNote: 'In the 1520s the Ming copied Portuguese breech-loading cannons, while still limiting foreign trade.',
      },
      japan: {
        prompt: 'It is 1543. A ship carrying Portuguese traders lands on the island of Tanegashima. They have muskets. Your warlords have been fighting each other for decades.',
        choices: [
          { id: 'a', label: 'Buy two muskets and have your blacksmiths copy them.', effects: { tech: 3, econ: 1 }, history: true, result: 'Within years, Japanese smiths are making thousands of guns.' },
          { id: 'b', label: 'Ignore them. Samurai fight with swords.', effects: {}, result: 'Your rivals get guns first.' },
          { id: 'c', label: 'Drive the foreigners away.', effects: { open: -2 }, result: 'The Portuguese leave and take their guns with them.' },
        ],
        historyNote: 'Japanese smiths copied the Tanegashima muskets so fast that guns helped decide Japan’s wars within a generation.',
      },
      russia: {
        prompt: 'Your small state around Moscow has just stopped paying tribute to the Mongols. Your nobles, the boyars, fight on horseback with bows. Neighbors to the west have guns.',
        choices: [
          { id: 'a', label: 'Hire foreign gunmakers and create musket units.', effects: { tech: 2, econ: -1, open: 1 }, history: true, result: 'Your new musketeers make the czar stronger than the boyars.' },
          { id: 'b', label: 'Rely on the boyars’ cavalry.', effects: {}, result: 'The boyars stay powerful, and your army stays old-fashioned.' },
          { id: 'c', label: 'Keep your head down and avoid wars.', effects: { econ: 1 }, result: 'Peace helps trade, but your neighbors keep growing.' },
        ],
        historyNote: 'Ivan III ended Mongol rule in 1480. In 1550, Ivan IV created the streltsy, Russia’s first standing musket units.',
      },
      iberia: {
        prompt: 'Portugal’s ships are inching down the coast of Africa. Spain has just united its kingdoms. Both have learned to put cannons on ships.',
        choices: [
          { id: 'a', label: 'Send armed ships out into the Atlantic and around Africa.', effects: { tech: 2, open: 1, econ: 2 }, history: true, result: 'Your ships reach India and the Americas. Gold and silver begin to flow back.' },
          { id: 'b', label: 'Keep your money and soldiers at home in Europe.', effects: {}, result: 'You stay safe, but someone else will find those sea routes.' },
          { id: 'c', label: 'Trade in the Mediterranean through Ottoman ports.', effects: { econ: 1 }, result: 'You pay Ottoman prices for Asian goods.' },
        ],
        historyNote: 'Portugal reached India by sea in 1498, and Spain reached the Americas in 1492. Spain’s wealth came from conquest: disease, war, and forced labor killed millions of Indigenous people (Lesson 14).',
      },
      northsea: {
        prompt: 'It is 1485. England has just ended a long civil war between noble families. Cannons have made the nobles’ castles easy to knock down.',
        choices: [
          { id: 'a', label: 'The king builds royal cannons, raises taxes, and breaks the nobles’ private armies.', effects: { tech: 2, econ: 1 }, history: true, result: 'Power moves from the nobles to the king.' },
          { id: 'b', label: 'Let the nobles keep their castles and armies.', effects: { econ: -1 }, result: 'The nobles keep fighting each other.' },
          { id: 'c', label: 'Spend the money on merchant ships instead of cannons.', effects: { open: 1, econ: 1 }, result: 'Trade grows, but the nobles stay strong.' },
        ],
        historyNote: 'Henry VII, the first Tudor king, limited the nobles’ private armies and kept the strongest weapons for the crown.',
      },
    },
    events: [
      { title: '1453: Constantinople falls', text: 'The Ottomans now control the old trade routes between Asia and Europe. European merchants start looking for a way to Asia by sea.',
        effects: { iberia: { open: 1 }, northsea: { open: 1 } } },
    ],
  },
]
