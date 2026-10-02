import { useSyncExternalStore } from 'react'
import rows from './translations.tsv?raw'

export type Locale = 'zh' | 'ja' | 'en'
const dictionaries = new Map<string, Record<Locale, string>>()
for (const row of rows.split('\n')) {
  const [key, second, ja] = row.split('\t')
  if (!key || second === undefined || ja === undefined) continue
  const chinese = /[\u3400-\u9fff]/.test(key)
  const entry = { zh: chinese ? key : second, en: chinese ? second : key, ja }
  dictionaries.set(key, entry)
  dictionaries.set(entry.zh, entry)
  dictionaries.set(entry.en, entry)
  dictionaries.set(entry.ja, entry)
}
let locale: Locale = 'zh'
try { const saved = localStorage.getItem('shelftwin.locale'); if (saved === 'zh' || saved === 'ja' || saved === 'en') locale = saved } catch { /* Storage can be disabled. */ }
const listeners = new Set<() => void>()
export function t(text: string): string {
  const key = text.trim()
  const translated = dictionaries.get(key)?.[locale]
  return translated === undefined ? text : text.replace(key, translated)
}
export function useLocale() {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback) }, () => locale, () => 'zh' as Locale)
}
export function setLocale(next: Locale) {
  locale = next
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : next
  try { localStorage.setItem('shelftwin.locale', next) } catch { /* Keep the in-memory selection. */ }
  listeners.forEach(callback => callback())
}
export function formatDate(value: string) { return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US', { timeZone: 'Asia/Tokyo' }) }
// Exact preset translations can be mapped back for the deterministic local router.
export function querySource(value: string) {
  for (const [key, entry] of dictionaries) if (entry.en === value || entry.ja === value) return key
  return value
}
export function LanguageSelector() {
  const current = useLocale()
  return <select className="language-selector" aria-label={t('界面语言')} value={current} onChange={event => setLocale(event.target.value as Locale)}>
    <option value="zh">中文</option><option value="ja">日本語</option><option value="en">English</option>
  </select>
}
setLocale(locale)
