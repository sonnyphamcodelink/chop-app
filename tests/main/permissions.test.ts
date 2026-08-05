import { describe, expect, it } from 'vitest'
import { permissionMessage } from '../../src/main/permissions-message'

describe('permissionMessage', () => {
  it('explains how to grant permission when denied', () => {
    const message = permissionMessage('denied')
    expect(message).toMatch(/Screen Recording/i)
    expect(message).toMatch(/System Settings/i)
  })

  it('explains the first-run prompt when not determined', () => {
    expect(permissionMessage('not-determined')).toMatch(/Screen Recording/i)
  })

  it('returns an empty message when granted', () => {
    expect(permissionMessage('granted')).toBe('')
  })

  it('returns an empty message on platforms without the concept', () => {
    expect(permissionMessage('unsupported')).toBe('')
  })
})
