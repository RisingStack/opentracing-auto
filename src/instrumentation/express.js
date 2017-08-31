'use strict'

const opentracing = require('opentracing')
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
    const parentSpanContexts = tracers.map((tracer) => tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers))
    const spans = parentSpanContexts.map((parentSpanContext, key) =>
      cls.startRootSpan(tracers[key], OPERATION_NAME, parentSpanContext)
    )

    spans.forEach((span) => span.setTag(opentracing.Tags.HTTP_URL, url))
    spans.forEach((span) => span.setTag(opentracing.Tags.HTTP_METHOD, req.method))
    spans.forEach((span) => span.setTag(opentracing.Tags.SPAN_KIND_RPC_SERVER, true))

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

      spans.forEach((span) => span.setTag(opentracing.Tags.HTTP_STATUS_CODE, res.statusCode))

      if (res.statusCode >= 400) {
        spans.forEach((span) => span.setTag(opentracing.Tags.ERROR, true))
      }

      spans.forEach((span) => span.finish())

      return returned
    }

    next()
  }

  METHODS.forEach((method) => {
    shimmer.wrap(express.application, method, applicationActionWrap)
  })
}

function unpatch (express) {
  METHODS.forEach((method) => {
    shimmer.unwrap(express.application, method)
  })
}

module.exports = {
  module: 'express',
  supportedVersions: ['4.x'],
  TAG_REQUEST_PATH,
  OPERATION_NAME,
  patch,
  unpatch
}
