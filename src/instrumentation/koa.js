'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:koa')
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing')
const shimmer = require('shimmer')

const METHODS = ['use']
const cls = require('../cls')
const { getOriginUrlWithoutQs } = require('./utils')

const OPERATION_NAME = 'http_server'
const TAG_REQUEST_PATH = 'request_path'

function patch (koa, tracers) {
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
      const url = `${ctx.protocol}://${ctx.get('host')}${ctx.originalUrl}`
      const SPAN_NAME = getOriginUrlWithoutQs(ctx.originalUrl) || OPERATION_NAME
      const parentSpanContexts = tracers.map((tracer) => tracer.extract(FORMAT_HTTP_HEADERS, ctx.headers))
      const spans = parentSpanContexts.map((parentSpanContext, key) =>
        cls.startRootSpan(tracers[key], SPAN_NAME, {
          childOf: parentSpanContext,
          tags: {
            [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_SERVER,
            [Tags.HTTP_URL]: url,
            [Tags.HTTP_METHOD]: ctx.method
          }
        }))
      debug(`Operation started ${SPAN_NAME}`, {
        [Tags.HTTP_URL]: url,
        [Tags.HTTP_METHOD]: ctx.method
      })

      if (ctx.ip) {
        spans.forEach((span) => span.log({ peerRemoteAddress: ctx.ip }))
      }

      // end
      const { res } = ctx
      const originalEnd = res.end
      res.end = function (...args) {
        ctx.res.end = originalEnd
        const returned = res.end.call(this, ...args)

        // if (req.route && req.route.path) {
        //   spans.forEach((span) => span.setTag(TAG_REQUEST_PATH, req.route.path))
        // }

        spans.forEach((span) => span.setTag(Tags.HTTP_STATUS_CODE, res.statusCode))

        if (res.statusCode >= 400) {
          spans.forEach((span) => span.setTag(Tags.ERROR, true))

          debug(`Operation error captured ${SPAN_NAME}`, {
            reason: 'Bad status code',
            statusCode: res.statusCode
          })
        }

        spans.forEach((span) => span.finish())

        debug(`Operation finished ${SPAN_NAME}`, {
          [Tags.HTTP_STATUS_CODE]: res.statusCode
        })

        return returned
      }
      return next()
    })
  }

  METHODS.forEach((method) => {
    shimmer.wrap(koa.prototype, method, applicationActionWrap)
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
  name: 'koa',
  module: 'koa',
  supportedVersions: ['2.x'],
  TAG_REQUEST_PATH,
  OPERATION_NAME,
  patch,
  unpatch
}
