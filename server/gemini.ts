import { GoogleGenAI, FunctionCallingConfigMode, type Content, type Part, type GenerateContentParameters } from '@google/genai'
import { randomUUID } from 'node:crypto'
import type { ModelTransport } from './investigation.ts'

type Generate = (request: GenerateContentParameters) => ReturnType<GoogleGenAI['models']['generateContent']>
export function createGeminiTransport(project: string, model: string, location = 'global', generate?: Generate): ModelTransport {
  const client = generate ? undefined : new GoogleGenAI({ vertexai: true, project, location })
  const invoke = generate ?? ((request: GenerateContentParameters) => client!.models.generateContent(request))
  return async (request, signal) => {
    const contents: Content[] = []
    const names = new Map<string, string>()
    const append = (role: string, part: Part) => {
      const last = contents.at(-1)
      if (last?.role === role) last.parts!.push(part)
      else contents.push({ role, parts: [part] })
    }
    for (const value of request.input) {
      const item = value as Record<string, unknown>
      if (item.role === 'user') append('user', { text: String(item.content) })
      else if (item.type === 'function_call') {
        names.set(String(item.call_id), String(item.name))
        append('model', (item.geminiPart as Part | undefined) ?? { functionCall: { name: String(item.name), args: JSON.parse(String(item.arguments)) } })
      } else if (item.type === 'gemini_part') append('model', item.geminiPart as Part)
      else if (item.type === 'function_call_output') {
        const name = names.get(String(item.call_id))
        if (!name) throw new Error('Unknown Gemini function response')
        append('user', { functionResponse: { name, response: { result: JSON.parse(String(item.output)) } } })
      }
    }
    const response = await invoke({ model, contents, config: {
      systemInstruction: request.instructions, abortSignal: signal,
      maxOutputTokens: request.max_output_tokens, temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
      tools: [{ functionDeclarations: request.tools.map(value => {
        const tool = value as { name: string; description: string; parameters: unknown }
        return { name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters }
      }) }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: request.allowedToolNames } },
    } })
    const candidate = response.candidates?.[0]
    return {
      status: candidate?.finishReason === 'STOP' ? 'completed' : 'incomplete',
      output: (candidate?.content?.parts ?? []).map(part => part.functionCall ? {
        type: 'function_call', name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}),
        call_id: randomUUID(), geminiPart: part,
      } : { type: 'gemini_part', geminiPart: part }),
      usage: { input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0) },
    }
  }
}
