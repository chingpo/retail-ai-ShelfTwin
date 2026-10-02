import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { investigate, type ModelTransport } from './investigation.ts'
import type { QueryContext } from '../src/domain/types.ts'
import { investigateLocally } from './mock-investigation.ts'
import { caseRoutes } from './case-routes.ts'
import type { CaseStore } from './cases.ts'

const maxBodyBytes = 16_384
function send(response: ServerResponse, status: number, value: unknown) {
  if (response.destroyed) return
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}
async function readQuestion(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) throw new Error('Request too large')
    chunks.push(chunk)
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!data || typeof data.question !== 'string' || !data.question.trim() || data.question.length > 2000) throw new Error('Invalid question')
  return data.question.trim()
}

export function createAgentServer(options: { getContext: () => Promise<QueryContext>; provider?: 'mock' | 'openai'; transport?: ModelTransport; model?: string; caseStore?: CaseStore }) {
  const provider = options.provider ?? 'mock'
  let busy = false
  return createServer(async (request, response) => {
    const path = request.url?.split('?')[0]
    // Local service: only same-origin JSON requests; no permissive CORS.
    if (request.headers['sec-fetch-site'] === 'cross-site') return send(response, 403, { error: '仅支持本地同源请求。' })
    const origin = request.headers.origin
    if (origin) {
      try {
        const url = new URL(origin)
        const host = request.headers.host?.split(':')[0]
        if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname !== host) return send(response, 403, { error: '请求来源不受支持。' })
      } catch { return send(response, 403, { error: '请求来源无效。' }) }
    }
    if (await caseRoutes(request, response, options.caseStore)) return
    if (path === '/api/agent/status' && request.method === 'GET') {
      try {
        const context = await options.getContext()
        return send(response, 200, { provider, configured: provider === 'mock' || Boolean(options.transport), model: provider === 'mock' ? null : options.model ?? null,
          dataStatus: context.status, errors: context.errors, busy })
      } catch { return send(response, 503, { error: '无法加载本地数据。' }) }
    }
    if (path !== '/api/agent/investigate') return send(response, 404, { error: '接口不存在。' })
    if (request.method !== 'POST') return send(response, 405, { error: '请使用 POST。' })
    if (!request.headers['content-type']?.startsWith('application/json')) return send(response, 415, { error: '需要 JSON 请求。' })
    if (provider === 'openai' && !options.transport) return send(response, 503, { error: '模型尚未配置。请在服务端设置 OPENAI_API_KEY 和 OPENAI_MODEL，或切回 mock 模式。' })
    if (busy) return send(response, 429, { error: '已有调查进行中，请稍后重试。' })
    // Acquire before awaiting body/data, so concurrent requests cannot race.
    busy = true
    const controller = new AbortController()
    response.on('close', () => { if (!response.writableEnded) controller.abort() })
    try {
      let question: string
      try { question = await readQuestion(request) } catch { return send(response, 400, { error: '问题不能为空且最多 2000 字；请求体上限 16KB。' }) }
      let context: QueryContext
      try { context = await options.getContext() } catch { return send(response, 503, { error: '无法加载本地数据。' }) }
      const result = provider === 'mock' ? investigateLocally(context, question, controller.signal)
        : await investigate(context, question, options.transport!, { signal: controller.signal })
      return send(response, 200, result)
    } catch {
      return send(response, 500, { error: '调查服务内部错误，请重试。' })
    } finally { busy = false }
  })
}
