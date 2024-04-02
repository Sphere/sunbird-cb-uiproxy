import axios from 'axios'
import { Router } from 'express'
import { UploadedFile } from 'express-fileupload'
import FormData from 'form-data'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { logError, logInfo } from '../../utils/logger'

const API_END_POINTS = {
    bhashiniIntefrancePipeline: `${CONSTANTS.DHURVA_BHASHINI_API_BASE}/services/inference/pipeline`,
    generateUUID: `${CONSTANTS.JUGALBANDI_API_BASE}/upload-files`,
    getModelsPipeline: `${CONSTANTS.MEITY_AUTH_ULCACONTRIB}/ulca/apis/v0/model/getModelsPipeline`,
    querywWithLangchainGpt: `${CONSTANTS.JUGALBANDI_API_BASE}/query-with-langchain-gpt3-5`,
}
export const aiServiceAPI = Router()
aiServiceAPI.post('/uploadFileAndGetUUID', async (req, res) => {
    try {
        if (!req.files || !req.files.file) {
            res.status(400).json({
                error: 'File not received in the request',
            })
            return
        }
        try {
            const file: UploadedFile = req.files.file as UploadedFile
            const formData = new FormData()
            formData.append('files', Buffer.from(file.data), {
                contentType: file.mimetype,
                filename: file.name,
            })
            const response = await axios.post(API_END_POINTS.generateUUID, formData, {
                ...axiosRequestConfig,
                headers: {
                    ...formData.getHeaders(),
                },
            })
            if (response) {
                logInfo('Entered into generateUUIDResponsev2 :' + JSON.stringify(response))
                res.status(200).json({
                    data: response.data.uuid_number,
                    msg: 'Files uploading is successful',
                    status: 'success',
                })
            }
        } catch (error) {
            handleErrorResponse(error, res)
        }

    } catch (error) {
        handleErrorResponse(error, res)
    }
})
aiServiceAPI.post('/getQuestions', async (req, res) => {
    try {
        if (!req.body.uuid || !req.body.numQuestions) {
            res.status(400).json({
                error: 'uuid or numQuestions not not received in the request',
            })
            return
        }
        try {
            const response = await axios.get(API_END_POINTS.querywWithLangchainGpt, {
                params: {
                    // tslint:disable-next-line: max-line-length
                    query_string: `Generate ${req.body.numQuestions} questions related to the uploaded file's topics within the questions array as a JSON response, each question represented as an object with the key 'text',excluding any reference point questions.`,
                    uuid_number: req.body.uuid,
                },
            })
            if (response && response.data) {
                logInfo('Entered into getQuestions :' + response)
                const answerObject = JSON.parse(response.data.answer)
                const questions = answerObject.questions
                res.status(200).json({
                    data: questions,
                    status: 'success',

                })
            }
        } catch (error) {
            handleErrorResponse(error, res)
        }

    } catch (error) {
        handleErrorResponse(error, res)
    }
})
const handleErrorResponse = (error, res) => {
    if (error.response && error.response.data && error.response.data.detail) {
        const errorDetail = error.response.data.detail
        const errorMessage = errorDetail.map((detail) => `${detail.loc.join('.')} ${detail.msg}`).join('; ')
        logError('Error:', errorMessage)
        res.status(400).json({ error: errorMessage })
    } else {
        logError('Error:', error.message)
        res.status(500).json({ error: 'Internal server error' })
    }
}

const handleAxiosError = (error) => {
    if (error.response && error.response.data) {
        const errorMessage = error.response.data.message || 'An error occurred while processing your request'
        logError('Error:', errorMessage)
        throw new Error(errorMessage)
    } else {
        logError('Error:', error.message)
        throw error
    }
}

/*Function to handle translation request */
const translateRequestHandler = async (reqestbody, pipelineRequestData, requestHeaders) => {
    try {
        const modelPipelineResponse = await axios.post(
            API_END_POINTS.getModelsPipeline,
            pipelineRequestData,
            { headers: requestHeaders }
        )

        if (modelPipelineResponse && modelPipelineResponse.data) {
            const { serviceId, authorizationToken } = extractDataFromResponse(modelPipelineResponse.data)
            const translateRequestData = buildTranslateRequestData(reqestbody.body, serviceId)
            const translateResponse = await axios.post(
                API_END_POINTS.bhashiniIntefrancePipeline,
                translateRequestData,
                { headers: buildTranslateRequestHeaders(authorizationToken) }
            )
            return translateResponse.data
        }
    } catch (error) {
        handleAxiosError(error)
    }
}

/*Function to extract necessary data from the model pipeline response */
const extractDataFromResponse = (responseData) => {
    const serviceId = responseData.pipelineResponseConfig[0].config[0].serviceId
    const authorizationToken = responseData.pipelineInferenceAPIEndPoint.inferenceApiKey.value
    return { serviceId, authorizationToken }
}

/*Function to build translate request data */
const buildTranslateRequestData = (body, serviceId) => ({
    inputData: {
        input: [
            {
                source: body.source,
            },
        ],
    },
    pipelineTasks: [
        {

            config: {
                language: {
                    sourceLanguage: body.sourceLanguage,
                    targetLanguage: body.targetLanguage,
                },
                serviceId,
            },
            taskType: 'translation',
        },
    ],

})

const pipeLineRequestData = (body, pipelineId) => ({
    pipelineRequestConfig : {
        pipelineId,
    },
    pipelineTasks: [
        {
            config: {
                language: {
                    sourceLanguage: body.sourceLanguage,
                    targetLanguage: body.targetLanguage,
                },
            },
            taskType: 'translation',
        },
    ],
})
/* Function to build translate request headers */
const buildTranslateRequestHeaders = (authorizationToken) => ({
    Authorization: authorizationToken,
    'Content-Type': 'application/json',
})

/*  Translate API endpoint */
aiServiceAPI.post('/translate', async (req, res) => {
    try {
        if (!req.body.sourceLanguage || !req.body.targetLanguage || !req.body.source) {
            return res.status(400).json({
                error: 'Source language, target language, or source text not received in the request',
            })
        }

        const pipelineRequestData = pipeLineRequestData(req.body, CONSTANTS.PIPE_LINE_ID)
        const requestHeaders = {
            ulcaApiKey: CONSTANTS.ULC_API_KEY,
            userID: CONSTANTS.PIPE_LINE_USER_ID,
        }

        const translateResponseData = await translateRequestHandler(req, pipelineRequestData, requestHeaders)
        res.status(200).json(translateResponseData)
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while processing your request' })
    }
})
