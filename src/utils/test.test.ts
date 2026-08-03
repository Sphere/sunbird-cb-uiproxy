import { test } from './test'

/**
 * @description Verifies the exported `test` constant has its expected shape.
 */
describe('test', () => {
  it('should export the expected static key/value object', () => {
    expect(test).toEqual({ key: 'a', key1: 'b', key2: 'c' })
  })
})
