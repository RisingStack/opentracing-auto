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

function patch (http, tracers) {
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

      const req = request.call(this, options, (res) => {
        const headers = _.omitBy(
          _.pick(res.headers, ['server', 'content-type', 'cache-control']),
          _.isUndefined
        )

        if (res.statusCode > 399) {
          spans.forEach((span) => span.setTag(Tags.ERROR, true))

          debug(`Operation error captured ${OPERATION_NAME}`, {
            reason: 'Bad status code',
            statusCode: res.statusCode
          })
        }

        spans.forEach((span) => span.setTag(Tags.HTTP_STATUS_CODE, res.statusCode))
        spans.forEach((span) => span.log({ headers }))
        spans.forEach((span) => span.finish())

        debug(`Operation finished ${OPERATION_NAME}`, {
          [Tags.HTTP_STATUS_CODE]: res.statusCode
        })

        if (callback) {
          callback(res)
        }
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
  patch,
  unpatch
}
