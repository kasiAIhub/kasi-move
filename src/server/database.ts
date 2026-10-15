// The narrow D1 interface also permits integration tests against real SQLite.
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface StallRow {
  id: string;
  phone: string;
  referral_name?: string;
  name: string;
  town: string;
  hours: string;
  is_open: number;
  takes_card: number;
  rider_phone: string | null;
  first_order_at: number | null;
  activated_at: number | null;
  settings: string;
  payment_reported_at: number | null;
}
