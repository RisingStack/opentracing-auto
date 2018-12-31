'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:ioredis')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const DB_TYPE = 'ioredis'
const OPERATION_NAME = 'ioredis'
const UNTRACKED_COMMANDS = [
  'ping',
  'flushall',
  'flushdb',
  'select',
  'auth',
  'info',
  'quit',
  'slaveof',
  'config',
  'sentinel'
]

function patch (redis, tracers) {
  shimmer.wrap(redis.prototype, 'sendCommand', wrapInternalSendCommand)

  debug('Patched')

  function wrapInternalSendCommand (original) {
    return function wrappedInternalSendCommand (commandObj) {
      // Do not track certain commands
      if (UNTRACKED_COMMANDS.includes(commandObj.name)) {
        original.call(this, commandObj)
        return
      }

      const statement = `${commandObj.name} ${commandObj.args}`
      const operationName = `${OPERATION_NAME}_${commandObj.name}`
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

      const originalReject = commandObj.reject
      commandObj.reject = (err, replies) => {
        // Error handling
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
        afterCallback(spans, operationName)

        if (originalReject) {
          originalReject(err, replies)
        }
      }

      const originalResolve = commandObj.resolve
      commandObj.resolve = (err, replies) => {
        afterCallback(spans, operationName)
        if (originalResolve) {
          originalResolve(err, replies)
        }
      }

      original.call(this, commandObj)
    }

    function afterCallback(spans, operationName) {
      spans.forEach((span) => span.finish())

      debug(`Operation finished ${operationName}`)
    }
  }
}

function unpatch (redis) {
  shimmer.unwrap(redis.prototype, 'sendCommand')

  debug('Unpatched')
}

module.exports = {
  name: 'ioredis',
  module: 'ioredis',
  OPERATION_NAME,
  DB_TYPE,
  patch,
  unpatch
}
