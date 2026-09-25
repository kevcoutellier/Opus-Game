import { Battle } from '../engine/battle.js';
import { createPokemon } from '../engine/pokemon.js';
import { chooseAction, chooseReplacement } from '../engine/ai.js';
import { tween, wait } from '../render/tween.js';
import { h, hpColor, icon, keyboardNav, statusBadge } from './dom.js';
import { commentary, describe, effectivenessText } from './messages.js';
import { resultScreen } from './resultScreen.js';

const OUTCOME_END = new Set(['move', 'turn', 'switchIn', 'switchOut', 'cant']);

/** Looks ahead from a 'move' event to know whether the attack connects. */
function moveOutcome(events, i) {
  for (let j = i + 1; j < events.length; j++) {
    const ev = events[j];
    if (OUTCOME_END.has(ev.type)) break;
    if (ev.type === 'miss') return 'miss';
    if (ev.type === 'immune' || ev.type === 'fail' || ev.type === 'clause' || ev.type === 'mistProtect') return 'none';
    if (ev.type === 'charge' || ev.type === 'move') return 'none';
  }
  return 'hit';
}

function hudPanel(side) {
  const name = h('span.hud-name');
  const lvl = h('span.hud-level');
  const status = h('span');
  const fill = h('div.hp-fill');
  const numbers = h('div.hp-numbers');
  const balls = h('div.balls');
  const el = h(
    `div.panel.hud-mon.hidden.${side === 0 ? 'mine' : 'foe'}`,
    h('div.hud-line', h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 } }, name, status), lvl),
    h('div.hp-wrap', h('span.hp-label', 'PV'), h('div.hp-bar', fill), balls),
    side === 0 ? numbers : null,
  );
  let shownHp = 0;
  let maxHp = 1;
  const drawHp = (hp) => {
    shownHp = hp;
    const r = Math.max(0, hp / maxHp);
    fill.style.width = `${r * 100}%`;
    fill.style.background = hpColor(r);
    numbers.textContent = `${Math.round(hp)} / ${maxHp}`;
  };
  return {
    el,
    set(mon) {
      name.textContent = mon.name;
      lvl.textContent = `N.${mon.level}`;
      maxHp = mon.maxHp;
      drawHp(mon.hp);
      this.status(mon.status);
      el.classList.remove('hidden');
    },
    status(s) {
      status.replaceChildren(statusBadge(s) || '');
    },
    hide() {
      el.classList.add('hidden');
    },
    balls(team) {
      balls.replaceChildren(...team.map((p) => h(`span.ball${p.fainted ? '.out' : ''}`)));
    },
    animateHp(hp, duration = 0.7) {
      const from = shownHp;
      return tween(duration, (k) => drawHp(from + (hp - from) * k));
    },
  };
}

/**
 * @param {{species: object, level: number}[]} mine  the player's 3 Pokémon
 * @param {object} foe  round info ({ name, title, ai, theme }) + team of 3 { species, level }
 */
export function battleScreen(game, { mine, foe }) {
  const { data, battleScene: scene, director, audio, arena } = game;
  const playerName = game.settings.playerName;
  game.resetField();
  scene.setTrainersVisible(true);
  arena.setTheme(foe.theme);
  audio.playTheme('battle');

  const battle = new Battle({
    data,
    seed: (Math.random() * 2 ** 32) >>> 0,
    sides: [
      { name: playerName, pokemon: mine.map((m) => createPokemon(m.species, data, { level: m.level })) },
      { name: foe.name, pokemon: foe.team.map((m) => createPokemon(m.species, data, { level: m.level })) },
    ],
  });
  const ctx = { trainers: [playerName, foe.name] };

  // ------------------------------------------------------------------ DOM
  const huds = [hudPanel(0), hudPanel(1)];
  const text = h('span');
  const caret = h('span.caret', '▼');
  const messageBox = h('div.panel.message-box', text);
  const comment = h('div.commentary');
  const turnLabel = h('div.turn-counter', 'TOUR 1');
  const speedBtn = h('button.btn.small.ghost', { onclick: () => cycleSpeed() }, `x${game.settings.speed}`);
  const muteBtn = h('button.btn.small.ghost', { onclick: () => toggleMute() }, game.settings.music || game.settings.sfx ? '🔊' : '🔇');
  const command = h('div.panel.command-panel', { style: { display: 'none' } });
  const el = h(
    'div.screen.battle-screen',
    huds[1].el,
    huds[0].el,
    comment,
    h('div.top-controls', turnLabel, speedBtn, muteBtn),
    messageBox,
    command,
  );

  let destroyed = false;
  let skip = null;
  const advance = () => skip?.();
  el.addEventListener('pointerdown', (e) => {
    if (!command.contains(e.target) && !e.target.closest('.top-controls')) advance();
  });
  const keyHandler = (e) => {
    if (command.style.display === 'none' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      advance();
    }
  };
  window.addEventListener('keydown', keyHandler);

  function cycleSpeed() {
    const speeds = [1, 1.5, 2];
    const next = speeds[(speeds.indexOf(game.settings.speed) + 1) % speeds.length];
    game.saveSettings({ speed: next });
    speedBtn.textContent = `x${next}`;
  }

  function toggleMute() {
    const on = !(game.settings.music || game.settings.sfx);
    game.saveSettings({ music: on, sfx: on });
    muteBtn.textContent = on ? '🔊' : '🔇';
  }

  /** Typewriter message; resolves after a pause (or immediately on click). */
  async function say(message, { hold = 0.9 } = {}) {
    if (!message || destroyed) return;
    messageBox.style.display = '';
    const speed = game.settings.speed;
    let skipped = false;
    await new Promise((resolve) => {
      let i = 0;
      text.textContent = '';
      caret.remove();
      const step = () => {
        if (destroyed) return resolve();
        if (skipped) {
          text.textContent = message;
          return resolve();
        }
        i += 2;
        text.textContent = message.slice(0, i);
        if (i >= message.length) return resolve();
        setTimeout(step, 22 / speed);
      };
      skip = () => {
        skipped = true;
      };
      step();
    });
    text.append(caret);
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, (hold * 1000) / speed);
      skip = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    skip = null;
  }

  let commentTimer;
  function comment_(kind, chance = 0.6) {
    if (Math.random() > chance) return;
    const line = commentary(kind);
    if (!line) return;
    comment.textContent = line;
    comment.classList.add('show');
    audio.say(line);
    clearTimeout(commentTimer);
    commentTimer = setTimeout(() => comment.classList.remove('show'), 2600);
  }

  function refreshBoards() {
    huds[0].balls(battle.sides[0].pokemon);
    huds[1].balls(battle.sides[1].pokemon);
    arena.setScoreboard({
      title: foe.title.toUpperCase(),
      left: playerName,
      right: foe.name.split(' ').pop().toUpperCase(),
      leftBalls: battle.sides[0].pokemon.map((p) => !p.fainted),
      rightBalls: battle.sides[1].pokemon.map((p) => !p.fainted),
    });
  }

  // ------------------------------------------------------------ playback
  const lowHpWarned = new Set();
  let pendingEffect = null;

  async function flushEffect() {
    if (!pendingEffect) return;
    const { crit, eff } = pendingEffect;
    pendingEffect = null;
    if (crit) {
      await say('Coup critique !', { hold: 0.6 });
      comment_('crit', 0.5);
    }
    const t = effectivenessText(eff);
    if (t) {
      await say(t, { hold: 0.7 });
      comment_(eff > 1 ? 'superEffective' : 'weak', 0.45);
    }
  }

  async function play(events) {
    for (let i = 0; i < events.length; i++) {
      if (destroyed) return;
      const ev = events[i];
      if (!['damage', 'subDamage', 'hitCount'].includes(ev.type)) await flushEffect();
      await playEvent(ev, events, i);
    }
    await flushEffect();
  }

  async function playEvent(ev, events, i) {
    const side = ev.side;
    const mon = side !== undefined ? battle.active(side) : null;
    switch (ev.type) {
      case 'turn':
        turnLabel.textContent = `TOUR ${ev.turn}`;
        return;
      case 'switchIn': {
        const incoming = battle.sides[side].pokemon[ev.index];
        huds[side].hide();
        const msg = say(describe(ev, ctx), { hold: 0.2 });
        audio.sfx('throw');
        await scene.sendOut(side, incoming.species);
        audio.sfx('open');
        audio.cry(incoming.num);
        await msg;
        huds[side].set(incoming);
        refreshBoards();
        await wait(0.35);
        return;
      }
      case 'switchOut':
        await say(describe(ev, ctx), { hold: 0.2 });
        audio.sfx('recall');
        await scene.recall(side);
        scene.setSubstitute(side, false);
        huds[side].hide();
        return;
      case 'move': {
        const move = data.moves[ev.moveId];
        const outcome = moveOutcome(events, i);
        if (move.semiInvulnerable && !ev.called) scene.reveal(side);
        await say(describe(ev, ctx), { hold: 0.35 });
        if (move.charge && events[i + 1]?.type === 'charge') return;
        if (outcome === 'none' && move.category !== 'Status') return;
        if (['thunder', 'thunderbolt'].includes(move.id)) audio.sfx('thunder');
        if (move.selfdestruct) audio.sfx('explosion');
        await scene.playMove(side, move, outcome);
        if (outcome === 'miss') {
          audio.sfx('miss');
          scene.miss(1 - side);
        }
        return;
      }
      case 'charge':
        await Promise.all([say(describe(ev, ctx), { hold: 0.5 }), scene.charge(side, data.moves[ev.moveId])]);
        return;
      case 'damage': {
        const ratio = ev.hp / ev.maxHp;
        if (ev.source === 'move') {
          const strong = ev.eff > 1 || ev.crit;
          audio.sfx(ev.eff < 1 ? 'weak' : 'hit', { strong });
          await Promise.all([scene.hit(side, { eff: ev.eff, crit: ev.crit }), huds[side].animateHp(ev.hp)]);
          if (!pendingEffect) pendingEffect = { crit: ev.crit, eff: ev.eff };
          else pendingEffect.crit ||= ev.crit;
        } else {
          if (ev.source === 'psn' || ev.source === 'brn') scene.statusFx(side, ev.source);
          else if (ev.source !== 'substitute') scene.hit(side, {});
          const msg = describe(ev, ctx);
          await Promise.all([msg ? say(msg, { hold: 0.5 }) : null, huds[side].animateHp(ev.hp)]);
        }
        if (ratio > 0 && ratio < 0.25 && !lowHpWarned.has(mon)) {
          lowHpWarned.add(mon);
          audio.sfx('lowhp');
          comment_('lowHp', 0.5);
        }
        return;
      }
      case 'subDamage':
        audio.sfx('hit', { strong: false });
        await scene.hit(side, { sub: true });
        if (!pendingEffect) pendingEffect = { crit: ev.crit, eff: ev.eff };
        await say(describe(ev, ctx), { hold: 0.5 });
        return;
      case 'heal':
        audio.sfx('heal');
        await Promise.all([huds[side].animateHp(ev.hp), say(describe(ev, ctx), { hold: 0.5 })]);
        return;
      case 'miss':
        await say(describe(ev, ctx));
        comment_('miss', 0.35);
        return;
      case 'status':
        audio.sfx('status');
        huds[side].status(ev.status);
        await Promise.all([scene.statusFx(side, ev.status), say(describe(ev, ctx))]);
        return;
      case 'cure':
        huds[side].status(null);
        await say(describe(ev, ctx));
        return;
      case 'cant':
        scene.reveal(side);
        if (['slp', 'par', 'frz'].includes(ev.reason)) scene.statusFx(side, ev.reason);
        await say(describe(ev, ctx));
        return;
      case 'boost':
        audio.sfx(ev.amount > 0 ? 'statUp' : 'statDown');
        await Promise.all([scene.statChange(side, ev.stat, ev.amount > 0), say(describe(ev, ctx), { hold: 0.6 })]);
        return;
      case 'faint':
        audio.cry(mon.num, { rate: 0.75 });
        audio.sfx('faint');
        await scene.faint(side);
        huds[side].hide();
        refreshBoards();
        await say(describe(ev, ctx));
        comment_('faint', 0.7);
        return;
      case 'substitute':
        scene.setSubstitute(side, true);
        await say(describe(ev, ctx));
        return;
      case 'subBreak':
        scene.setSubstitute(side, false);
        await say(describe(ev, ctx));
        return;
      case 'transform':
        await scene.transform(side, game.byNum.get(ev.num));
        await say(describe(ev, ctx));
        return;
      case 'hitCount':
        await flushEffect();
        await say(describe(ev, ctx), { hold: 0.6 });
        return;
      case 'win':
        await say(describe(ev, ctx), { hold: 0.4 });
        return;
      default: {
        const msg = describe(ev, ctx);
        if (msg) await say(msg);
      }
    }
  }

  // --------------------------------------------------------------- input
  function hideCommand() {
    command.style.display = 'none';
    command.replaceChildren();
    messageBox.style.display = '';
  }

  /** Shows a command menu; `build(done)` returns its children. Arrow keys / gamepad move the focus. */
  function commandMenu(build, { onBack, onKey } = {}) {
    return new Promise((resolve) => {
      let nav;
      const done = (value) => {
        nav.destroy();
        hideCommand();
        resolve(value);
      };
      messageBox.style.display = 'none';
      command.style.display = '';
      command.replaceChildren(...build(done));
      nav = keyboardNav(command, { onBack: onBack && (() => onBack(done)), onKey: onKey && ((e) => onKey(e, done)) });
      nav.focus(0);
    });
  }

  function askSwitch(forced) {
    const req = battle.getRequest(0);
    const team = battle.sides[0].pokemon;
    return commandMenu(
      (done) => [
        h('div.prompt', forced ? 'Quel Pokémon envoyer ?' : 'Changer de Pokémon ?'),
        h(
          'div.switch-list',
          team.map((p, index) => {
            const r = p.hp / p.maxHp;
            return h(
              'button.switch-card',
              { 'data-nav': true, disabled: !req.switches.includes(index), onclick: () => done({ type: 'switch', index }) },
              icon(p.num),
              h(
                'div',
                h('div', { style: { fontWeight: 800 } }, p.name, ' ', statusBadge(p.status), index === battle.sides[0].active && !p.fainted ? ' (au combat)' : ''),
                h('div.hp-bar', h('div.hp-fill', { style: { width: `${r * 100}%`, background: hpColor(r) } })),
                h('div', { style: { fontSize: '12px', opacity: 0.8 } }, `${p.hp} / ${p.maxHp} PV`),
              ),
            );
          }),
        ),
        forced ? h('div') : h('div.side-actions', h('button.btn.ghost.small', { 'data-nav': true, onclick: () => done(null) }, 'Retour')),
      ],
      {
        onBack: forced ? null : (done) => done(null),
        onKey: (e, done) => {
          const n = Number(e.key);
          if (n >= 1 && n <= team.length && req.switches.includes(n - 1)) {
            done({ type: 'switch', index: n - 1 });
            return true;
          }
          return false;
        },
      },
    );
  }

  function confirmForfeit() {
    return commandMenu((done) => [
      h('div.prompt', 'Abandonner le combat ? Il sera compté comme une défaite.'),
      h('div.side-actions', { style: { flexDirection: 'row' } },
        h('button.btn.ghost', { 'data-nav': true, onclick: () => done(false) }, 'Non, continuer'),
        h('button.btn', { 'data-nav': true, onclick: () => done(true) }, 'Oui, abandonner'),
      ),
    ], { onBack: (done) => done(false) });
  }

  async function askAction() {
    const req = battle.getRequest(0);
    if (req.kind === 'locked') return { type: 'locked' };
    const mon = battle.active(0);
    const choice = await commandMenu(
      (done) => {
        const buttons = req.struggle
          ? [h('button.move-btn', { 'data-nav': true, style: { background: data.types.Normal.color }, onclick: () => done({ type: 'move', index: -1 }) }, h('div.mname', 'Lutte'), h('div.mmeta', h('span', 'Plus aucun PP !')))]
          : req.moves.map((m, i) => {
              const move = data.moves[m.id];
              const color = data.types[move.type].color;
              return h(
                'button.move-btn',
                {
                  'data-nav': true,
                  disabled: !m.usable,
                  style: { background: `linear-gradient(135deg, ${color}, ${color}aa)` },
                  onclick: () => done({ type: 'move', index: m.index }),
                  title: move.name,
                },
                h('span.key', i + 1),
                h('div.mname', move.nameFr),
                h('div.mmeta', h('span', `${data.types[move.type].fr} · ${move.category === 'Status' ? 'Statut' : move.category === 'Physical' ? 'Physique' : 'Spéciale'}`), h('span', m.disabled ? 'Bloquée' : `PP ${m.pp}/${m.maxPp}`)),
              );
            });
        return [
          h('div.prompt', `Que doit faire ${mon.name} ?`),
          h('div.moves-grid', buttons),
          h(
            'div.side-actions',
            h('button.btn.blue', { 'data-nav': true, disabled: !req.switches.length, onclick: () => done('switch') }, 'Changer (S)'),
            h('button.btn.ghost.small', { 'data-nav': true, onclick: () => done('forfeit') }, 'Abandonner'),
          ),
        ];
      },
      {
        onKey: (e, done) => {
          const n = Number(e.key);
          const usable = req.moves?.[n - 1]?.usable;
          if (n >= 1 && n <= 4 && (usable || (req.struggle && n === 1))) {
            done({ type: 'move', index: req.struggle ? -1 : n - 1 });
            return true;
          }
          if ((e.key === 's' || e.key === 'S') && req.switches.length) {
            done('switch');
            return true;
          }
          return false;
        },
      },
    );
    if (choice === 'switch') return (await askSwitch(false)) || askAction();
    if (choice === 'forfeit') return (await confirmForfeit()) ? { type: 'forfeit' } : askAction();
    audio.sfx('select');
    return choice;
  }

  // ------------------------------------------------------------- main loop
  async function run() {
    refreshBoards();
    director.overview(0);
    director.startOrbit({ radius: 26, height: 12, speed: 0.12 });
    await say(`${foe.name} veut se battre !`, { hold: 1.2 });
    comment_('sendOut', 0.9);
    await play(battle.start());
    let forfeited = false;
    while (!battle.isOver && !destroyed) {
      for (const side of [0, 1]) {
        if (battle.needsReplacement(side)) {
          const index = side === 0 ? (await askSwitch(true)).index : chooseReplacement(battle, 1, foe.ai);
          await play(battle.replace(side, index));
        }
      }
      if (battle.isOver || destroyed) break;
      director.battleView(0.8);
      const action = await askAction();
      if (action.type === 'forfeit') {
        forfeited = true;
        break;
      }
      await play(battle.playTurn([action, chooseAction(battle, 1, foe.ai)]));
    }
    if (destroyed) return;
    const won = !forfeited && battle.winner === 0;
    audio.playTheme(won ? 'victory' : 'menu');
    if (won) {
      comment_('win', 1);
      const winnerSide = 0;
      if (scene.actors[winnerSide]?.root.visible) {
        director.focus(winnerSide, scene.actorHeight(winnerSide), 0.8);
        await scene.celebrate(winnerSide);
      }
    }
    arena.cheer(1, 3);
    audio.sfx('crowd', { dur: 2.5, gain: 0.25 });
    await wait(1.2);
    game.show(resultScreen, {
      won,
      foe,
      turns: battle.turn,
      survivors: battle.sides[0].pokemon.filter((p) => !p.fainted).length,
      team: mine.map((m) => ({ num: m.species.num, level: m.level })),
    });
  }

  run().catch((err) => {
    console.error(err);
    say(`Erreur : ${err.message}`);
  });

  return {
    el,
    destroy() {
      destroyed = true;
      skip?.();
      clearTimeout(commentTimer);
      window.removeEventListener('keydown', keyHandler);
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
  };
}
