/**
 * Normalises anything the API hands back into an array.
 *
 * The reason this exists: the Azure Functions PowerShell worker serialises a single-element
 * collection as the element itself, so an incident record with one external action arrives as
 * `ExternalActions: {Action: "...", ...}` instead of `[{...}]`, and one with none arrives as `[]`.
 * A component that does `list(field).map(...)` then dies with "map is not a function" - which is
 * exactly how a case with one notified third party took the whole BEC page down while a case with
 * two worked fine.
 *
 * Fixing it here rather than at each call site: the defect is in the transport, it affects every
 * list the PSIT endpoints return, and it only shows up on the record that happens to hold exactly
 * one row - the worst kind of bug to leave to case-by-case guarding.
 *
 * A JSON string is parsed rather than wrapped, so a list that survived one round trip too many
 * still lands as a list.
 */
export const psitAsArray = (value) => {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return []
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        return psitAsArray(JSON.parse(text))
      } catch {
        return [value]
      }
    }
    return [value]
  }

  return [value]
}
