/* eslint-disable import/order */

'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:sequelize')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')

const METHODS = ['query']
const cls = require('../cls')

const OPERATION_NAME = 'sql'

function patch (sequelize, tracers) {
  function applicationActionWrap (method) {
    return function applicationActionWrapped (...args) {
      if (!this._jaeger_trace_patched) {
        this._jaeger_trace_patched = true
        this[method] = query.bind(this)
      }
      return method.call(this, ...args)
    }
  }

  function query (sql, option) {
    const self = this
    return cls.runAndReturn(() => {
      const SPAN_NAME = 'sql' || OPERATION_NAME
      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, SPAN_NAME, {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_SERVER,
          [Tags.DB_TYPE]: self.getDialect(),
          [Tags.DB_STATEMENT]: sql
        }
      })).filter((span) => !!span)
      debug(`Operation started ${SPAN_NAME}`, {
        [Tags.DB_TYPE]: self.getDialect(),
        [Tags.DB_STATEMENT]: sql
      })

      return self.query(sql, option)
        .then((result) => {
          spans.forEach((span) => span.finish())
          return result
        })
        .catch((err) => {
          spans.forEach((span) => span.setTag(Tags.ERROR, true))
          spans.forEach((span) => span.log({ error: err }))
          spans.forEach((span) => span.finish())
        })
    })
  }

  METHODS.forEach((method) => {
    shimmer.wrap(sequelize.prototype, method, applicationActionWrap)
    debug(`Method patched ${method}`)
  })

  debug('Patched')
}

function unpatch (koa) {
  METHODS.forEach((method) => {
    shimmer.unwrap(koa.prototype, method)
    debug(`Method unpatched ${method}`)
  })

  debug('Unpatched')
}

module.exports = {
  name: 'sequelize',
  module: 'sequelize',
  supportedVersions: ['4.x', '5.x'],
  OPERATION_NAME,
  patch,
  unpatch
}
