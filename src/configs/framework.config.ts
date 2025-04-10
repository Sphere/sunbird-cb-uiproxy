
const fs = require('fs')
const expressCassandra = require('express-cassandra')
import { CONSTANTS } from '../utils/env'
const _ = require('lodash')
const packageObj = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const uuidv1 = require('uuid/v1')

const consistency = getConsistencyLevel(CONSTANTS.PORTAL_CASSANDRA_CONSISTENCY_LEVEL)
const replicationStrategy = {class: 'SimpleStrategy', replication_factor: CONSTANTS.CASSANDRA_REPLICATION_FORM || 3}
function getIPList() {
    return CONSTANTS.CASSANDRA_IP.split(',')
}

// tslint:disable-next-line: no-any
function getConsistencyLevel(consistencyParam: any) {
    // tslint:disable-next-line: max-line-length
    return (consistencyParam && _.get(expressCassandra, `consistencies.${consistencyParam}`) ? _.get(expressCassandra, `consistencies.${consistencyParam}`) :  expressCassandra.consistencies.one)
  }
// tslint:disable-next-line: no-console
console.log('getIPList method : ', getIPList())
module.exports = {
    db: {
        cassandra: {
            contactPoints: getIPList(),
            defaultKeyspaceSettings: {
                replication: replicationStrategy,
            },
            queryOptions: {
                consistency,
                // prepare: true,
            },
        },
        couchdb: {
            url: '',
        },
        elasticsearch: {
            disabledApis: [],
            host: '',
        },
        pouchdb: {
            path: '',
        },
    },
    logLevel: 'error',
    pluginBasePath: __dirname + '/../node_modules/',
    plugins: [
        { id: '@project-sunbird/form-service', ver: '1.0'},
        // { id: '@project-sunbird/review-comment', ver: '1.0' },
        // { id: '@project-sunbird/discussion-service', ver: '1.0' }
        // { id: '@project-sunbird/program', ver: '1.0' }
    ],
    telemetry: {
        authtoken: 'Bearer ' + CONSTANTS.SB_API_KEY,
        batchsize: 1,
        channel: '', // should fetch default channel by making api call
        dispatcher: 'http', // default
        endpoint: 'v1/telemetry',
        env: process.env.sunbird_environment,
        host: CONSTANTS.TELEMETRY_SB_BASE,
        pdata: {
            id: CONSTANTS.CORS_ENVIRONMENT + '-sunbird-cb-uiproxy',
            pid: 'sunbird-cb-uiproxy',
            ver: packageObj.version,
        },
        runningEnv: 'server',
        // apislug: '', // not needed in portal
        uid: uuidv1(),
    },
}
