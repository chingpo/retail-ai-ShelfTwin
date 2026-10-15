import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadQueryContext } from './data.ts'
import { createAgentServer } from './http.ts'
import { configureProvider } from './provider.ts'
import { CaseError, CaseStore } from './cases.ts'
import { createCloudStore } from './cloud-store.ts'
import { investigate } from './investigation.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
// Environment variables take precedence; .env.local is never sent to Vite.
if (existsSync(`${root}/.env.local`)) process.loadEnvFile(`${root}/.env.local`)
const configuration = configureProvider(process.env)
const port = Number(process.env.PORT ?? process.env.AGENT_PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid AGENT_PORT')
const getContext = () => loadQueryContext(root)
const cloud = process.env.CASE_STORAGE === 'firestore' ? createCloudStore(process.env.GOOGLE_CLOUD_PROJECT!) : undefined
if (process.env.K_SERVICE && !cloud) throw new Error('Cloud deployment requires persistent storage')
const modelProvider = configuration.provider === 'mock' ? undefined : configuration.provider
const runModelInvestigation = modelProvider ? async (question: string, context: Awaited<ReturnType<typeof getContext>>, locale: import('../src/assistant/investigation-types.ts').InvestigationLocale) => {
  if (!configuration.transport) throw new CaseError('AI 服务未配置，Case 未执行本地替代调查。', 503)
  if (cloud?.reserveInvestigation && !await cloud.reserveInvestigation()) throw new CaseError('今天的模型调查额度已用完，请明天再试。', 429)
  return investigate(context, question, configuration.transport, { execution: modelProvider, locale })
} : undefined
const server = createAgentServer({ getContext, ...configuration,
  caseStore: new CaseStore(`${root}/.local/agent-cases.json`, getContext, undefined, cloud?.cases, runModelInvestigation),
  staticRoot: process.env.SERVE_STATIC === 'true' ? `${root}/dist` : undefined,
  credentials: process.env.DEMO_CREDENTIALS, reserveInvestigation: cloud?.reserveInvestigation })
server.listen(port, process.env.PORT ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`ShelfTwin Agent: http://127.0.0.1:${port} · ${configuration.provider === 'mock' ? 'local fixed workflow, no model calls' : configuration.transport ? 'OpenAI configured' : 'OpenAI not configured'}`)
})
process.on('SIGTERM', () => server.close(() => process.exit(0)))
