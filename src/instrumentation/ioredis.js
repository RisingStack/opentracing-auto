/* eslint-disable import/order */

'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:ioredis')
const { Tags } = require('opentracing')
const shimmer = require('shimmer')

const METHODS = ['sendCommand']
const cls = require('../cls')

const OPERATION_NAME = 'redis'

function patch (Redis, tracers) {
  METHODS.forEach((method) => {
    const originFn = Redis.prototype[method]
    Redis.prototype[method] = fn

    function fn (command, stream) {
      const self = this
      return cls.runAndReturn(() => {
        const SPAN_NAME = 'redis' || OPERATION_NAME
        const statement = command && (`${command.name} ${command.args}`)
        const spans = tracers.map((tracer) => cls.startChildSpan(tracer, SPAN_NAME, {
          tags: {
            [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_SERVER,
            [Tags.DB_TYPE]: 'redis',
            [Tags.DB_STATEMENT]: statement
          }
        })).filter((span) => !!span)
        debug(`Operation started ${SPAN_NAME}`, {
          [Tags.DB_TYPE]: 'redis',
          [Tags.DB_STATEMENT]: statement
        })

        return originFn.bind(self)(command, stream)
          .then((result) => {
            spans.forEach((span) => span.finish())
            return result
          })
          .catch((err) => {
            spans.forEach((span) => span.setTag(Tags.ERROR, true))
            spans.forEach((span) => span.log({ error: err }))
            spans.forEach((span) => span.finish())
            throw err
          })
      })
    }
  })

  debug('Patched')
}

function unpatch (Redis) {
  METHODS.forEach((method) => {
    shimmer.unwrap(Redis.prototype, method)
    debug(`Method unpatched ${method}`)
  })

  debug('Unpatched')
}

module.exports = {
  name: 'ioredis',
  module: 'ioredis',
  supportedVersions: ['4.x'],
  OPERATION_NAME,
  patch,
  unpatch
}
