import type { AssetManager } from '../assets/AssetManager';
import { MISSIONS } from '../data/missions';
import { deployMax } from '../missions/Mission';
import {
  ARMY_CAP,
  armoury,
  type ArmyTroop,
  buy,
  type CampaignState,
  CLASSES,
  className,
  deploy,
  dismiss,
  equip,
  hire,
  type Item,
  type ItemKind,
  missionOf,
  newCampaign,
  promote,
  promotions,
  reroll,
  sell,
  sellPrice,
  type Skill,
  skillCap,
  SKILL_NAMES,
  SKILLS,
  tavern,
  train,
  troopBoost,
  unequip,
  xpToNext,
} from './Campaign';
import type { SaveStore } from './SaveStore';

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const pct = (x: number) => `${Math.round(x * 100)} %`;
const KIND_NAMES: Record<ItemKind, string> = { weapon: 'Armes', armour: 'Armure', accessory: 'Accessoire' };
type Tab = 'troops' | 'armoury' | 'tavern';
/** A new seed for the armoury and the tavern (outside the simulation: Math.random is fine here). */
const freshSeed = () => Math.floor(Math.random() * 2 ** 31);

export function itemStats(item: Item): string {
  const parts: string[] = [];
  if (item.attack) parts.push(`Attaque +${pct(item.attack)}`);
  if (item.defense) parts.push(`Défense +${item.defense.toFixed(1)}`);
  if (item.health) parts.push(`PV +${pct(item.health)}`);
  if (item.xpBonus) parts.push(`Expérience +${pct(item.xpBonus)}`);
  if (item.spBonus) parts.push(`SP +${pct(item.spBonus)}`);
  return parts.join(' · ');
}

/**
 * The campaign between battles, outside the 3D scene: the title menu (campaigns, skirmish, free missions)
 * and the barracks (troops, armoury, tavern, preparing the next battle). Every change is saved at once.
 */
export class CampaignApp {
  state: CampaignState | null = null;
  private readonly el: HTMLDivElement;
  private tab: Tab = 'troops';
  private selected: string | null = null;
  private preparing = false;
  private chosen = new Set<string>();
  private notice: string | null = null;
  /** Buttons that ask to be clicked twice (start over, dismiss a troop). */
  private armed: string | null = null;
  saving: Promise<void> = Promise.resolve();

  constructor(
    root: HTMLElement,
    private readonly store: SaveStore,
    assets: AssetManager,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'campaign interactive';
    const art = assets.artwork();
    if (art) this.el.style.setProperty('--artwork', `url("${art}")`);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => this.onChange(e));
    root.append(this.el);
  }

  async start(hash: string): Promise<void> {
    const saved = await this.store.load();
    if (hash === '#barracks' && saved) {
      // As in the original, reloading the save gives the armoury new stock.
      this.state = reroll(saved, freshSeed());
      await this.persist();
    } else {
      this.state = saved;
      if (hash === '#barracks') history.replaceState(null, '', '#campaign');
    }
    this.render(hash === '#barracks' && saved ? 'barracks' : 'title');
  }

  private screen: 'title' | 'barracks' = 'title';

  private render(screen = this.screen): void {
    this.screen = screen;
    this.el.innerHTML = screen === 'title' ? this.title() : this.barracks();
  }

  private persist(): Promise<void> {
    const state = this.state;
    if (state) this.saving = this.saving.then(() => this.store.save(state));
    return this.saving;
  }

  private change(f: (s: CampaignState) => CampaignState): void {
    try {
      this.state = f(this.state!);
      this.notice = null;
      void this.persist();
    } catch (e) {
      this.notice = (e as Error).message;
    }
    this.render();
  }

  // ------------------------------------------------------------------ title

  private title(): string {
    const s = this.state;
    const next = s?.next ? missionOf(s.next) : null;
    const progress = s ? (next ? `Mission ${next.order} : ${escape(next.title)} · ${s.gold} or` : `Missions terminées · ${s.gold} or`) : '';
    return `
      <div class="campaign-card panel title-menu">
        <header>
          <div class="briefing-game title">Kingdom Under Fire</div>
          <h1 class="title">The Crusaders</h1>
        </header>
        <section class="campaign-list">
          <article class="campaign-entry">
            <div><b class="title">Gerald</b> <span class="dim">Hironeiden · le capitaine de la Force de défense de l’Est</span></div>
            ${s ? `<div class="dim">${progress}</div>` : ''}
            <div class="actions">
              ${s ? '<button type="button" data-action="continue" class="primary">Continuer</button>' : ''}
              <button type="button" data-action="new">${
                this.armed === 'new' ? 'Effacer la campagne en cours ?' : s ? 'Nouvelle campagne' : 'Commencer la campagne'
              }</button>
            </div>
          </article>
          <article class="campaign-entry locked"><div><b class="title">Lucretia</b> <span class="dim">Vellond · pas encore jouable</span></div></article>
          <article class="campaign-entry locked"><div><b class="title">Kendal · Regnier</b> <span class="dim">s’ouvrent après Lucretia</span></div></article>
        </section>
        <nav class="briefing-missions">
          <span class="dim">Hors campagne :</span>
          ${MISSIONS.map((m) => `<a href="#mission=${m.id}">${m.order}. ${escape(m.title)}</a>`).join('')}
          <a href="#skirmish">Escarmouche</a>
        </nav>
      </div>`;
  }

  // ------------------------------------------------------------------ barracks

  private barracks(): string {
    const s = this.state!;
    const next = s.next ? missionOf(s.next) : null;
    return `
      <div class="campaign-card panel barracks">
        <header class="barracks-head">
          <div><div class="briefing-game title">Caserne · Campagne de Gerald</div>
            <div class="dim">${next ? `Prochaine mission : ${next.order}. ${escape(next.title)}` : 'Les missions de cette version sont terminées.'}</div></div>
          <div class="gold">${s.gold} <span class="dim">or</span></div>
          <div class="actions">
            <button type="button" data-action="menu">Menu</button>
            ${next && !this.preparing ? '<button type="button" data-action="prepare" class="primary">Préparer la bataille</button>' : ''}
          </div>
        </header>
        ${this.report()}
        ${this.notice ? `<div class="notice">${escape(this.notice)}</div>` : ''}
        ${this.preparing && next ? this.preparation() : this.tabs()}
      </div>`;
  }

  private report(): string {
    const r = this.state!.report;
    if (!r) return '';
    const m = missionOf(r.mission);
    return `<section class="report">
      <div><b class="title">Victoire : ${escape(m.title)}</b> <button type="button" data-action="close-report" class="close" title="Fermer">×</button></div>
      <div>+${r.gold} or <span class="dim">(dont ${r.goldFromKills} pour les ennemis tués)</span></div>
      <ul>${r.troops
        .map(
          (t) =>
            `<li><b>${escape(t.name)}</b> : ${t.kills} ennemi${t.kills > 1 ? 's' : ''} tué${t.kills > 1 ? 's' : ''}, +${t.xp} XP${
              t.levels ? ` · <span class="up">niveau ${t.level}</span>` : ''
            }</li>`,
        )
        .join('')}</ul>
      ${r.recruits.map((n) => `<div class="up">${escape(n)} rejoignent l’armée.</div>`).join('')}
    </section>`;
  }

  private tabs(): string {
    const tab = (id: Tab, label: string) => `<button type="button" data-tab="${id}" class="${this.tab === id ? 'current' : ''}">${label}</button>`;
    const body = this.tab === 'troops' ? this.troopsTab() : this.tab === 'armoury' ? this.armouryTab() : this.tavernTab();
    return `<nav class="barracks-tabs">${tab('troops', 'Troupes')}${tab('armoury', 'Armurerie')}${tab('tavern', 'Taverne')}</nav><div class="barracks-body">${body}</div>`;
  }

  private troopsTab(): string {
    const s = this.state!;
    const sel = s.troops.find((t) => t.id === this.selected) ?? s.troops[0];
    this.selected = sel.id;
    return `<div class="troop-columns">
      <ul class="roster">${s.troops
        .map(
          (t) => `<li data-troop="${t.id}" class="${t.id === sel.id ? 'current' : ''}">
            <b>${escape(t.name)}</b><span class="dim">${escape(className(t.type))} · niv. ${t.level}</span>${t.skillPoints ? `<span class="points">${t.skillPoints}</span>` : ''}
          </li>`,
        )
        .join('')}</ul>
      ${this.troopDetail(sel)}
    </div>`;
  }

  private troopDetail(t: ArmyTroop): string {
    const b = troopBoost(t);
    const lead = t.hero ? 'menée par Gerald' : t.mercenary ? `menée par le mercenaire ${escape(t.mercenary)}` : 'menée par son capitaine';
    const skills = SKILLS.map(
      (k: Skill) => `<div class="skill"><span>${SKILL_NAMES[k]}</span><b>${t.skills[k]}</b><span class="dim">/ ${skillCap(k)}</span>${
        t.skillPoints > 0 && t.skills[k] < skillCap(k) ? `<button type="button" data-train="${k}" title="Dépenser un point">+</button>` : ''
      }</div>`,
    ).join('');
    const promos = promotions(t)
      .map((p) =>
        p.ready
          ? `<button type="button" data-promote="${p.type}">Devenir ${escape(className(p.type))}</button>`
          : `<div class="dim">${escape(className(p.type))} : ${Object.entries(p.requires)
              .map(([k, n]) => `${SKILL_NAMES[k as Skill]} ${n}`)
              .join(', ')}</div>`,
      )
      .join('');
    const slot = (kind: ItemKind) => {
      const item = t.equipment[kind];
      return `<div class="slot"><span class="dim">${KIND_NAMES[kind]}</span>${
        item
          ? `<b>${escape(item.name)}</b> <span class="dim">niv. ${item.level}</span><div class="stats">${itemStats(item)}</div><button type="button" data-unequip="${kind}">Retirer</button>`
          : '<span class="dim">—</span>'
      }</div>`;
    };
    return `<section class="troop-detail">
      <h2 class="title">${escape(t.name)}</h2>
      <div class="dim">${escape(className(t.type))} · ${CLASSES[t.type]?.count ?? 15} soldats · ${lead}</div>
      <div class="level">Niveau ${t.level} <div class="bar"><div style="width:${Math.min(100, (t.xp / xpToNext(t.level)) * 100).toFixed(1)}%"></div></div>
        <span class="dim">${Math.floor(t.xp)} / ${xpToNext(t.level)} XP</span></div>
      <div class="dim">En bataille : PV +${pct(b.health - 1)}, attaque +${pct(b.attack - 1)}, défense +${b.defense.toFixed(1)}${b.sp > 1 ? `, SP +${pct(b.sp - 1)}` : ''}</div>
      <h3>Compétences ${t.skillPoints ? `<span class="points">${t.skillPoints} point${t.skillPoints > 1 ? 's' : ''} à répartir</span>` : ''}</h3>
      <div class="skills">${skills}</div>
      ${promos ? `<h3>Promotions</h3><div class="promotions">${promos}</div>` : ''}
      <h3>Équipement</h3><div class="slots">${slot('weapon')}${slot('armour')}${slot('accessory')}</div>
      ${t.hero ? '' : `<button type="button" data-action="dismiss" class="danger">${this.armed === `dismiss:${t.id}` ? 'Confirmer le renvoi' : 'Renvoyer la troupe'}</button>`}
    </section>`;
  }

  private armouryTab(): string {
    const s = this.state!;
    const stock = armoury(s);
    const options = s.troops.map((t) => `<option value="${t.id}">${escape(t.name)} (niv. ${t.level})</option>`).join('');
    return `<div class="shop">
      <h3>Marchandises <span class="dim">· le stock change à chaque chargement de la sauvegarde</span></h3>
      <ul class="items">${
        stock.length
          ? stock
              .map(
                (i) => `<li><div><b>${escape(i.name)}</b> <span class="dim">${KIND_NAMES[i.kind]} · niv. ${i.level}</span><div class="stats">${itemStats(i)}</div></div>
                  <button type="button" data-buy="${i.id}" ${s.gold < i.price ? 'disabled' : ''}>Acheter · ${i.price} or</button></li>`,
              )
              .join('')
          : '<li class="dim">Tout a été vendu.</li>'
      }</ul>
      <h3>Inventaire</h3>
      <ul class="items">${
        s.inventory.length
          ? s.inventory
              .map(
                (i) => `<li><div><b>${escape(i.name)}</b> <span class="dim">${KIND_NAMES[i.kind]} · niv. ${i.level}</span><div class="stats">${itemStats(i)}</div></div>
                  <div class="actions"><select data-for="${i.id}">${options}</select><button type="button" data-equip="${i.id}">Équiper</button>
                  <button type="button" data-sell="${i.id}">Vendre · ${sellPrice(i)} or</button></div></li>`,
              )
              .join('')
          : '<li class="dim">Rien en réserve.</li>'
      }</ul>
    </div>`;
  }

  private tavernTab(): string {
    const s = this.state!;
    const full = s.troops.length >= ARMY_CAP;
    return `<div class="shop">
      <h3>Mercenaires <span class="dim">· chacun mène une troupe de sa classe · ${s.troops.length} / ${ARMY_CAP} troupes à la caserne</span></h3>
      <ul class="items">${tavern(s)
        .map((m) => {
          const best = SKILLS.filter((k) => m.skills[k] > 0)
            .map((k) => `${SKILL_NAMES[k]} ${m.skills[k]}`)
            .join(', ');
          return `<li><div><b>${escape(m.name)}</b> <span class="dim">${escape(className(m.type))} · niv. ${m.level}</span><div class="stats">${best}</div></div>
            <button type="button" data-hire="${m.id}" ${full || s.gold < m.price ? 'disabled' : ''}>Engager · ${m.price} or</button></li>`;
        })
        .join('')}</ul>
    </div>`;
  }

  private preparation(): string {
    const s = this.state!;
    const m = missionOf(s.next!);
    const max = deployMax(m);
    const hero = s.troops.find((t) => t.hero)!;
    this.chosen.add(hero.id);
    return `<section class="preparation">
      <h2 class="title">${m.order}. ${escape(m.title)}</h2>
      <p>${escape(m.briefing[0])}</p>
      <div class="briefing-objective"><b>Objectif</b> ${escape(m.objective)}</div>
      <h3>Troupes engagées <span class="dim">${this.chosen.size} / ${max}</span></h3>
      <ul class="deploy">${s.troops
        .map((t) => {
          const on = this.chosen.has(t.id);
          const locked = !!t.hero || (!on && this.chosen.size >= max);
          return `<li><label><input type="checkbox" data-deploy="${t.id}" ${on ? 'checked' : ''} ${locked ? 'disabled' : ''} />
            <b>${escape(t.name)}</b> <span class="dim">${escape(className(t.type))} · niv. ${t.level}</span></label></li>`;
        })
        .join('')}</ul>
      <div class="actions"><button type="button" data-action="back">Retour</button><button type="button" data-action="launch" class="primary">Lancer la bataille</button></div>
    </section>`;
  }

  // ------------------------------------------------------------------ events

  private onChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const id = input.dataset.deploy;
    if (!id) return;
    if (input.checked) this.chosen.add(id);
    else this.chosen.delete(id);
    this.render();
  }

  private onClick(e: Event): void {
    const button = (e.target as HTMLElement).closest<HTMLElement>('button, li[data-troop], a');
    if (!button || (button as HTMLButtonElement).disabled) return;
    if (button.tagName === 'A') {
      // Another page of the game (a mission, the skirmish): a fresh start on it.
      e.preventDefault();
      location.hash = button.getAttribute('href')!;
      location.reload();
      return;
    }
    const d = button.dataset;
    const armed = this.armed;
    this.armed = null;
    if (d.tab) {
      this.tab = d.tab as Tab;
      this.preparing = false;
    } else if (d.troop) this.selected = d.troop;
    else if (d.train) return this.change((s) => train(s, this.selected!, d.train as Skill));
    else if (d.promote) return this.change((s) => promote(s, this.selected!, d.promote!));
    else if (d.unequip) return this.change((s) => unequip(s, this.selected!, d.unequip as ItemKind));
    else if (d.buy) return this.change((s) => buy(s, d.buy!));
    else if (d.sell) return this.change((s) => sell(s, d.sell!));
    else if (d.hire) return this.change((s) => hire(s, d.hire!));
    else if (d.equip) {
      const troop = this.el.querySelector<HTMLSelectElement>(`select[data-for="${d.equip}"]`)!.value;
      return this.change((s) => equip(s, troop, d.equip!));
    } else if (d.action) return void this.action(d.action, armed);
    this.render();
  }

  private async action(action: string, armed: string | null): Promise<void> {
    switch (action) {
      case 'new':
        if (this.state && armed !== 'new') {
          this.armed = 'new';
          break;
        }
        this.state = newCampaign(freshSeed());
        await this.persist();
        history.replaceState(null, '', '#barracks');
        this.render('barracks');
        return;
      case 'continue':
        history.replaceState(null, '', '#barracks');
        this.render('barracks');
        return;
      case 'menu':
        history.replaceState(null, '', '#campaign');
        this.preparing = false;
        this.render('title');
        return;
      case 'close-report':
        this.change((s) => ({ ...s, report: null }));
        return;
      case 'prepare':
        this.preparing = true;
        this.chosen = new Set(this.state!.troops.slice(0, deployMax(missionOf(this.state!.next!))).map((t) => t.id));
        break;
      case 'back':
        this.preparing = false;
        break;
      case 'dismiss':
        if (armed !== `dismiss:${this.selected}`) {
          this.armed = `dismiss:${this.selected}`;
          break;
        }
        this.change((s) => dismiss(s, this.selected!));
        this.selected = null;
        return;
      case 'launch': {
        const max = deployMax(missionOf(this.state!.next!));
        this.state = deploy(this.state!, [...this.chosen], max);
        await this.persist();
        location.hash = '#campaign-battle';
        location.reload();
        return;
      }
    }
    this.render();
  }
}
