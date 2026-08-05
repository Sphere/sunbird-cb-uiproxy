import Joi from 'joi'

/**
 * Joi fragments shared by the org-signup forms (UPSMF, mpNHM, BNRC) for the
 * fields every one of those forms validates the same way. Org-specific
 * fields (role, institute details, etc.) stay defined in each form's own
 * schema since their rules genuinely differ per org.
 */
export const requiredDistrictValidator = Joi.string()
  .required()
  .messages({
    // tslint:disable-next-line: all
    'any.required': 'District is required',
  })

export const optionalEmailValidator = Joi.string().allow('', null).email().optional()

export const requiredFirstNameValidator = Joi.string()
  .required()
  .messages({
    // tslint:disable-next-line: all
    'any.required': 'First name is required',
  })

export const requiredLastNameValidator = Joi.string()
  .required()
  .messages({
    // tslint:disable-next-line: all
    'any.required': 'Last name is required',
  })

export const requiredPhoneValidator = Joi.number() // Adjusted to validate as a number
  .required()
  .integer()
  .positive()
  .messages({
    // tslint:disable-next-line: all
    'any.required': 'Phone number is required',
    'number.base': 'Phone number must be a number',
    'number.integer': 'Phone number must be an integer',
    'number.positive': 'Phone number must be a positive integer',
  })
