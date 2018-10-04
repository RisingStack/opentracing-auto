'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:mongodb-core')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const DB_TYPE = 'mongodb'
const OPERATION_NAME = 'mongodb'

function nextWrapFactory (tracers) {
  return function nextWrap (next) {
    return function nextTrace (cb) {
      const operationName = `${OPERATION_NAME}_cursor`
      const statement = JSON.stringify(this.cmd)
      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, operationName, {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          [Tags.DB_TYPE]: DB_TYPE,
          [Tags.DB_STATEMENT]: statement
        }
      }))

      debug(`Operation started ${OPERATION_NAME}`, {
        [Tags.DB_TYPE]: DB_TYPE,
        [Tags.DB_STATEMENT]: statement
      })

      return next.call(this, wrapCallback(tracers, spans, operationName, cb))
    }
  }
}

function wrapCallback (tracers, spans, operationName, done) {
  const fn = function (err, res) {
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

    spans.forEach((span) => span.finish())

    debug(`Operation finished ${operationName}`)

    if (done) {
      done(err, res)
    }
  }

  return fn
}

function wrapFactory (tracers, command) {
  return function (original) {
    return function mongoOperationTrace (ns, ops, options, callback) {
      const operationName = `${OPERATION_NAME}_${command}`
      const statement = JSON.stringify(ops)
      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, operationName, {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          [Tags.DB_TYPE]: DB_TYPE,
          [Tags.DB_STATEMENT]: statement,
          [Tags.DB_INSTANCE]: ns
        }
      }))

      debug(`Operation started ${operationName}`, {
        [Tags.DB_TYPE]: DB_TYPE,
        [Tags.DB_STATEMENT]: statement,
        [Tags.DB_INSTANCE]: ns
      })

      if (typeof options === 'function') {
        return original.call(this, ns, ops, wrapCallback(tracers, spans, operationName, options))
      }

      return original.call(this, ns, ops, options, wrapCallback(tracers, spans, operationName, callback))
    }
  }
}

function patch (mongodb, tracer) {
  shimmer.wrap(mongodb.Server.prototype, 'command', wrapFactory(tracer, 'command'))
  shimmer.wrap(mongodb.Server.prototype, 'insert', wrapFactory(tracer, 'insert'))
  shimmer.wrap(mongodb.Server.prototype, 'update', wrapFactory(tracer, 'update'))
  shimmer.wrap(mongodb.Server.prototype, 'remove', wrapFactory(tracer, 'remove'))
  shimmer.wrap(mongodb.Cursor.prototype, 'next', nextWrapFactory(tracer))

  debug('Patched')
}

function unpatch (mongodb) {
  shimmer.unwrap(mongodb.Server.prototype, 'command')
  shimmer.unwrap(mongodb.Server.prototype, 'insert')
  shimmer.unwrap(mongodb.Server.prototype, 'update')
  shimmer.unwrap(mongodb.Server.prototype, 'remove')
  shimmer.unwrap(mongodb.Cursor.prototype, 'next')

  debug('Unpatched')
}

module.exports = {
  name: 'mongodbCore',
  module: 'mongodb-core',
  supportedVersions: ['1.x', '2.x', '3.x'],
  OPERATION_NAME,
  DB_TYPE,
  patch,
  unpatch
}
