'use strict'

const fs          = require('fs')
const fileFormat = () => {
    let date    = new Date().toISOString().substring(0, 10)
    date        = date.replace(/:/g, '_')
    date        = date.replace(/-/g, '_')
    date        = date.replace(/T/g, '_')
    const name    = date + '.log'
    return process.cwd() + '/logs/' + name
}

const logFile = fs.createWriteStream(fileFormat(), {flags : 'w'})
export let pino    = require('pino')({},
{
    [Symbol.for('needsMetadata')]: true,
    // tslint:disable-next-line: no-any
    write(msg: any) {
        logFile.write(msg)
    },
})
