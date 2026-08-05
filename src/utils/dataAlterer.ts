/* tslint:disable */
import _ from 'lodash'

const contentMapper = { Collection: 'CourseUnit', CourseUnit: 'Collection', }

/**
 * [This function is used for altering the request and response structure based on keys]
 * @param  {[json]} data      [Mandatory]
 * @param  {[string]} masterObjectKey [First Level Key]
 * @return {[json]}         [description]
 */

// tslint:disable-next-line: no-any
export const returnData = (data: any, masterObjectKey: any = null, level = 'flat') => {
	if (_.isEmpty(data)) {
		return false
	}
	// tslint:disable-next-line: no-any
	let responseData: any = ''
	if (level === 'hierarchy') {
		responseData = hierarchy(data)
	} else {
		const dataToAlter = data[masterObjectKey]
		const modifiedData = alterData(dataToAlter)
		data[masterObjectKey] = modifiedData
		responseData = data
	}
	return responseData
}

/**
 * [This function is used for handling hierarchy]
 * @param  {[json]} data      [Mandatory]
 * @return {[json]}         [description]
 */

// tslint:disable-next-line: no-any
function swapFirstMatchingHierarchyContentType(data: any) {
	const alData = data.request.data.hierarchy
	for (const property in alData) {
		if (alData[property].contentType === 'Collection' || alData[property].contentType === 'CourseUnit') {
			data.request.data.hierarchy[property].contentType = contentMapper[data.request.data.hierarchy[property].contentType]
			break
		}
	}
}

// tslint:disable-next-line: no-any
function swapChildrenContentType(data: any) {
	if (data.result.content && data.result.content.children && data.result.content.children.length > 0) {
		data.result.content.children.forEach((element: any) => {
			if (element.contentType === 'Collection' || element.contentType === 'CourseUnit') {
				element.contentType = contentMapper[element.contentType]
			}
		})
	}
}

// tslint:disable-next-line: no-any
function hierarchy(data: any = null) {
	if (data.request) {
		swapFirstMatchingHierarchyContentType(data)
	} else if (data.params.status === 'successful' && data.result) {
		swapChildrenContentType(data)
	}

	return data
}

/**
 * [This function is used for handling flat level object]
 * @param  {[json]} request      [Mandatory]
 * @return {[json]}         [description]
 */

// tslint:disable-next-line: no-any
function alterData(request: any = null) {
	if (request == null) return false
	const contentType = request.content.contentType
	if (contentType === 'Collection') {
		request.content.contentType = contentMapper[contentType]
	} else if (contentType === 'CourseUnit') {
		request.content.contentType = contentMapper[contentType]
	}
	return request
}