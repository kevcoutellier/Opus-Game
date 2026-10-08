import { AssetManager } from './assets/AssetManager';
import { CampaignApp } from './campaign/CampaignApp';
import { openSaveStore } from './campaign/SaveStore';
import { Game } from './core/Game';

/** Pages of the campaign outside the battle (the title menu by default, the barracks). */
const CAMPAIGN_PAGES = ['', '#', '#campaign', '#barracks'];

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  // Official artwork and sounds installed by `npm run assets` (optional).
  const assets = new AssetManager();
  await assets.load();
  const store = openSaveStore();
  const hash = location.hash;
  if (CAMPAIGN_PAGES.includes(hash)) {
    const app = new CampaignApp(ui, store, assets);
    await app.start(hash);
    // Exposed for debugging from the console and for the browser tests.
    (window as unknown as { campaign: CampaignApp }).campaign = app;
    return;
  }
  // A campaign battle needs the saved army; without one, back to the barracks.
  let campaign = null;
  if (hash === '#campaign-battle') {
    const state = await store.load();
    if (!state?.deployment) {
      location.hash = '#barracks';
      location.reload();
      return;
    }
    campaign = { state, store };
  }
  const game = new Game(canvas, ui, assets, campaign);
  game.start();
  (window as unknown as { game: Game }).game = game;
}

void boot();
