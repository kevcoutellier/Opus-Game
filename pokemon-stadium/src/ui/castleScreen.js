import { h, icon, keyboardNav, toast, typeBadge } from './dom.js';
import { menuScreen } from './menuScreen.js';
import { rentalScreen } from './rentalScreen.js';
import { ELITE_FOUR, GYMS, RIVAL, ofCity } from '../game/castle.js';
import { eliteRun, gymRun } from '../game/runs.js';
import { badgeCount } from '../game/progress.js';

export function castleScreen(game) {
  const { data, progress } = game;
  game.resetField();
  game.run = null;
  game.arena.setTheme('sunset');
  const badges = badgeCount(progress);
  game.arena.setScoreboard({ title: 'CHÂTEAU DES CHAMPIONS', left: 'BADGES', right: `${badges}/8` });
  game.audio.playTheme('menu');
  game.director.startOrbit({ radius: 40, height: 20, speed: 0.035 });
  const byId = (id) => data.species.find((s) => s.id === id);

  const gymCards = GYMS.map((gym) => {
    const won = !!progress.badges[gym.id];
    return h(
      `button.panel.gym-card${won ? '.won' : ''}`,
      { 'data-nav': true, onclick: () => startGym(gym) },
      h('div.gym-badge', { style: { background: gym.color } }, won ? '★' : ''),
      h(
        'div',
        h('div.gym-leader', gym.leader),
        h('div.hint', `Arène ${ofCity(gym.city)}`),
        h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' } }, typeBadge(data, gym.type), h('span.hint', won ? gym.badge : '2 combats')),
      ),
      h('div.gym-ace', icon(byId(gym.team[0]).num)),
    );
  });

  const eliteUnlocked = badges >= GYMS.length;
  const elite = h(
    `button.panel.elite-card${progress.elite ? '.won' : ''}`,
    { 'data-nav': true, onclick: () => startElite() },
    h('div.gym-leader', progress.elite ? '🏆 Conseil 4 vaincu' : eliteUnlocked ? 'Conseil 4' : '🔒 Conseil 4'),
    h('div.hint', `${ELITE_FOUR.map((e) => e.name).join(', ')}, puis ton rival ${RIVAL.name} : 5 combats d'affilée.`),
    h('div.elite-icons', [...ELITE_FOUR.map((e) => byId(e.team[0])), byId(RIVAL.team[1])].map((s) => icon(s.num))),
  );

  function startGym(gym) {
    game.audio.sfx('select');
    game.run = gymRun(data, gym);
    game.show(rentalScreen);
  }

  function startElite() {
    if (!eliteUnlocked) {
      toast(`Il te faut les 8 badges (${badges}/8)`);
      game.audio.sfx('back');
      return;
    }
    game.audio.sfx('select');
    game.run = eliteRun(data);
    game.show(rentalScreen);
  }

  const el = h(
    'div.screen.hub-screen',
    h('div.hub-header', h('h2', 'Château des Champions'), h('p.hint', 'Chaque arène : un disciple puis le Champion, règles de la Coupe Poké (niv. 50 à 55). Les 8 badges ouvrent le Conseil 4.')),
    h('div.gym-grid', gymCards),
    elite,
    h('div.hub-footer', h('button.btn.ghost', { 'data-nav': true, onclick: () => game.show(menuScreen) }, 'Retour')),
  );
  const nav = keyboardNav(el, { onBack: () => game.show(menuScreen) });
  nav.focus(0);
  return { el, destroy: () => nav.destroy() };
}
