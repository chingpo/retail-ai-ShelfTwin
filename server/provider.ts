import { createOpenAITransport } from './openai.ts'
import { createGeminiTransport } from './gemini.ts'

export function configureProvider(env: Record<string, string | undefined>) {
  const provider = env.AGENT_PROVIDER?.trim() || 'mock'
  if (provider === 'mock') return { provider: 'mock' as const, model: undefined, transport: undefined }
  if (provider === 'gemini') {
    const project = env.GOOGLE_CLOUD_PROJECT?.trim()
    const model = env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash-lite'
    return { provider: 'gemini' as const, model, transport: project ? createGeminiTransport(project, model, env.GOOGLE_CLOUD_LOCATION || 'global') : undefined }
  }
  if (provider !== 'openai') throw new Error('AGENT_PROVIDER must be mock, gemini or openai')
  const key = env.OPENAI_API_KEY?.trim()
  const model = env.OPENAI_MODEL?.trim()
  return { provider: 'openai' as const, model, transport: key && model ? createOpenAITransport(key, model) : undefined }
}
