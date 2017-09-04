'use strict'

const debug = require('debug')('opentracing-auto:cls')
const { ContinuationLocalStorage } = require('asyncctx')
const _ = require('lodash')

const cls = new ContinuationLocalStorage()
const DEFAULT_CONTEXT = {}

cls.setRootContext(_.clone(DEFAULT_CONTEXT))

/**
* @function assign
* @param {Tracer} tracer
* @param {SpanContext} spanContext
*/
function assign (tracer, spanContext) {
  const currentContext = cls.getContext() || {}
  const currentTracerContext = currentContext[tracer.__clsNamespace] || {}
  const newTracerContext = Object.assign(currentTracerContext, spanContext)
  const newContext = Object.assign(currentContext, {
    [tracer.__clsNamespace]: newTracerContext
  })

  cls.setContext(newContext)
}

/**
* @function getRootSpan
* @param {Tracer} tracer
* @return {Span}
*/
function getRootSpan (tracer) {
  if (!tracer) {
    throw new Error('tracer is required')
  }

  const context = cls.getContext() || cls.getRootContext() || {}
  const tracerContext = context[tracer.__clsNamespace] || {}
  return tracerContext.currentSpan
}

/**
* @function startRootSpan
* @param {Tracer} tracer
* @param {String} operationName
* @param {SpanContext} [parentSpanContext]
* @return {Span}
*/
function startRootSpan (tracer, operationName, parentSpanContext) {
  if (!tracer) {
    throw new Error('tracer is required')
  }
  if (!operationName) {
    throw new Error('operationName is required')
  }

  const span = tracer.startSpan(operationName, {
    childOf: parentSpanContext
  })

  cls.assign(tracer, {
    currentSpan: span
  })

  debug('Root span started')

  return span
}

/**
* @function startChildSpan
* @param {Tracer} tracer
* @param {String} operationName
* @return {Span}
*/
function startChildSpan (tracer, operationName) {
  if (!tracer) {
    throw new Error('tracer is required')
  }
  if (!operationName) {
    throw new Error('operationName is required')
  }

  const parentSpan = getRootSpan(tracer)
  const parentSpanContext = parentSpan ? parentSpan.context() : undefined

  const span = tracer.startSpan(operationName, {
    childOf: parentSpanContext
  })

  debug('Child span started')

  return span
}

module.exports = Object.assign(cls, {
  DEFAULT_CONTEXT,
  assign,
  getRootSpan,
  startRootSpan,
  startChildSpan
})
