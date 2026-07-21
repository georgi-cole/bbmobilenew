import { useMemo } from 'react'
import { CanvasTexture, DoubleSide, LinearFilter, SRGBColorSpace } from 'three'
import type { CinematicQuality } from '../config/cinematicQuality'
import type { TimelineState } from '../timeline/timeline'
import { clamp01, lerp } from '../utils/math'
import { CITY_LAYOUT } from './cityLayout'

type ShopKind = 'produce' | 'coffee' | 'market' | 'arcade' | 'garage'

type ShopStyle = {
  kind: ShopKind
  label: string
  accent: string
  glow: string
  interior: string
}

const SHOP_STYLES: readonly ShopStyle[] = [
  {
    kind: 'produce',
    label: 'FRESH MARKET',
    accent: '#7ead72',
    glow: '#dff1a4',
    interior: '#4b5a32',
  },
  {
    kind: 'coffee',
    label: 'NIGHT OWL COFFEE',
    accent: '#b77955',
    glow: '#ffd5a1',
    interior: '#5a3022',
  },
  { kind: 'market', label: 'MINI MARKET', accent: '#4b98a5', glow: '#a5f1e9', interior: '#23495a' },
  {
    kind: 'arcade',
    label: 'PIXEL ARCADE',
    accent: '#7657a8',
    glow: '#dbb6ff',
    interior: '#241f50',
  },
  { kind: 'garage', label: 'CITY GARAGE', accent: '#647181', glow: '#d3e5ee', interior: '#31383f' },
] as const

type StoreSpec = {
  side: -1 | 1
  facadeX: number
  z: number
  width: number
  style: ShopStyle
}

const STORE_SPECS: StoreSpec[] = []
;([-1, 1] as const).forEach((side, sideIndex) => {
  CITY_LAYOUT.buildings
    .filter(
      (building) =>
        Math.sign(building.position[0]) === side &&
        Math.abs(building.position[0]) < 35 &&
        building.position[2] > -455 &&
        building.position[2] < 118
    )
    .filter((_, index) => index % 2 === 0)
    .slice(0, 8)
    .forEach((building, index) => {
      STORE_SPECS.push({
        side,
        facadeX: building.position[0] - side * (building.scale[0] / 2 + 0.24),
        z: building.position[2],
        width: Math.min(9.6, building.scale[2] * 0.68),
        style: SHOP_STYLES[(index + sideIndex * 2) % SHOP_STYLES.length] ?? SHOP_STYLES[0],
      })
    })
})

const createSignTexture = (style: ShopStyle): CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create storefront signage.')

  const gradient = context.createLinearGradient(0, 0, canvas.width, 0)
  gradient.addColorStop(0, '#0b1118')
  gradient.addColorStop(0.48, style.interior)
  gradient.addColorStop(1, '#0b1118')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = style.accent
  context.lineWidth = 10
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24)
  context.fillStyle = style.glow
  context.shadowColor = style.glow
  context.shadowBlur = 22
  context.font = '700 82px Montserrat, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(style.label, canvas.width / 2, canvas.height / 2 + 4)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

type PedestrianSpec = {
  side: -1 | 1
  targetZ: number
  facadeX: number
  approach: -1 | 1
  delay: number
  storeKey: string
  coat: string
  umbrella: string
}

const PEDESTRIAN_STORES = [...STORE_SPECS]
  .filter((store) => store.style.kind !== 'garage')
  .sort((first, second) => second.z - first.z)
  .slice(0, 10)

const PEDESTRIANS: readonly PedestrianSpec[] = PEDESTRIAN_STORES.map((store, index) => ({
  side: store.side,
  targetZ: store.z,
  facadeX: store.facadeX,
  approach: index % 2 === 0 ? -1 : 1,
  delay: index * 18,
  storeKey: store.side + ':' + store.z,
  coat: ['#8296a8', '#9b6870', '#658b84', '#82758e'][index % 4] ?? '#8296a8',
  umbrella: ['#a76572', '#b49a60', '#4d8e92', '#75809b', '#856d99'][index % 5] ?? '#6d7285',
}))

const getPedestrianJourney = (frame: number, person: PedestrianSpec, index: number): number =>
  clamp01((frame - 382 - person.delay) / (250 + (index % 3) * 18))

export const Storefronts = ({ frame, state }: { frame: number; state: TimelineState }) => {
  const signTextures = useMemo(
    () =>
      Object.fromEntries(
        SHOP_STYLES.map((style) => [style.kind, createSignTexture(style)])
      ) as Record<ShopKind, CanvasTexture>,
    []
  )
  const nightStrength = clamp01(0.36 + state.windowIntensity * 0.27)
  const reflectedStrength = clamp01(state.wetness * 0.22 + state.rainIntensity * 0.08)

  return (
    <group>
      {STORE_SPECS.map((store, index) => {
        const roadOffset = -store.side * 0.28
        const isGarage = store.style.kind === 'garage'
        const hasAwning = store.style.kind === 'produce' || store.style.kind === 'coffee'
        const storeKey = store.side + ':' + store.z
        const visitorIndex = PEDESTRIANS.findIndex((person) => person.storeKey === storeKey)
        const visitor = visitorIndex >= 0 ? PEDESTRIANS[visitorIndex] : undefined
        const journey = visitor ? getPedestrianJourney(frame, visitor, visitorIndex) : 0
        const doorOpen = visitor
          ? clamp01((journey - 0.56) / 0.13) * (1 - clamp01((journey - 0.96) / 0.04))
          : 0
        const panelWidth = Math.max(1.8, (store.width - 2.5) / 2)
        const panelOffset = 1.25 + panelWidth / 2

        return (
          <group key={storeKey} position={[store.facadeX, 0, store.z]}>
            <mesh position={[roadOffset, 3.95, 0]}>
              <boxGeometry args={[0.64, 7.9, store.width + 0.9]} />
              <meshStandardMaterial color="#2b373c" roughness={0.5} metalness={0.54} />
            </mesh>
            <mesh position={[roadOffset, 8.22, 0]}>
              <boxGeometry args={[0.8, 0.54, store.width + 1.15]} />
              <meshStandardMaterial color="#303a3e" roughness={0.38} metalness={0.7} />
            </mesh>

            {isGarage ? (
              <mesh position={[roadOffset - store.side * 0.37, 3.02, 0]}>
                <boxGeometry args={[0.18, 5.55, store.width - 0.7]} />
                <meshStandardMaterial
                  color="#4a565f"
                  roughness={0.42}
                  metalness={0.76}
                  emissive={store.style.interior}
                  emissiveIntensity={nightStrength * 0.18}
                />
              </mesh>
            ) : (
              <>
                {([-1, 1] as const).map((panel) => (
                  <mesh
                    key={panel}
                    position={[roadOffset - store.side * 0.38, 3.05, panel * panelOffset]}
                  >
                    <boxGeometry args={[0.18, 5.05, panelWidth]} />
                    <meshPhysicalMaterial
                      color="#183039"
                      roughness={0.1 + state.wetness * 0.12}
                      metalness={0.42}
                      clearcoat={1}
                      emissive={store.style.interior}
                      emissiveIntensity={nightStrength * 0.4}
                    />
                  </mesh>
                ))}
                <mesh position={[roadOffset - store.side * 0.4, 2.62, 0]}>
                  <boxGeometry args={[0.22, 4.85, 2.18]} />
                  <meshStandardMaterial color="#080d11" roughness={0.78} metalness={0.16} />
                </mesh>
                {([-1, 1] as const).map((panel) => (
                  <mesh
                    key={'door-' + panel}
                    position={[
                      roadOffset - store.side * 0.54,
                      2.64,
                      panel * (0.52 + doorOpen * 0.58),
                    ]}
                  >
                    <boxGeometry args={[0.12, 4.55, 0.98]} />
                    <meshPhysicalMaterial
                      color="#294550"
                      roughness={0.08}
                      metalness={0.46}
                      clearcoat={1}
                      transparent
                      opacity={0.78}
                    />
                  </mesh>
                ))}
              </>
            )}

            <mesh position={[roadOffset - store.side * 0.38, 6.7, 0]}>
              <boxGeometry args={[0.42, 1.22, store.width + 0.72]} />
              <meshStandardMaterial
                color={store.style.accent}
                roughness={0.28}
                metalness={0.58}
                emissive={store.style.glow}
                emissiveIntensity={nightStrength * 0.3}
              />
            </mesh>
            <mesh
              position={[roadOffset - store.side * 0.62, 6.7, 0]}
              rotation={[0, store.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              <planeGeometry args={[store.width, 0.98]} />
              <meshBasicMaterial
                map={signTextures[store.style.kind]}
                color="#ffffff"
                side={DoubleSide}
                toneMapped={false}
              />
            </mesh>

            {hasAwning && (
              <mesh
                position={[roadOffset - store.side * 1.18, 5.7, 0]}
                rotation={[0, 0, store.side * 0.08]}
              >
                <boxGeometry args={[2, 0.13, store.width + 0.5]} />
                <meshStandardMaterial
                  color={index % 2 === 0 ? store.style.accent : '#d2c7b5'}
                  roughness={0.5}
                  metalness={0.18}
                />
              </mesh>
            )}

            <mesh position={[-store.side * 1.6, 0.265, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[3, store.width * 0.92]} />
              <meshBasicMaterial
                color={store.style.glow}
                transparent
                opacity={reflectedStrength}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export const UmbrellaPedestrians = ({
  frame,
  state,
  quality,
}: {
  frame: number
  state: TimelineState
  quality: CinematicQuality
}) => {
  if (state.rainIntensity <= 0.002) return null

  const opacity = Math.min(1, state.rainIntensity * 1.7)
  const sampledFrame = quality === 'balanced' ? Math.floor(frame / 2) * 2 : frame
  const visiblePedestrians = PEDESTRIANS.map((person, index) => ({ person, index })).filter(
    ({ index }) => quality === 'high' || index % 5 !== 4
  )

  return (
    <group>
      {visiblePedestrians.map(({ person, index }) => {
        const journey = getPedestrianJourney(sampledFrame, person, index)
        const startFrame = 382 + person.delay
        const arrival = clamp01(journey / 0.82)
        const easedArrival = arrival * arrival * (3 - 2 * arrival)
        const entering = clamp01((journey - 0.82) / 0.18)
        const appear = clamp01((sampledFrame - startFrame) / 14)
        const concealed = clamp01((journey - 0.985) / 0.015)
        const visibleScale = Math.min(1, state.rainIntensity * 1.8) * appear * (1 - concealed)
        if (visibleScale <= 0.01) return null

        const doorX = person.facadeX - person.side * 0.82
        const x = lerp(person.side * 10.35, doorX, easedArrival) + person.side * entering * 3.1
        const z = lerp(person.targetZ + person.approach * 10.8, person.targetZ, easedArrival)
        const walkStrength = 1 - entering
        const bob = Math.abs(Math.sin(sampledFrame * 0.18 + index * 1.7)) * 0.11 * walkStrength
        const step = Math.sin(sampledFrame * 0.18 + index * 1.7) * 0.34 * walkStrength

        return (
          <group key={person.storeKey} position={[x, 0, z]}>
            {([-1, 1] as const).map((leg) => (
              <mesh
                key={leg}
                position={[0, 0.72 + bob, leg * 0.19]}
                rotation={[leg * step, 0, 0]}
                scale={[0.12 * visibleScale, 0.72 * visibleScale, 0.12 * visibleScale]}
              >
                <cylinderGeometry args={[1, 1, 1, 7]} />
                <meshStandardMaterial
                  color={person.coat}
                  emissive={person.coat}
                  emissiveIntensity={0.28}
                  roughness={0.72}
                  transparent
                  opacity={opacity}
                />
              </mesh>
            ))}
            <mesh
              position={[0, 1.62 + bob, 0]}
              rotation={[person.side * -0.07, 0, person.approach * 0.05]}
              scale={[visibleScale, visibleScale, visibleScale]}
            >
              <capsuleGeometry args={[0.42, 1.28, 4, 8]} />
              <meshStandardMaterial
                color={person.coat}
                emissive={person.coat}
                emissiveIntensity={0.42}
                roughness={0.66}
                transparent
                opacity={opacity}
              />
            </mesh>
            <mesh
              position={[0, 2.92 + bob, 0]}
              scale={[0.4 * visibleScale, 0.4 * visibleScale, 0.4 * visibleScale]}
            >
              <sphereGeometry args={[1, 8, 6]} />
              <meshStandardMaterial
                color="#c69b80"
                emissive="#6f4838"
                emissiveIntensity={0.24}
                roughness={0.72}
                transparent
                opacity={opacity}
              />
            </mesh>
            <mesh
              position={[-person.side * 0.24, 3.02 + bob, 0]}
              rotation={[0, 0, person.side * -0.1]}
              scale={[0.045 * visibleScale, 0.7 * visibleScale, 0.045 * visibleScale]}
            >
              <cylinderGeometry args={[1, 1, 1, 6]} />
              <meshStandardMaterial
                color="#aeb8b8"
                roughness={0.34}
                metalness={0.72}
                transparent
                opacity={opacity}
              />
            </mesh>
            <mesh
              position={[-person.side * 0.24, 3.7 + bob, 0]}
              rotation={[0, 0, person.side * -0.1]}
              scale={[1.3 * visibleScale, 0.44 * visibleScale, 1.3 * visibleScale]}
            >
              <sphereGeometry args={[1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshBasicMaterial
                color={person.umbrella}
                side={DoubleSide}
                transparent
                opacity={opacity * 0.9}
                toneMapped={false}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
