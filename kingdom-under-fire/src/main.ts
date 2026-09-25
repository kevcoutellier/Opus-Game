import { Game } from './core/Game';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas, ui);
game.start();

// Exposed for debugging from the console and for the browser tests.
(window as unknown as { game: Game }).game = game;
