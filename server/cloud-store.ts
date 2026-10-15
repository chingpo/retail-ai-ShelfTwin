import { Firestore } from '@google-cloud/firestore'
import { CaseError, type CasePersistence } from './cases.ts'
import type { InvestigationCase } from '../src/assistant/case-types.ts'

// Small review deployment: one transactional snapshot, bounded below Firestore's document limit.
export function createCloudStore(projectId: string): { cases: CasePersistence; reserveInvestigation: () => Promise<boolean> } {
  const db = new Firestore({ projectId })
  const ref = db.doc('shelftwin/cases')
  const decode = (value: unknown): InvestigationCase[] => {
    if (value === undefined) return []
    const parsed = JSON.parse(String(value))
    if (!Array.isArray(parsed) || !parsed.every(c => typeof c.id === 'string' && Number.isInteger(c.revision) && Array.isArray(c.history) && Array.isArray(c.processedCommands))) throw new CaseError('云端 Case 数据无效。', 503)
    return parsed
  }
  return {
    cases: {
      async read() { return decode((await ref.get()).data()?.json) },
      async mutate(operation) {
        return db.runTransaction(async transaction => {
          const cases = decode((await transaction.get(ref)).data()?.json)
          const result = await operation(cases)
          const json = JSON.stringify(cases)
          if (Buffer.byteLength(json) > 750_000) throw new CaseError('演示 Case 存储已达到容量限制。', 429)
          transaction.set(ref, { json, version: 1 })
          return result
        })
      },
    },
    async reserveInvestigation() {
      const date = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
      const quota = db.doc(`shelftwin-usage/${date}`)
      return db.runTransaction(async transaction => {
        const used = Number((await transaction.get(quota)).data()?.investigations ?? 0)
        if (used >= 100) return false
        transaction.set(quota, { investigations: used + 1 })
        return true
      })
    },
  }
}
