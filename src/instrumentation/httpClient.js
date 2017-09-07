'use strict'

const url = require('url')
const debug = require('debug')('opentracing-auto:instrumentation:httpClient')
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing')
const shimmer = require('shimmer')
const _ = require('lodash')
// eslint-disable-next-line
const httpAgent = require('_http_agent')
const semver = require('semver')
const cls = require('../cls')

const OPERATION_NAME = 'http_request'
const OPERATION_NAME_DNS_LOOKUP = `${OPERATION_NAME}_dns_lookup`
const OPERATION_NAME_CONNECTION = `${OPERATION_NAME}_connection`
const OPERATION_NAME_SSL = `${OPERATION_NAME}_ssl`
const OPERATION_NAME_TIME_TO_FIRST_BYTE = `${OPERATION_NAME}_time_to_first_byte`
const OPERATION_NAME_CONTENT_TRANSFER = `${OPERATION_NAME}_content_transfer`

function extractUrl (options) {
  const uri = options
  const agent = options._defaultAgent || httpAgent.globalAgent

  return _.isString(uri) ? uri : url.format({
    protocol: options.protocol || agent.protocol,
    hostname: options.hostname || options.host || 'localhost',
    port: options.port,
    path: options.path || options.pathName || '/'
  })
}

function addTimings (tracers, spans, timings) {
  tracers.forEach((tracer, key) => {
    const childOf = spans[key]

    // DNS Lookup
    if (timings.begin !== undefined && timings.dnsLookup !== undefined) {
      const dnsSpan = tracer.startSpan(OPERATION_NAME_DNS_LOOKUP, {
        childOf,
        startTime: timings.begin
      })
      dnsSpan.finish(timings.dnsLookup)
    }

    // Initial connection
    if (timings.dnsLookup !== undefined && timings.tcpConnection !== undefined) {
      const connectionSpan = tracer.startSpan(OPERATION_NAME_CONNECTION, {
        childOf,
        startTime: timings.dnsLookup
      })
      connectionSpan.finish(timings.tlsHandshake || timings.tcpConnection)
    }

    // SSL connection
    if (timings.tcpConnection !== undefined && timings.tlsHandshake !== undefined) {
      const tlsSpan = tracer.startSpan(OPERATION_NAME_SSL, {
        childOf,
        startTime: timings.tcpConnection
      })
      tlsSpan.finish(timings.tlsHandshake)
    }

    // Time to first byte
    if (timings.tcpConnection !== undefined && timings.firstByte !== undefined) {
      const ttfbSpan = tracer.startSpan(OPERATION_NAME_TIME_TO_FIRST_BYTE, {
        childOf,
        startTime: timings.tlsHandshake || timings.tcpConnection
      })
      ttfbSpan.finish(timings.firstByte)
    }

    // Content transfer
    if (timings.firstByte !== undefined && timings.end !== undefined) {
      const contentTransferSpan = tracer.startSpan(OPERATION_NAME_CONTENT_TRANSFER, {
        childOf,
        startTime: timings.firstByte
      })
      contentTransferSpan.finish(timings.end)
    }
  })
}

function patch (http, tracers, { httpTimings } = {}) {
  shimmer.wrap(http, 'request', (request) => makeRequestTrace(request))

  if (semver.satisfies(process.version, '>=8.0.0')) {
    // http.get in Node 8 calls the private copy of request rather than the one
    // we have patched on module.export. We need to patch get as well. Luckily,
    // the request patch we have does work for get as well.
    shimmer.wrap(http, 'get', (get) => makeRequestTrace(get))
  }

  function makeRequestTrace (request) {
    // On Node 8+ we use the following function to patch both request and get.
    // Here `request` may also happen to be `get`.
    return function requestTrace (options, callback) {
      if (!options) {
        return request.apply(this, [options, callback])
      }

      const spans = tracers.map((tracer) => cls.startChildSpan(tracer, OPERATION_NAME))
      const uri = extractUrl(options)
      const method = options.method || 'GET'
      const timings = {
        begin: undefined,
        dnsLookup: undefined,
        tcpConnection: undefined,
        firstByte: undefined,
        tlsHandshake: undefined,
        end: undefined
      }
      let isFinish = false

      debug(`Operation started ${OPERATION_NAME}`, {
        [Tags.HTTP_URL]: uri,
        [Tags.HTTP_METHOD]: method
      })

      options = _.isString(options) ? url.parse(options) : _.merge({}, options)
      options.headers = options.headers || {}

      tracers.forEach((tracer, key) => tracer.inject(spans[key], FORMAT_HTTP_HEADERS, options.headers))

      spans.forEach((span) => span.setTag(Tags.HTTP_URL, uri))
      spans.forEach((span) => span.setTag(Tags.HTTP_METHOD, method))
      spans.forEach((span) => span.setTag(Tags.SPAN_KIND_RPC_CLIENT, true))

      timings.begin = Date.now()

      const req = request.call(this, options, (res) => {
        function finish () {
          if (httpTimings) {
            timings.end = Date.now()
            addTimings(tracers, spans, timings)
          }

          spans.forEach((span) => span.finish())
          isFinish = true
        }

        if (res.statusCode > 399) {
          spans.forEach((span) => span.setTag(Tags.ERROR, true))

          debug(`Operation error captured ${OPERATION_NAME}`, {
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

        debug(`Operation finished ${OPERATION_NAME}`, {
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
            spans.forEach((span) => span.finish())
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

          debug(`Operation error captured ${OPERATION_NAME}`, {
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

function unpatch (http) {
  shimmer.unwrap(http, 'request')

  if (semver.satisfies(process.version, '>=8.0.0')) {
    shimmer.unwrap(http, 'get')
  }

  debug('Unpatched')
}

module.exports = {
  name: 'httpClient',
  module: 'http',
  OPERATION_NAME,
  OPERATION_NAME_DNS_LOOKUP,
  OPERATION_NAME_CONNECTION,
  OPERATION_NAME_SSL,
  OPERATION_NAME_TIME_TO_FIRST_BYTE,
  OPERATION_NAME_CONTENT_TRANSFER,
  patch,
  unpatch
}
