import { AssetManager } from './assets/AssetManager';
import { Game } from './core/Game';

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  // Official artwork and sounds installed by `npm run assets` (optional).
  const assets = new AssetManager();
  await assets.load();
  const game = new Game(canvas, ui, assets);
  game.start();
  // Exposed for debugging from the console and for the browser tests.
  (window as unknown as { game: Game }).game = game;
}

void boot();
