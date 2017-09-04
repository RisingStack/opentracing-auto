'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:pg')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const DB_TYPE = 'postgresql'
const OPERATION_NAME = 'pg'

function patch (pg, tracers) {
  function queryWrap (query) {
    return function queryTrace (...args) {
      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, `${OPERATION_NAME}_query`))
      const pgQuery = query.call(this, ...args)
      const originalCallback = pgQuery.callback
      const statement = pgQuery.text

      debug(`Operation started ${OPERATION_NAME}`, {
        [Tags.DB_TYPE]: DB_TYPE,
        [Tags.DB_STATEMENT]: statement
      })

      spans.forEach((span) => span.setTag(Tags.DB_TYPE, DB_TYPE))
      spans.forEach((span) => span.setTag(Tags.DB_STATEMENT, statement))

      pgQuery.callback = (err, res) => {
        if (err) {
          spans.forEach((span) => span.log({
            event: 'error',
            'error.object': err,
            message: err.message,
            stack: err.stack
          }))
          spans.forEach((span) => span.setTag(Tags.ERROR, true))

          debug(`Operation error captured ${OPERATION_NAME}`, {
            reason: 'Error event',
            errorMessage: err.message
          })
        }

        if (res) {
          spans.forEach((span) => span.log({
            row_count: res.rowCount
          }))
        }

        spans.forEach((span) => span.finish())

        debug(`Operation finished ${OPERATION_NAME}`)

        if (originalCallback) {
          originalCallback(err, res)
        }
      }
      return pgQuery
    }
  }

  shimmer.wrap(pg.Client.prototype, 'query', queryWrap)

  debug('Patched')
}

function unpatch (pg) {
  shimmer.unwrap(pg.Client.prototype, 'query')

  debug('Unpatched')
}

module.exports = {
  name: 'pg',
  module: 'pg',
  supportedVersions: ['6.x'],
  OPERATION_NAME,
  DB_TYPE,
  patch,
  unpatch
}
