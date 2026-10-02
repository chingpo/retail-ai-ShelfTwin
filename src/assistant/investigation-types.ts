export type Finding = { statement: string; evidenceRefs: string[] }
export type Hypothesis = { explanation: string; supportRefs: string[]; counterEvidenceRefs: string[]; missingEvidence: string }
export type InvestigationReport = {
  title: string; summary: string; findings: Finding[]; hypotheses: Hypothesis[]; limitations: string[]; nextSteps: string[]
}
export type Evidence = { eventRef: string; shopperId: string; eventId: string; video: string; seekTime: number; shelfId?: string; action: string }
export type InvestigationStep = { round: number; tool: string; arguments: Record<string, unknown>; status: 'ok' | 'error'; detail: string }
export type InvestigationResult = {
  execution: 'mock' | 'openai'
  status: 'completed' | 'insufficient_evidence' | 'budget_reached' | 'cancelled' | 'error'
  stopReason: string; report: InvestigationReport; evidence: Evidence[]; steps: InvestigationStep[]
  usage: { modelRequests: number; toolCalls: number; inputTokens: number; outputTokens: number; elapsedMs: number }
}
