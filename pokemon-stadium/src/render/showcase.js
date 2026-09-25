import * as THREE from 'three';
import { PokemonActor } from './actor.js';

/** A single Pokémon on the centre of the field with an orbiting camera. */
export class Showcase {
  constructor(stage, director) {
    this.stage = stage;
    this.director = director;
    this.actor = null;
    this.token = 0;
    this.spin = 0.35;
    stage.onUpdate((dt, time) => {
      if (!this.actor) return;
      this.actor.root.rotation.y += dt * this.spin;
      this.actor.update(dt, time, stage.camera);
    });
  }

  /** Shows `species`; stale requests (user scrolled on) are dropped. */
  async show(species, { orbit = true, radiusScale = 1 } = {}) {
    const token = ++this.token;
    const actor = await PokemonActor.create(species);
    if (token !== this.token) {
      actor.dispose();
      return null;
    }
    this.clearActor();
    this.actor = actor;
    actor.root.position.set(0, 0, 0);
    actor.root.rotation.y = 0.4;
    actor.root.scale.setScalar(0.001);
    this.stage.scene.add(actor.root);
    actor.appear();
    if (orbit) {
      const h = actor.height + actor.hover;
      this.director.startOrbit({
        center: new THREE.Vector3(0, h * 0.5, 0),
        radius: (3.2 + Math.max(h, actor.width) * 1.7) * radiusScale,
        height: h * 0.65 + 0.9,
        speed: 0.06,
      });
    }
    return actor;
  }

  clearActor() {
    this.actor?.dispose();
    this.actor = null;
  }

  clear() {
    this.token++;
    this.clearActor();
  }
}
