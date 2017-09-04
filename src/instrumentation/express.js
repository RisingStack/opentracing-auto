'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:express')
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing')
const shimmer = require('shimmer')
const METHODS = require('methods').concat('use', 'route', 'param', 'all')
const cls = require('../cls')

const OPERATION_NAME = 'http_server'
const TAG_REQUEST_PATH = 'request_path'

function patch (express, tracers) {
  function applicationActionWrap (method) {
    return function applicationActionWrapped (...args) {
      if (!this._jaeger_trace_patched && !this._router) {
        this._jaeger_trace_patched = true
        this.use(middleware)
      }
      return method.call(this, ...args)
    }
  }

  function middleware (req, res, next) {
    // start
    const url = `${req.protocol}://${req.hostname}${req.originalUrl}`
    const parentSpanContexts = tracers.map((tracer) => tracer.extract(FORMAT_HTTP_HEADERS, req.headers))
    const spans = parentSpanContexts.map((parentSpanContext, key) =>
      cls.startRootSpan(tracers[key], OPERATION_NAME, parentSpanContext)
    )
    debug(`Operation started ${OPERATION_NAME}`, {
      [Tags.HTTP_URL]: url,
      [Tags.HTTP_METHOD]: req.method
    })

    spans.forEach((span) => span.setTag(Tags.HTTP_URL, url))
    spans.forEach((span) => span.setTag(Tags.HTTP_METHOD, req.method))
    spans.forEach((span) => span.setTag(Tags.SPAN_KIND_RPC_SERVER, true))

    if (req.connection.remoteAddress) {
      spans.forEach((span) => span.log({ peerRemoteAddress: req.connection.remoteAddress }))
    }

    // end
    const originalEnd = res.end

    res.end = function (...args) {
      res.end = originalEnd
      const returned = res.end.call(this, ...args)

      if (req.route && req.route.path) {
        spans.forEach((span) => span.setTag(TAG_REQUEST_PATH, req.route.path))
      }

      spans.forEach((span) => span.setTag(Tags.HTTP_STATUS_CODE, res.statusCode))

      if (res.statusCode >= 400) {
        spans.forEach((span) => span.setTag(Tags.ERROR, true))

        debug(`Operation error captured ${OPERATION_NAME}`, {
          reason: 'Bad status code',
          statusCode: res.statusCode
        })
      }

      spans.forEach((span) => span.finish())

      debug(`Operation finished ${OPERATION_NAME}`, {
        [Tags.HTTP_STATUS_CODE]: res.statusCode
      })

      return returned
    }

    next()
  }

  METHODS.forEach((method) => {
    shimmer.wrap(express.application, method, applicationActionWrap)
    debug(`Method patched ${method}`)
  })

  debug('Patched')
}

function unpatch (express) {
  METHODS.forEach((method) => {
    shimmer.unwrap(express.application, method)
    debug(`Method unpatched ${method}`)
  })

  debug('Unpatched')
}

module.exports = {
  name: 'express',
  module: 'express',
  supportedVersions: ['4.x'],
  TAG_REQUEST_PATH,
  OPERATION_NAME,
  patch,
  unpatch
}
