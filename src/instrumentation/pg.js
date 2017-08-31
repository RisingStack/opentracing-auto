'use strict'

const opentracing = require('opentracing')
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

      spans.forEach((span) => span.setTag(opentracing.Tags.DB_TYPE, DB_TYPE))
      spans.forEach((span) => span.setTag(opentracing.Tags.DB_STATEMENT, pgQuery.text))

      pgQuery.callback = (err, res) => {
        if (err) {
          spans.forEach((span) => span.log({
            event: 'error',
            'error.object': err,
            message: err.message,
            stack: err.stack
          }))
          spans.forEach((span) => span.setTag(opentracing.Tags.ERROR, true))
        }

        if (res) {
          spans.forEach((span) => span.log({
            row_count: res.rowCount
          }))
        }

        spans.forEach((span) => span.finish())

        if (originalCallback) {
          originalCallback(err, res)
        }
      }
      return pgQuery
    }
  }

  shimmer.wrap(pg.Client.prototype, 'query', queryWrap)
}

function unpatch (pg) {
  shimmer.unwrap(pg.Client.prototype, 'query')
}

module.exports = {
  module: 'pg',
  supportedVersions: ['6.x'],
  OPERATION_NAME,
  DB_TYPE,
  patch,
  unpatch
}
