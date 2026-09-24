import { Canvas } from '@react-three/fiber'
import { Environment, Html, OrbitControls, Text, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import * as THREE from 'three'

type Point = { t: number; x: number; z: number }
type RetailEvent = { id: string; t: number; type: 'PICK' | 'PUT BACK' | 'TOUCH'; item: string; aisle: string; x?: number; z?: number }
type DemoData = { trajectory: Point[]; events: RetailEvent[]; journey?: { trackId: string; duration: number; source: string } }

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

function StoreScene({ time, points, interaction, onInteraction, dwelling, visits, onVisit, events, onEvent, activeLabel, onSelectShopper }: { time: number; points: Point[]; interaction?: InteractionMarker; onInteraction: () => void; dwelling: boolean; visits: Visit[]; onVisit: (t: number) => void; events: RetailEvent[]; onEvent: (event: RetailEvent) => void; activeLabel: string; onSelectShopper: (id: (typeof shopperSources)[number]['id']) => void }) {
  const shopper = positionAt(time, points)
  const path = useMemo(() => points.map((point) => new THREE.Vector3(point.x, 0.03, point.z)), [points])
  return <Canvas shadows camera={{ position: [0, 27, 0.01], rotation: [-Math.PI / 2, 0, 0], fov: 42 }}>
    <color attach="background" args={['#dce8e7']} />
    <ambientLight intensity={1.5} />
    <directionalLight castShadow position={[7, 14, 5]} intensity={2.2} shadow-mapSize={[1024, 1024]} />
    <Environment preset="city" />
    <mesh receiveShadow rotation-x={-Math.PI / 2}><planeGeometry args={[30, 24]} /><meshStandardMaterial color="#b9c5c3" roughness={0.95} /></mesh>
    <Suspense fallback={<Html center className="model-loading">Loading store…</Html>}><Supermarket /></Suspense>
    <mesh position={[0, 0.09, 0]}><tubeGeometry args={[new THREE.CatmullRomCurve3(path), 80, 0.045, 8, false]} /><meshStandardMaterial color="#1f8e91" emissive="#1f8e91" emissiveIntensity={0.6} /></mesh>
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
  const journey = data.journey
  const timelineDuration = Math.max(1, ...data.trajectory.map((point) => point.t), ...data.events.map((event) => event.t))
  const interaction = journey ? { ...positionAt(Math.min(15.8, journey.duration), data.trajectory), t: Math.min(15.8, journey.duration), videoTime: 3.09 } : undefined
  const visits: Visit[] = journey ? [1.7, 9.5, 18.5].map((t, index) => ({ id: `visit-${index + 1}`, t, ...positionAt(t, data.trajectory) })) : []
  const dwelling = Boolean(journey && ((time >= 8.9 && time <= 10.1) || (time >= 18.2 && time <= 20.3)))
  const seek = (t: number) => { if (videoRef.current) videoRef.current.currentTime = t; setTime(t) }
  const jump = (t: number) => { seek(t); if (videoRef.current) void videoRef.current.play().catch(() => undefined) }
  const openInteraction = () => {
    if (!interaction || !videoRef.current) return
    setJourneyPlaying(false)
    videoRef.current.currentTime = interaction.videoTime
    void videoRef.current.play().catch(() => undefined)
  }
  const openVisit = (visitTime: number) => { setJourneyPlaying(false); setTime(visitTime) }
  const selectShopper = (id: (typeof shopperSources)[number]['id']) => { setActiveShopperId(id); setCustomVideoSrc(null); setVideoAvailable(true); setTime(0) }
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
  useEffect(() => {
    if (!journey || !journeyPlaying) return
    const timer = window.setInterval(() => setTime((current) => current >= journey.duration ? 0 : Math.min(journey.duration, current + .1)), 100)
    return () => window.clearInterval(timer)
  }, [journey, journeyPlaying])
  const active = data.events.find((event) => Math.abs(event.t - time) < 1.2)
  return <main className="app-shell">
    <header><div><p className="eyebrow">RETAIL AI / SPATIAL REPLAY</p><h1>Store intelligence, in motion.</h1></div><div className="status"><span /> LIVE DEMO</div></header>
    <section className="workspace">
      <article className="video-card panel"><div className="panel-title"><span>{journey ? 'REFERENCE INTERACTION CLIP · INDEPENDENT SAMPLE' : 'RETAILACTION · DUAL INTERACTION CLIP'}</span><time>{time.toFixed(1).padStart(4, '0')}s</time></div>
        {videoAvailable ? <video key={videoSrc} ref={videoRef} className="camera" controls muted playsInline src={videoSrc} onTimeUpdate={(event) => { if (!journey) setTime(event.currentTarget.currentTime) }} onError={() => setVideoAvailable(false)} /> : <div className="camera placeholder"><div className="scan-frame" /><p>Select a local RetailAction video below</p><small>The spatial replay remains interactive using demo data.</small></div>}
        <div className="local-loader"><label>VIDEO<input type="file" accept="video/mp4" onChange={loadVideo} /></label><label>EVENT JSON<input type="file" accept="application/json" onChange={loadData} /></label></div>
        {active && <div className={'event-toast ' + active.type.toLowerCase().replace(' ', '-')}><b>{active.type}</b><span>{active.item}</span></div>}
      </article>
      <article className="scene-card panel"><div className="panel-title"><span>SPATIAL STORE MAP</span><label className="shopper-select"><i /> <select value={activeShopperId} onChange={(event) => selectShopper(event.target.value as (typeof shopperSources)[number]['id'])}>{shopperSources.map((shopper) => <option key={shopper.id} value={shopper.id}>{shopper.label}</option>)}</select> <b>● PICK / PUT</b></label></div><StoreScene time={time} points={data.trajectory} interaction={interaction} onInteraction={openInteraction} dwelling={dwelling} visits={visits} onVisit={openVisit} events={data.events} onEvent={(event) => jump(event.t)} activeLabel={activeShopper.label} onSelectShopper={selectShopper} /></article>
    </section>
    <section className="events panel"><div><p className="eyebrow">{journey ? 'CONTINUOUS SHOPPER JOURNEY' : 'DETECTED MOMENTS'}</p><h2>{journey ? `Track ${journey.trackId}` : 'Interaction timeline'}</h2></div>{journey ? <div className="journey-controls"><button onClick={() => setJourneyPlaying((playing) => !playing)}>{journeyPlaying ? 'Pause replay' : 'Play replay'}</button><button className="pick-button" onClick={openInteraction}>View PICK clip</button><input aria-label="Journey position" type="range" min="0" max={journey.duration} step="0.1" value={time} onChange={(event) => setTime(Number(event.target.value))} /><span>{time.toFixed(1)}s / {journey.duration.toFixed(1)}s</span><div className="visit-list">{visits.map((visit, index) => <button key={visit.id} onClick={() => openVisit(visit.t)}><strong>STOP {index + 1}</strong><span>{visit.t.toFixed(1)}s · shelf dwell</span></button>)}</div><small>Teal map markers are track-derived dwell stops. The gold PICK marker opens the separate prepared RetailAction clip.</small></div> : <div className="video-timeline"><div className="event-list">{data.events.map((event) => <button className={Math.abs(event.t - time) < 1.2 ? 'selected' : ''} key={event.id} onClick={() => jump(event.t)}><time>{event.t.toFixed(1)}s</time><strong>{event.type}</strong><span>{event.item} · {event.aisle}</span><em>Jump →</em></button>)}</div><div className="scrubber"><input aria-label="Video position" type="range" min="0" max={timelineDuration} step="0.05" value={Math.min(time, timelineDuration)} onChange={(event) => seek(Number(event.target.value))} /><span>{time.toFixed(1)}s / {timelineDuration.toFixed(1)}s</span></div></div>}</section>
  </main>
}
