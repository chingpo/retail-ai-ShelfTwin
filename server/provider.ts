import { createOpenAITransport } from './openai.ts'

export function configureProvider(env: Record<string, string | undefined>) {
  const provider = env.AGENT_PROVIDER?.trim() || 'mock'
  if (provider === 'mock') return { provider: 'mock' as const, model: undefined, transport: undefined }
  if (provider !== 'openai') throw new Error('AGENT_PROVIDER must be mock or openai')
  const key = env.OPENAI_API_KEY?.trim()
  const model = env.OPENAI_MODEL?.trim()
  return { provider: 'openai' as const, model, transport: key && model ? createOpenAITransport(key, model) : undefined }
}
