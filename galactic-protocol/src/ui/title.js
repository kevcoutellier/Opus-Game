// Title screen, scenario and faction selection, opening crawl.
import { SCENARIOS, SCENARIO_BY_ID } from '../data/scenarios.js';
import { GOVERNMENTS, AGENCIES } from '../data/factions.js';
import { createGame, difficultyStars } from '../engine/setup.js';
import { militaryPower, staticSystem, yearLabel } from '../engine/query.js';
import { listSaves, loadGame } from '../engine/save.js';
import { leaderImage } from '../assetSources.js';
import { clear, fmt, h, esc, aurebesh, holoPic, project } from './dom.js';
import { emblemSvg, preloadEmblems } from './emblems.js';
import { startGame } from './game.js';
import { helpModal } from './help.js';
import { audio } from '../audio/audio.js';

export function stars(n) {
  return h('span', { class: 'stars', 'data-tip': `Difficulté ${n}/5` }, '★'.repeat(n), h('span', { class: 'off' }, '★'.repeat(5 - n)));
}

function idleLoop(app) {
  app.idle = true;
  const tick = (t) => {
    if (!app.idle) return;
    app.map.drawIdle(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// The idle galaxy is projected above a holotable (CSS perspective on the map canvas).
function holotable(on) {
  document.body.classList.toggle('holo-table', on);
}

export function titleScreen(app) {
  app.map.setState(null);
  holotable(true);
  if (!app.idle) idleLoop(app);
  // Browsers only allow music after a user gesture.
  const startMusic = () => audio.playTheme({ volume: 0.35, restart: false, loop: true });
  window.addEventListener('pointerdown', startMusic, { once: true });
  const root = clear(app.root);
  const saves = listSaves();
  const menu = h('div', { class: 'menu' },
    h('button', { class: 'btn primary', onclick: () => { audio.click(); scenarioScreen(app); } }, 'NOUVELLE PARTIE'),
    saves.length ? h('button', { class: 'btn', onclick: () => { audio.click(); loadScreen(app); } }, 'CHARGER UNE PARTIE') : null,
    h('button', { class: 'btn', onclick: () => { audio.click(); helpModal(app); } }, 'COMMENT JOUER'),
  );
  root.append(h('div', { class: 'screen dim' },
    h('div', { class: 'logo' },
      h('div', { class: 'pre' }, 'GRANDE STRATÉGIE GALACTIQUE'),
      h('h1', {}, 'GALACTIC PROTOCOL'),
      h('div', { class: 'sub' }, 'LE NOUVEL ORDRE'),
      aurebesh('galactic protocol'),
    ),
    menu,
    h('div', { class: 'emitter' }),
    h('div', { class: 'footer-note' }, 'Projet de fan non commercial inspiré de Global Protocol: New World Order. Star Wars et les visuels officiels sont la propriété de Lucasfilm Ltd. / Disney.'),
  ));
}

function loadScreen(app) {
  holotable(true);
  const root = clear(app.root);
  const saves = listSaves();
  const list = h('div', { class: 'stack' }, saves.map((meta) => h('div', { class: 'card row between' },
    h('div', {},
      h('div', {}, h('b', {}, meta.slot === 'auto' ? 'Sauvegarde automatique' : `Emplacement ${meta.slot}`), ` — ${meta.name}`),
      h('div', { class: 'muted small' }, `${SCENARIO_BY_ID[meta.scenario]?.name ?? meta.scenario} · ${yearLabel(meta.startYear + Math.floor(meta.day / 360))} · ${new Date(meta.savedAt).toLocaleString('fr-FR')}`),
    ),
    h('button', { class: 'btn primary small', onclick: () => {
      const state = loadGame(meta.slot);
      if (state) launch(app, state, false);
    } }, 'Charger'),
  )));
  root.append(h('div', { class: 'screen dim' }, h('div', { class: 'setup', style: { width: 'min(640px, 96vw)' } },
    h('div', { class: 'row between' }, h('h2', {}, 'Charger une partie'), h('button', { class: 'btn', onclick: () => titleScreen(app) }, 'Retour')),
    list,
  )));
}

function scenarioScreen(app) {
  app.map.setState(null);
  holotable(true);
  const root = clear(app.root);
  const cards = SCENARIOS.map((sc) => h('div', { class: 'scenario-card', onclick: () => { audio.click(); factionScreen(app, sc.id); } },
    h('div', { class: 'year' }, yearLabel(sc.year)),
    h('h3', {}, sc.name),
    h('p', {}, sc.tagline),
    h('p', { class: 'small', style: { marginTop: '8px' } }, `${sc.factions.length} factions jouables`),
  ));
  root.append(h('div', { class: 'screen dim' }, h('div', { class: 'setup' },
    h('div', { class: 'row between' }, h('h2', {}, 'Choisissez une époque'), h('button', { class: 'btn', onclick: () => titleScreen(app) }, 'Retour')),
    h('div', { class: 'scenario-grid' }, cards),
  ), h('div', { class: 'emitter' })));
}

async function factionScreen(app, scenarioId) {
  const sc = SCENARIO_BY_ID[scenarioId];
  const preview = createGame({ scenario: scenarioId, player: sc.factions[0].id, seed: 1 });
  preview.factions[sc.factions[0].id].isPlayer = false;
  await preloadEmblems(Object.values(preview.factions));
  const ratings = difficultyStars(preview);
  holotable(false);
  app.idle = false;
  app.map.setState({ ...preview, player: null });
  app.map.centerOn(preview.factions[sc.factions[0].id].capital, 0.55);
  const drawPreview = () => {
    if (!app.previewing) return;
    app.map.draw();
    requestAnimationFrame(drawPreview);
  };
  app.previewing = true;
  requestAnimationFrame(drawPreview);

  const root = clear(app.root);
  const detail = h('div', { class: 'faction-detail' });
  const items = [];
  const order = [...sc.factions].sort((a, b) => ratings[a.id] - ratings[b.id]);
  const select = (fid) => {
    items.forEach((it) => it.classList.toggle('selected', it.dataset.id === fid));
    const f = preview.factions[fid];
    app.map.centerOn(f.capital);
    const g = GOVERNMENTS[f.gov];
    const ag = AGENCIES[f.agency];
    const systems = Object.values(preview.systems).filter((s) => s.owner === fid);
    const popTotal = systems.reduce((acc, s) => acc + s.pop, 0);
    const img = leaderImage(f.leader);
    project(detail);
    clear(detail).append(
      h('div', { class: 'row', style: { gap: '14px', alignItems: 'flex-start' } },
        img ? holoPic(img, { width: 88, height: 116, alt: f.leader }) : h('div', { class: 'emblem', style: { width: '84px', height: '84px' }, html: emblemSvg(f, 56) }),
        h('div', { class: 'stack', style: { gap: '4px' } },
          h('div', { class: 'row' }, h('span', { class: 'emblem', style: { width: '34px', height: '34px' }, html: emblemSvg(f, 22) }), h('h3', { style: { fontSize: '17px', color: f.color } }, f.name)),
          h('div', {}, 'Dirigeant : ', h('b', {}, f.leader)),
          h('div', { class: 'row' }, 'Difficulté : ', stars(ratings[fid])),
          h('div', { class: 'muted small' }, `Capitale : ${staticSystem(f.capital).name}`),
        ),
      ),
      h('div', { class: 'grid2' },
        h('div', { class: 'kv' }, h('span', {}, 'Systèmes'), h('span', {}, systems.length)),
        h('div', { class: 'kv' }, h('span', {}, 'Population'), h('span', {}, `${fmt(popTotal)} Md`)),
        h('div', { class: 'kv' }, h('span', {}, 'PIB / jour'), h('span', {}, fmt(f.econ.gdp))),
        h('div', { class: 'kv' }, h('span', {}, 'Puissance militaire'), h('span', {}, fmt(militaryPower(preview, fid)))),
        h('div', { class: 'kv' }, h('span', {}, 'Trésorerie'), h('span', {}, fmt(f.treasury))),
        h('div', { class: 'kv' }, h('span', {}, 'Technologies'), h('span', {}, f.techs.length)),
      ),
      h('div', { class: 'card small' }, h('b', {}, g.name), h('div', { class: 'muted' }, g.desc)),
      h('div', { class: 'card small' }, h('b', {}, ag.name), h('div', { class: 'muted' }, ag.desc)),
      f.goal ? h('div', { class: 'card small' }, h('b', { class: 'accent' }, 'Objectif : '), f.goal.text) : null,
      h('div', { class: 'small muted' }, `Victoire : accomplir votre objectif ou produire ${Math.round(Math.max(0.6, f.startShare + (1 - f.startShare) * 0.6) * 100)} % de la richesse galactique (${Math.round(f.startShare * 100)} % au départ).`),
      h('button', { class: 'btn primary', style: { padding: '12px', fontFamily: 'var(--title-font)' }, onclick: () => {
        audio.click();
        app.previewing = false;
        const state = createGame({ scenario: scenarioId, player: fid, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
        crawl(app, sc, () => launch(app, state, true));
      } }, 'PRENDRE LE COMMANDEMENT'),
    );
  };
  for (const entry of order) {
    const f = preview.factions[entry.id];
    const item = h('div', { class: 'faction-item', dataset: { id: f.id }, onclick: () => { audio.click(); select(f.id); } },
      h('span', { class: 'emblem', style: { width: '30px', height: '30px' }, html: emblemSvg(f, 20) }),
      h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, f.name), h('div', { class: 'muted small' }, f.leader)),
      stars(ratings[f.id]),
    );
    items.push(item);
  }
  root.append(h('div', { class: 'screen', style: { background: 'linear-gradient(90deg, rgba(3,5,11,0.2), rgba(3,5,11,0.75))', alignItems: 'flex-end', paddingRight: '2vw' } },
    h('div', { class: 'setup', style: { width: 'min(900px, 96vw)' } },
      h('div', { class: 'row between' },
        h('div', {}, h('h2', {}, sc.name), h('div', { class: 'muted small' }, `${yearLabel(sc.year)} — ${esc(sc.tagline)}`)),
        h('button', { class: 'btn', onclick: () => { app.previewing = false; scenarioScreen(app); idleLoop(app); } }, 'Retour'),
      ),
      h('div', { class: 'faction-layout' }, h('div', { class: 'faction-list scroll' }, items), h('div', { class: 'scroll', style: { maxHeight: '62vh' } }, detail)),
    ),
  ));
  select(order[0].id);
}

function crawl(app, sc, done) {
  holotable(false);
  const root = clear(app.root);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    audio.stopTheme();
    done();
  };
  const wrap = h('div', { class: 'crawl-wrap', onclick: finish },
    h('div', { class: 'crawl-intro' }, 'Il y a bien longtemps, dans une galaxie lointaine, très lointaine....'),
    h('div', { class: 'crawl' }, h('div', { class: 'crawl-inner' },
      h('h2', {}, 'GALACTIC PROTOCOL'),
      h('h1', {}, sc.crawl.title),
      sc.crawl.text.map((p) => h('p', {}, p)),
    )),
    h('button', { class: 'btn crawl-skip', onclick: (e) => { e.stopPropagation(); finish(); } }, 'Passer ▸'),
  );
  root.append(wrap);
  audio.playTheme({ volume: 0.9, restart: true });
  setTimeout(finish, 52000);
}

function launch(app, state, fresh) {
  holotable(false);
  app.idle = false;
  app.previewing = false;
  startGame(app, state, { fresh });
}
