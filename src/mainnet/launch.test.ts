import { describe, expect, it } from 'vitest'
import { countdown, LAUNCH, whenText } from './launch'

const H = 3_600_000

describe('launch countdown', () => {
  it('counts down to the start of the reported day', () => {
    const c = countdown(LAUNCH.at - (2 * 24 * H + 3 * H + 61_000))
    expect(c).toEqual({ days: 2, hours: 3, minutes: 1, seconds: 1, due: false })
    expect(countdown(LAUNCH.at + 1).due).toBe(true)
  })

  it('phrases the time left for the bar', () => {
    expect(whenText(LAUNCH.at - 10 * 24 * H)).toBe('10 days to go')
    expect(whenText(LAUNCH.at - (10 * 24 + 3) * H)).toBe('10 days to go') // matches the countdown's 10 days 3 hours
    expect(whenText(LAUNCH.at - 30 * H)).toBe('1 day to go')
    expect(whenText(LAUNCH.at - 5 * H)).toBe('tomorrow')
    expect(whenText(LAUNCH.at + 5 * H)).toBe('today')
    expect(whenText(LAUNCH.at + 30 * H)).toBe('any moment now')
  })
})
