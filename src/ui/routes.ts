import type { App, ScreenView } from '../app';
import { clubScreen } from './screens/club';
import { academyScreen, garageScreen } from './screens/garage';
import { homeScreen, playScreen } from './screens/home';
import { leagueScreen, seasonScreen } from './screens/league';
import { arenasScreen, prematchScreen } from './screens/prematch';
import { resultsScreen, trialResultScreen } from './screens/results';
import { settingsScreen } from './screens/settings';
import { setupScreen } from './screens/setup';

export const ROUTES: Record<string, (app: App, params: URLSearchParams) => ScreenView> = {
  setup: setupScreen,
  home: homeScreen,
  play: playScreen,
  league: leagueScreen,
  season: seasonScreen,
  prematch: prematchScreen,
  arenas: arenasScreen,
  results: resultsScreen,
  trial: trialResultScreen,
  garage: garageScreen,
  academy: academyScreen,
  club: clubScreen,
  settings: settingsScreen,
};
