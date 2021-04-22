'use strict'

const debug = require('debug')('opentracing-auto:instrumentation:httpClient')
const { FORMAT_HTTP_HEADERS } = require('opentracing')
const shimmer = require('shimmer')
const cls = require('../cls')

function patch (grpcCaller, tracers) {
  const original = grpcCaller.wrap
  grpcCaller.wrap = _wrap(original)
  function _wrap (original) {
    return function (...args) {
      const instance = original(...args)
      const proto = Object.getPrototypeOf(instance)
      const keys = Object.keys(proto)
      keys.forEach((fnName) => {
        if (fnName === 'constructor') {
          return
        }
        if (fnName === 'exec') {
          return
        }
        const oldFn = proto[fnName]
        proto[fnName] = (arg, metadata, options, fn) => {
          const spans = tracers.map((tracer) => cls.getRootSpan(tracer))
          if (!metadata) {
            metadata = {}
          }
          tracers.forEach((tracer, key) => tracer.inject(spans[key], FORMAT_HTTP_HEADERS, metadata))
          return oldFn.bind(instance)(arg, metadata, options, fn)
        }
      })
      return instance
    }
  }
  debug('Patched')
}

function unpatch (grpcCaller) {
  shimmer.unwrap(grpcCaller, 'wrap')
  debug('Unpatched')
}

module.exports = {
  name: '@guanghe/grpc-caller',
  module: '@guanghe/grpc-caller',
  patch,
  unpatch
}
