'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:expressError')
const shimmer = require('shimmer')
const { Tags } = require('opentracing')
const cls = require('../cls')
const { getOriginUrlWithoutQs } = require('./utils')


const OPERATION_NAME = 'express_error_handler'
const wrappedLayers = new Set()

function patch (express, tracers) {
  let lastLayer

  shimmer.wrap(express.Router, 'use', (originalUse) =>
    function errorHandler (...args) {
      const app = originalUse.call(this, ...args)

      // Remove error handler
      if (lastLayer) {
        unpatchLayer(lastLayer)
      }

      // Add error handler
      lastLayer = app.stack[app.stack.length - 1]

      if (!lastLayer) {
        return app
      }

      shimmer.wrap(lastLayer, 'handle_error', (originalHandleError) =>
        function (err, req, res, next) {
          const SPAN_NAME = getOriginUrlWithoutQs(req.originalUrl) || OPERATION_NAME
          let rootSpans = tracers.map((tracer) => cls.getRootSpan(tracer))
          rootSpans = rootSpans.filter((rootSpan) => rootSpan)
          if (rootSpans.length) {
            rootSpans.forEach((rootSpan) => rootSpan.setTag(Tags.ERROR, true))
          }

          // error span
          const spans = tracers.map((tracer) => cls.startChildSpan(tracer, SPAN_NAME, {
            tags: {
              [Tags.ERROR]: true
            }
          }))

          debug(`Operation started ${SPAN_NAME}`)

          spans.forEach((span) => span.log({
            event: 'error',
            'error.object': err,
            message: err.message,
            stack: err.stack
          }))

          debug(`Operation error captured ${SPAN_NAME}`, {
            reason: 'Error handler'
          })

          spans.forEach((span) => span.finish())

          debug(`Operation finished ${SPAN_NAME}`)

          return originalHandleError.call(this, err, req, res, next)
        })
      wrappedLayers.add(lastLayer)

      return app
    })

  debug('Patched')
}

function unpatchLayer (layer) {
  shimmer.unwrap(layer, 'handle_error')
  wrappedLayers.delete(layer)
}

function unpatch (express) {
  shimmer.unwrap(express.Router, 'use')

  wrappedLayers.forEach(unpatchLayer)

  debug('Unpatched')
}

module.exports = {
  name: 'expressError',
  module: 'express',
  supportedVersions: ['4.x'],
  OPERATION_NAME,
  patch,
  unpatch
}
