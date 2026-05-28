import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, generateInvoiceNumber, isOverdue } from './utils'

describe('formatCurrency', () => {
  it('formats positive number', () => {
    expect(formatCurrency(1500)).toBe('$1,500.00')
  })
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })
  it('formats large number', () => {
    expect(formatCurrency(1234567.89)).toBe('$1,234,567.89')
  })
})

describe('formatDate', () => {
  it('returns dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })
  it('formats valid date string', () => {
    const result = formatDate('2024-01-15')
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2024/)
  })
})

describe('generateInvoiceNumber', () => {
  it('starts with INV-', () => {
    expect(generateInvoiceNumber()).toMatch(/^INV-\d{4}-\d{4}$/)
  })
  it('includes current year', () => {
    const year = new Date().getFullYear().toString()
    expect(generateInvoiceNumber()).toContain(year)
  })
})

describe('isOverdue', () => {
  it('returns false for undefined', () => {
    expect(isOverdue(undefined)).toBe(false)
  })
  it('returns true for past date', () => {
    expect(isOverdue('2020-01-01')).toBe(true)
  })
  it('returns false for future date', () => {
    expect(isOverdue('2099-01-01')).toBe(false)
  })
})
