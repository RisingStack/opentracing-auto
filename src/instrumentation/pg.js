const debug = require('debug')('opentracing-auto:instrumentation:pg')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const DB_TYPE = 'postgresql'
const OPERATION_NAME = 'pg'
const UNTRACKED_QUERIES = [
  'select version();'
]

function patch (pg, tracers) {
  function queryWrap (query) {
    return function queryTrace (...args) {
      const pgQuery = query.call(this, ...args)
      const originalCallback = pgQuery.callback
      const statement = pgQuery.text

      if (UNTRACKED_QUERIES.includes(statement)) {
        return pgQuery
      }

      const operationName = `${OPERATION_NAME}_query`
      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, operationName, {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          [Tags.DB_TYPE]: DB_TYPE,
          [Tags.DB_STATEMENT]: statement
        }
      }))

      debug(`Operation started ${operationName}`, {
        [Tags.DB_TYPE]: DB_TYPE,
        [Tags.DB_STATEMENT]: statement
      })

      pgQuery.callback = (err, res) => {
        if (err) {
          spans.forEach((span) => span.log({
            event: 'error',
            'error.object': err,
            message: err.message,
            stack: err.stack
          }))
          spans.forEach((span) => span.setTag(Tags.ERROR, true))

          debug(`Operation error captured ${operationName}`, {
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

        debug(`Operation finished ${operationName}`)

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
