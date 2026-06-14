import type { ModuleBlueprintsCopy } from '../../../model/workbench'

const moduleblueprints: ModuleBlueprintsCopy = {
  characters: {
    title: 'Character Editor',
    state: 'Reserved',
    summary: 'Roster, portraits, schedules, dialogue bindings, and relationships will converge here.',
    focusTitle: 'Portrait / Schedule Focus',
    listTitle: 'Roster',
    inspectorTitle: 'Linked Parameters',
    list: ['Abigail', 'Lewis', 'Robin', 'Wizard'],
    lanes: ['Portrait + emotions', 'Schedule timeline', 'Dialogue relations', 'Festival conditions'],
    bullets: ['Bidirectional map anchors', 'NPC spawn validation', 'Weather and season conditions'],
    nodes: [],
  },
  buildings: {
    title: 'Building Editor',
    state: 'Reserved',
    summary: 'Footprints, entry points, interior mapping, and upgrade stages will reuse the same dock system.',
    focusTitle: 'Footprint / Entry Focus',
    listTitle: 'Building List',
    inspectorTitle: 'Upgrade Chain',
    list: ['Barn', 'Coop', 'Shop', 'Town Hall'],
    lanes: ['Footprint', 'Entry', 'Interior mapping', 'Upgrade stage'],
    bullets: ['Collision footprint checks', 'Entry visualization', 'Upgrade diff preview'],
    nodes: [],
  },
  items: {
    title: 'Item Editor',
    state: 'Reserved',
    summary: 'Definitions, atlases, shop rules, drops, and rewards will share one dense editing surface.',
    focusTitle: 'Atlas / Definition Focus',
    listTitle: 'Catalog',
    inspectorTitle: 'Distribution Rules',
    list: ['Seeds', 'Quest Item', 'Craftable', 'Festival Reward'],
    lanes: ['Definition', 'Icon atlas', 'Shop rules', 'Drops + rewards'],
    bullets: ['Atlas coordinate preview', 'Rarity and value balancing', 'Reward source chains'],
    nodes: [],
  },
  events: {
    title: 'Event Graph',
    state: 'Reserved',
    summary: 'Trigger, Condition, Action, and Dialogue will work as a graph linked back into the map viewport.',
    focusTitle: 'Node Graph',
    listTitle: 'Node Catalog',
    inspectorTitle: 'Execution Rules',
    list: ['Trigger', 'Condition', 'Action', 'Dialogue'],
    lanes: ['Map trigger', 'Conditional branch', 'Action node', 'Dialogue node'],
    bullets: ['Bidirectional links to map objects', 'Time and relationship conditions', 'Graph-to-inspector write-back'],
    nodes: [
      {
        title: 'Town Entry',
        detail: 'Trigger',
      },
      {
        title: 'Festival Gate',
        detail: 'Condition',
      },
      {
        title: 'Mayor Intro',
        detail: 'Dialogue',
      },
      {
        title: 'Reward Mail',
        detail: 'Action',
      },
    ],
  },
}

export default moduleblueprints
