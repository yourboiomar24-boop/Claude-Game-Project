import * as THREE from 'three';

// Builds a stylized low-poly humanoid rig from a skin definition.
// Returns a Group plus references to the parts needed for simple
// procedural animation (walk cycle, aim pitch, pickaxe swing).
export function buildCharacterModel(skin) {
  const root = new THREE.Group();
  root.name = 'CharacterModel';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: skin.body,
    roughness: 0.7,
    metalness: 0.05,
    emissive: skin.emissive || 0x000000,
    emissiveIntensity: skin.emissive ? 0.15 : 0,
  });
  const headMat = new THREE.MeshStandardMaterial({ color: skin.head, roughness: 0.8 });
  const limbMat = new THREE.MeshStandardMaterial({ color: skin.limbs, roughness: 0.75 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: skin.accent,
    roughness: 0.5,
    metalness: 0.2,
    emissive: skin.emissive || 0x000000,
    emissiveIntensity: skin.emissive ? 0.35 : 0,
  });

  // Hips pivot — used for overall lean/crouch
  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), bodyMat);
  torso.position.y = 0.36;
  torso.castShadow = true;
  hips.add(torso);

  const beltGeo = new THREE.BoxGeometry(0.52, 0.08, 0.3);
  const belt = new THREE.Mesh(beltGeo, accentMat);
  belt.position.y = 0.04;
  hips.add(belt);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 8), headMat);
  neck.position.y = 0.71;
  hips.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.86;
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), headMat);
  headMesh.castShadow = true;
  head.add(headMesh);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.08, 0.06),
    new THREE.MeshStandardMaterial({ color: skin.accent, emissive: skin.accent, emissiveIntensity: 0.6 })
  );
  visor.position.set(0, 0.02, 0.16);
  head.add(visor);
  hips.add(head);

  // Arms — pivots at shoulder so we can rotate for swing/aim animation
  function buildArm(sign) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.32 * sign, 0.62, 0);
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 0.15), limbMat);
    upperArm.position.y = -0.16;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    const foreArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.3, 0.13), bodyMat);
    foreArm.position.y = -0.15;
    foreArm.castShadow = true;
    elbow.add(foreArm);

    const hand = new THREE.Group();
    hand.position.y = -0.32;
    elbow.add(hand);

    return { shoulder, elbow, hand };
  }

  const armL = buildArm(1);
  const armR = buildArm(-1);
  hips.add(armL.shoulder, armR.shoulder);

  function buildLeg(sign) {
    const hip = new THREE.Group();
    hip.position.set(0.14 * sign, 0, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.36, 0.19), limbMat);
    thigh.position.y = -0.18;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.36;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 0.16), bodyMat);
    shin.position.y = -0.17;
    shin.castShadow = true;
    knee.add(shin);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.24), accentMat);
    foot.position.set(0, -0.38, 0.04);
    knee.add(foot);

    return { hip, knee };
  }

  const legL = buildLeg(1);
  const legR = buildLeg(-1);
  hips.add(legL.hip, legR.hip);

  // Cosmetic accessories driven by skin.accessory
  if (skin.accessory === 'cape') {
    const cape = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.55, 0.04),
      new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.6, side: THREE.DoubleSide })
    );
    cape.position.set(0, 0.35, -0.16);
    cape.rotation.x = 0.15;
    cape.name = 'cape';
    hips.add(cape);
  } else if (skin.accessory === 'hood') {
    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: skin.limbs, roughness: 0.8 })
    );
    hood.position.set(0, 1.0, -0.03);
    hood.rotation.x = Math.PI;
    hips.add(hood);
  } else if (skin.accessory === 'shoulderPad') {
    [1, -1].forEach((sign) => {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.22), accentMat);
      pad.position.set(0.32 * sign, 0.78, 0);
      hips.add(pad);
    });
  }

  root.userData.parts = { hips, head, armL, armR, legL, legR, torso };
  root.userData.skin = skin;

  // rough capsule-ish collision radius/height used by movement & hit tests
  root.userData.collision = { radius: 0.38, height: 1.85 };

  return root;
}
