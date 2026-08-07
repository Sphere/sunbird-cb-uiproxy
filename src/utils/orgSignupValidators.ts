import Joi from 'joi'

/**
 * Joi fragments shared by the org-signup forms (UPSMF, mpNHM, BNRC) for the
 * fields every one of those forms validates the same way. Most org-specific
 * fields (role, service details, etc.) stay defined in each form's own
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

// sonar-cleanup: extracted from upsmfUser.ts / mpNHMUser.ts / bnrcUser.ts inline .when('role', ...) blocks (CHANGE 22); `.required()` on the `is` clause added (CHANGE 26) to preserve the original bare-string `is: 'Faculty'` matching behavior for an absent role
/**
 * Builds a string field that's required only when `role` matches one of
 * `triggerRoles`, and optional (allowing '' or null) otherwise — the shape
 * every org-signup form uses for its role-conditional fields (course
 * selection, faculty type, institute name/type). Each caller passes its own
 * `triggerRoles`, since the literal role names that trigger a given field
 * are a property of that org's role list, not a shared constant — a form
 * that renames or adds roles updates its own call site, not this function.
 *
 * @param triggerRoles - the role value(s) that make this field required
 * @param requiredMessage - the `any.required` message shown when the field is missing
 */
export function conditionalFieldValidator(triggerRoles: string | string[], requiredMessage: string) {
  return Joi.string()
    .when('role', {
      is: Joi.valid(...([] as string[]).concat(triggerRoles)).required(),
      otherwise: Joi.string().allow('', null).optional(),
      then: Joi.string().required(),
    })
    .messages({
      // tslint:disable-next-line: all
      'any.required': requiredMessage,
    })
}
