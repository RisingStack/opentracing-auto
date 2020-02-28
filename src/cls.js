const debug = require('debug')('opentracing-auto:cls')
const { createNamespace } = require('cls-hooked')

const session = createNamespace('opentracing-auto')

/**
* @function getRootSpan
* @param {Tracer} tracer
* @return {Span}
*/
function getRootSpan (tracer) {
  if (!tracer) {
    throw new Error('tracer is required')
  }

  const rootSpan = getContext(tracer)

  return rootSpan && rootSpan.context ? rootSpan : undefined
}

/**
* @function startRootSpan
* @param {Tracer} tracer
* @param {String} operationName
* @param {Object} [options]
* @return {Span}
*/
function startRootSpan (tracer, operationName, options) {
  if (!tracer) {
    throw new Error('tracer is required')
  }
  if (!operationName) {
    throw new Error('operationName is required')
  }

  let span = getRootSpan(tracer)

  if (span) {
    debug('Root span finded')
  } else {
    span = tracer.startSpan(operationName, options)
    setContext(tracer, span)
    debug('Root span started')
  }

  return span
}

/**
* @function startChildSpan
* @param {Tracer} tracer
* @param {String} operationName
* @param {Object} [options]
* @return {Span}
*/
function startChildSpan (tracer, operationName, options) {
  if (!tracer) {
    throw new Error('tracer is required')
  }
  if (!operationName) {
    throw new Error('operationName is required')
  }

  const rootSpan = getRootSpan(tracer)
  const rootSpanContext = rootSpan ? rootSpan.context() : undefined

  const span = tracer.startSpan(operationName, Object.assign({}, options, {
    childOf: rootSpanContext
  }))

  debug('Child span started')

  return span
}

function setContext (tracer, rootSpan) {
  return session.set(tracer.__clsNamespace, rootSpan)
}

function getContext (tracer) {
  return session.get(tracer.__clsNamespace)
}


module.exports = Object.assign(session, {
  getRootSpan,
  startRootSpan,
  startChildSpan,
  setContext,
  getContext
})
