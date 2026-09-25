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
