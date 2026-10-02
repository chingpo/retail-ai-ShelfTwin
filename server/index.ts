import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadQueryContext } from './data.ts'
import { createAgentServer } from './http.ts'
import { configureProvider } from './provider.ts'
import { CaseStore } from './cases.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
// Environment variables take precedence; .env.local is never sent to Vite.
if (existsSync(`${root}/.env.local`)) process.loadEnvFile(`${root}/.env.local`)
const configuration = configureProvider(process.env)
const port = Number(process.env.AGENT_PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid AGENT_PORT')
const getContext = () => loadQueryContext(root)
const server = createAgentServer({ getContext, ...configuration, caseStore: new CaseStore(`${root}/.local/agent-cases.json`, getContext) })
server.listen(port, '127.0.0.1', () => {
  console.log(`ShelfTwin Agent: http://127.0.0.1:${port} · ${configuration.provider === 'mock' ? 'local fixed workflow, no model calls' : configuration.transport ? 'OpenAI configured' : 'OpenAI not configured'}`)
})
