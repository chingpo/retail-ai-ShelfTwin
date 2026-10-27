import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { investigate, type ModelTransport } from './investigation.ts'
import type { InvestigationLocale } from '../src/assistant/investigation-types.ts'
import type { QueryContext } from '../src/domain/types.ts'
import { investigateLocally } from './mock-investigation.ts'
import { caseRoutes } from './case-routes.ts'
import type { CaseStore } from './cases.ts'
import { serveStatic } from './static.ts'
import { timingSafeEqual } from 'node:crypto'

const maxBodyBytes = 16_384
function send(response: ServerResponse, status: number, value: unknown) {
  if (response.destroyed) return
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}
async function readInvestigationRequest(request: IncomingMessage): Promise<{ question: string; locale: InvestigationLocale }> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) throw new Error('Request too large')
    chunks.push(chunk)
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!data || typeof data.question !== 'string' || !data.question.trim() || data.question.length > 2000) throw new Error('Invalid question')
  const locale: InvestigationLocale = ['zh', 'ja', 'en', 'ko'].includes(data.locale) ? data.locale : 'zh'
  return { question: data.question.trim(), locale }
}

export function createAgentServer(options: { getContext: () => Promise<QueryContext>; provider?: 'mock' | 'openai' | 'gemini'; transport?: ModelTransport; model?: string; caseStore?: CaseStore; staticRoot?: string; credentials?: string; reserveInvestigation?: () => Promise<boolean> }) {
  const provider = options.provider ?? 'mock'
  let busy = false
  return createServer(async (request, response) => {
    const path = request.url?.split('?')[0]
    if (path === '/healthz' && request.method === 'GET') return send(response, 200, { ok: true })
    if (options.credentials) {
      const actual = Buffer.from(request.headers.authorization ?? '')
      const expected = Buffer.from(`Basic ${Buffer.from(options.credentials).toString('base64')}`)
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="ShelfTwin review", charset="UTF-8"', 'Cache-Control': 'no-store' })
        response.end('ShelfTwin review login required.'); return
      }
    }
    // Keep API calls same-origin, while allowing visitors to open the site
    // from external links (for example, GitHub's repository About section).
    if (path?.startsWith('/api/')) {
      if (request.headers['sec-fetch-site'] === 'cross-site') return send(response, 403, { error: '仅支持本地同源请求。' })
      const origin = request.headers.origin
      if (origin) {
        try {
          const url = new URL(origin)
          if (!['http:', 'https:'].includes(url.protocol) || url.host !== request.headers.host) return send(response, 403, { error: '请求来源不受支持。' })
        } catch { return send(response, 403, { error: '请求来源无效。' }) }
      }
    }
    if (await caseRoutes(request, response, options.caseStore)) return
    if (path === '/api/agent/status' && request.method === 'GET') {
      try {
        const context = await options.getContext()
        return send(response, 200, { provider, configured: provider === 'mock' || Boolean(options.transport), model: provider === 'mock' ? null : options.model ?? null,
          dataStatus: context.status, errors: context.errors, busy })
      } catch { return send(response, 503, { error: '无法加载本地数据。' }) }
    }
    if (path !== '/api/agent/investigate') {
      if (options.staticRoot && !path?.startsWith('/api/')) {
        try { await serveStatic(request, response, options.staticRoot) } catch { if (!response.headersSent) send(response, 500, { error: '页面加载失败。' }); else response.destroy() }
        return
      }
      return send(response, 404, { error: '接口不存在。' })
    }
    if (request.method !== 'POST') return send(response, 405, { error: '请使用 POST。' })
    if (!request.headers['content-type']?.startsWith('application/json')) return send(response, 415, { error: '需要 JSON 请求。' })
    if (provider !== 'mock' && !options.transport) return send(response, 503, { error: '模型尚未配置，请检查服务端项目或模型配置。' })
    if (busy) return send(response, 429, { error: '已有调查进行中，请稍后重试。' })
    // Acquire before awaiting body/data, so concurrent requests cannot race.
    busy = true
    const controller = new AbortController()
    response.on('close', () => { if (!response.writableEnded) controller.abort() })
    try {
      let input: { question: string; locale: InvestigationLocale }
      try { input = await readInvestigationRequest(request) } catch { return send(response, 400, { error: '问题不能为空且最多 2000 字；请求体上限 16KB。' }) }
      let context: QueryContext
      try { context = await options.getContext() } catch { return send(response, 503, { error: '无法加载本地数据。' }) }
      if (provider !== 'mock' && options.reserveInvestigation && !await options.reserveInvestigation()) return send(response, 429, { error: '今天的模型调查额度已用完，请明天再试；视频浏览和本地工作台仍可使用。' })
      const result = provider === 'mock' ? investigateLocally(context, input.question, controller.signal, input.locale)
        : await investigate(context, input.question, options.transport!, { signal: controller.signal, execution: provider, locale: input.locale })
      return send(response, 200, result)
    } catch {
      return send(response, 500, { error: '调查服务内部错误，请重试。' })
    } finally { busy = false }
  })
}
