'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:restify')
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing')
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
    const parentSpanContexts = tracers.map((tracer) => tracer.extract(FORMAT_HTTP_HEADERS, req.headers))
    const spans = parentSpanContexts.map((parentSpanContext, key) =>
      cls.startRootSpan(tracers[key], OPERATION_NAME, parentSpanContext)
    )

    debug(`Operation started ${OPERATION_NAME}`, {
      [Tags.HTTP_URL]: req.url,
      [Tags.HTTP_METHOD]: req.method
    })

    spans.forEach((span) => span.setTag(Tags.HTTP_URL, req.url))
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

      spans.forEach((span) => span.setTag(TAG_REQUEST_PATH, req.path()))
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

  shimmer.wrap(restify, 'createServer', createServerWrap)

  debug('Patched')
}

function unpatch (restify) {
  shimmer.unwrap(restify, 'createServer')

  debug('Unpatched')
}

module.exports = {
  name: 'restify',
  module: 'restify',
  supportedVersions: ['5.x'],
  TAG_REQUEST_PATH,
  OPERATION_NAME,
  patch,
  unpatch
}
