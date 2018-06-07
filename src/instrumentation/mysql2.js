'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:mysql2')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const DB_TYPE = 'mysql'
const OPERATION_NAME = 'mysql2'

function createWrapQuery (tracers) {
  return function wrapQuery (query) {
    return function queryWithTrace (sql, values, cb) {
      const operationName = `${OPERATION_NAME}_query`
      const spans = tracers.map((tracer) =>
        cls.startChildSpan(tracer, operationName, {
          tags: {
            [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
            [Tags.DB_TYPE]: DB_TYPE
          }
        }))

      const sequence = query.call(this, sql, values, cb)
      sequence.on('error', (err) => {
        spans.forEach((span) =>
          span.log({
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
      })

      sequence.on('end', () => {
        spans.forEach((span) => span.finish())

        debug(`Operation finished ${operationName}`)
      })

      spans.forEach((span) => {
        span.setTag('service.name', 'mysql')
        span.setTag(Tags.DB_STATEMENT, sequence.sql)
        span.setTag('mysql.host', this.config.host)
        span.setTag('mysql.port', String(this.config.port))
        span.setTag('mysql.user', this.config.user)

        if (this.config.database) {
          span.setTag('mysql.db', this.config.database)
        }
      })
      return sequence
    }
  }
}

function patchConnection (Connection, tracers) {
  shimmer.wrap(Connection.prototype, 'query', createWrapQuery(tracers))
}

function unpatchConnection (Connection) {
  if (Connection) {
    shimmer.unwrap(Connection.prototype, 'query')
  }
  debug('Unpatched')
}

module.exports = {
  name: 'mysql2',
  module: 'mysql2',
  file: 'lib/connection.js',
  supportedVersions: ['^1.5'],
  OPERATION_NAME,
  DB_TYPE,
  patch: patchConnection,
  unpatch: unpatchConnection
}
