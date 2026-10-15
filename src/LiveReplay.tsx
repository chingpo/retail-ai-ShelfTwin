import { useEffect, useRef, useState } from 'react'
import { t, useLocale } from './i18n'
import type { DemoData } from './domain/types'
import { shopperSources } from './domain/shopper-sources'
import './live-replay.css'

export function LiveReplay({ data }: { data: Record<string, DemoData> }) {
  useLocale()
  const [streamIndex, setStreamIndex] = useState(0)
  const [streamTime, setStreamTime] = useState(0)
  const [simulatedSeconds, setSimulatedSeconds] = useState(9 * 60 * 60)
  const [playing, setPlaying] = useState(true)
  const streamVideoRef = useRef<HTMLVideoElement | null>(null)
  const streamSource = shopperSources[streamIndex % shopperSources.length]
  const events = data[streamSource.id]?.events ?? []
  const totalEvents = shopperSources.reduce((count, source) => count + (data[source.id]?.events.length ?? 0), 0)
  const streamEvent = events.find(event => Math.abs(event.t - streamTime) <= 1.6)
  const clock = `${String(Math.floor(simulatedSeconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(simulatedSeconds / 60) % 60).padStart(2, '0')}:${String(simulatedSeconds % 60).padStart(2, '0')}`

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setSimulatedSeconds(value => (value + 1) % 86400), 1000)
    return () => window.clearInterval(timer)
  }, [playing])

  const togglePlayback = () => {
    const next = !playing
    setPlaying(next)
    if (streamVideoRef.current) {
      if (next) void streamVideoRef.current.play().catch(() => undefined)
      else streamVideoRef.current.pause()
    }
  }

  return <section className="live-replay panel" aria-label={t('模拟实时样本回放')}>
    <header className="live-replay-heading">
      <div><p className="eyebrow">{t('SINGLE CHANNEL DEMO')}</p><h2>{t('门店总览 · 多路实时演示')}</h2><p>{t('单屏连续播放不同顾客样本，片段间直接切换；模拟实时，不连接门店摄像头。')}</p></div>
      <div className="live-replay-actions"><span className="simulated-live"><i />{t('模拟 Live')}</span><button onClick={togglePlayback}>{playing ? t('暂停回放') : t('继续回放')}</button></div>
    </header>
    <div className="live-replay-stats"><span><b>{shopperSources.length}</b>{t('路样本视频')}</span><span><b>{totalEvents}</b>{t('条标注事件')}</span><span>{t('本地样本 · 仅回放 · 无实时摄像头')}</span></div>
    <div className="single-live-feed">
      <div className="single-live-video-wrap">
        <video key={streamSource.id} ref={streamVideoRef} src={streamSource.video} autoPlay={playing} muted playsInline preload="auto" onTimeUpdate={event => setStreamTime(event.currentTarget.currentTime)} onEnded={() => { setStreamTime(0); setStreamIndex(value => (value + 1) % shopperSources.length) }} onError={() => setStreamIndex(value => (value + 1) % shopperSources.length)} />
        <div className="single-live-osd"><span><i className={playing ? 'playing' : ''} /> CAM 01 · {t(streamSource.label)} · {t('预录样本')} {streamIndex + 1}/{shopperSources.length}</span><strong>{clock}</strong></div>
        <span className="single-live-sim-label">{t('模拟 Live · 片段切换')}</span>
        {streamEvent && <div className="single-live-event"><b>{t(streamEvent.type)}</b><span>{t(streamEvent.item)}</span></div>}
      </div>
      <div className="single-live-caption"><span>{t('连续样本播放')} · {t(streamSource.label)}</span><span>{t('片段播放到结尾后自动切换到下一样本')}</span></div>
    </div>
  </section>
}
