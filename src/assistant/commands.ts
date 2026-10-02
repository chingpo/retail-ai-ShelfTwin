export type UiCommand =
  | { type: 'focus_shelf'; shelfId: string }
  | { type: 'open_evidence'; eventRef: string }
  | { type: 'show_shopper'; shopperId: string }
  | { type: 'browse_products' }
export type AgentReply = { title: string; body: string; evidence: string; actions: { label: string; command: UiCommand }[] }
