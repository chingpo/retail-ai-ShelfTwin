import type { InvestigationResult } from './investigation-types.ts'

export type CaseStatus = 'investigating' | 'waiting_evidence' | 'awaiting_decision' | 'observing' | 'closed'
export type CaseTask = { id: string; title: string; status: 'open' | 'done'; feedback?: string; outcome?: 'supports' | 'refutes' | 'unknown' }
export type MetricSample = { interactions: number; puts: number; source: 'simulated' | 'manual' }
export type Intervention = { id: string; description: string; startedAt: string; observeUntil: string; minimumSamples: number;
  improvementThreshold: number; baseline: MetricSample; observations: (MetricSample & { id: string; observedAt: string; note: string })[];
  assessment?: { outcome: 'improved' | 'worsened' | 'unchanged' | 'insufficient'; baselineRate: number; afterRate: number | null; explanation: string } }
export type InvestigationCase = { id: string; title: string; question: string; owner: string; status: CaseStatus; createdAt: string; updatedAt: string;
  revision: number; impact: number; reliability: number; actionability: number; cost: number; maxRuns: number; runsUsed: number;
  report?: InvestigationResult; reports: InvestigationResult[]; lastFingerprint?: string; tasks: CaseTask[]; hypotheses: { explanation: string; status: 'unverified' | 'supported' | 'refuted'; taskId: string }[];
  intervention?: Intervention; history: { at: string; action: string; detail: string }[]; processedCommands: string[] }
export type QueueItem = { caseId: string; title: string; status: CaseStatus; score: number; decision: 'continue' | 'wait' | 'escalate' | 'stop'; reason: string }
export type CaseAction =
  | { type: 'investigate' }
  | { type: 'add_task'; title: string }
  | { type: 'feedback'; taskId: string; note: string; outcome: 'supports' | 'refutes' | 'unknown' }
  | { type: 'resume'; reason: string }
  | { type: 'close'; reason: string }
  | { type: 'priority'; impact: number; reliability: number; actionability: number; cost: number; maxRuns: number }
  | { type: 'intervention'; description: string; startedAt: string; observeUntil: string; minimumSamples: number; improvementThreshold: number; baseline: MetricSample }
  | { type: 'observation'; observedAt: string; interactions: number; puts: number; source: 'simulated' | 'manual'; note: string }
  | { type: 'evaluate' }
