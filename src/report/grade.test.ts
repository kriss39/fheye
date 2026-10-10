import { describe, expect, it } from 'vitest'
import { privacyGrade } from './grade'

describe('privacyGrade', () => {
  it('grades by the public share, and only gives A when nothing is public', () => {
    expect(privacyGrade(0, 0).grade).toBe('A')
    expect(privacyGrade(0, 50).grade).toBe('A')
    expect(privacyGrade(1, 1000).grade).toBe('B') // any public value costs the A
    expect(privacyGrade(5, 50).grade).toBe('B')
    expect(privacyGrade(12, 50).grade).toBe('C')
    expect(privacyGrade(25, 50).grade).toBe('D')
    expect(privacyGrade(26, 50).grade).toBe('F')
  })
})
