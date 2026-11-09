import type { ClubStyleId } from '../game/ai/bot';
import type { ArenaId } from './arenas';

export interface ClubDef {
  id: string;
  name: string;
  badge: string;
  primary: string;
  secondary: string;
  /** Alternative kit used when the primary clashes with the player's colours. */
  away: string;
  style: ClubStyleId;
  styleLabel: string;
  /** Relative strength within a division, roughly -1..1. Used for simulated fixtures and small bot adjustments. */
  rating: number;
}

export const PLAYER_ID = 'player';

export const CLUBS: Record<string, ClubDef> = {
  ember_works: { id: 'ember_works', name: 'Ember Works', badge: 'badge_flame', primary: '#F48A2C', secondary: '#3A2A22', away: '#7A3B2E', style: 'pressure', styleLabel: 'Direct pressure and rebounds', rating: 0.5 },
  tide_runners: { id: 'tide_runners', name: 'Tide Runners', badge: 'badge_wave', primary: '#1E9C8E', secondary: '#F1EEE3', away: '#1D3557', style: 'passing', styleLabel: 'Passing and width', rating: 0.2 },
  skyline_bots: { id: 'skyline_bots', name: 'Skyline Bots', badge: 'badge_skyline', primary: '#8A5CF0', secondary: '#2F6FE4', away: '#C9B8FF', style: 'wide', styleLabel: 'Wide support runs', rating: 0 },
  iron_comets: { id: 'iron_comets', name: 'Iron Comets', badge: 'badge_comet', primary: '#E24B4B', secondary: '#24395C', away: '#24395C', style: 'counter', styleLabel: 'Stable defence and counters', rating: -0.2 },
  sunset_gears: { id: 'sunset_gears', name: 'Sunset Gears', badge: 'badge_gear', primary: '#F2C230', secondary: '#7A3B74', away: '#7A3B74', style: 'balanced', styleLabel: 'Balanced play', rating: -0.5 },
  coral_cranes: { id: 'coral_cranes', name: 'Coral Cranes', badge: 'badge_anchor', primary: '#EC5F8E', secondary: '#F1EEE3', away: '#8A2F52', style: 'passing', styleLabel: 'Patient passing', rating: 0.3 },
  breakwater_united: { id: 'breakwater_united', name: 'Breakwater United', badge: 'badge_shield', primary: '#2F6FE4', secondary: '#F1EEE3', away: '#F48A2C', style: 'counter', styleLabel: 'Deep block and fast breaks', rating: 0.1 },
  neon_circuit: { id: 'neon_circuit', name: 'Neon Circuit', badge: 'badge_bolt', primary: '#3FB86B', secondary: '#17273E', away: '#17273E', style: 'pressure', styleLabel: 'Relentless pressing', rating: 0.4 },
  metro_volts: { id: 'metro_volts', name: 'Metro Volts', badge: 'badge_bolt', primary: '#F2C230', secondary: '#24395C', away: '#24395C', style: 'wide', styleLabel: 'Wing play and switches', rating: 0 },
  copper_kings: { id: 'copper_kings', name: 'Copper Kings', badge: 'badge_star', primary: '#C7773A', secondary: '#2B2B33', away: '#2B2B33', style: 'balanced', styleLabel: 'Composed all-round play', rating: 0.2 },
  polar_pistons: { id: 'polar_pistons', name: 'Polar Pistons', badge: 'badge_gear', primary: '#7FC4EA', secondary: '#1D3557', away: '#1D3557', style: 'counter', styleLabel: 'Ice-cool counters', rating: 0.3 },
  apex_orbit: { id: 'apex_orbit', name: 'Apex Orbit', badge: 'badge_comet', primary: '#24395C', secondary: '#F2C230', away: '#F2C230', style: 'pressure', styleLabel: 'Champion-level pressure', rating: 0.6 },
};

export interface DivisionDef {
  id: string;
  name: string;
  trophy: string;
  /** Five AI clubs (the player's club is the sixth). */
  clubs: string[];
  /** Bot difficulty level: 0 = Rookie, 1 = Club, 2 = Pro (fractions blend). */
  level: number;
  homeArena: ArenaId;
  awayArena: ArenaId;
}

export const DIVISIONS: DivisionDef[] = [
  { id: 'rookie_league', name: 'Rookie League', trophy: 'Rookie Cup', clubs: ['ember_works', 'tide_runners', 'skyline_bots', 'iron_comets', 'sunset_gears'], level: 0, homeArena: 'harbor_park', awayArena: 'harbor_park' },
  { id: 'harbor_division', name: 'Harbor Division', trophy: 'Harbor Shield', clubs: ['ember_works', 'tide_runners', 'coral_cranes', 'breakwater_united', 'sunset_gears'], level: 0.55, homeArena: 'harbor_park', awayArena: 'foundry_court' },
  { id: 'metro_division', name: 'Metro Division', trophy: 'Metro Plate', clubs: ['skyline_bots', 'iron_comets', 'neon_circuit', 'metro_volts', 'breakwater_united'], level: 1, homeArena: 'skyline_stadium', awayArena: 'foundry_court' },
  { id: 'premier_division', name: 'Premier Division', trophy: 'Premier Crown', clubs: ['coral_cranes', 'neon_circuit', 'copper_kings', 'polar_pistons', 'iron_comets'], level: 1.45, homeArena: 'championship_dome', awayArena: 'skyline_stadium' },
  { id: 'championship_league', name: 'Championship League', trophy: 'Tether League Trophy', clubs: ['apex_orbit', 'polar_pistons', 'copper_kings', 'metro_volts', 'ember_works'], level: 1.9, homeArena: 'championship_dome', awayArena: 'championship_dome' },
];
