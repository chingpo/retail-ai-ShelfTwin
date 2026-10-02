import type { ModelTransport } from './investigation.ts'

export function createOpenAITransport(apiKey: string, model: string): ModelTransport {
  return async (request, signal) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, model }),
    })
    if (!response.ok) throw new Error(`Model request failed: HTTP ${response.status}`)
    return response.json()
  }
}
