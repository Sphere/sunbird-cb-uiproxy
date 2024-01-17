export function requestValidator(requiredParams, requestBody, res) {
    const invalidProperties = []
    for (const prop of requiredParams) {
        const value = requestBody[prop]
        // tslint:disable-next-line: max-line-length
        if (!(prop in requestBody) || value === null || value === undefined || (Array.isArray(value) && value.length === 0) || value == '') {
            invalidProperties.push(prop)
        }
    }
    if (invalidProperties.length > 0) {
        return res.status(400).json({
            error: `Missing parameters: ${invalidProperties.join(', ')}`,
            type: 'Failed',
        })
    }
    return false
}
