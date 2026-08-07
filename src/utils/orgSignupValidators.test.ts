/**
 * Direct behavioral proof for the shared Joi fragments used by the
 * org-signup forms (upsmfUser.ts, mpNHMUser.ts, bnrcUser.ts). These fields
 * aren't exercised by any HTTP-level test today — each of those files'
 * own test suite is scoped to its OTP endpoints only, not `/createUser` —
 * so this is the only place these validators' actual pass/fail behavior
 * and error messages are checked.
 */

import Joi from 'joi'
import {
  conditionalFieldValidator,
  optionalEmailValidator,
  requiredDistrictValidator,
  requiredFirstNameValidator,
  requiredLastNameValidator,
  requiredPhoneValidator,
} from './orgSignupValidators'

describe('requiredDistrictValidator', () => {
  it('rejects a missing value with the expected message', () => {
    const { error } = requiredDistrictValidator.validate(undefined)
    expect(error.details[0].message).toBe('District is required')
  })

  it('accepts a plain string', () => {
    const { error } = requiredDistrictValidator.validate('Patna')
    expect(error).toBeUndefined()
  })
})

describe('requiredFirstNameValidator', () => {
  it('rejects a missing value with the expected message', () => {
    const { error } = requiredFirstNameValidator.validate(undefined)
    expect(error.details[0].message).toBe('First name is required')
  })

  it('accepts a plain string', () => {
    const { error } = requiredFirstNameValidator.validate('Ravi')
    expect(error).toBeUndefined()
  })
})

describe('requiredLastNameValidator', () => {
  it('rejects a missing value with the expected message', () => {
    const { error } = requiredLastNameValidator.validate(undefined)
    expect(error.details[0].message).toBe('Last name is required')
  })

  it('accepts a plain string', () => {
    const { error } = requiredLastNameValidator.validate('Kumar')
    expect(error).toBeUndefined()
  })
})

describe('requiredPhoneValidator', () => {
  it('rejects a missing value', () => {
    const { error } = requiredPhoneValidator.validate(undefined)
    expect(error.details[0].message).toBe('Phone number is required')
  })

  it('rejects a non-numeric value', () => {
    const { error } = requiredPhoneValidator.validate('abc')
    expect(error.details[0].message).toBe('Phone number must be a number')
  })

  it('rejects a non-integer value', () => {
    const { error } = requiredPhoneValidator.validate(98765.5)
    expect(error.details[0].message).toBe('Phone number must be an integer')
  })

  it('rejects a negative value', () => {
    const { error } = requiredPhoneValidator.validate(-9876543210)
    expect(error.details[0].message).toBe('Phone number must be a positive integer')
  })

  it('accepts a positive integer', () => {
    const { error } = requiredPhoneValidator.validate(9876543210)
    expect(error).toBeUndefined()
  })
})

describe('optionalEmailValidator', () => {
  it('allows an absent value', () => {
    const { error } = optionalEmailValidator.validate(undefined)
    expect(error).toBeUndefined()
  })

  it('allows an empty string', () => {
    const { error } = optionalEmailValidator.validate('')
    expect(error).toBeUndefined()
  })

  it('allows null', () => {
    const { error } = optionalEmailValidator.validate(null)
    expect(error).toBeUndefined()
  })

  it('rejects a malformed email', () => {
    const { error } = optionalEmailValidator.validate('not-an-email')
    expect(error).toBeDefined()
  })

  it('accepts a well-formed email', () => {
    const { error } = optionalEmailValidator.validate('a@b.com')
    expect(error).toBeUndefined()
  })
})

/**
 * conditionalFieldValidator relies on Joi's sibling-field `role` lookup via
 * `.when()`, so it must be validated inside an object schema — the same
 * context every real caller (upsmfUser.ts, mpNHMUser.ts, bnrcUser.ts) uses
 * it in, not as a standalone field.
 */
describe('conditionalFieldValidator', () => {
  const schema = Joi.object({
    facultyType: conditionalFieldValidator('Faculty', 'Faculty type is required for Faculty role'),
    instituteName: conditionalFieldValidator(['Student', 'Faculty'], 'Institute name is required for Student and Faculty roles'),
    role: Joi.string(),
  })

  it('requires the field when role matches a single trigger role', () => {
    const { error } = schema.validate({ instituteName: 'x', role: 'Faculty' })
    expect(error.details[0].message).toBe('Faculty type is required for Faculty role')
  })

  it('requires the field when role matches any of several trigger roles', () => {
    const { error: studentError } = schema.validate({ facultyType: 'x', role: 'Student' })
    expect(studentError.details[0].message).toBe('Institute name is required for Student and Faculty roles')

    const { error: facultyError } = schema.validate({ facultyType: 'x', role: 'Faculty' })
    expect(facultyError.details[0].message).toBe('Institute name is required for Student and Faculty roles')
  })

  it('allows the field to be empty, null, or absent when role does not match', () => {
    expect(schema.validate({ role: 'ANM-UP' }).error).toBeUndefined()
    expect(schema.validate({ facultyType: '', instituteName: null, role: 'ANM-UP' }).error).toBeUndefined()
  })

  it('accepts the field when role matches and a value is provided', () => {
    const { error } = schema.validate({ facultyType: 'Assistant Professor', instituteName: 'ABC Institute', role: 'Faculty' })
    expect(error).toBeUndefined()
  })

  it('treats an absent role the same as a non-matching role (field stays optional)', () => {
    expect(schema.validate({}).error).toBeUndefined()
    expect(schema.validate({ facultyType: '' }).error).toBeUndefined()
    expect(schema.validate({ facultyType: null }).error).toBeUndefined()
  })
})
