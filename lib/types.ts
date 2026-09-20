export type ChatMessage = {
  role: string;
  content: string;
  /** Optional timestamp / meta kept as-is; never invent speakers. */
  meta?: string;
};

export type ParseResult = {
  messages: ChatMessage[];
  /** How many discrete messages were found before any cap. */
  totalCount: number;
  /** Heuristic used: roles | markdown | alternating */
  mode: "roles" | "markdown" | "alternating" | "empty";
};
