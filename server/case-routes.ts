import type { IncomingMessage, ServerResponse } from 'node:http'
import { CaseError, CaseStore, queueFor } from './cases.ts'
import type { CaseAction } from '../src/assistant/case-types.ts'

async function body(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new CaseError('需要 JSON 请求。', 415)
  if (Number(request.headers['content-length'] ?? 0) > 16_384) throw new CaseError('请求过大。', 413)
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of request) { size += chunk.length; if (size > 16_384) throw new CaseError('请求过大。', 413); chunks.push(chunk) }
  let value
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new CaseError('JSON 无效。') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CaseError('请求格式无效。')
  return value
}
export async function caseRoutes(request: IncomingMessage, response: ServerResponse, store?: CaseStore) {
  const path = request.url?.split('?')[0] ?? ''
  if (!path.startsWith('/api/agent/cases') && path !== '/api/agent/queue' && path !== '/api/agent/dispatch') return false
  const send = (status: number, value: unknown) => { if (!response.destroyed) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)) } }
  try {
    if (!store) throw new CaseError('Case 工作台尚未配置。', 503)
    if (path === '/api/agent/cases' && request.method === 'GET') send(200, { cases: await store.list() })
    else if (path === '/api/agent/cases' && request.method === 'POST') send(201, await store.create(await body(request)))
    else if (path === '/api/agent/queue' && request.method === 'GET') send(200, { queue: queueFor(await store.list()) })
    else if (path === '/api/agent/dispatch' && request.method === 'POST') send(200, await store.dispatch((await body(request)).requestId))
    else {
      const match = path.match(/^\/api\/agent\/cases\/([\w-]+)(\/commands)?$/)
      if (!match) throw new CaseError('Case 接口不存在。', 404)
      if (!match[2] && request.method === 'GET') send(200, await store.get(match[1]))
      else if (match[2] && request.method === 'POST') {
        const input = await body(request)
        send(200, await store.command(match[1], input.revision, input.requestId, input.action as CaseAction))
      } else throw new CaseError('请求方法不支持。', 405)
    }
  } catch (error) { send(error instanceof CaseError ? error.status : 500, { error: error instanceof CaseError ? error.message : 'Case 服务内部错误。' }) }
  return true
}
