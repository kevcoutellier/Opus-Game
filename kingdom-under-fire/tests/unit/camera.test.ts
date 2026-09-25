import { describe, expect, it } from 'vitest';
import { RTSCamera } from '../../src/camera/RTSCamera';
import type { KeyboardInput } from '../../src/input/KeyboardInput';
import type { MouseInput } from '../../src/input/MouseInput';

const keysDown = (...codes: string[]) =>
  ({ isDown: (...q: string[]) => q.some((c) => codes.includes(c)), shift: false }) as unknown as KeyboardInput;
const mouse = { x: 500, y: 400, dx: 0, dy: 0, wheel: 0, inside: true, isDown: () => false } as unknown as MouseInput;
const viewport = { width: 1920, height: 1080 };
const bounds = { minX: 10, maxX: 246, minZ: 10, maxZ: 246 };

describe('RTSCamera', () => {
  it('pans forward (towards -z at yaw 0) and stays inside the map bounds', () => {
    const cam = new RTSCamera(() => 0, bounds);
    cam.focus(128, 128, 60, true);
    for (let i = 0; i < 60; i++) cam.update(1 / 60, keysDown('KeyW'), mouse, viewport);
    expect(cam.target.z).toBeLessThan(120);
    expect(cam.target.x).toBeCloseTo(128, 3);
    for (let i = 0; i < 2000; i++) cam.update(1 / 60, keysDown('KeyW', 'KeyA'), mouse, viewport);
    expect(cam.target.z).toBeGreaterThanOrEqual(bounds.minZ - 1e-3);
    expect(cam.target.x).toBeGreaterThanOrEqual(bounds.minX - 1e-3);
  });

  it('scrolls when the pointer touches a screen edge', () => {
    const cam = new RTSCamera(() => 0, bounds);
    cam.focus(128, 128, 60, true);
    const edge = { ...mouse, x: 1919 } as MouseInput;
    for (let i = 0; i < 30; i++) cam.update(1 / 60, keysDown(), edge, viewport);
    expect(cam.target.x).toBeGreaterThan(129);
  });

  it('zooms within limits and raises the pitch when zooming out', () => {
    const cam = new RTSCamera(() => 0, bounds);
    cam.focus(128, 128, 20, true);
    cam.apply();
    const closePitch = cam.pitch;
    cam.zoom(100);
    for (let i = 0; i < 300; i++) cam.update(1 / 60, keysDown(), mouse, viewport);
    expect(cam.distance).toBeLessThanOrEqual(190.01);
    expect(cam.pitch).toBeGreaterThan(closePitch);
  });

  it('never goes below the terrain', () => {
    const cam = new RTSCamera((x) => (x > 128 ? 80 : 0), bounds);
    cam.focus(120, 128, 12, true);
    cam.apply();
    expect(cam.camera.position.y).toBeGreaterThanOrEqual(2.5);
  });
});
