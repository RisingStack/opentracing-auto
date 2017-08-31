'use strict'

const opentracing = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

const OPERATION_NAME = 'http_server'
const TAG_REQUEST_PATH = 'request_path'

function patch (restify, tracers) {
  function createServerWrap (createServer) {
    return function createServerWrapped (...args) {
      const server = createServer.call(this, ...args)
      server.use(middleware)
      return server
    }
  }

  function middleware (req, res, next) {
    // start
    const parentSpanContexts = tracers.map((tracer) => tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers))
    const spans = parentSpanContexts.map((parentSpanContext, key) =>
      cls.startRootSpan(tracers[key], OPERATION_NAME, parentSpanContext)
    )

    spans.forEach((span) => span.setTag(opentracing.Tags.HTTP_URL, req.url))
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

      spans.forEach((span) => span.setTag(TAG_REQUEST_PATH, req.path()))
      spans.forEach((span) => span.setTag(opentracing.Tags.HTTP_STATUS_CODE, res.statusCode))

      if (res.statusCode >= 400) {
        spans.forEach((span) => span.setTag(opentracing.Tags.ERROR, true))
      }

      spans.forEach((span) => span.finish())

      return returned
    }

    next()
  }

  shimmer.wrap(restify, 'createServer', createServerWrap)
}

function unpatch (restify) {
  shimmer.unwrap(restify, 'createServer')
}

module.exports = {
  module: 'restify',
  supportedVersions: ['5.x'],
  TAG_REQUEST_PATH,
  OPERATION_NAME,
  patch,
  unpatch
}
