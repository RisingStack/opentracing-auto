'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:mysql')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const DB_TYPE = 'mysql'
const OPERATION_NAME = 'mysql'
let Connection

function patch (mysql, tracers) {
  // eslint-disable-next-line
  Connection = Connection || require('mysql/lib/Connection')

  function createQueryWrap (createQuery) {
    return function createQueryWrapped (sql, values, cb) {
      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, `${OPERATION_NAME}_query`))
      const query = createQuery.call(this, sql, values, cb)
      const statement = query.sql

      debug(`Operation started ${OPERATION_NAME}`, {
        [Tags.DB_TYPE]: DB_TYPE,
        [Tags.DB_STATEMENT]: statement
      })

      spans.forEach((span) => span.setTag(Tags.DB_TYPE, DB_TYPE))
      spans.forEach((span) => span.setTag(Tags.DB_STATEMENT, statement))

      query.on('error', (err) => {
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
      })

      query.on('end', () => {
        spans.forEach((span) => span.finish())

        debug(`Operation finished ${OPERATION_NAME}`)
      })

      return query
    }
  }

  shimmer.wrap(Connection, 'createQuery', createQueryWrap)

  debug('Patched')
}

function unpatch () {
  if (Connection) {
    shimmer.unwrap(Connection, 'createQuery')
  }
  debug('Unpatched')
}

module.exports = {
  name: 'mysql',
  module: 'mysql',
  supportedVersions: ['2.x'],
  OPERATION_NAME,
  DB_TYPE,
  patch,
  unpatch
}
