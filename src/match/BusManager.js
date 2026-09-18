import * as THREE from 'three';

const BUS_ALTITUDE = 60;
const BUS_DURATION = 48; // seconds to cross the whole route
const BUS_SPEED_ESTIMATE = 14; // used to give the player some forward momentum on drop

function buildBusMesh() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe7e2d3, roughness: 0.5, metalness: 0.2 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b6fb0, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fd6ff, roughness: 0.2, transparent: true, opacity: 0.75 });
  const balloonMat = new THREE.MeshStandardMaterial({ color: 0xff5b5b, roughness: 0.6 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 6.5), bodyMat);
  body.castShadow = true;
  group.add(body);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.4, 6.55), trimMat);
  stripe.position.y = -0.3;
  group.add(stripe);

  const windows = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.7, 5.8), glassMat);
  windows.position.y = 0.3;
  group.add(windows);

  const balloon = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 12), balloonMat);
  balloon.scale.set(1, 0.7, 1);
  balloon.position.y = 6.5;
  balloon.castShadow = true;
  group.add(balloon);

  const cablePositions = [
    [1.4, 0, 2.6], [-1.4, 0, 2.6], [1.4, 0, -2.6], [-1.4, 0, -2.6],
  ];
  for (const [x, , z] of cablePositions) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.8, 6), cableMat);
    cable.position.set(x, 3.3, z);
    group.add(cable);
  }

  return group;
}

// Phase 2: the Battle Bus flies a straight route across the map at a fixed
// altitude. Walking is disabled, but the player keeps full mouse look (see
// Player.updateBusRide) to scan the landscape before jumping or the bus
// reaching the far edge.
export class BusManager {
  constructor(scene, mapRadius) {
    this.scene = scene;
    this.mapRadius = mapRadius;
    this.t = 0;
    this.duration = BUS_DURATION;

    const routeRadius = mapRadius * 1.35;
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.PI * (0.55 + Math.random() * 0.3); // not a perfect diameter, some variety
    this.start = new THREE.Vector3(Math.cos(angle) * routeRadius, BUS_ALTITUDE, Math.sin(angle) * routeRadius);
    this.end = new THREE.Vector3(
      Math.cos(angle + spread) * routeRadius, BUS_ALTITUDE, Math.sin(angle + spread) * routeRadius
    );
    this.forward = this.end.clone().sub(this.start).normalize();

    this.mesh = buildBusMesh();
    this.mesh.position.copy(this.start);
    this.mesh.rotation.y = Math.atan2(this.forward.x, this.forward.z);
    scene.add(this.mesh);
  }

  getPosition() {
    return this.mesh.position;
  }

  getDropVelocity() {
    return this.forward.clone().multiplyScalar(BUS_SPEED_ESTIMATE);
  }

  // Returns true once the bus has reached the far edge of its route.
  update(dt) {
    this.t = Math.min(1, this.t + dt / this.duration);
    this.mesh.position.lerpVectors(this.start, this.end, this.t);
    return this.t >= 1;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
