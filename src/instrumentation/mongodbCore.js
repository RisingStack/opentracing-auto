'use strict'

const opentracing = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const DB_TYPE = 'mongodb'
const OPERATION_NAME = 'mongodb'

function nextWrapFactory (tracers) {
  return function nextWrap (next) {
    return function nextTrace (cb) {
      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, `${OPERATION_NAME}_cursor`))

      spans.forEach((span) => span.setTag(opentracing.Tags.DB_TYPE, DB_TYPE))
      spans.forEach((span) => span.setTag(opentracing.Tags.DB_STATEMENT, JSON.stringify(this.cmd)))

      return next.call(this, wrapCallback(tracers, spans, cb))
    }
  }
}

function wrapCallback (tracers, spans, done) {
  const fn = function (err, res) {
    if (err) {
      spans.forEach((span) => span.log({
        event: 'error',
        'error.object': err,
        message: err.message,
        stack: err.stack
      }))
      spans.forEach((span) => span.setTag(opentracing.Tags.ERROR, true))
    }

    spans.forEach((span) => span.finish())

    if (done) {
      done(err, res)
    }
  }

  return fn
}

function wrapFactory (tracers, command) {
  return function (original) {
    return function mongoOperationTrace (ns, ops, options, callback) {
      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, `${OPERATION_NAME}_${command}`))

      spans.forEach((span) => span.setTag(opentracing.Tags.DB_TYPE, DB_TYPE))
      spans.forEach((span) => span.setTag(opentracing.Tags.DB_STATEMENT, JSON.stringify(ops)))
      spans.forEach((span) => span.setTag(opentracing.Tags.DB_INSTANCE, ns))

      if (typeof options === 'function') {
        return original.call(this, ns, ops, wrapCallback(tracers, spans, options))
      }

      return original.call(this, ns, ops, options, wrapCallback(tracers, spans, callback))
    }
  }
}

function patch (mongodb, tracer) {
  shimmer.wrap(mongodb.Server.prototype, 'command', wrapFactory(tracer, 'command'))
  shimmer.wrap(mongodb.Server.prototype, 'insert', wrapFactory(tracer, 'insert'))
  shimmer.wrap(mongodb.Server.prototype, 'update', wrapFactory(tracer, 'update'))
  shimmer.wrap(mongodb.Server.prototype, 'remove', wrapFactory(tracer, 'remove'))
  shimmer.wrap(mongodb.Cursor.prototype, 'next', nextWrapFactory(tracer))
}

function unpatch (mongodb) {
  shimmer.unwrap(mongodb.Server.prototype, 'command')
  shimmer.unwrap(mongodb.Server.prototype, 'insert')
  shimmer.unwrap(mongodb.Server.prototype, 'update')
  shimmer.unwrap(mongodb.Server.prototype, 'remove')
  shimmer.unwrap(mongodb.Cursor.prototype, 'next')
}

module.exports = {
  module: 'mongodb-core',
  supportedVersions: ['1.x', '2.x'],
  OPERATION_NAME,
  DB_TYPE,
  patch,
  unpatch
}
