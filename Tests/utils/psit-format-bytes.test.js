import {
  psitFormatBytes,
  psitFormatByteField,
  psitIsByteKey,
} from '../../src/utils/psit-format-bytes'
import { getAlertItemFields } from '../../src/utils/format-alert-item'

describe('psitFormatBytes', () => {
  it('picks the unit that reads best and trims trailing zeros', () => {
    expect(psitFormatBytes(50982040315)).toBe('47.48 GB')
    expect(psitFormatBytes(53687091200)).toBe('50 GB')
    expect(psitFormatBytes(1024)).toBe('1 KB')
    expect(psitFormatBytes(512)).toBe('512 bytes')
    expect(psitFormatBytes(0)).toBe('0 bytes')
    expect(psitFormatBytes(1.5 * 1024 ** 4)).toBe('1.5 TB')
    expect(psitFormatBytes(1024 ** 5)).toBe('1 PB')
  })

  it('accepts numeric strings, since alert items come back as JSON', () => {
    expect(psitFormatBytes('53687091200')).toBe('50 GB')
    expect(psitFormatBytes(' 1024 ')).toBe('1 KB')
  })

  it('returns null for anything that is not a positive byte count', () => {
    expect(psitFormatBytes(null)).toBeNull()
    expect(psitFormatBytes(undefined)).toBeNull()
    expect(psitFormatBytes('')).toBeNull()
    expect(psitFormatBytes('abc')).toBeNull()
    expect(psitFormatBytes(-1)).toBeNull()
    expect(psitFormatBytes(true)).toBeNull()
  })
})

describe('psitIsByteKey', () => {
  it('matches byte fields only', () => {
    expect(psitIsByteKey('StorageUsedInBytes')).toBe(true)
    expect(psitIsByteKey('ProhibitSendReceiveQuotaInBytes')).toBe(true)
    expect(psitIsByteKey('TotalItemSizeInBytes')).toBe(true)
    expect(psitIsByteKey('ArchiveSize')).toBe(true)
    expect(psitIsByteKey('UsagePercent')).toBe(false)
    expect(psitIsByteKey('Message')).toBe(false)
    expect(psitIsByteKey(undefined)).toBe(false)
  })
})

describe('psitFormatByteField', () => {
  it('drops the In Bytes suffix from the label', () => {
    expect(psitFormatByteField('StorageUsedInBytes', 50982040315)).toEqual({
      label: 'Storage Used',
      value: '47.48 GB',
    })
    expect(psitFormatByteField('ProhibitSendReceiveQuotaInBytes', 53687091200)).toEqual({
      label: 'Prohibit Send Receive Quota',
      value: '50 GB',
    })
    expect(psitFormatByteField('ArchiveSize', 1024)).toEqual({
      label: 'Archive Size',
      value: '1 KB',
    })
  })

  it('leaves non-byte fields to the default formatting', () => {
    expect(psitFormatByteField('UsagePercent', 95)).toBeNull()
    expect(psitFormatByteField('StorageUsedInBytes', 'unknown')).toBeNull()
  })
})

describe('getAlertItemFields with byte fields', () => {
  const quotaAlert = {
    Message: 'user@contoso.test: Mailbox is more than 90% full. Mailbox is 95% full',
    Owner: 'user@contoso.test',
    RecipientType: 'User',
    UsagePercent: 95,
    StorageUsedInBytes: 50982040315,
    ProhibitSendReceiveQuotaInBytes: 53687091200,
  }

  it('humanizes the sizes and leaves the other fields untouched', () => {
    const fields = getAlertItemFields(quotaAlert)
    expect(fields).toEqual([
      { label: 'Message', value: quotaAlert.Message },
      { label: 'Owner', value: 'user@contoso.test' },
      { label: 'Recipient Type', value: 'User' },
      { label: 'Usage Percent', value: '95' },
      { label: 'Storage Used', value: '47.48 GB' },
      { label: 'Prohibit Send Receive Quota', value: '50 GB' },
    ])
  })
})
