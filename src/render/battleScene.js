import * as THREE from 'three';
import { PokemonActor } from './actor.js';
import { createPokeball, createTrainer } from './props.js';
import { spotOf } from './director.js';
import { TRAINER_SPOT } from './arena.js';
import { ease, lerp, tween, wait } from './tween.js';
import { CONTACT_SPRITES, STATUS_SPRITES, projectileSprite } from './moveSprites.js';

const TYPE_COLOR = {
  Normal: '#ffffff', Fighting: '#ff8a4a', Flying: '#cfe8ff', Poison: '#c05ce8', Ground: '#d9b36a',
  Rock: '#b89a6a', Bug: '#b5d33a', Ghost: '#8a6bff', Fire: '#ff7a1a', Water: '#4aa3ff',
  Grass: '#5fd35f', Electric: '#ffe74a', Psychic: '#ff6fcf', Ice: '#a8f0ff', Dragon: '#7a5cff', '???': '#ffffff',
};
const STAT_COLOR = { atk: '#ff5a4a', def: '#4a8cff', spc: '#c35cff', spe: '#4affc3', accuracy: '#ffe14a', evasion: '#e0e0e0' };
const STATUS_COLOR = { par: '#ffe74a', psn: '#c05ce8', tox: '#9b2fd6', brn: '#ff6a1a', frz: '#a8f0ff', slp: '#9fb3ff' };

// Physical moves in Gen 1 that are not contact moves and look better as projectiles.
const RANGED = new Set([
  'rockslide', 'rockthrow', 'earthquake', 'fissure', 'hyperbeam', 'swift', 'pinmissile', 'twineedle',
  'poisonsting', 'sludge', 'acid', 'smog', 'gust', 'sonicboom', 'triattack', 'spikecannon', 'barrage',
  'eggbomb', 'bonemerang', 'boneclub', 'payday', 'razorwind', 'selfdestruct', 'explosion', 'sandattack',
]);
const BEAMS = {
  hyperbeam: '#ffb347', solarbeam: '#f6ff7a', icebeam: '#a8f0ff', aurorabeam: '#ff9ae6', psybeam: '#ff6fcf',
  dragonrage: '#7a5cff', nightshade: '#5b2a9e', triattack: '#ffffff',
};

export class BattleScene {
  constructor(stage, arena, effects, director) {
    this.stage = stage;
    this.arena = arena;
    this.fx = effects;
    this.director = director;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.actors = [null, null];
    this.trainers = [createTrainer('#e2493b'), createTrainer('#3b6fe2')];
    this.trainers.forEach((t, side) => {
      t.position.set(0, 0.5, side === 0 ? TRAINER_SPOT : -TRAINER_SPOT);
      t.rotation.y = side === 0 ? Math.PI : 0;
      this.group.add(t);
    });
    this.subs = [false, false];
    stage.onUpdate((dt, time) => {
      for (const a of this.actors) a?.update(dt, time, stage.camera);
    });
  }

  clear() {
    for (const side of [0, 1]) {
      this.actors[side]?.dispose();
      this.actors[side] = null;
    }
    this.subs = [false, false];
  }

  setTrainersVisible(visible) {
    for (const t of this.trainers) t.visible = visible;
  }

  /** Loads and places a Pokémon without any animation (menus, previews). */
  async place(side, species) {
    const actor = await PokemonActor.create(species);
    this.actors[side]?.dispose();
    this.actors[side] = actor;
    const spot = spotOf(side);
    actor.root.position.copy(spot);
    actor.root.rotation.y = side === 0 ? Math.PI : 0;
    this.group.add(actor.root);
    return actor;
  }

  actorHeight(side) {
    return this.actors[side]?.height ?? 2;
  }

  async throwBall(side) {
    const trainer = this.trainers[side];
    const arm = trainer.userData.armR;
    const ball = createPokeball();
    const start = trainer.position.clone().add(new THREE.Vector3(0.5, 2.3, 0));
    const end = spotOf(side).add(new THREE.Vector3(0, 1.2, 0));
    this.group.add(ball);
    await tween(0.25, (k) => {
      arm.rotation.x = lerp(0, side === 0 ? -2.6 : 2.6, k);
    });
    tween(0.3, (k) => {
      arm.rotation.x = lerp(side === 0 ? -2.6 : 2.6, 0, k);
    });
    await tween(0.6, (k) => {
      ball.position.lerpVectors(start, end, k);
      ball.position.y += Math.sin(k * Math.PI) * 3.2;
      ball.rotation.x += side === 0 ? -0.35 : 0.35;
    }, ease.linear);
    this.fx.burst(end, '#ffffff', { count: 60, speed: 6, size: 0.9, life: 0.5 });
    this.fx.ring(end.clone().setY(0.05), '#ffffff', { radius: 3.5, duration: 0.5 });
    ball.removeFromParent();
    return end;
  }

  async sendOut(side, species, { cinematic = true } = {}) {
    const loading = this.place(side, species);
    if (cinematic) await this.director.trainerView(side, 0.7);
    const actor = await loading;
    actor.root.visible = false;
    actor.root.scale.setScalar(0.001);
    await this.throwBall(side);
    if (cinematic) this.director.focus(side, actor.height, 0.7);
    await actor.appear();
    this.arena.cheer(0.5, 1.2);
    return actor;
  }

  async recall(side) {
    const actor = this.actors[side];
    if (!actor) return;
    const from = this.trainers[side].position.clone().add(new THREE.Vector3(0, 2, 0));
    this.fx.beam(from, actor.center, '#ff4a4a', { width: 0.12, duration: 0.5 });
    await actor.recall();
  }

  // --------------------------------------------------------- move choreography

  /** Plays a move up to its impact. `outcome` is 'hit' | 'miss' | 'none'. */
  async playMove(side, move, outcome) {
    const user = this.actors[side];
    const target = this.actors[1 - side];
    if (!user) return;
    const color = TYPE_COLOR[move.type] || '#ffffff';
    const from = user.center;
    const to = target ? target.center : spotOf(1 - side).add(new THREE.Vector3(0, 1.2, 0));
    const missTo = to.clone().add(new THREE.Vector3(side === 0 ? 2.8 : -2.8, 1.5, side === 0 ? -3 : 3));
    const aim = outcome === 'miss' ? missTo : to;
    const id = move.id;

    if (move.target === 'self' || move.category === 'Status') {
      return this.playStatusMove(side, move, color, outcome);
    }

    this.director.attackView(side, user.height, 0.45);
    await wait(0.25);

    if (id === 'explosion' || id === 'selfdestruct') {
      await user.shake('#ffd27a');
      this.director.shake(1.2);
      await this.fx.explosion(from);
      return;
    }
    if (id === 'earthquake' || id === 'fissure') {
      this.director.overview(0.4);
      await user.spin(color);
      for (let i = 0; i < 3; i++) {
        this.director.shake(0.9);
        this.fx.ring(spotOf(side).setY(0.06), color, { radius: 14, duration: 0.6 });
        this.fx.spriteBurst(spotOf(1 - side).setY(0.3), 'rocks', { count: 8, speed: 6, up: 5, gravity: 14, size: 1.2, life: 0.9 });
        await wait(0.22);
      }
      return;
    }
    if (id === 'rockslide' || id === 'rockthrow') {
      await user.channel(color);
      this.director.focus(1 - side, target?.height ?? 2, 0.35);
      await this.fx.rocks(outcome === 'miss' ? missTo.setY(0) : spotOf(1 - side));
      this.fx.spriteBurst(aim, 'rock2', { count: 10, speed: 6, up: 3, gravity: 12, size: 0.9 });
      this.director.shake(0.6);
      return;
    }
    if (id === 'thunder') {
      await user.channel(color);
      this.director.focus(1 - side, target?.height ?? 2, 0.3);
      this.fx.flashScreen('#fffbd0', 0.3, 0.7);
      this.fx.pop(aim.clone().add(new THREE.Vector3(0, 1.5, 0)), 'lightning', { size: 4.5, duration: 0.6 });
      await this.fx.lightning(aim.clone().add(new THREE.Vector3(0, 16, 0)), aim, color, { duration: 0.6, bolts: 4 });
      this.fx.spriteBurst(aim, 'electroball', { count: 12, speed: 6, size: 1 });
      return;
    }
    if (id === 'thunderbolt' || id === 'thundershock') {
      await user.channel(color);
      this.fx.projectile(from, aim, color, { sprite: 'electroball', duration: 0.35, size: 1.4 });
      await this.fx.lightning(from, aim, color, { duration: 0.55 });
      this.fx.pop(aim, 'lightning', { size: 2.6, duration: 0.4 });
      return;
    }
    if (BEAMS[id]) {
      await user.channel(BEAMS[id]);
      if (id === 'hyperbeam' || id === 'solarbeam') this.director.shake(0.5);
      await this.fx.beam(from, aim, BEAMS[id], { width: id === 'hyperbeam' || id === 'solarbeam' ? 0.6 : 0.35, duration: 0.8 });
      if (outcome !== 'miss') this.fx.spriteBurst(aim, projectileSprite(move), { count: 12, speed: 6, size: 1.1 });
      return;
    }
    if (id === 'fireblast') {
      await user.channel(color);
      await this.fx.projectile(from, aim, '#ffb347', { sprite: 'flareball', duration: 0.5, size: 2.6, spin: 0.2 });
      if (outcome !== 'miss') {
        this.director.shake(0.6);
        this.fx.spriteBurst(aim, 'fireball', { count: 22, speed: 9, size: 1.3, life: 0.8 });
        this.fx.burst(aim, '#ff7a1a', { count: 60, speed: 9, size: 1.2, life: 0.8 });
        this.fx.burst(aim, '#ffe08a', { count: 40, speed: 4, size: 1.6, life: 0.6 });
        this.fx.ring(aim.clone().setY(0.1), '#ff7a1a', { radius: 4, duration: 0.6 });
      }
      return;
    }
    if (id === 'flamethrower' || id === 'ember') {
      await user.channel(color);
      await this.fx.stream(from, aim, color, { sprite: 'fireball', duration: 0.8, rate: 90, size: 1.2, speed: 16, jitter: 0.5 });
      if (outcome !== 'miss') this.fx.spriteBurst(aim, 'fireball', { count: 12, speed: 5, size: 1, up: 2 });
      return;
    }
    if (id === 'hydropump' || id === 'watergun' || id === 'bubblebeam' || id === 'bubble') {
      await user.channel(color);
      const thick = id === 'hydropump';
      await this.fx.stream(from, aim, color, { sprite: 'waterwisp', duration: thick ? 0.9 : 0.6, rate: thick ? 160 : 70, size: thick ? 1.5 : 0.9, speed: 18, jitter: thick ? 0.6 : 0.3 });
      if (outcome !== 'miss') this.fx.spriteBurst(aim, 'waterwisp', { count: 14, speed: 6, size: 0.9, up: 2, gravity: 8 });
      return;
    }
    if (id === 'psychic' || id === 'confusion') {
      await user.channel(color);
      this.director.focus(1 - side, target?.height ?? 2, 0.35);
      for (let i = 0; i < 3; i++) {
        this.fx.ring(aim, color, { radius: 3.5, duration: 0.5, vertical: true });
        await wait(0.15);
      }
      if (outcome !== 'miss') this.fx.spriteBurst(aim, 'mistball', { count: 10, speed: 4, size: 1.2 });
      return;
    }
    if (id === 'surf') {
      this.director.sideView(side, 0.4);
      await user.channel(color);
      await this.fx.stream(spotOf(side).setY(0.6), aim.clone().setY(0.8), color, { sprite: 'waterwisp', duration: 0.8, rate: 150, size: 1.8, speed: 13, jitter: 1.4 });
      this.fx.burst(aim, '#ffffff', { count: 50, speed: 6, size: 0.8, up: 3 });
      return;
    }
    if (id === 'blizzard') {
      await user.channel(color);
      await this.fx.stream(from, aim, '#ffffff', { sprite: 'icicle', duration: 0.9, rate: 90, size: 1, speed: 12, jitter: 1.6 });
      this.fx.stream(from, aim, '#ffffff', { duration: 0.6, rate: 160, size: 0.6, speed: 12, jitter: 1.8 });
      return;
    }
    if (id === 'megadrain' || id === 'absorb' || id === 'leechlife' || id === 'dreameater') {
      if (move.category === 'Physical') await user.lunge(to, 3.5);
      else await user.channel(color);
      if (outcome !== 'miss') this.fx.stream(to, from, '#8dff8d', { sprite: 'energyball', duration: 0.6, rate: 40, size: 0.8, speed: 9 });
      return;
    }
    if (id === 'swift') {
      await user.channel('#fff27a');
      for (let i = 0; i < 4; i++) {
        this.fx.projectile(from.clone().add(new THREE.Vector3(0, i * 0.2, 0)), aim, '#fff27a', { sprite: 'shine', duration: 0.35, size: 1.1, arc: 1 - i * 0.4, spin: 0.3 });
        await wait(0.08);
      }
      await wait(0.3);
      return;
    }
    if (move.trap) {
      await user.channel(color);
      const center = target ? target.center : aim;
      for (let i = 0; i < 3; i++) {
        this.fx.ring(center.clone().setY(0.4 + i * 0.6), color, { radius: 2, duration: 0.45 });
        if (id === 'firespin') this.fx.spriteBurst(center, 'fireball', { count: 6, speed: 3, size: 1 });
        await wait(0.12);
      }
      return;
    }

    const physical = move.category === 'Physical' && !RANGED.has(id);
    if (physical) {
      this.director.sideView(side, 0.35);
      // Dash until just in front of the target; the return trip plays in the background.
      await user.lunge(to, outcome === 'miss' ? 3 : Math.max(2.5, 14.4 - 1.2 - (target?.width ?? 1) * 0.5 - user.width * 0.5));
      if (outcome !== 'miss') {
        const contact = CONTACT_SPRITES[id] || 'impact';
        if (contact === 'bite') this.fx.bite(to);
        else this.fx.pop(to, contact, { size: contact === 'impact' ? 2.2 : 1.8, rotation: Math.random() * 0.6 - 0.3 });
        if (move.type !== 'Normal' && move.type !== 'Fighting') this.fx.spriteBurst(to, projectileSprite(move), { count: 8, speed: 5, size: 0.9 });
        this.fx.burst(to, color === '#ffffff' ? '#ffe9a8' : color, { count: 24, speed: 7, size: 0.6, life: 0.35 });
      }
      return;
    }

    // Generic special / ranged move by type, drawn with Showdown's effect sprites.
    await user.channel(color);
    const sprite = projectileSprite(move);
    switch (move.type) {
      case 'Fire':
      case 'Dragon':
      case 'Water':
        await this.fx.stream(from, aim, color, { sprite, duration: 0.6, rate: 80, size: 1.1, speed: 15, gravity: move.type === 'Water' ? 2 : 0 });
        break;
      case 'Electric':
        this.fx.projectile(from, aim, color, { sprite, duration: 0.35, size: 1.2 });
        await this.fx.lightning(from, aim, color, { duration: 0.45 });
        break;
      case 'Grass':
      case 'Bug':
      case 'Poison':
      case 'Normal':
      case 'Flying':
      case 'Ground':
      case 'Rock':
      case 'Fighting':
        for (let i = 0; i < 4; i++) {
          this.fx.projectile(from, aim, color, { sprite, duration: 0.38, size: 0.9, arc: (i - 1.5) * 0.5, spin: sprite === 'bone' || sprite.startsWith('leaf') ? 0.35 : 0 });
          await wait(0.07);
        }
        await wait(0.3);
        break;
      default:
        await this.fx.projectile(from, aim, color, { sprite, duration: 0.45, size: 1.5 });
    }
    if (outcome !== 'miss') this.fx.spriteBurst(aim, sprite, { count: 8, speed: 5, size: 0.8 });
  }

  async playStatusMove(side, move, color, outcome) {
    const user = this.actors[side];
    const target = this.actors[1 - side];
    const id = move.id;
    const selfTarget = move.target === 'self';
    const actor = selfTarget ? user : target;
    if (!actor) return;
    this.director.focus(selfTarget ? side : 1 - side, actor.height, 0.45);
    await wait(0.3);
    const at = actor.center;
    const aimAt = outcome === 'miss' ? at.clone().add(new THREE.Vector3(2.5, 1, 0)) : at;
    const statusSprite = STATUS_SPRITES[id];
    if (statusSprite && outcome !== 'miss') {
      const onUser = ['swordsdance', 'focusenergy', 'metronome', 'meditate', 'sharpen', 'growth'].includes(id);
      const spot = (onUser ? user : actor).center.clone().add(new THREE.Vector3(0, (onUser ? user : actor).height * 0.55, 0));
      if (id === 'lovelykiss' || id === 'stringshot') await this.fx.projectile(user.center, at, '#ffffff', { sprite: statusSprite, duration: 0.45, size: 1.1 });
      this.fx.pop(spot, statusSprite, { size: 1.8, duration: 0.8, spin: id === 'swordsdance' ? Math.PI * 2 : id === 'metronome' ? 0.8 : 0 });
    }
    switch (id) {
      case 'sing':
      case 'lovelykiss':
        await this.fx.glyphs(aimAt, '♪', '#ff9ae6', { count: 12 });
        return;
      case 'hypnosis':
      case 'supersonic':
      case 'confuseray':
        for (let i = 0; i < 3; i++) {
          this.fx.ring(aimAt, id === 'confuseray' ? '#ffe74a' : '#ff6fcf', { radius: 2.8, duration: 0.5, vertical: true });
          await wait(0.16);
        }
        return;
      case 'sleeppowder':
      case 'spore':
      case 'stunspore':
      case 'poisonpowder':
        await this.fx.powder(aimAt.clone().setY(0), id === 'stunspore' ? '#ffe74a' : id === 'poisonpowder' ? '#c05ce8' : '#9fe0ff');
        return;
      case 'thunderwave':
        await this.fx.lightning(aimAt.clone().add(new THREE.Vector3(0, 5, 0)), aimAt, '#ffe74a', { duration: 0.4, bolts: 2 });
        return;
      case 'toxic':
      case 'poisongas':
      case 'smokescreen':
      case 'haze':
        if (id === 'toxic' || id === 'poisongas') this.fx.spriteBurst(aimAt, 'purplewisp', { count: 14, speed: 2, up: 1.5, size: 1.2, life: 0.9 });
        await this.fx.powder(aimAt.clone().setY(0), id === 'toxic' || id === 'poisongas' ? '#9b2fd6' : '#666677', { count: 90, spread: 2.2 });
        return;
      case 'leechseed':
        await this.fx.projectile(user.center, aimAt, '#8b5a2b', { duration: 0.5, size: 0.5, arc: 2 });
        return;
      case 'reflect':
      case 'lightscreen':
      case 'barrier':
        await this.fx.wall(user.root.position, new THREE.Vector3(0, 0, side === 0 ? -1 : 1), id === 'lightscreen' ? '#ffe74a' : '#7ac8ff');
        return;
      case 'recover':
      case 'softboiled':
      case 'rest':
        await Promise.all([user.heal(), this.fx.aura(user.center, '#7dffb2', { up: true })]);
        return;
      case 'transform':
        await user.spin('#ff9ae6');
        return;
      case 'splash':
        await user.celebrate();
        return;
      case 'metronome':
        await Promise.all([user.shake('#ffffff'), this.fx.glyphs(user.center, '♪', '#ffffff', { count: 6 })]);
        return;
      default:
        if (selfTarget) await user.spin(color);
        else await this.fx.projectile(user.center, aimAt, color, { duration: 0.45, size: 0.9 });
    }
  }

  /** Charging turn: Fly/Dig vanish, Solar Beam gathers light... */
  async charge(side, move) {
    const actor = this.actors[side];
    if (!actor) return;
    this.director.focus(side, actor.height, 0.5);
    await wait(0.3);
    if (move.id === 'fly') {
      await tween(0.6, (k) => { actor.offset.y = k * 14; }, ease.inCubic);
      actor.root.visible = false;
      actor.offset.y = 0;
    } else if (move.id === 'dig') {
      this.fx.burst(actor.root.position.clone().setY(0.2), '#b48a55', { count: 50, speed: 5, size: 0.8, up: 3, gravity: 9 });
      await tween(0.6, (k) => { actor.offset.y = -k * actor.height * 1.2; }, ease.inCubic);
      actor.root.visible = false;
      actor.offset.y = 0;
    } else {
      const color = move.id === 'solarbeam' ? '#f6ff7a' : move.id === 'skyattack' ? '#ffffff' : '#ffb347';
      await Promise.all([actor.shake(color), this.fx.aura(actor.center, color, { up: true, count: 50 })]);
    }
  }

  /** Called before the second turn of Fly/Dig so the Pokémon is visible again. */
  reveal(side) {
    const actor = this.actors[side];
    if (actor) actor.root.visible = true;
  }

  async hit(side, { eff = 1, crit = false, sub = false } = {}) {
    const actor = this.actors[side];
    if (!actor) return;
    const strong = eff > 1 || crit;
    if (strong) this.director.shake(0.45);
    this.fx.burst(actor.center, eff > 1 ? '#ffec6e' : '#ffffff', { count: strong ? 45 : 22, speed: strong ? 8 : 5, size: 0.6, life: 0.35 });
    if (sub) await actor.shake('#ffffff');
    else await actor.hit({ strong });
  }

  async miss(side) {
    const actor = this.actors[side];
    if (!actor) return;
    // the defender sidesteps
    await tween(0.3, (k) => { actor.offset.x = Math.sin(k * Math.PI) * 1.2; });
    actor.offset.x = 0;
  }

  async faint(side) {
    const actor = this.actors[side];
    if (!actor) return;
    this.director.focus(side, actor.height, 0.5);
    await wait(0.2);
    await actor.faint();
    this.arena.cheer(0.9, 1.8);
  }

  async statusFx(side, status) {
    const actor = this.actors[side];
    if (!actor) return;
    const color = STATUS_COLOR[status] || '#ffffff';
    const at = actor.center;
    switch (status) {
      case 'slp':
        await Promise.all([this.fx.glyphs(at.clone().add(new THREE.Vector3(0, actor.height * 0.4, 0)), 'Z', '#9fb3ff', { count: 6, rise: 1 }), actor.shake(color)]);
        break;
      case 'par':
        await Promise.all([this.fx.lightning(at.clone().add(new THREE.Vector3(-0.8, 0.6, 0)), at.clone().add(new THREE.Vector3(0.8, -0.4, 0)), color, { duration: 0.35, bolts: 2 }), actor.shake(color)]);
        break;
      case 'brn':
        this.fx.burst(at, color, { count: 40, speed: 2, size: 0.8, up: 3, life: 0.7 });
        await actor.shake(color);
        break;
      case 'frz':
        this.fx.burst(at, '#e6fbff', { count: 50, speed: 4, size: 0.7, life: 0.6 });
        await actor.shake(color);
        break;
      default:
        this.fx.burst(at, color, { count: 30, speed: 2, size: 0.7, up: 2, life: 0.7 });
        await actor.shake(color);
    }
  }

  async statChange(side, stat, up) {
    const actor = this.actors[side];
    if (!actor) return;
    await this.fx.aura(actor.center, STAT_COLOR[stat] || '#ffffff', { up });
  }

  async transform(side, species) {
    const old = this.actors[side];
    const pos = old?.root.position.clone();
    await old?.shake('#ff9ae6');
    const actor = await this.place(side, species);
    actor.root.position.copy(pos);
    actor.setFlash('#ff9ae6', 1);
    await tween(0.5, (k) => actor.setFlash('#ff9ae6', 1 - k));
  }

  setSleeping(side, on) {
    this.actors[side]?.setSleeping(on);
  }

  setSubstitute(side, on) {
    this.subs[side] = on;
    this.actors[side]?.setOpacity(on ? 0.45 : 1);
  }

  async celebrate(side) {
    await this.actors[side]?.celebrate();
  }
}
