import { t, useLocale, LanguageSelector } from './i18n'
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
import './tour.css'

import type { Point, RetailEvent, DemoData, Shelf, StoreConfig, QueryContext } from './domain/types'
import { buildEventIndex, eventReference, loadDemoData, parseDemoData } from './domain/event-index'
import { aggregateInteractions, queryEvents, getEventEvidence, getShelfContext } from './domain/queries'
import type { UiCommand } from './assistant/commands'
import { shopperSources } from './domain/shopper-sources'
import { AgentDialog } from './assistant/AgentDialog'
import { CaseWorkspace } from './assistant/CaseWorkspace'
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
    <Suspense fallback={<Html center className="model-loading">{t("Loading store…")}</Html>}><Supermarket /></Suspense>
    {path.length > 1 && <mesh position={[0, 0.055, 0]}><tubeGeometry args={[new THREE.CatmullRomCurve3(path), 80, 0.105, 10, false]} /><meshBasicMaterial color="#174f55" /></mesh>}
    {path.length > 1 && <mesh position={[0, 0.09, 0]}><tubeGeometry args={[new THREE.CatmullRomCurve3(path), 80, 0.058, 10, false]} /><meshBasicMaterial color="#00a995" /></mesh>}
    <group position={[shopper.x, 0.2, shopper.z]}>
    <mesh castShadow position-y={0.72}><cylinderGeometry args={[0.3, 0.38, 0.95, 20]} /><meshStandardMaterial color="#f07048" emissive="#7a2519" emissiveIntensity={0.3} /></mesh>
    <mesh castShadow position={[0, 1.48, 0]}><sphereGeometry args={[0.3, 20, 20]} /><meshStandardMaterial color="#ffd0aa" /></mesh>
    <mesh castShadow position={[-0.19, 0.2, 0]} rotation-z={0.12}><cylinderGeometry args={[0.1, 0.11, 0.55, 12]} /><meshStandardMaterial color="#354c85" /></mesh>
    <mesh castShadow position={[0.19, 0.2, 0]} rotation-z={-0.12}><cylinderGeometry args={[0.1, 0.11, 0.55, 12]} /><meshStandardMaterial color="#354c85" /></mesh>
    <mesh castShadow position={[-0.45, 0.95, 0]} rotation-z={-0.75}><cylinderGeometry args={[0.08, 0.09, 0.62, 12]} /><meshStandardMaterial color="#f07048" /></mesh>
    <mesh castShadow position={[0.45, 0.95, 0]} rotation-z={0.75}><cylinderGeometry args={[0.08, 0.09, 0.62, 12]} /><meshStandardMaterial color="#f07048" /></mesh>
    <mesh position-y={0.03} rotation-x={-Math.PI / 2}><ringGeometry args={[0.58, 0.68, 40]} /><meshBasicMaterial color={dwelling ? '#ffcc65' : '#ffb04b'} /></mesh>
    <Text position={[0, 2.1, 0]} fontSize={0.26} color="#ffffff" anchorX="center">{dwelling ? t('DWELLING') : activeLabel}</Text>
    </group>
    <AmbientShopper time={time} points={ambientPaths[0]} color="#6098e8" label={t("SHOPPER 02")} onSelect={() => onSelectShopper('shopper-02')} />
    <AmbientShopper time={time} points={ambientPaths[1]} color="#62bd96" label={t("SHOPPER 03")} onSelect={() => onSelectShopper('shopper-03')} />
    {shelves.map((shelf) => { const active = shelf.id === activeShelfId; return <group key={shelf.id} position={[shelf.map_zone.x, 0.075, shelf.map_zone.z]} onClick={() => onShelf(shelf.id)}>
    <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[shelf.map_zone.width, shelf.map_zone.depth]} /><meshBasicMaterial color={active ? '#ffcb64' : '#4ab9ad'} transparent opacity={active ? 0.66 : 0.25} depthWrite={false} /></mesh>
    <mesh position-y={0.015} rotation-x={-Math.PI / 2}><ringGeometry args={[0.3, 0.36, 24]} /><meshBasicMaterial color={active ? '#fff0b5' : '#8ee5d7'} /></mesh>
    <Text position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={active ? 0.2 : 0.15} color={active ? '#4f3900' : '#e9fffb'} anchorX="center">{t(active ? shelf.name : shelf.category)}</Text>
    </group> })}
    {interaction && <group position={[interaction.x, 0.3, interaction.z]} onClick={onInteraction}>
    <mesh castShadow><cylinderGeometry args={[0.44, 0.44, 0.28, 24]} /><meshStandardMaterial color="#ffcc65" emissive="#a56a00" emissiveIntensity={0.55} /></mesh>
    <mesh position-y={0.18} rotation-x={-Math.PI / 2}><ringGeometry args={[0.52, 0.62, 32]} /><meshBasicMaterial color="#fff1b6" /></mesh>
    <Text position={[0, 0.65, 0]} fontSize={0.34} color="#493400" anchorX="center">{t("PICK")}</Text>
    </group>}
    {visits.map((visit, index) => <group key={visit.id} position={[visit.x, 0.24, visit.z]} onClick={() => onVisit(visit.t)}>
    <mesh rotation-x={-Math.PI / 2}><ringGeometry args={[0.3, 0.39, 24]} /><meshBasicMaterial color="#77d6c5" /></mesh>
    <Text position={[0, 0.42, 0]} fontSize={0.2} color="#e7fffb" anchorX="center">{t("STOP ")}{index + 1}</Text>
    </group>)}
    {events.filter((event) => event.x !== undefined && event.z !== undefined).map((event) => <group key={event.id} position={[event.x!, 0.34, event.z!]} onClick={() => onEvent(event)}>
    <mesh><cylinderGeometry args={[0.38, 0.38, 0.36, 24]} /><meshStandardMaterial color={event.type === 'PUT BACK' ? '#6f9cf2' : '#ffcc65'} emissive={event.type === 'PUT BACK' ? '#1f438e' : '#a56a00'} emissiveIntensity={0.55} /></mesh>
    <Text position={[0, 0.66, 0]} fontSize={0.24} color="#fff" anchorX="center">{t(event.type === 'PUT BACK' ? 'PUT' : 'PICK')}</Text>
    </group>)}
    <Text position={[-7.8, 0.05, 7.2]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.42} color="#37504c">{t("ENTRANCE")}</Text>
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
  useLocale()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [tourRect, setTourRect] = useState<DOMRect | null>(null)
  const [tourPlaying, setTourPlaying] = useState(false)
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
  const [indexLoaded, setIndexLoaded] = useState(false)
  const [indexErrors, setIndexErrors] = useState<string[]>([])
  const [activeDataError, setActiveDataError] = useState(false)
  const [storeError, setStoreError] = useState(false)
  const pendingEvidence = useRef<{ shopperId: string; t: number; eventId: string } | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [casesOpen, setCasesOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const journey = data.journey
  const timelineDuration = Math.max(1, ...data.trajectory.map((point) => point.t), ...data.events.map((event) => event.t))
  const enrichedEvents = data.events.map((event) => ({ ...event, shelfId: storeConfig?.event_shelves[eventReference(activeShopperId, event.id)] }))
  const selectedEvent = enrichedEvents.find((event) => event.id === selectedEventId) ?? enrichedEvents.find((event) => Math.abs(event.t - time) < 1.2) ?? null
  const selectedShelf = storeConfig?.shelves.find((shelf) => shelf.id === selectedShelfId) ?? storeConfig?.shelves.find((shelf) => shelf.id === selectedEvent?.shelfId) ?? null
  const products = useMemo(() => (storeConfig?.shelves ?? []).flatMap((shelf) => shelf.sku_candidates.map((product, index) => ({ ...product, id: `${shelf.id}-${index}`, shelf }))), [storeConfig])
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null
  const allIndexedEvents = useMemo(() => buildEventIndex(shopperSources, allShopperData, storeConfig), [allShopperData, storeConfig])
  const queryContext: QueryContext = { events: allIndexedEvents, shelves: storeConfig?.shelves ?? [],
    status: indexErrors.length || storeError ? 'error' : indexLoaded && storeConfig ? 'ready' : 'loading',
    errors: [...indexErrors, ...(storeError ? ['store-config'] : [])] }
  const productEvents = selectedProduct ? queryEvents(queryContext, { shelfId: selectedProduct.shelf.id, limit: 100 }).result.events : []
  const clusters = aggregateInteractions(queryContext).result.clusters
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
  const executeCommand = (command: UiCommand) => {
    if (command.type === 'focus_shelf') {
      const shelf = getShelfContext(queryContext, command.shelfId).result
      if (shelf) { setSelectedShelfId(shelf.id); setActiveMode('insights') }
    } else if (command.type === 'open_evidence') {
      const evidence = getEventEvidence(queryContext, command.eventRef).result
      if (!evidence) return
      const shopper = shopperSources.find(source => source.id === evidence.shopperId)
      if (!shopper) return
      setActiveMode('shopper')
      if (shopper.id === activeShopperId && !customVideoSrc) jump(evidence.seekTime, evidence.eventId)
      else {
        selectShopper(shopper.id)
        if (shopper.id === activeShopperId && allShopperData[shopper.id]) setData(allShopperData[shopper.id])
        pendingEvidence.current = { shopperId: shopper.id, t: evidence.seekTime, eventId: evidence.eventId }
      }
    } else if (command.type === 'show_shopper') {
      const shopper = shopperSources.find(source => source.id === command.shopperId)
      if (shopper) selectShopper(shopper.id)
    } else if (command.type === 'browse_products') setActiveMode('product')
  }
  const openProductEvent = (event: typeof productEvents[number]) => executeCommand({ type: 'open_evidence', eventRef: event.eventRef })
  const openInteraction = () => {
    if (!interaction || !videoRef.current) return
    setJourneyPlaying(false)
    videoRef.current.currentTime = interaction.videoTime
    void videoRef.current.play().catch(() => undefined)
  }
  const openVisit = (visitTime: number) => { setJourneyPlaying(false); setTime(visitTime) }
  const selectShopper = (id: (typeof shopperSources)[number]['id']) => { pendingEvidence.current = null; setActiveShopperId(id); setCustomVideoSrc(null); setVideoAvailable(true); setTime(0); setSelectedEventId(null); setSelectedShelfId(null) }
  const selectStore = (id: (typeof demoStores)[number]['id']) => { setActiveStoreId(id); setSelectedShelfId(null); setSelectedProductId(null); setSelectedEventId(null) }
  const loadVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    pendingEvidence.current = null
    setCustomVideoSrc(URL.createObjectURL(file)); setVideoAvailable(true); setTime(0); setJourneyPlaying(false)
  }
  const loadData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    pendingEvidence.current = null
    file.text().then((text) => { setData(parseDemoData(JSON.parse(text))); setActiveDataError(false); setTime(0) }).catch(() => window.alert(t('Invalid demo JSON')))
  }

  useEffect(() => {
    let cancelled = false
    setActiveDataError(false)
    setData({ trajectory: [], events: [] })
    loadDemoData(activeShopper.data).then(value => {
      if (cancelled) return
      setData(value)
      const pending = pendingEvidence.current
      if (pending?.shopperId === activeShopperId) { setTime(pending.t); setSelectedEventId(pending.eventId) }
    }).catch(() => { if (!cancelled) { setActiveDataError(true); setData({ trajectory: [], events: [] }); pendingEvidence.current = null } })
    return () => { cancelled = true }
  }, [activeShopper.data])
  useEffect(() => {
    let cancelled = false
    Promise.allSettled(shopperSources.map(source => loadDemoData(source.data))).then(results => {
      if (cancelled) return
      const loaded: Record<string, DemoData> = {}
      const errors: string[] = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') loaded[shopperSources[index].id] = result.value
        else errors.push(shopperSources[index].id)
      })
      setAllShopperData(loaded); setIndexErrors(errors); setIndexLoaded(true)
    })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    fetch('/data/store-config.json').then(response => {
      if (!response.ok) throw new Error('Store config failed')
      return response.json()
    }).then((value: StoreConfig) => {
      if (!Array.isArray(value.shelves) || !value.event_shelves) throw new Error('Invalid store config')
      if (!cancelled) setBaseStoreConfig(value)
    }).catch(() => { if (!cancelled) setStoreError(true) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setAgentOpen(true) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])
  useEffect(() => {
    if (!journey || !journeyPlaying) return
    const timer = window.setInterval(() => setTime((current) => current >= journey.duration ? 0 : Math.min(journey.duration, current + .1)), 100)
    return () => window.clearInterval(timer)
  }, [journey, journeyPlaying])
  const active = data.events.find((event) => Math.abs(event.t - time) < 1.2)
  const tourSteps = [
    { selector: '.main-nav', title: t('从这里切换工作视图'), text: t('门店总览、商品和品类洞察分别展示空间活动、商品证据链和跨样本汇总。点击侧栏任一入口即可切换。'), action: () => setActiveMode('product') },
    { selector: '.product-catalog', title: t('选择一个商品'), text: t('商品目录连接货架和互动记录。选中商品后，下面会展开候选信息、互动数量和相关视频证据。'), action: () => { setActiveMode('product'); if (products[0]) selectProduct(products[0].id) } },
    { selector: '.product-story', title: t('商品说明与证据'), text: t('这里显示商品对应的货架、候选置信度和行为指标。点击任意视频证据，可以跳到对应顾客片段。'), action: () => { setActiveMode('product'); if (products[0]) selectProduct(products[0].id) } },
    { selector: '.video-card', title: t('查看真实互动片段'), text: t('视频用于核对 PICK / PUT BACK 等行为。下方时间线和证据帧都可以点击，跳转到事件发生时刻。'), action: () => setActiveMode('shopper') },
    { selector: '.scene-card', title: t('在数字地图里点选货架'), text: t('地图显示顾客轨迹、互动标记和货架区域。点击货架或事件标记，可以关联到视频和商品信息。'), action: () => setActiveMode('shopper') },
    { selector: '.events', title: t('按时间浏览行为'), text: t('活动时间线汇总当前样本的互动。选中一条事件会同步视频位置和地图上的位置。'), action: () => setActiveMode('shopper') },
    { selector: '.clusters', title: t('比较品类与货架'), text: t('品类洞察按映射货架聚合多个样本，点击分类可继续查看商品或回到视频证据。'), action: () => setActiveMode('insights') },
    { selector: '.ask-agent', title: t('用自然语言查找线索'), text: t('ShelfTwin Agent 可以回答商品、放回行为和视频证据相关的问题，并提供可点击的结果入口。'), action: () => setAgentOpen(true) },
  ]
  const activeTour = tourStep === null ? null : tourSteps[tourStep]
  const currentTourStep = tourStep ?? 0
  const updateTourRect = () => {
    if (tourStep === null) return
    const target = document.querySelector(tourSteps[tourStep].selector)
    setTourRect(target?.getBoundingClientRect() ?? null)
  }
  useEffect(() => {
    if (tourStep === null) { setTourRect(null); return }
    tourSteps[tourStep].action()
    const timer = window.setTimeout(() => {
      const target = document.querySelector(tourSteps[tourStep].selector)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTourRect(target?.getBoundingClientRect() ?? null)
    }, 100)
    return () => window.clearTimeout(timer)
  }, [tourStep])
  useEffect(() => {
    if (tourStep === null) return
    const refresh = () => updateTourRect()
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    return () => { window.removeEventListener('resize', refresh); window.removeEventListener('scroll', refresh, true) }
  }, [tourStep])
  useEffect(() => {
    if (!tourPlaying) return
    const timer = window.setInterval(() => setTourStep((step) => step === null || step >= tourSteps.length - 1 ? (setTourPlaying(false), step) : step + 1), 4200)
    return () => window.clearInterval(timer)
  }, [tourPlaying])
  return <main className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
    <aside className="side-nav">
    <div className="side-brand"><div className="brand-mark">S</div><div className="brand-copy"><strong>ShelfTwin</strong><span>{t("Retail intelligence")}</span></div><button className="nav-toggle" aria-label={navCollapsed ? t('Expand navigation') : t('Collapse navigation')} onClick={() => setNavCollapsed((collapsed) => !collapsed)}>{navCollapsed ? '›' : '‹'}</button></div>
    <p className="sidebar-label">{t("WORKSPACE")}</p>
    <nav className="main-nav">
    <button className={activeMode === 'shopper' ? 'active' : ''} onClick={() => setActiveMode('shopper')}><i>◫</i><span>{t("Store overview")}</span></button>
    <button className={activeMode === 'product' ? 'active' : ''} onClick={() => { setActiveMode('product'); if (!selectedProductId && products[0]) selectProduct(products[0].id) }}><i>□</i><span>{t("Products")}</span></button>
    <button className={activeMode === 'insights' ? 'active' : ''} onClick={() => setActiveMode('insights')}><i>◔</i><span>{t("Category insights")}</span></button>
    </nav>
    <p className="sidebar-label store-list-label">{t("DEMO STORES")}</p>
    <nav className="store-list" aria-label={t("Demo stores")}>{demoStores.map((store, index) => <button key={store.id} className={store.id === activeStoreId ? 'active' : ''} onClick={() => selectStore(store.id)}><i>{index + 1}</i><span>{store.name}</span>{store.id === activeStoreId && <b>{t("ACTIVE")}</b>}</button>)}</nav>
    <div className="nav-footer"><span>{t("DEMO WORKSPACE")}</span><small>{t("Sample data · 3 store layouts")}</small></div>
    </aside>
    <div className="app-content">
    <header><div><p className="eyebrow">{t("PRODUCT & SPACE INTELLIGENCE")}</p><h1>{activeMode === 'product' ? t('Products') : activeMode === 'insights' ? t('Category insights') : t('Store overview')}</h1></div><div className="header-actions"><LanguageSelector /><button className="tour-launch" onClick={() => { setTourPlaying(false); setTourStep(0) }}>{t("▶ 产品导览")}</button><button className="ask-agent" onClick={() => setCasesOpen(true)}>{t("调查工作台")}</button><button className="ask-agent" onClick={() => setAgentOpen(true)}>{t("✦ Ask ShelfTwin ")}<kbd>⌘ K</kbd></button><div className="filter-chip">{t("Today ")}<b>⌄</b></div><div className="status"><span />{t(" Demo dataset")}</div></div></header>
    <div className="prototype-note"><b>{t("DATA CONTEXT")}</b><span>{t("Video interactions are RetailAction evidence. Store locations and product links are configurable planogram associations in this prototype.")}</span></div>
    {(queryContext.status !== 'ready' || activeDataError) && <p role="status" className="product-lens-note">{activeDataError ? t('当前样本加载失败，未使用示例事件代替。') : queryContext.status === 'loading' ? t('正在加载事件索引…') : `${t('数据未完整加载：')}${queryContext.errors.join(', ')}. ${t('当前统计仅含成功加载的数据，问答排名暂不可用。')}`}</p>}
    {casesOpen && <CaseWorkspace execute={executeCommand} onClose={() => setCasesOpen(false)} />}
    {agentOpen && <AgentDialog context={queryContext} execute={executeCommand} onClose={() => setAgentOpen(false)} />}
    {activeMode === 'product' && <section className="product-lens panel"><div className="product-lens-heading"><div><p className="eyebrow">{t("PRODUCT LENS")}</p><h2>{t("Start from a product, follow the evidence.")}</h2></div><span>{t("CATALOG → SHELF → INTERACTION → SHOPPER → VIDEO")}</span></div><div className="product-catalog">{products.map((product) => <button key={product.id} className={selectedProduct?.id === product.id ? 'selected' : ''} onClick={() => selectProduct(product.id)}><i>{product.shelf.category.slice(0, 1)}</i><span>{t(product.name)}</span><small>{t(product.shelf.category)}</small></button>)}</div>{selectedProduct && <div className="product-story"><div className="product-identity"><div className="product-tile">{selectedProduct.shelf.category.slice(0, 1)}</div><div><small>{t("PLANOGRAM CANDIDATE")}</small><h3>{t(selectedProduct.name)}</h3><p>{t(selectedProduct.shelf.name)}{t(" · candidate confidence ")}{Math.round(selectedProduct.confidence * 100)}%</p></div></div><div className="product-metrics"><div><b>{productEvents.length}</b><span>{t("shelf interactions")}</span></div><div><b>{new Set(productEvents.map((event) => event.shopperId)).size}</b><span>{t("shopper tracks")}</span></div><div><b>{productEvents.filter((event) => event.type === 'PICK').length}</b><span>{t("picks")}</span></div></div><div className="product-events"><small>{t("SHELF-ASSOCIATED VIDEO EVIDENCE")}</small>{productEvents.length ? productEvents.map((event) => <button key={`${event.shopperId}-${event.id}`} onClick={() => openProductEvent(event)}><strong>{t(event.shopperLabel)}</strong><span>{t(event.type)} · {event.t.toFixed(2)}s</span><em>{t("Open video →")}</em></button>) : <p>{t("No interaction clip is curated for this shelf yet.")}</p>}</div></div>}<p className="product-lens-note">{t("This product view uses a configurable planogram association. With a real catalog, barcode/OCR, inventory or POS signal, the same cards can be promoted from candidate to confirmed.")}</p></section>}
    {activeMode === 'insights' && <section className="clusters panel"><div className="product-lens-heading"><div><p className="eyebrow">{t("CURATED CROSS-SAMPLE AGGREGATE")}</p><h2>{t("Product & shelf clusters")}</h2></div><span>{t("NOT A SINGLE STORE SESSION")}</span></div><div className="cluster-layout"><div className="cluster-list">{clusters.map((cluster) => <button key={cluster.shelf.id} className={selectedCluster?.shelf.id === cluster.shelf.id ? 'selected' : ''} onClick={() => setSelectedShelfId(cluster.shelf.id)}><i>{cluster.shelf.category.slice(0, 1)}</i><span><strong>{t(cluster.shelf.category)}</strong><small>{cluster.shelf.sku_candidates.length}{t(" product candidates")}</small></span><b>{cluster.events.length}</b></button>)}</div>{selectedCluster && <div className="cluster-detail"><div className="cluster-detail-title"><div className="product-tile">{selectedCluster.shelf.category.slice(0, 1)}</div><div><small>{t("SELECTED CLUSTER")}</small><h3>{t(selectedCluster.shelf.name)}</h3><p>{selectedCluster.shelf.sku_candidates.map((product) => t(product.name)).join(' · ')}</p></div></div><div className="cluster-metrics"><div><b>{selectedCluster.events.length}</b><span>{t("shelf interactions")}</span></div><div><b>{selectedCluster.shoppers}</b><span>{t("shoppers")}</span></div><div><b>{selectedCluster.picks}</b><span>{t("picks")}</span></div><div><b>{selectedCluster.puts}</b><span>{t("put backs")}</span></div></div><div className="cluster-video-list"><small>{t("DRILL DOWN TO EVIDENCE")}</small>{selectedCluster.events.length ? selectedCluster.events.map((event) => <button key={`${event.shopperId}-${event.id}`} onClick={() => openProductEvent(event)}><strong>{t(event.shopperLabel)}</strong><span>{t(event.type)} · {event.t.toFixed(2)}s</span><em>{t("View video →")}</em></button>) : <p>{t("Map-only cluster: add more clips mapped to this shelf to grow this cluster.")}</p>}</div><button className="explore-cluster" onClick={() => { const product = products.find((item) => item.shelf.id === selectedCluster.shelf.id); if (product) { setActiveMode('product'); selectProduct(product.id) } }}>{t("Explore product cluster →")}</button></div>}</div><p className="product-lens-note">{t("Counts aggregate the bundled RetailAction samples after configurable shelf mapping. They demonstrate the drill-down interaction; they are not transaction totals from a single physical store.")}</p></section>}
    <section className="workspace">
    <article className="video-card panel"><div className="panel-title"><span>{journey ? t('REFERENCE INTERACTION CLIP · INDEPENDENT SAMPLE') : t('RETAILACTION · DUAL INTERACTION CLIP')}</span><time>{time.toFixed(1).padStart(4, '0')}s</time></div>
    {videoAvailable ? <video onLoadedMetadata={() => {
        const pending = pendingEvidence.current
        if (pending?.shopperId === activeShopperId) {
          seek(pending.t); setSelectedEventId(pending.eventId); pendingEvidence.current = null
        }
      }} key={videoSrc} ref={videoRef} className="camera" controls muted playsInline src={videoSrc} onTimeUpdate={(event) => { if (!journey) setTime(event.currentTarget.currentTime) }} onError={() => setVideoAvailable(false)} /> : <div className="camera placeholder"><div className="scan-frame" /><p>{t("Select a local RetailAction video below")}</p><small>{t("The spatial replay remains interactive using demo data.")}</small></div>}
    {evidenceFrames.length > 0 && <div className="evidence-strip"><div className="evidence-title"><span>{t("VIDEO EVIDENCE · ")}{selectedEvent?.type}</span><small>{t("annotated interaction point")}</small></div><div className="evidence-frames">{evidenceFrames.map((frame) => <button key={frame.image} onClick={() => jump(frame.time, selectedEvent?.id)}><div className="evidence-image"><img src={`/data/RetailActionDemoAssets/001085/evidence/${frame.image}`} alt={`${t(frame.label)} frame from RetailAction video`} /><i style={{ left: `${interactionPoint.x}%`, top: `${interactionPoint.y}%` }} /></div><span>{t(frame.label)}</span><time>{frame.time.toFixed(2)}s</time></button>)}</div></div>}
    <div className="local-loader"><label>{t("VIDEO")}<input type="file" accept="video/mp4" onChange={loadVideo} /></label><label>{t("EVENT JSON")}<input type="file" accept="application/json" onChange={loadData} /></label></div>
    {active && <div className={'event-toast ' + active.type.toLowerCase().replace(' ', '-')}><b>{t(active.type)}</b><span>{t(active.item)}</span></div>}
    </article>
    <article className="scene-card panel"><div className="panel-title"><span>{t("SPATIAL STORE MAP")}</span><label className="shopper-select"><i />
    <select value={activeShopperId} onChange={(event) => selectShopper(event.target.value as (typeof shopperSources)[number]['id'])}>{shopperSources.map((shopper) => <option key={shopper.id} value={shopper.id}>{t(shopper.label)}</option>)}</select>
    <b>{t("● PICK / PUT")}</b></label></div><div className="map-viewport"><StoreScene time={time} points={data.trajectory} interaction={interaction} onInteraction={openInteraction} dwelling={dwelling} visits={visits} onVisit={openVisit} events={enrichedEvents} onEvent={(event) => jump(event.t, event.id)} activeLabel={activeShopper.label} onSelectShopper={selectShopper} shelves={storeConfig?.shelves ?? []} activeShelfId={selectedShelf?.id} onShelf={(shelfId) => { setSelectedShelfId(shelfId); const event = enrichedEvents.find((item) => item.shelfId === shelfId); if (event) jump(event.t, event.id) }} /></div></article>
    </section>
    <section className="events panel"><div><p className="eyebrow">{journey ? t('SHOPPER JOURNEY') : t('INTERACTION HISTORY')}</p><h2>{journey ? `Track ${journey.trackId}` : t('Activity at selected shelf')}</h2></div>{journey ? <div className="journey-controls"><button onClick={() => setJourneyPlaying((playing) => !playing)}>{journeyPlaying ? t('Pause replay') : t('Play replay')}</button><button className="pick-button" onClick={openInteraction}>{t("View PICK clip")}</button><input aria-label={t("Journey position")} type="range" min="0" max={journey.duration} step="0.1" value={time} onChange={(event) => setTime(Number(event.target.value))} /><span>{time.toFixed(1)}s / {journey.duration.toFixed(1)}s</span><div className="visit-list">{visits.map((visit, index) => <button key={visit.id} onClick={() => openVisit(visit.t)}><strong>{t("STOP ")}{index + 1}</strong><span>{visit.t.toFixed(1)}{t("s · shelf dwell")}</span></button>)}</div><small>{t("Teal map markers are track-derived dwell stops. The gold PICK marker opens the separate prepared RetailAction clip.")}</small></div> : <div className="video-timeline"><div className="event-list">{enrichedEvents.map((event) => <button className={selectedEvent?.id === event.id ? 'selected' : ''} key={event.id} onClick={() => jump(event.t, event.id)}><time>{event.t.toFixed(1)}s</time><strong>{t(event.type)}</strong><span>{t(selectedEvent?.id === event.id && selectedShelf ? selectedShelf.name : event.item)} · {t(event.aisle)}</span><em>{t("View evidence →")}</em></button>)}</div><div className="scrubber"><input aria-label={t("Video position")} type="range" min="0" max={timelineDuration} step="0.05" value={Math.min(time, timelineDuration)} onChange={(event) => seek(Number(event.target.value))} /><span>{time.toFixed(1)}s / {timelineDuration.toFixed(1)}s</span></div></div>}</section>
    {selectedEvent && <section className="event-inspector panel">
    <div className="inspector-heading"><p className="eyebrow">{t("EVENT INSPECTOR")}</p><h2>{t(selectedEvent.type)} · {selectedEvent.t.toFixed(2)}s</h2></div>
    <div className="evidence-tags"><span>{t("VIDEO VERIFIED")}</span><span>{t("PROTOTYPE MAP")}</span><span>{t("PLANOGRAM CANDIDATE")}</span></div>
    <div className="event-context"><div><small>{t("SHELF")}</small><strong>{selectedShelf?.name ?? 'Shelf mapping pending'}</strong><em>{selectedShelf?.category ?? 'No planogram context yet'}</em></div><div><small>{t("PRODUCT CANDIDATES")}</small>{selectedShelf ? <ol>{selectedShelf.sku_candidates.map((product) => <li key={t(product.name)}><span>{t(product.name)}</span><b>{Math.round(product.confidence * 100)}%</b></li>)}</ol> : <p>{t("Load a store planogram to show candidate products.")}</p>}</div><button onClick={() => jump(selectedEvent.t, selectedEvent.id)}>{t("View video evidence →")}</button></div>
    <div className="provenance-grid"><div><small>{t("VIDEO EVIDENCE")}</small><span>{storeConfig?.provenance?.interaction_video ?? 'RetailAction labeled interaction clip'}</span></div><div><small>{t("MAP ASSOCIATION")}</small><span>{storeConfig?.provenance?.store_map ?? 'Configured digital-twin demonstration map'}</span></div><div><small>{t("PRODUCT SOURCE")}</small><span>{storeConfig?.provenance?.product_catalog ?? 'Demo planogram candidates'}</span></div></div>
    <p className="inspector-note">{t("Production replacement path: same-store camera calibration → projected coordinates → real shelf polygons → planogram / inventory / POS-supported product association.")}</p>
    </section>}
    </div>
    {activeTour && tourRect && <div className="tour-layer" role="dialog" aria-live="polite">
    <button className="tour-backdrop" aria-label={t("关闭产品导览")} onClick={() => { setTourStep(null); setTourPlaying(false) }} />
    <div className="tour-focus" style={{ top: tourRect.top - 7, left: tourRect.left - 7, width: tourRect.width + 14, height: tourRect.height + 14 }} />
    <section className="tour-card" style={{ top: Math.min(window.innerHeight - 245, Math.max(18, tourRect.bottom + 18)), left: Math.min(window.innerWidth - 370, Math.max(18, tourRect.left)) }}>
    <div className="tour-card-top"><span>{t("产品导览 · ")}{String(currentTourStep + 1).padStart(2, '0')} / {String(tourSteps.length).padStart(2, '0')}</span><button aria-label={t("关闭")} onClick={() => { setTourStep(null); setTourPlaying(false) }}>×</button></div>
    <h2>{t(activeTour.title)}</h2><p>{t(activeTour.text)}</p><div className="tour-progress"><i style={{ width: `${((currentTourStep + 1) / tourSteps.length) * 100}%` }} /></div>
    <div className="tour-controls"><button onClick={() => setTourPlaying((playing) => !playing)}>{tourPlaying ? t('暂停演示') : t('自动演示')}</button><span>{currentTourStep + 1} / {tourSteps.length}</span><button disabled={currentTourStep === 0} onClick={() => setTourStep((step) => Math.max(0, (step ?? 0) - 1))}>{t("上一步")}</button><button className="tour-next" onClick={() => currentTourStep === tourSteps.length - 1 ? (setTourStep(null), setTourPlaying(false)) : setTourStep(currentTourStep + 1)}>{currentTourStep === tourSteps.length - 1 ? t('完成') : t('下一步')} →</button></div>
    </section>
    </div>}
    </main>
}
