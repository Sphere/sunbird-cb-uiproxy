import { ERROR } from './message'

describe('ERROR message catalogue', () => {
  it('exposes the expected keys', () => {
    expect(Object.keys(ERROR).sort()).toEqual(
      [
        'ERROR_NO_DEPT_DATA',
        'ERROR_NO_ORG_DATA',
        'GENERAL_ERR_MSG',
        'fetchErrorElasticSearch',
        'fetchErrorFullStack',
        'fetchErrorLearningPaths',
      ].sort()
    )
  })

  it('has a non-empty string for every message', () => {
    for (const value of Object.values(ERROR)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })
})
