import { Canvas } from '@react-three/fiber'
import { Environment, Html, OrbitControls, Text, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import * as THREE from 'three'
import './inspector.css'
import './prototype.css'
import './evidence.css'
import './product-lens.css'
import './clusters.css'
import './commercial.css'
import './events-readable.css'
import './readability.css'
import './agent.css'
import './typography.css'

type Point = { t: number; x: number; z: number }
type RetailEvent = { id: string; t: number; type: 'PICK' | 'PUT BACK' | 'TOUCH'; item: string; aisle: string; x?: number; z?: number }
type DemoData = { trajectory: Point[]; events: RetailEvent[]; journey?: { trackId: string; duration: number; source: string } }
type ProductCandidate = { name: string; confidence: number }
type Shelf = { id: string; name: string; category: string; map_zone: { x: number; z: number; width: number; depth: number }; sku_candidates: ProductCandidate[] }
type StoreConfig = { mode?: 'prototype_replay' | 'production'; provenance?: { interaction_video: string; store_map: string; product_catalog: string }; shelves: Shelf[]; event_mappings: Record<string, string[]> }
type AgentReply = { title: string; body: string; evidence: string; actions: { label: string; run: () => void }[] }
const demoStores = [
  { id: 'store-01', name: 'Riverside Market', offsetX: 0, offsetZ: 0 },
  { id: 'store-02', name: 'Midtown Grocery', offsetX: -0.65, offsetZ: 0.45 },
  { id: 'store-03', name: 'Harbor Express', offsetX: 0.55, offsetZ: -0.4 },
] as const

const demo: DemoData = {
  trajectory: [
    { t: 0, x: -5.8, z: 3.4 }, { t: 2, x: -4.5, z: 3 }, { t: 4, x: -3, z: 2.3 },
    { t: 6, x: -1.3, z: 1.7 }, { t: 8, x: 0.2, z: 1.5 }, { t: 10, x: 1.4, z: 0.5 },
    { t: 12, x: 2.6, z: -0.8 }, { t: 14, x: 3.8, z: -1.9 }, { t: 16, x: 4.8, z: -2.6 }, { t: 18, x: 5.8, z: -3.2 },
  ],
  events: [
    { id: 'event-1', t: 5.2, type: 'PICK', item: 'Sparkling water', aisle: 'Aisle 02' },
    { id: 'event-2', t: 11.8, type: 'PUT BACK', item: 'Organic granola', aisle: 'Aisle 04' },
    { id: 'event-3', t: 16.1, type: 'PICK', item: 'Pasta sauce', aisle: 'Aisle 05' },
  ],
}

const ambientPaths: Point[][] = [
  [{ t: 0, x: -5.7, z: -2.6 }, { t: 2, x: -4.1, z: -1.8 }, { t: 4, x: -2.8, z: -0.8 }, { t: 6, x: -1.6, z: 0.8 }, { t: 8, x: -2.7, z: 2.1 }, { t: 11, x: -4.8, z: 2.8 }],
  [{ t: 0, x: 5.6, z: 2.9 }, { t: 2, x: 4.4, z: 1.7 }, { t: 4, x: 3.2, z: 0.4 }, { t: 6, x: 4.2, z: -1.2 }, { t: 8, x: 5.3, z: -2.6 }, { t: 11, x: 4.6, z: -3.4 }],
]

const shopperSources = [
  { id: 'shopper-01', label: 'SHOPPER 01', video: '/data/RetailActionDemoAssets/001085/rank1_video.mp4', data: '/data/RetailActionDemoAssets/001085/demo-rank1.json' },
  { id: 'shopper-02', label: 'SHOPPER 02', video: '/data/RetailActionDemoAssets/001272/rank0_video.mp4', data: '/data/RetailActionDemoAssets/001272/demo.json' },
  { id: 'shopper-03', label: 'SHOPPER 03', video: '/data/RetailActionDemoAssets/000533/rank0_video.mp4', data: '/data/RetailActionDemoAssets/000533/demo.json' },
  { id: 'shopper-04', label: 'SHOPPER 04', video: '/data/RetailActionDemoAssets/000157/rank0_video.mp4', data: '/data/RetailActionDemoAssets/000157/demo.json' },
  { id: 'shopper-05', label: 'SHOPPER 05', video: '/data/RetailActionDemoAssets/000365/rank0_video.mp4', data: '/data/RetailActionDemoAssets/000365/demo.json' },
  { id: 'shopper-06', label: 'SHOPPER 06', video: '/data/RetailActionDemoAssets/000701/rank0_video.mp4', data: '/data/RetailActionDemoAssets/000701/demo.json' },
  { id: 'shopper-07', label: 'SHOPPER 07', video: '/data/RetailActionDemoAssets/001071/rank0_video.mp4', data: '/data/RetailActionDemoAssets/001071/demo.json' },
  { id: 'shopper-08', label: 'SHOPPER 08', video: '/data/RetailActionDemoAssets/001243/rank0_video.mp4', data: '/data/RetailActionDemoAssets/001243/demo.json' },
  { id: 'shopper-09', label: 'SHOPPER 09', video: '/data/RetailActionDemoAssets/000391/rank0_video.mp4', data: '/data/RetailActionDemoAssets/000391/demo.json' },
  { id: 'shopper-10', label: 'SHOPPER 10', video: '/data/RetailActionDemoAssets/000954/rank0_video.mp4', data: '/data/RetailActionDemoAssets/000954/demo.json' },
  { id: 'shopper-11', label: 'SHOPPER 11', video: '/data/RetailActionDemoAssets/000168/rank0_video.mp4', data: '/data/RetailActionDemoAssets/000168/demo.json' },
  { id: 'shopper-12', label: 'SHOPPER 12', video: '/data/RetailActionDemoAssets/001244/rank0_video.mp4', data: '/data/RetailActionDemoAssets/001244/demo.json' },
] as const

function positionAt(time: number, points: Point[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  const after = points.find((point) => point.t >= time) ?? points[points.length - 1]
  const before = [...points].reverse().find((point) => point.t <= time) ?? points[0]
  const progress = before.t === after.t ? 0 : (time - before.t) / (after.t - before.t)
  return { x: THREE.MathUtils.lerp(before.x, after.x, progress), z: THREE.MathUtils.lerp(before.z, after.z, progress) }
}

function AmbientShopper({ time, points, color, label, onSelect }: { time: number; points: Point[]; color: string; label: string; onSelect: () => void }) {
  const position = positionAt(Math.min(time, points[points.length - 1].t), points)
  return <group position={[position.x, 0.18, position.z]} onClick={onSelect}>
    <mesh castShadow position-y={0.64}><cylinderGeometry args={[0.25, 0.33, 0.88, 16]} /><meshStandardMaterial color={color} /></mesh>
    <mesh castShadow position-y={1.27}><sphereGeometry args={[0.25, 16, 16]} /><meshStandardMaterial color="#f2c49e" /></mesh>
    <mesh position-y={0.02} rotation-x={-Math.PI / 2}><ringGeometry args={[0.4, 0.46, 28]} /><meshBasicMaterial color={color} /></mesh>
    <Text position={[0, 1.75, 0]} fontSize={0.18} color="#dcefeb" anchorX="center">{label}</Text>
  </group>
}

type InteractionMarker = { t: number; x: number; z: number; videoTime: number }
type Visit = { id: string; t: number; x: number; z: number }

function StoreScene({ time, points, interaction, onInteraction, dwelling, visits, onVisit, events, onEvent, activeLabel, onSelectShopper, shelves, activeShelfId, onShelf }: { time: number; points: Point[]; interaction?: InteractionMarker; onInteraction: () => void; dwelling: boolean; visits: Visit[]; onVisit: (t: number) => void; events: RetailEvent[]; onEvent: (event: RetailEvent) => void; activeLabel: string; onSelectShopper: (id: (typeof shopperSources)[number]['id']) => void; shelves: Shelf[]; activeShelfId?: string; onShelf: (id: string) => void }) {
  const shopper = positionAt(time, points)
  const path = useMemo(() => points.map((point) => new THREE.Vector3(point.x, 0.03, point.z)), [points])
  return <Canvas shadows camera={{ position: [0, 27, 0.01], rotation: [-Math.PI / 2, 0, 0], fov: 42 }}>
    <color attach="background" args={['#dce8e7']} />
    <ambientLight intensity={1.5} />
    <directionalLight castShadow position={[7, 14, 5]} intensity={2.2} shadow-mapSize={[1024, 1024]} />
    <Environment preset="city" />
    <mesh receiveShadow rotation-x={-Math.PI / 2}><planeGeometry args={[30, 24]} /><meshStandardMaterial color="#b9c5c3" roughness={0.95} /></mesh>
    <Suspense fallback={<Html center className="model-loading">Loading store…</Html>}><Supermarket /></Suspense>
    <mesh position={[0, 0.055, 0]}><tubeGeometry args={[new THREE.CatmullRomCurve3(path), 80, 0.105, 10, false]} /><meshBasicMaterial color="#174f55" /></mesh>
    <mesh position={[0, 0.09, 0]}><tubeGeometry args={[new THREE.CatmullRomCurve3(path), 80, 0.058, 10, false]} /><meshBasicMaterial color="#00a995" /></mesh>
    <group position={[shopper.x, 0.2, shopper.z]}>
      <mesh castShadow position-y={0.72}><cylinderGeometry args={[0.3, 0.38, 0.95, 20]} /><meshStandardMaterial color="#f07048" emissive="#7a2519" emissiveIntensity={0.3} /></mesh>
      <mesh castShadow position={[0, 1.48, 0]}><sphereGeometry args={[0.3, 20, 20]} /><meshStandardMaterial color="#ffd0aa" /></mesh>
      <mesh castShadow position={[-0.19, 0.2, 0]} rotation-z={0.12}><cylinderGeometry args={[0.1, 0.11, 0.55, 12]} /><meshStandardMaterial color="#354c85" /></mesh>
      <mesh castShadow position={[0.19, 0.2, 0]} rotation-z={-0.12}><cylinderGeometry args={[0.1, 0.11, 0.55, 12]} /><meshStandardMaterial color="#354c85" /></mesh>
      <mesh castShadow position={[-0.45, 0.95, 0]} rotation-z={-0.75}><cylinderGeometry args={[0.08, 0.09, 0.62, 12]} /><meshStandardMaterial color="#f07048" /></mesh>
      <mesh castShadow position={[0.45, 0.95, 0]} rotation-z={0.75}><cylinderGeometry args={[0.08, 0.09, 0.62, 12]} /><meshStandardMaterial color="#f07048" /></mesh>
      <mesh position-y={0.03} rotation-x={-Math.PI / 2}><ringGeometry args={[0.58, 0.68, 40]} /><meshBasicMaterial color={dwelling ? '#ffcc65' : '#ffb04b'} /></mesh>
      <Text position={[0, 2.1, 0]} fontSize={0.26} color="#ffffff" anchorX="center">{dwelling ? 'DWELLING' : activeLabel}</Text>
    </group>
    <AmbientShopper time={time} points={ambientPaths[0]} color="#6098e8" label="SHOPPER 02" onSelect={() => onSelectShopper('shopper-02')} />
    <AmbientShopper time={time} points={ambientPaths[1]} color="#62bd96" label="SHOPPER 03" onSelect={() => onSelectShopper('shopper-03')} />
    {shelves.map((shelf) => { const active = shelf.id === activeShelfId; return <group key={shelf.id} position={[shelf.map_zone.x, 0.075, shelf.map_zone.z]} onClick={() => onShelf(shelf.id)}>
      <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[shelf.map_zone.width, shelf.map_zone.depth]} /><meshBasicMaterial color={active ? '#ffcb64' : '#4ab9ad'} transparent opacity={active ? 0.66 : 0.25} depthWrite={false} /></mesh>
      <mesh position-y={0.015} rotation-x={-Math.PI / 2}><ringGeometry args={[0.3, 0.36, 24]} /><meshBasicMaterial color={active ? '#fff0b5' : '#8ee5d7'} /></mesh>
      <Text position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={active ? 0.2 : 0.15} color={active ? '#4f3900' : '#e9fffb'} anchorX="center">{active ? shelf.name : shelf.category}</Text>
    </group> })}
    {interaction && <group position={[interaction.x, 0.3, interaction.z]} onClick={onInteraction}>
      <mesh castShadow><cylinderGeometry args={[0.44, 0.44, 0.28, 24]} /><meshStandardMaterial color="#ffcc65" emissive="#a56a00" emissiveIntensity={0.55} /></mesh>
      <mesh position-y={0.18} rotation-x={-Math.PI / 2}><ringGeometry args={[0.52, 0.62, 32]} /><meshBasicMaterial color="#fff1b6" /></mesh>
      <Text position={[0, 0.65, 0]} fontSize={0.34} color="#493400" anchorX="center">PICK</Text>
    </group>}
    {visits.map((visit, index) => <group key={visit.id} position={[visit.x, 0.24, visit.z]} onClick={() => onVisit(visit.t)}>
      <mesh rotation-x={-Math.PI / 2}><ringGeometry args={[0.3, 0.39, 24]} /><meshBasicMaterial color="#77d6c5" /></mesh>
      <Text position={[0, 0.42, 0]} fontSize={0.2} color="#e7fffb" anchorX="center">STOP {index + 1}</Text>
    </group>)}
    {events.filter((event) => event.x !== undefined && event.z !== undefined).map((event) => <group key={event.id} position={[event.x!, 0.34, event.z!]} onClick={() => onEvent(event)}>
      <mesh><cylinderGeometry args={[0.38, 0.38, 0.36, 24]} /><meshStandardMaterial color={event.type === 'PUT BACK' ? '#6f9cf2' : '#ffcc65'} emissive={event.type === 'PUT BACK' ? '#1f438e' : '#a56a00'} emissiveIntensity={0.55} /></mesh>
      <Text position={[0, 0.66, 0]} fontSize={0.24} color="#fff" anchorX="center">{event.type === 'PUT BACK' ? 'PUT' : 'PICK'}</Text>
    </group>)}
    <Text position={[-7.8, 0.05, 7.2]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.42} color="#37504c">ENTRANCE</Text>
    <OrbitControls makeDefault enabled={false} />
  </Canvas>
}

function Supermarket() {
  const { scene } = useGLTF('/models/supermarket.glb')
  useEffect(() => { scene.traverse((object) => { object.castShadow = true; object.receiveShadow = true }) }, [scene])
  return <primitive object={scene} />
}

useGLTF.preload('/models/supermarket.glb')

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [data, setData] = useState(demo)
  const [activeShopperId, setActiveShopperId] = useState<(typeof shopperSources)[number]['id']>('shopper-01')
  const [customVideoSrc, setCustomVideoSrc] = useState<string | null>(null)
  const activeShopper = shopperSources.find((shopper) => shopper.id === activeShopperId)!
  const videoSrc = customVideoSrc ?? activeShopper.video
  const [videoAvailable, setVideoAvailable] = useState(true)
  const [journeyPlaying, setJourneyPlaying] = useState(true)
  const [baseStoreConfig, setBaseStoreConfig] = useState<StoreConfig | null>(null)
  const [activeStoreId, setActiveStoreId] = useState<(typeof demoStores)[number]['id']>('store-01')
  const activeStore = demoStores.find((store) => store.id === activeStoreId)!
  const storeConfig = useMemo(() => baseStoreConfig ? {
    ...baseStoreConfig,
    store_id: activeStore.id,
    provenance: { ...baseStoreConfig.provenance, store_map: `${activeStore.name} · demo layout` },
    shelves: baseStoreConfig.shelves.map((shelf) => ({ ...shelf, map_zone: { ...shelf.map_zone, x: shelf.map_zone.x + activeStore.offsetX, z: shelf.map_zone.z + activeStore.offsetZ } })),
  } : null, [baseStoreConfig, activeStore])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null)
  const [activeMode, setActiveMode] = useState<'shopper' | 'product' | 'insights'>('product')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [allShopperData, setAllShopperData] = useState<Record<string, DemoData>>({})
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentQuery, setAgentQuery] = useState('')
  const [agentReply, setAgentReply] = useState<AgentReply | null>(null)
  const journey = data.journey
  const timelineDuration = Math.max(1, ...data.trajectory.map((point) => point.t), ...data.events.map((event) => event.t))
  const enrichedEvents = data.events.map((event, index) => ({ ...event, shelfId: storeConfig?.event_mappings[activeShopperId]?.[index] }))
  const selectedEvent = enrichedEvents.find((event) => event.id === selectedEventId) ?? enrichedEvents.find((event) => Math.abs(event.t - time) < 1.2) ?? null
  const selectedShelf = storeConfig?.shelves.find((shelf) => shelf.id === selectedShelfId) ?? storeConfig?.shelves.find((shelf) => shelf.id === selectedEvent?.shelfId) ?? null
  const products = useMemo(() => (storeConfig?.shelves ?? []).flatMap((shelf) => shelf.sku_candidates.map((product, index) => ({ ...product, id: `${shelf.id}-${index}`, shelf }))), [storeConfig])
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null
  const allIndexedEvents = useMemo(() => shopperSources.flatMap((shopper) => (allShopperData[shopper.id]?.events ?? []).map((event, index) => ({ ...event, shopperId: shopper.id, shopperLabel: shopper.label, shelfId: storeConfig?.event_mappings[shopper.id]?.[index] }))), [allShopperData, storeConfig])
  const productEvents = selectedProduct ? allIndexedEvents.filter((event) => event.shelfId === selectedProduct.shelf.id) : []
  const clusters = useMemo(() => (storeConfig?.shelves ?? []).map((shelf) => { const events = allIndexedEvents.filter((event) => event.shelfId === shelf.id); return { shelf, events, shoppers: new Set(events.map((event) => event.shopperId)).size, picks: events.filter((event) => event.type === 'PICK').length, puts: events.filter((event) => event.type === 'PUT BACK').length } }).sort((a, b) => b.events.length - a.events.length), [storeConfig, allIndexedEvents])
  const selectedCluster = clusters.find((cluster) => cluster.shelf.id === selectedShelfId) ?? clusters[0]
  const evidenceFrames = activeShopperId === 'shopper-01' && selectedEvent ? (selectedEvent.type === 'PICK'
    ? [{ label: 'BEFORE', time: 1.35, image: 'pick-before.jpg' }, { label: 'CONTACT', time: 1.95, image: 'pick-contact.jpg' }, { label: 'AFTER', time: 2.55, image: 'pick-after.jpg' }]
    : [{ label: 'BEFORE', time: 3.65, image: 'put-before.jpg' }, { label: 'CONTACT', time: 4.23, image: 'put-contact.jpg' }, { label: 'AFTER', time: 4.8, image: 'put-after.jpg' }]) : []
  const interactionPoint = selectedEvent?.type === 'PICK' ? { x: 40.6, y: 48.2 } : { x: 43.2, y: 47.8 }
  const interaction = journey ? { ...positionAt(Math.min(15.8, journey.duration), data.trajectory), t: Math.min(15.8, journey.duration), videoTime: 3.09 } : undefined
  const visits: Visit[] = journey ? [1.7, 9.5, 18.5].map((t, index) => ({ id: `visit-${index + 1}`, t, ...positionAt(t, data.trajectory) })) : []
  const dwelling = Boolean(journey && ((time >= 8.9 && time <= 10.1) || (time >= 18.2 && time <= 20.3)))
  const seek = (t: number) => { if (videoRef.current) videoRef.current.currentTime = t; setTime(t) }
  const jump = (t: number, eventId?: string) => { seek(t); if (eventId) setSelectedEventId(eventId); if (videoRef.current) void videoRef.current.play().catch(() => undefined) }
  const selectProduct = (productId: string) => {
    const product = products.find((candidate) => candidate.id === productId)
    if (!product) return
    setSelectedProductId(productId); setSelectedShelfId(product.shelf.id)
    const event = enrichedEvents.find((item) => item.shelfId === product.shelf.id)
    if (event) jump(event.t, event.id)
  }
  const openProductEvent = (event: typeof productEvents[number]) => { selectShopper(event.shopperId as (typeof shopperSources)[number]['id']); setTime(event.t); setSelectedEventId(event.id) }
  const focusCluster = (shelf: Shelf) => { setSelectedShelfId(shelf.id); setActiveMode('insights') }
  const runAgentQuery = (rawQuery: string) => {
    const query = rawQuery.trim().toLowerCase()
    if (!query) return
    const putLeader = [...clusters].sort((a, b) => b.puts - a.puts || b.events.length - a.events.length)[0]
    const productLeader = [...clusters].sort((a, b) => b.events.length - a.events.length)[0]
    const target = query.includes('饮料') || query.includes('beverage') ? clusters.find((cluster) => cluster.shelf.category === 'Beverages') : query.includes('零食') || query.includes('snack') ? clusters.find((cluster) => cluster.shelf.category === 'Snacks') : undefined
    if (target) {
      setAgentReply({ title: `${target.shelf.category} cluster`, body: `${target.events.length} interactions across ${target.shoppers} shopper tracks. ${target.picks} PICK and ${target.puts} PUT BACK events are available for review.`, evidence: 'Curated RetailAction event aggregate · configurable shelf mapping', actions: [{ label: 'Open category insight', run: () => focusCluster(target.shelf) }, { label: 'Explore products', run: () => { const product = products.find((item) => item.shelf.id === target.shelf.id); if (product) { setActiveMode('product'); selectProduct(product.id) } } }] })
    } else if (query.includes('放回') || query.includes('put back') || query.includes('return')) {
      setAgentReply({ title: 'Highest put-back signal', body: putLeader ? `${putLeader.shelf.category} has ${putLeader.puts} PUT BACK events from ${putLeader.events.length} interactions. This can indicate comparison behavior or shelf friction; inspect the linked clips before drawing a business conclusion.` : 'No put-back evidence is loaded yet.', evidence: 'Evidence-grounded aggregate, not a transaction record', actions: putLeader ? [{ label: 'Review put-back evidence', run: () => focusCluster(putLeader.shelf) }] : [] })
    } else {
      setAgentReply({ title: 'Store activity summary', body: productLeader ? `${productLeader.shelf.category} is the most active mapped category in the current sample pool, with ${productLeader.events.length} interactions across ${productLeader.shoppers} shopper tracks. Ask about a category, put-backs, shoppers, or evidence videos.` : 'Loading the local event index. Try again in a moment.', evidence: 'Queries run over local RetailAction-derived event JSON', actions: productLeader ? [{ label: 'Open top category', run: () => focusCluster(productLeader.shelf) }, { label: 'Browse products', run: () => setActiveMode('product') }] : [] })
    }
  }
  const openInteraction = () => {
    if (!interaction || !videoRef.current) return
    setJourneyPlaying(false)
    videoRef.current.currentTime = interaction.videoTime
    void videoRef.current.play().catch(() => undefined)
  }
  const openVisit = (visitTime: number) => { setJourneyPlaying(false); setTime(visitTime) }
  const selectShopper = (id: (typeof shopperSources)[number]['id']) => { setActiveShopperId(id); setCustomVideoSrc(null); setVideoAvailable(true); setTime(0); setSelectedEventId(null); setSelectedShelfId(null) }
  const selectStore = (id: (typeof demoStores)[number]['id']) => { setActiveStoreId(id); setSelectedShelfId(null); setSelectedProductId(null); setSelectedEventId(null) }
  const loadVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCustomVideoSrc(URL.createObjectURL(file)); setVideoAvailable(true); setTime(0); setJourneyPlaying(false)
  }
  const loadData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    file.text().then((text) => { setData(JSON.parse(text) as DemoData); setTime(0) }).catch(() => window.alert('Invalid demo JSON'))
  }

  useEffect(() => { fetch(activeShopper.data).then((res) => res.ok ? res.json() : demo).then(setData).catch(() => setData(demo)) }, [activeShopper.data])
  useEffect(() => { Promise.all(shopperSources.map(async (shopper) => [shopper.id, await fetch(shopper.data).then((res) => res.ok ? res.json() : demo).catch(() => demo)] as const)).then((entries) => setAllShopperData(Object.fromEntries(entries))) }, [])
  useEffect(() => { fetch('/data/store-config.json').then((res) => res.ok ? res.json() : null).then(setBaseStoreConfig).catch(() => setBaseStoreConfig(null)) }, [])
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setAgentOpen(true) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])
  useEffect(() => {
    if (!journey || !journeyPlaying) return
    const timer = window.setInterval(() => setTime((current) => current >= journey.duration ? 0 : Math.min(journey.duration, current + .1)), 100)
    return () => window.clearInterval(timer)
  }, [journey, journeyPlaying])
  const active = data.events.find((event) => Math.abs(event.t - time) < 1.2)
  return <main className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
    <aside className="side-nav">
      <div className="side-brand"><div className="brand-mark">S</div><div className="brand-copy"><strong>ShelfTwin</strong><span>Retail intelligence</span></div><button className="nav-toggle" aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setNavCollapsed((collapsed) => !collapsed)}>{navCollapsed ? '›' : '‹'}</button></div>
      <p className="sidebar-label">WORKSPACE</p>
      <nav className="main-nav">
        <button className={activeMode === 'shopper' ? 'active' : ''} onClick={() => setActiveMode('shopper')}><i>◫</i><span>Store overview</span></button>
        <button className={activeMode === 'product' ? 'active' : ''} onClick={() => { setActiveMode('product'); if (!selectedProductId && products[0]) selectProduct(products[0].id) }}><i>□</i><span>Products</span></button>
        <button className={activeMode === 'insights' ? 'active' : ''} onClick={() => setActiveMode('insights')}><i>◔</i><span>Category insights</span></button>
      </nav>
      <p className="sidebar-label store-list-label">DEMO STORES</p>
      <nav className="store-list" aria-label="Demo stores">{demoStores.map((store, index) => <button key={store.id} className={store.id === activeStoreId ? 'active' : ''} onClick={() => selectStore(store.id)}><i>{index + 1}</i><span>{store.name}</span>{store.id === activeStoreId && <b>ACTIVE</b>}</button>)}</nav>
      <div className="nav-footer"><span>DEMO WORKSPACE</span><small>Sample data · 3 store layouts</small></div>
    </aside>
    <div className="app-content">
    <header><div><p className="eyebrow">PRODUCT & SPACE INTELLIGENCE</p><h1>{activeMode === 'product' ? 'Products' : activeMode === 'insights' ? 'Category insights' : 'Store overview'}</h1></div><div className="header-actions"><button className="ask-agent" onClick={() => setAgentOpen(true)}>✦ Ask ShelfTwin <kbd>⌘ K</kbd></button><div className="filter-chip">Today <b>⌄</b></div><div className="status"><span /> Demo dataset</div></div></header>
    <div className="prototype-note"><b>DATA CONTEXT</b><span>Video interactions are RetailAction evidence. Store locations and product links are configurable planogram associations in this prototype.</span></div>
    {agentOpen && <div className="agent-scrim" onMouseDown={() => setAgentOpen(false)}><section className="agent-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="agent-dialog-head"><div><span>✦</span><strong>ShelfTwin Agent</strong><small>Evidence-grounded retail queries</small></div><button onClick={() => setAgentOpen(false)}>×</button></div><form onSubmit={(event) => { event.preventDefault(); runAgentQuery(agentQuery) }}><input autoFocus value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} placeholder="Ask about products, put-backs, shoppers, or video evidence…" /><button type="submit">Ask</button></form><div className="agent-suggestions"><button onClick={() => { setAgentQuery('哪些商品拿了又放回最多？'); runAgentQuery('哪些商品拿了又放回最多？') }}>Which products are put back most?</button><button onClick={() => { setAgentQuery('给我看饮料区相关视频'); runAgentQuery('给我看饮料区相关视频') }}>Show Beverage evidence</button><button onClick={() => { setAgentQuery('总结当前门店活动'); runAgentQuery('总结当前门店活动') }}>Summarize store activity</button></div>{agentReply && <div className="agent-answer"><p className="eyebrow">AGENT ANSWER</p><h2>{agentReply.title}</h2><p>{agentReply.body}</p><small>{agentReply.evidence}</small><div>{agentReply.actions.map((action) => <button key={action.label} onClick={() => { action.run(); setAgentOpen(false) }}>{action.label} →</button>)}</div></div>}<p className="agent-footnote">This demo agent queries the local event layer. It can be upgraded to Text-to-SQL / LLM tools without changing the evidence contract.</p></section></div>}
    {activeMode === 'product' && <section className="product-lens panel"><div className="product-lens-heading"><div><p className="eyebrow">PRODUCT LENS</p><h2>Start from a product, follow the evidence.</h2></div><span>CATALOG → SHELF → INTERACTION → SHOPPER → VIDEO</span></div><div className="product-catalog">{products.map((product) => <button key={product.id} className={selectedProduct?.id === product.id ? 'selected' : ''} onClick={() => selectProduct(product.id)}><i>{product.shelf.category.slice(0, 1)}</i><span>{product.name}</span><small>{product.shelf.category}</small></button>)}</div>{selectedProduct && <div className="product-story"><div className="product-identity"><div className="product-tile">{selectedProduct.shelf.category.slice(0, 1)}</div><div><small>PLANOGRAM CANDIDATE</small><h3>{selectedProduct.name}</h3><p>{selectedProduct.shelf.name} · candidate confidence {Math.round(selectedProduct.confidence * 100)}%</p></div></div><div className="product-metrics"><div><b>{productEvents.length}</b><span>interactions</span></div><div><b>{new Set(productEvents.map((event) => event.shopperId)).size}</b><span>shopper tracks</span></div><div><b>{productEvents.filter((event) => event.type === 'PICK').length}</b><span>picks</span></div></div><div className="product-events"><small>RELATED VIDEO EVIDENCE</small>{productEvents.length ? productEvents.map((event) => <button key={`${event.shopperId}-${event.id}`} onClick={() => openProductEvent(event)}><strong>{event.shopperLabel}</strong><span>{event.type} · {event.t.toFixed(2)}s</span><em>Open video →</em></button>) : <p>No interaction clip is curated for this shelf yet.</p>}</div></div>}<p className="product-lens-note">This product view uses a configurable planogram association. With a real catalog, barcode/OCR, inventory or POS signal, the same cards can be promoted from candidate to confirmed.</p></section>}
    {activeMode === 'insights' && <section className="clusters panel"><div className="product-lens-heading"><div><p className="eyebrow">CURATED CROSS-SAMPLE AGGREGATE</p><h2>Product & shelf clusters</h2></div><span>NOT A SINGLE STORE SESSION</span></div><div className="cluster-layout"><div className="cluster-list">{clusters.map((cluster) => <button key={cluster.shelf.id} className={selectedCluster?.shelf.id === cluster.shelf.id ? 'selected' : ''} onClick={() => setSelectedShelfId(cluster.shelf.id)}><i>{cluster.shelf.category.slice(0, 1)}</i><span><strong>{cluster.shelf.category}</strong><small>{cluster.shelf.sku_candidates.length} product candidates</small></span><b>{cluster.events.length}</b></button>)}</div>{selectedCluster && <div className="cluster-detail"><div className="cluster-detail-title"><div className="product-tile">{selectedCluster.shelf.category.slice(0, 1)}</div><div><small>SELECTED CLUSTER</small><h3>{selectedCluster.shelf.name}</h3><p>{selectedCluster.shelf.sku_candidates.map((product) => product.name).join(' · ')}</p></div></div><div className="cluster-metrics"><div><b>{selectedCluster.events.length}</b><span>interactions</span></div><div><b>{selectedCluster.shoppers}</b><span>shoppers</span></div><div><b>{selectedCluster.picks}</b><span>picks</span></div><div><b>{selectedCluster.puts}</b><span>put backs</span></div></div><div className="cluster-video-list"><small>DRILL DOWN TO EVIDENCE</small>{selectedCluster.events.length ? selectedCluster.events.map((event) => <button key={`${event.shopperId}-${event.id}`} onClick={() => openProductEvent(event)}><strong>{event.shopperLabel}</strong><span>{event.type} · {event.t.toFixed(2)}s</span><em>View video →</em></button>) : <p>Map-only cluster: add more clips mapped to this shelf to grow this cluster.</p>}</div><button className="explore-cluster" onClick={() => { const product = products.find((item) => item.shelf.id === selectedCluster.shelf.id); if (product) { setActiveMode('product'); selectProduct(product.id) } }}>Explore product cluster →</button></div>}</div><p className="product-lens-note">Counts aggregate the bundled RetailAction samples after configurable shelf mapping. They demonstrate the drill-down interaction; they are not transaction totals from a single physical store.</p></section>}
    <section className="workspace">
      <article className="video-card panel"><div className="panel-title"><span>{journey ? 'REFERENCE INTERACTION CLIP · INDEPENDENT SAMPLE' : 'RETAILACTION · DUAL INTERACTION CLIP'}</span><time>{time.toFixed(1).padStart(4, '0')}s</time></div>
        {videoAvailable ? <video key={videoSrc} ref={videoRef} className="camera" controls muted playsInline src={videoSrc} onTimeUpdate={(event) => { if (!journey) setTime(event.currentTarget.currentTime) }} onError={() => setVideoAvailable(false)} /> : <div className="camera placeholder"><div className="scan-frame" /><p>Select a local RetailAction video below</p><small>The spatial replay remains interactive using demo data.</small></div>}
        {evidenceFrames.length > 0 && <div className="evidence-strip"><div className="evidence-title"><span>VIDEO EVIDENCE · {selectedEvent?.type}</span><small>annotated interaction point</small></div><div className="evidence-frames">{evidenceFrames.map((frame) => <button key={frame.image} onClick={() => jump(frame.time, selectedEvent?.id)}><div className="evidence-image"><img src={`/data/RetailActionDemoAssets/001085/evidence/${frame.image}`} alt={`${frame.label} frame from RetailAction video`} /><i style={{ left: `${interactionPoint.x}%`, top: `${interactionPoint.y}%` }} /></div><span>{frame.label}</span><time>{frame.time.toFixed(2)}s</time></button>)}</div></div>}
        <div className="local-loader"><label>VIDEO<input type="file" accept="video/mp4" onChange={loadVideo} /></label><label>EVENT JSON<input type="file" accept="application/json" onChange={loadData} /></label></div>
        {active && <div className={'event-toast ' + active.type.toLowerCase().replace(' ', '-')}><b>{active.type}</b><span>{active.item}</span></div>}
      </article>
      <article className="scene-card panel"><div className="panel-title"><span>SPATIAL STORE MAP</span><label className="shopper-select"><i /> <select value={activeShopperId} onChange={(event) => selectShopper(event.target.value as (typeof shopperSources)[number]['id'])}>{shopperSources.map((shopper) => <option key={shopper.id} value={shopper.id}>{shopper.label}</option>)}</select> <b>● PICK / PUT</b></label></div><div className="map-viewport"><StoreScene time={time} points={data.trajectory} interaction={interaction} onInteraction={openInteraction} dwelling={dwelling} visits={visits} onVisit={openVisit} events={enrichedEvents} onEvent={(event) => jump(event.t, event.id)} activeLabel={activeShopper.label} onSelectShopper={selectShopper} shelves={storeConfig?.shelves ?? []} activeShelfId={selectedShelf?.id} onShelf={(shelfId) => { setSelectedShelfId(shelfId); const event = enrichedEvents.find((item) => item.shelfId === shelfId); if (event) jump(event.t, event.id) }} /></div></article>
    </section>
    <section className="events panel"><div><p className="eyebrow">{journey ? 'SHOPPER JOURNEY' : 'INTERACTION HISTORY'}</p><h2>{journey ? `Track ${journey.trackId}` : 'Activity at selected shelf'}</h2></div>{journey ? <div className="journey-controls"><button onClick={() => setJourneyPlaying((playing) => !playing)}>{journeyPlaying ? 'Pause replay' : 'Play replay'}</button><button className="pick-button" onClick={openInteraction}>View PICK clip</button><input aria-label="Journey position" type="range" min="0" max={journey.duration} step="0.1" value={time} onChange={(event) => setTime(Number(event.target.value))} /><span>{time.toFixed(1)}s / {journey.duration.toFixed(1)}s</span><div className="visit-list">{visits.map((visit, index) => <button key={visit.id} onClick={() => openVisit(visit.t)}><strong>STOP {index + 1}</strong><span>{visit.t.toFixed(1)}s · shelf dwell</span></button>)}</div><small>Teal map markers are track-derived dwell stops. The gold PICK marker opens the separate prepared RetailAction clip.</small></div> : <div className="video-timeline"><div className="event-list">{enrichedEvents.map((event) => <button className={selectedEvent?.id === event.id ? 'selected' : ''} key={event.id} onClick={() => jump(event.t, event.id)}><time>{event.t.toFixed(1)}s</time><strong>{event.type}</strong><span>{selectedEvent?.id === event.id && selectedShelf ? selectedShelf.name : event.item} · {event.aisle}</span><em>View evidence →</em></button>)}</div><div className="scrubber"><input aria-label="Video position" type="range" min="0" max={timelineDuration} step="0.05" value={Math.min(time, timelineDuration)} onChange={(event) => seek(Number(event.target.value))} /><span>{time.toFixed(1)}s / {timelineDuration.toFixed(1)}s</span></div></div>}</section>
    {selectedEvent && <section className="event-inspector panel">
      <div className="inspector-heading"><p className="eyebrow">EVENT INSPECTOR</p><h2>{selectedEvent.type} · {selectedEvent.t.toFixed(2)}s</h2></div>
      <div className="evidence-tags"><span>VIDEO VERIFIED</span><span>PROTOTYPE MAP</span><span>PLANOGRAM CANDIDATE</span></div>
      <div className="event-context"><div><small>SHELF</small><strong>{selectedShelf?.name ?? 'Shelf mapping pending'}</strong><em>{selectedShelf?.category ?? 'No planogram context yet'}</em></div><div><small>PRODUCT CANDIDATES</small>{selectedShelf ? <ol>{selectedShelf.sku_candidates.map((product) => <li key={product.name}><span>{product.name}</span><b>{Math.round(product.confidence * 100)}%</b></li>)}</ol> : <p>Load a store planogram to show candidate products.</p>}</div><button onClick={() => jump(selectedEvent.t, selectedEvent.id)}>View video evidence →</button></div>
      <div className="provenance-grid"><div><small>VIDEO EVIDENCE</small><span>{storeConfig?.provenance?.interaction_video ?? 'RetailAction labeled interaction clip'}</span></div><div><small>MAP ASSOCIATION</small><span>{storeConfig?.provenance?.store_map ?? 'Configured digital-twin demonstration map'}</span></div><div><small>PRODUCT SOURCE</small><span>{storeConfig?.provenance?.product_catalog ?? 'Demo planogram candidates'}</span></div></div>
      <p className="inspector-note">Production replacement path: same-store camera calibration → projected coordinates → real shelf polygons → planogram / inventory / POS-supported product association.</p>
    </section>}
    </div>
  </main>
}
