const BYTE_UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB']

// Byte-valued fields whose name does not end in "Bytes". Kept aligned with the mailbox
// columns get-cipp-formatting.js already converts to GB.
const BYTE_KEYS = new Set(['archivesize'])

const BYTES_SUFFIX = /\s*(?:In\s*)?Bytes$/i

export const psitIsByteKey = (key) => {
  if (typeof key !== 'string') return false
  return /bytes$/i.test(key) || BYTE_KEYS.has(key.toLowerCase())
}

// Adaptive binary units with at most 2 decimals and no trailing zeros: 50982040315 becomes
// "47.48 GB" and 53687091200 becomes "50 GB". Returns null when the value is not a
// non-negative finite number so callers can fall back to their default formatting.
export const psitFormatBytes = (value) => {
  if (value == null || value === '' || typeof value === 'boolean') return null
  const bytes = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(bytes) || bytes < 0) return null
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${Number(size.toFixed(2))} ${BYTE_UNITS[unit]}`
}

// Same camel case split as formatFieldName in format-alert-item.js, inlined to avoid an
// import cycle since that module is the consumer of this one.
const formatLabel = (key) =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

// Returns { label, value } for a byte-valued alert field, or null when the field is not one.
// The unit lives in the value, so the label drops its "In Bytes" suffix.
export const psitFormatByteField = (key, value) => {
  if (!psitIsByteKey(key)) return null
  const formatted = psitFormatBytes(value)
  if (!formatted) return null
  return { label: formatLabel(key).replace(BYTES_SUFFIX, ''), value: formatted }
}
