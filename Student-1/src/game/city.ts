import * as THREE from 'three'

export type CityObstacle = { minX: number; maxX: number; minZ: number; maxZ: number }

const HALF = 58
const SURFACE = 0.025
const roadMat = new THREE.MeshStandardMaterial({ color: '#22272a', roughness: 0.96 })
const pavementMat = new THREE.MeshStandardMaterial({ color: '#414446', roughness: 1 })
const concreteMats = ['#45494a', '#555653', '#3b4142', '#625f58'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.97 }))
const windowDark = new THREE.MeshStandardMaterial({ color: '#131a1b', roughness: 0.55, metalness: 0.12 })
const windowWarm = new THREE.MeshStandardMaterial({ color: '#a35d32', emissive: '#7b3216', emissiveIntensity: 0.48, roughness: 0.6 })
const rustMats = ['#643c32', '#825143', '#a16c4b', '#3f4140'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.18 }))
const seamMat = new THREE.MeshBasicMaterial({ color: '#242a2b', transparent: true, opacity: 0.36, depthWrite: false })
const laneMarkMat = new THREE.MeshBasicMaterial({ color: '#b4a86f', transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })
const crosswalkMat = new THREE.MeshBasicMaterial({ color: '#a8a18e', transparent: true, opacity: 0.23, side: THREE.DoubleSide, depthWrite: false })
type GroundMark = { x: number; y: number; z: number; width: number; depth: number }

export class City {
  readonly obstacles: CityObstacle[] = []
  private readonly random: () => number

  constructor(readonly scene: THREE.Scene) {
    this.random = seededRandom(10421)
    this.scene.background = new THREE.Color('#111719')
    this.scene.fog = new THREE.FogExp2('#111719', 0.0087)
    this.scene.add(new THREE.HemisphereLight('#a3b6b9', '#20201c', 1.2))
    const moon = new THREE.DirectionalLight('#c0d0d4', 1.35)
    moon.position.set(-32, 52, 24)
    moon.castShadow = false
    moon.shadow.mapSize.set(1024, 1024)
    moon.shadow.camera.left = -58
    moon.shadow.camera.right = 58
    moon.shadow.camera.top = 58
    moon.shadow.camera.bottom = -58
    moon.shadow.bias = -0.0006
    this.scene.add(moon)
    this.addGround()
    this.addRoads()
    this.addBuildings()
    this.addCars()
    this.addDebris()
    this.addStreetLamps()
  }

  /** Axis-separated movement keeps the survivor inside map bounds and out of solid geometry. */
  move(position: THREE.Vector3, dx: number, dz: number, radius: number): void {
    const nextX = THREE.MathUtils.clamp(position.x + dx, -HALF, HALF)
    if (!this.blocked(nextX, position.z, radius)) position.x = nextX
    const nextZ = THREE.MathUtils.clamp(position.z + dz, -HALF, HALF)
    if (!this.blocked(position.x, nextZ, radius)) position.z = nextZ
  }

  blocked(x: number, z: number, radius: number): boolean {
    for (const box of this.obstacles) {
      const cx = THREE.MathUtils.clamp(x, box.minX, box.maxX)
      const cz = THREE.MathUtils.clamp(z, box.minZ, box.maxZ)
      const dx = x - cx
      const dz = z - cz
      if (dx * dx + dz * dz < radius * radius) return true
    }
    return false
  }

  private addGround(): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#303638', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.09
    ground.receiveShadow = true
    this.scene.add(ground)
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(118, 118), new THREE.MeshStandardMaterial({ color: '#555653', roughness: 1 }))
    slab.rotation.x = -Math.PI / 2
    slab.position.y = -0.035
    slab.receiveShadow = true
    this.scene.add(slab)
    for (let x = -56; x <= 56; x += 8) {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 118), seamMat)
      seam.rotation.x = -Math.PI / 2
      seam.position.set(x, SURFACE, 0)
      this.scene.add(seam)
    }
    for (let z = -56; z <= 56; z += 8) {
      const crossSeam = new THREE.Mesh(new THREE.PlaneGeometry(118, 0.035), seamMat)
      crossSeam.rotation.x = -Math.PI / 2
      crossSeam.position.set(0, SURFACE, z)
      this.scene.add(crossSeam)
    }
  }

  private addRoads(): void {
    const lanes = [-42, -18, 6, 30, 54]
    const laneMarks: GroundMark[] = []
    const crosswalkMarks: GroundMark[] = []
    for (const x of lanes) {
      this.addPlane(roadMat, 12, 116, x, -0.01, 0)
      this.addPlane(pavementMat, 2, 116, x - 7, 0, 0)
      this.addPlane(pavementMat, 2, 116, x + 7, 0, 0)
      for (let z = -55; z < 56; z += 10) laneMarks.push({ x, y: 0.012, z, width: 0.16, depth: 4.2 })
    }
    for (const z of lanes) {
      this.addPlane(roadMat, 116, 12, 0, -0.009, z)
      this.addPlane(pavementMat, 116, 2, 0, 0, z - 7)
      this.addPlane(pavementMat, 116, 2, 0, 0, z + 7)
      for (let x = -55; x < 56; x += 10) laneMarks.push({ x, y: 0.012, z, width: 4.2, depth: 0.16 })
    }
    // Faded crosswalks establish intersections without making the road grid feel pristine.
    for (const x of lanes) for (const z of lanes) {
      for (let i = -2; i <= 2; i += 1) {
        crosswalkMarks.push({ x: x + i * 1.05, y: 0.015, z: z - 7.1, width: 0.72, depth: 1.7 })
      }
    }
    this.addGroundMarkInstances(laneMarks, laneMarkMat)
    this.addGroundMarkInstances(crosswalkMarks, crosswalkMat)
    const manhole = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28), new THREE.MeshStandardMaterial({ color: '#2c3030', roughness: 0.8, metalness: 0.24 }))
    manhole.rotation.x = -Math.PI / 2
    manhole.position.set(-18, 0.022, 6)
    this.scene.add(manhole)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 0.93, 28), new THREE.MeshBasicMaterial({ color: '#77756a', side: THREE.DoubleSide, transparent: true, opacity: 0.45 }))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(-18, 0.03, 6)
    this.scene.add(ring)
  }

  private addGroundMarkInstances(marks: GroundMark[], material: THREE.Material): void {
    const geometry = new THREE.PlaneGeometry(1, 1)
    geometry.rotateX(-Math.PI / 2)
    const instances = new THREE.InstancedMesh(geometry, material, marks.length)
    const transform = new THREE.Object3D()
    marks.forEach((mark, index) => {
      transform.position.set(mark.x, mark.y, mark.z)
      transform.rotation.set(0, 0, 0)
      transform.scale.set(mark.width, 1, mark.depth)
      transform.updateMatrix()
      instances.setMatrixAt(index, transform.matrix)
    })
    instances.instanceMatrix.needsUpdate = true
    instances.castShadow = false
    instances.receiveShadow = false
    this.scene.add(instances)
  }

  private addBuildings(): void {
    const centers = [-30, -6, 18, 42]
    centers.forEach((x, xi) => centers.forEach((z, zi) => {
      if (Math.hypot(x, z) < 14) return // leave a broken-open intersection for the survivor's start point
      if ((xi * 5 + zi * 3) % 7 === 0) {
        this.makeRuin(x, z)
        return
      }
      this.makeBuilding(x + (this.random() - 0.5) * 1.1, z + (this.random() - 0.5) * 1.1)
    }))
  }

  private makeBuilding(cx: number, cz: number): void {
    const width = 13 + this.random() * 2.1
    const depth = 12.4 + this.random() * 2.8
    const height = 5.3 + this.random() * 6.1
    const mat = concreteMats[Math.floor(this.random() * concreteMats.length)]
    this.box(mat, cx, height / 2, cz, width, height, depth, (this.random() - 0.5) * 0.06)
    this.obstacles.push({ minX: cx - width / 2 - 0.55, maxX: cx + width / 2 + 0.55, minZ: cz - depth / 2 - 0.55, maxZ: cz + depth / 2 + 0.55 })

    const floors = Math.max(2, Math.floor(height / 2.25))
    for (let f = 0; f < floors; f += 1) {
      const y = 1.05 + f * 2.1
      for (let c = 0; c < 4; c += 1) {
        const wx = cx - width * 0.36 + c * width * 0.24
        const matWindow = this.random() > 0.77 ? windowWarm : windowDark
        this.box(matWindow, wx, y, cz + depth / 2 + 0.06, 0.92, 0.72, 0.09, 0)
        if (this.random() > 0.22) this.box(matWindow, wx, y, cz - depth / 2 - 0.06, 0.92, 0.72, 0.09, 0)
      }
    }
    const brokenLip = this.box(concreteMats[0], cx, height + 0.24, cz, width + 0.2, 0.4, depth + 0.2, 0)
    brokenLip.rotation.z = (this.random() - 0.5) * 0.025
    // Roof clutter, water tank and a fractured side wall silhouette.
    if (this.random() > 0.45) this.box(concreteMats[2], cx + (this.random() - 0.5) * 6, height + 1, cz + (this.random() - 0.5) * 5, 2.4, 1.5, 2.4, this.random() * 0.4)
    if (this.random() > 0.4) {
      const broken = this.box(concreteMats[3], cx + width * 0.47, height * 0.42, cz, 0.38, height * 0.82, depth * 0.86, 0.04)
      broken.position.x += (this.random() - 0.5) * 0.8
    }
    // Scarred concrete slabs laid around the entrance.
    this.box(concreteMats[1], cx + width / 2 + 1, 0.12, cz + depth * 0.32, 2.6, 0.24, 2.1, this.random() * 0.4)
  }

  private makeRuin(cx: number, cz: number): void {
    const width = 12 + this.random() * 2
    const depth = 12 + this.random() * 2
    const height = 2.5 + this.random() * 3
    const base = this.box(concreteMats[2], cx, height / 2, cz, width, height, depth, this.random() * 0.06)
    base.position.y -= 0.2
    this.obstacles.push({ minX: cx - width / 2 - 0.35, maxX: cx + width / 2 + 0.35, minZ: cz - depth / 2 - 0.35, maxZ: cz + depth / 2 + 0.35 })
    for (let n = 0; n < 4; n += 1) {
      const angle = (n / 4) * Math.PI * 2 + this.random() * 0.5
      const x = cx + Math.cos(angle) * (width * 0.38)
      const z = cz + Math.sin(angle) * (depth * 0.38)
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.6 + this.random(), 6), rustMats[1])
      rebar.position.set(x, height + 0.9, z)
      rebar.rotation.z = (this.random() - 0.5) * 0.24
      rebar.castShadow = true
      this.scene.add(rebar)
    }
    for (let n = 0; n < 7; n += 1) {
      const angle = this.random() * Math.PI * 2
      const dist = 5 + this.random() * 3
      const chunk = this.box(concreteMats[Math.floor(this.random() * concreteMats.length)], cx + Math.cos(angle) * dist, 0.2 + this.random() * 0.22, cz + Math.sin(angle) * dist, 0.8 + this.random() * 1.5, 0.4 + this.random() * 0.5, 0.8 + this.random() * 1.4, this.random() * Math.PI)
      chunk.rotation.z = (this.random() - 0.5) * 0.12
    }
  }

  private addCars(): void {
    const cars: Array<[number, number, number]> = [
      [-36, -18, Math.PI / 2], [36, 18, Math.PI / 2], [-18, 36, 0], [18, -36, 0], [-42, 42, Math.PI / 2], [42, -42, 0],
    ]
    cars.forEach(([x, z, rotation], index) => {
      const g = new THREE.Group()
      g.position.set(x, 0, z)
      g.rotation.y = rotation
      const rust = rustMats[index % rustMats.length]
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.76, 2.05), rust)
      body.position.y = 0.58
      body.castShadow = true
      body.receiveShadow = true
      g.add(body)
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.82, 1.72), concreteMats[0])
      cabin.position.set(-0.2, 1.25, 0)
      cabin.rotation.z = (index % 2 ? 1 : -1) * 0.13
      cabin.castShadow = true
      g.add(cabin)
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.54, 1.75), windowDark)
      glass.position.set(-0.22, 1.27, 0)
      glass.castShadow = true
      g.add(glass)
      const wheelMat = new THREE.MeshStandardMaterial({ color: '#171919', roughness: 1 })
      for (const wx of [-1.45, 1.45]) for (const wz of [-1.08, 1.08]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.23, 10), wheelMat)
        wheel.rotation.x = Math.PI / 2
        wheel.position.set(wx, 0.35, wz)
        wheel.castShadow = true
        g.add(wheel)
      }
      this.scene.add(g)
      this.obstacles.push({ minX: x - 2.6, maxX: x + 2.6, minZ: z - 1.5, maxZ: z + 1.5 })
      // Hood damage and a detached door lean against the shell.
      const dent = this.box(concreteMats[3], x + Math.cos(rotation) * 1.8, 0.93, z - Math.sin(rotation) * 1.8, 1.35, 0.1, 1.3, rotation + 0.1)
      dent.rotation.z = 0.08
    })
  }

  private addDebris(): void {
    for (let i = 0; i < 120; i += 1) {
      const x = (this.random() - 0.5) * 112
      const z = (this.random() - 0.5) * 112
      if (this.nearRoadCenter(x, z) || this.insideBuilding(x, z)) continue
      const material = this.random() > 0.62 ? rustMats[Math.floor(this.random() * rustMats.length)] : concreteMats[Math.floor(this.random() * concreteMats.length)]
      const size = 0.18 + this.random() * 0.85
      const piece = this.box(material, x, 0.1 + size * 0.24, z, size, 0.2 + size * 0.48, size * (0.5 + this.random()), this.random() * Math.PI)
      piece.rotation.x = (this.random() - 0.5) * 0.12
    }
  }

  private addStreetLamps(): void {
    const lampMat = new THREE.MeshStandardMaterial({ color: '#353b3b', roughness: 0.56, metalness: 0.5 })
    const glowMat = new THREE.MeshBasicMaterial({ color: '#d59755' })
    const positions = [[-36, -8], [-24, 20], [0, -30], [24, 10], [48, 20], [-48, 48], [12, 48], [46, -22]]
    for (const [x, z] of positions) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 6.2, 8), lampMat)
      pole.position.set(x, 3.1, z)
      pole.castShadow = true
      this.scene.add(pole)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), lampMat)
      arm.position.set(x + 0.72, 5.95, z)
      this.scene.add(arm)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glowMat)
      bulb.position.set(x + 1.52, 5.85, z)
      this.scene.add(bulb)
    }
  }

  private addPlane(material: THREE.Material, width: number, height: number, x: number, y: number, z: number): void {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, y, z)
    mesh.receiveShadow = true
    this.scene.add(mesh)
  }

  private box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rotation = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.rotation.y = rotation
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
    return mesh
  }

  private nearRoadCenter(x: number, z: number): boolean {
    const lanes = [-42, -18, 6, 30, 54]
    return lanes.some(lane => Math.abs(x - lane) < 7 || Math.abs(z - lane) < 7)
  }

  private insideBuilding(x: number, z: number): boolean {
    return this.obstacles.some(o => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ)
  }
}

function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
