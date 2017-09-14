'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:redis')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const DB_TYPE = 'redis'
const OPERATION_NAME = 'redis'
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
  shimmer.wrap(redis.RedisClient.prototype, 'internal_send_command', wrapInternalSendCommand)

  debug('Patched')

  function wrapInternalSendCommand (original) {
    return function wrappedInternalSendCommand (commandObj) {
      // Do not track certain commands
      if (UNTRACKED_COMMANDS.includes(commandObj.command)) {
        original.call(this, commandObj)
        return
      }

      const statement = `${commandObj.command} ${commandObj.args}`
      const operationName = `${OPERATION_NAME}_${commandObj.command}`
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

      const originalCallback = commandObj.callback

      commandObj.callback = (err, replies) => {
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

        spans.forEach((span) => span.finish())

        debug(`Operation finished ${operationName}`)

        if (originalCallback) {
          originalCallback(err, replies)
        }
      }

      original.call(this, commandObj)
    }
  }
}

function unpatch (redis) {
  shimmer.unwrap(redis.RedisClient.prototype, 'internal_send_command')

  debug('Unpatched')
}

module.exports = {
  name: 'redis',
  module: 'redis',
  supportedVersions: ['2.8'],
  OPERATION_NAME,
  DB_TYPE,
  patch,
  unpatch
}
