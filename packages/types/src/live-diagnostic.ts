export interface LiveDiagnostic {
  message: string
  range?: { start: number, end: number }
}
