import { Router } from "express";
import { CONSTANTS } from "../utils/env";
import fs from 'fs';
import path from 'path';
import util from 'util';
import axios from "axios";
export const adminApiV8 = Router()
const getErrorPage = async () => {
    const readFile = util.promisify(fs.readFile);
    const filePath = path.join(__dirname, 'error.html');
    const data = await readFile(filePath, 'utf8');
    return data;
}
const API_END_POINTS = {
    getLearnerDetails: `${CONSTANTS.SELF_SERVICE_PORTAL_API_BASE}/v1/user/getLearnerDetails`,
    getLeanerCompletedResourceDetails: `${CONSTANTS.SELF_SERVICE_PORTAL_API_BASE}/v1/user/getLeanerCompletedResourceDetails`
}
adminApiV8.get("/v1/user/getLearnerDetails", async (req, res) => {
    try {
        const { authorizationKey } = req.query
        const selfServiceAuthKey = CONSTANTS.SELF_SERVICE_PORTAL_AUTH_KEY
        if (!authorizationKey || (authorizationKey != selfServiceAuthKey)) {
            return res.status(403).send(await getErrorPage());
        }
        const response = await axios({
            method: 'GET',
            params: req.query,
            url: API_END_POINTS.getLearnerDetails,
        })
        console.log(response)
        res.status(200).send(response.data)
    } catch (error) {
        console.log(error)
        return res.status(403).send(await getErrorPage());
    }
})
adminApiV8.get("/v1/user/getLeanerCompletedResourceDetails", async (req, res) => {
    try {
        const { authorizationKey } = req.query
        const selfServiceAuthKey = CONSTANTS.SELF_SERVICE_PORTAL_AUTH_KEY
        if (!authorizationKey || (authorizationKey != selfServiceAuthKey)) {
            return res.status(403).send(await getErrorPage());
        }
        const response = await axios({
            method: 'GET',
            params: req.query,
            url: API_END_POINTS.getLeanerCompletedResourceDetails,
        })
        console.log(response)
        res.status(200).send(response.data)
    } catch (error) {
        console.log(error)
        return res.status(403).send(await getErrorPage());
    }
})
