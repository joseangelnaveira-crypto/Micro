export type Question = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  source: string;
  topic: string;
};

export type ExamAttempt = {
  id: string;
  question_ids: string[];
  answers: (string | null)[];
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  score: number;
  pass_mark: number;
  duration_ms: number;
  flagged_ids: string[];
  source_filter: string | null;
  topic_filter: string | null;
  client_uuid: string;
  created_at: string;
};

export type BankMeta = {
  total: number;
  sources: { name: string; count: number }[];
  topics: { name: string; count: number }[];
};
