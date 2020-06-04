'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:mali')
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing')
// eslint-disable-next-line import/order
const shimmer = require('shimmer')

const METHODS = ['use']
const cls = require('../cls')

const OPERATION_NAME = 'grpc'
const TAG_REQUEST_PATH = 'request_path'

function patch (mali, tracers) {
  function applicationActionWrap (method) {
    return function applicationActionWrapped (...args) {
      if (!this._jaeger_trace_patched && !this._router) {
        this._jaeger_trace_patched = true
        this.use(middleware)
      }
      return method.call(this, ...args)
    }
  }

  function middleware (ctx, next) {
    return cls.runAndReturn(() => {
      // start
      const url = `grpc:${ctx.fullName}`
      const SPAN_NAME = ctx.fullName || OPERATION_NAME
      const parentSpanContexts = tracers.map((tracer) => tracer.extract(FORMAT_HTTP_HEADERS, ctx.request.metadata))
      const spans = parentSpanContexts.map((parentSpanContext, key) => cls.startRootSpan(tracers[key], SPAN_NAME, {
        childOf: parentSpanContext,
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_SERVER,
          [Tags.HTTP_METHOD]: url
        }
      })).filter((span) => !!span)
      debug(`Operation started ${SPAN_NAME}`, {
        [Tags.HTTP_METHOD]: url
      })

      if (ctx.request.metadata) {
        const keys = Object.keys(ctx.request.metadata)
        keys.forEach((key) => {
          spans.forEach((span) => span.log({ [key]: ctx.request.metadata[key] }))
        })
      }
      try {
        return next()
      } catch (err) {
        spans.forEach((span) => {
          span.setTag(Tags.ERROR, true)
          span.log({ error: err })
        })
        throw err
      } finally {
        spans.forEach((span) => span.finish())
        debug(`Operation finished ${SPAN_NAME}`)
      }
    })
  }

  METHODS.forEach((method) => {
    shimmer.wrap(mali.prototype, method, applicationActionWrap)
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
  name: 'mali',
  module: 'mali',
  supportedVersions: ['0.x'],
  TAG_REQUEST_PATH,
  OPERATION_NAME,
  patch,
  unpatch
}
