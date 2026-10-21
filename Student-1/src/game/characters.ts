import * as THREE from 'three'

export type CharacterVisual = {
  root: THREE.Group
  animate(time: number, moving: boolean, attacking?: boolean): void
}

const survivorJacket = new THREE.MeshStandardMaterial({ color: '#344242', roughness: 0.91 })
const survivorDark = new THREE.MeshStandardMaterial({ color: '#212b2a', roughness: 0.95 })
const survivorPants = new THREE.MeshStandardMaterial({ color: '#6b6555', roughness: 0.98 })
const survivorSkin = new THREE.MeshStandardMaterial({ color: '#c49b79', roughness: 0.8 })
const metal = new THREE.MeshStandardMaterial({ color: '#343a3a', roughness: 0.52, metalness: 0.54 })
const cyan = new THREE.MeshStandardMaterial({ color: '#a9fff0', emissive: '#39cabb', emissiveIntensity: 1.7, roughness: 0.28 })
const zombieSkin = new THREE.MeshStandardMaterial({ color: '#788678', roughness: 0.96 })
const zombieCloth = new THREE.MeshStandardMaterial({ color: '#343f37', roughness: 1 })
const zombieCloth2 = new THREE.MeshStandardMaterial({ color: '#55443b', roughness: 1 })
const eyeGlow = new THREE.MeshStandardMaterial({ color: '#a9f9ee', emissive: '#38d2c3', emissiveIntensity: 2.1, roughness: 0.2 })
const boot = new THREE.MeshStandardMaterial({ color: '#211f1b', roughness: 0.98 })

function box(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, bevel = 0): THREE.Mesh {
  const geometry = bevel > 0 ? new THREE.BoxGeometry(w, h, d, 1, 1, 1) : new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  if (bevel) mesh.rotation.z = bevel
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function sphere(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, detail = 9): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, detail, Math.max(6, detail - 2)), material)
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function limb(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number, width: number, length: number, depth: number): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.set(x, y, z)
  parent.add(pivot)
  box(pivot, material, 0, -length * 0.47, 0, width, length, depth)
  return pivot
}

function shoe(parent: THREE.Object3D, x: number, z: number, color: THREE.Material): void {
  box(parent, color, x, 0.13, z + 0.07, 0.29, 0.23, 0.44)
  box(parent, metal, x, 0.035, z + 0.09, 0.3, 0.045, 0.45)
}

export function createSurvivorVisual(): CharacterVisual {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  // Canvas-carrying survivor: worn field jacket, backpack, scarf and a compact sidearm.
  box(body, survivorJacket, 0, 1.24, 0, 0.76, 0.77, 0.43)
  box(body, survivorDark, 0, 1.39, 0.225, 0.24, 0.44, 0.04)
  box(body, survivorDark, 0, 1.48, -0.29, 0.54, 0.55, 0.29)
  box(body, metal, 0, 1.13, 0.236, 0.31, 0.13, 0.06)
  box(body, survivorPants, 0, 0.75, -0.015, 0.58, 0.16, 0.39)
  sphere(body, survivorSkin, 0, 1.86, 0.015, 0.26, 0.31, 0.24, 11)
  box(body, survivorDark, 0, 2.12, 0.03, 0.53, 0.17, 0.49, -0.03)
  box(body, survivorSkin, 0, 1.65, 0.07, 0.18, 0.11, 0.2)
  sphere(body, metal, -0.105, 1.88, 0.229, 0.026, 0.018, 0.018, 6)
  sphere(body, metal, 0.105, 1.88, 0.229, 0.026, 0.018, 0.018, 6)
  box(body, cyan, 0.255, 1.47, 0.19, 0.055, 0.1, 0.04)
  // Backpack straps and a small life-source sensor.
  box(body, survivorDark, -0.22, 1.34, -0.24, 0.09, 0.62, 0.08, -0.16)
  box(body, survivorDark, 0.22, 1.34, -0.24, 0.09, 0.62, 0.08, 0.16)
  box(body, survivorJacket, 0, 1.42, -0.39, 0.47, 0.5, 0.25)
  sphere(body, cyan, 0, 1.48, -0.53, 0.075, 0.075, 0.04, 7)

  const leftArm = limb(body, survivorJacket, -0.44, 1.54, 0.01, 0.24, 0.59, 0.25)
  const rightArm = limb(body, survivorJacket, 0.44, 1.54, 0.02, 0.24, 0.57, 0.25)
  sphere(leftArm, survivorSkin, 0, -0.57, 0.03, 0.115, 0.1, 0.13, 7)
  sphere(rightArm, survivorSkin, 0, -0.55, 0.03, 0.115, 0.1, 0.13, 7)
  // Pistol sits in the right hand and points in the character's forward (+Z) direction.
  box(rightArm, metal, 0, -0.52, 0.19, 0.1, 0.12, 0.38)
  box(rightArm, survivorDark, 0, -0.6, 0.16, 0.075, 0.2, 0.1, -0.1)
  const leftLeg = limb(body, survivorPants, -0.2, 0.69, 0, 0.25, 0.66, 0.31)
  const rightLeg = limb(body, survivorPants, 0.2, 0.69, 0, 0.25, 0.66, 0.31)
  shoe(leftLeg, 0, -0.03, boot)
  shoe(rightLeg, 0, -0.03, boot)

  return {
    root,
    animate(time, moving, attacking = false) {
      const gait = moving ? Math.sin(time * 8.8) * 0.46 : Math.sin(time * 1.8) * 0.025
      leftLeg.rotation.x = gait
      rightLeg.rotation.x = -gait
      leftArm.rotation.x = -0.22 - gait * 0.25
      rightArm.rotation.x = attacking ? -0.16 : -0.34
      body.position.y = Math.abs(Math.sin(time * (moving ? 8.8 : 1.8))) * (moving ? 0.055 : 0.018)
      body.rotation.z = moving ? Math.sin(time * 4.4) * 0.025 : 0
    },
  }
}

export function createZombieVisual(): CharacterVisual {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  box(body, zombieCloth, 0, 1.19, 0, 0.78, 0.76, 0.43)
  box(body, zombieCloth2, -0.2, 1.43, 0.055, 0.26, 0.33, 0.12)
  box(body, zombieCloth, 0.19, 1.32, 0.215, 0.21, 0.44, -0.1)
  box(body, zombieCloth2, 0.01, 0.79, -0.02, 0.56, 0.18, 0.37)
  sphere(body, zombieSkin, 0, 1.82, 0.06, 0.27, 0.32, 0.25, 9)
  box(body, zombieSkin, 0.015, 1.58, 0.13, 0.22, 0.11, 0.16, 0.04)
  box(body, zombieCloth, 0.02, 2.08, -0.01, 0.47, 0.16, 0.46, -0.09)
  sphere(body, eyeGlow, -0.105, 1.87, 0.286, 0.047, 0.038, 0.025, 7)
  sphere(body, eyeGlow, 0.105, 1.87, 0.286, 0.047, 0.038, 0.025, 7)
  // The cyan forehead mark makes the two-shot brain target legible from the overhead camera.
  box(body, eyeGlow, 0, 2.03, 0.247, 0.12, 0.075, 0.025)
  // Ragged hems, torn sleeves and dull patches help distinguish infected silhouettes.
  box(body, zombieCloth2, -0.25, 0.82, 0.08, 0.14, 0.13, 0.45, -0.3)
  box(body, zombieCloth2, 0.28, 1.02, 0.17, 0.1, 0.22, 0.36, 0.15)

  const leftArm = limb(body, zombieCloth2, -0.46, 1.48, 0.02, 0.24, 0.65, 0.25)
  const rightArm = limb(body, zombieCloth, 0.46, 1.48, 0.02, 0.24, 0.61, 0.25)
  sphere(leftArm, zombieSkin, 0, -0.61, 0.045, 0.12, 0.13, 0.14, 7)
  sphere(rightArm, zombieSkin, 0, -0.57, 0.045, 0.12, 0.13, 0.14, 7)
  box(leftArm, zombieSkin, 0, -0.68, 0.13, 0.055, 0.19, 0.06, 0.12)
  const leftLeg = limb(body, zombieCloth, -0.19, 0.69, 0, 0.26, 0.68, 0.31)
  const rightLeg = limb(body, zombieCloth2, 0.2, 0.69, -0.015, 0.26, 0.64, 0.31)
  shoe(leftLeg, 0, 0.01, boot)
  shoe(rightLeg, 0, -0.03, boot)

  return {
    root,
    animate(time, moving, attacking = false) {
      const gait = moving ? Math.sin(time * 5.4) * 0.34 : Math.sin(time * 1.6) * 0.018
      leftLeg.rotation.x = gait
      rightLeg.rotation.x = -gait * 0.7
      leftArm.rotation.x = -0.8 + gait * 0.16 + (attacking ? -0.45 : 0)
      rightArm.rotation.x = -0.8 - gait * 0.14 + (attacking ? -0.45 : 0)
      body.position.y = Math.abs(Math.sin(time * (moving ? 5.4 : 1.6))) * (moving ? 0.052 : 0.014)
      body.rotation.z = Math.sin(time * (moving ? 2.7 : 1.2)) * (moving ? 0.035 : 0.015)
      body.rotation.x = attacking ? -0.09 : Math.sin(time * 1.9) * 0.018
    },
  }
}
