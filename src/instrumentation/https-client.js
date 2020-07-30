'use strict'

const url = require('url')
const debug = require('debug')('opentracing-auto:instrumentation:httpsClient')
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing')
const shimmer = require('shimmer')
const _ = require('lodash')
const semver = require('semver')
const cls = require('../cls')
const { getOriginUrlWithoutQs } = require('./utils')


const OPERATION_NAME = 'https_request'

function extractUrl (options) {
  const uri = options
  return _.isString(uri) ? uri : url.format({
    protocol: 'https',
    hostname: options.hostname || options.host || 'localhost',
    port: options.port,
    pathname: options.path || options.pathName || '/'
  })
}

function patch (https, tracers) {
  shimmer.wrap(https, 'request', (request) => makeRequestTrace(request))

  if (semver.satisfies(process.version, '>=8.0.0')) {
    // http.get in Node 8 calls the private copy of request rather than the one
    // we have patched on module.export. We need to patch get as well. Luckily,
    // the request patch we have does work for get as well.
    shimmer.wrap(https, 'get', (get) => makeRequestTrace(get))
  }

  function makeRequestTrace (request) {
    // On Node 8+ we use the following function to patch both request and get.
    // Here `request` may also happen to be `get`.
    return function requestTrace (options, callback) {
      if (!options) {
        return request.apply(this, [options, callback])
      }

      const uri = extractUrl(options)
      const SPAN_NAME = getOriginUrlWithoutQs(options.path || options.pathName) || OPERATION_NAME
      const method = options.method || 'GET'
      const spans = tracers.map((tracer) => {
        if (uri.indexOf('/api/traces') >= 0) {
          debug(`match /api/traces skip span ${uri}`)
          return null
        }
        return cls.startChildSpan(tracer, SPAN_NAME, {
          tags: {
            [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
            [Tags.HTTP_URL]: uri,
            [Tags.HTTP_METHOD]: method
          }
        })
      }).filter((span) => !!span)

      const timings = {
        begin: undefined,
        dnsLookup: undefined,
        tcpConnection: undefined,
        firstByte: undefined,
        tlsHandshake: undefined,
        end: undefined
      }
      let isFinish = false

      debug(`Operation started ${SPAN_NAME}`, {
        [Tags.HTTP_URL]: uri,
        [Tags.HTTP_METHOD]: method
      })

      options = _.isString(options) ? url.parse(options) : _.merge({}, options)
      options.headers = options.headers || {}

      tracers.forEach((tracer, key) => tracer.inject(spans[key], FORMAT_HTTP_HEADERS, options.headers))

      timings.begin = Date.now()

      function finish () {
        spans.forEach((span) => span.finish())
        isFinish = true
      }

      const req = request.call(this, options, (res) => {
        if (res.statusCode > 399) {
          spans.forEach((span) => span.setTag(Tags.ERROR, true))

          debug(`Operation error captured ${SPAN_NAME}`, {
            reason: 'Bad status code',
            statusCode: res.statusCode
          })
        }

        const headers = _.omitBy(
          _.pick(res.headers, ['server', 'content-type', 'cache-control']),
          _.isUndefined
        )

        spans.forEach((span) => span.setTag(Tags.HTTP_STATUS_CODE, res.statusCode))
        spans.forEach((span) => span.log({ headers }))

        // Timing spans
        res.once('readable', () => {
          timings.firstByte = Date.now()
        })

        // End event is not emitted when stream is not consumed fully
        res.on('end', () => {
          finish(res)
        })

        debug(`Operation finished ${SPAN_NAME}`, {
          [Tags.HTTP_STATUS_CODE]: res.statusCode
        })

        if (callback) {
          callback(res)
        }
      })

      // Timings
      req.on('socket', (socket) => {
        socket.on('lookup', () => {
          timings.dnsLookup = Date.now()
        })
        socket.on('connect', () => {
          timings.tcpConnection = Date.now()
        })
        socket.on('secureConnect', () => {
          timings.tlsHandshake = Date.now()
        })
        socket.on('close', () => {
          // End event is not emitted when stream is not consumed fully
          if (!isFinish) {
            finish()
          }
        })
      })

      req.on('error', (err) => {
        spans.forEach((span) => span.setTag(Tags.ERROR, true))

        if (err) {
          spans.forEach((span) => span.log({
            event: 'error',
            'error.object': err,
            message: err.message,
            stack: err.stack
          }))

          debug(`Operation error captured ${SPAN_NAME}`, {
            reason: 'Error event',
            errorMessage: err.message
          })
        }

        spans.forEach((span) => span.finish())
      })
      return req
    }
  }

  debug('Patched')
}

function unpatch (https) {
  shimmer.unwrap(https, 'request')

  if (semver.satisfies(process.version, '>=8.0.0')) {
    shimmer.unwrap(https, 'get')
  }

  debug('Unpatched')
}

module.exports = {
  name: 'httpsClient',
  module: 'https',
  OPERATION_NAME,
  patch,
  unpatch
}
