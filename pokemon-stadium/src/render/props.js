import * as THREE from 'three';

export function createPokeball(radius = 0.28) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#e3261c', roughness: 0.35, metalness: 0.1 });
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), red);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
  const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.99, radius * 0.08, 8, 32), black);
  band.rotation.x = Math.PI / 2;
  const button = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.28, radius * 0.28, radius * 0.2, 16), white);
  button.rotation.x = Math.PI / 2;
  button.position.z = radius * 0.95;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.36, radius * 0.36, radius * 0.14, 16), black);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = radius * 0.9;
  g.add(top, bottom, band, ring, button);
  g.traverse((o) => {
    o.castShadow = true;
  });
  g.userData.top = top;
  return g;
}

/** Low-poly trainer standing on the trainer box; can play a throw pose. */
export function createTrainer(color) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#f1c9a5', roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: '#2f3b57', roughness: 0.8 });
  const capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.3), pants);
  legs.position.y = 0.45;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.38), shirt);
  body.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), skin);
  head.position.y = 1.95;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  cap.position.y = 2.0;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.25), capMat);
  visor.position.set(0, 2.02, 0.3);

  const armGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
  armGeo.translate(0, -0.33, 0);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.46, 1.65, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.46, 1.65, 0);
  g.add(legs, body, head, cap, visor, armL, armR);
  g.traverse((o) => {
    o.castShadow = true;
  });
  g.userData.armR = armR;
  return g;
}
