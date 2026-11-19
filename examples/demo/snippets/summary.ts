// #region summary
export function summarize(items: { done: boolean }[]): string {
  const complete = items.filter(item => item.done).length
  return `${complete} of ${items.length} complete`
}
// #endregion summary
