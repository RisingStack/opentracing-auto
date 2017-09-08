'use strict'

const { expect } = require('chai')
const { Tags } = require('opentracing')
const _ = require('lodash')
const cls = require('./cls')

describe('cls', () => {
  let tracer

  beforeEach(function () {
    tracer = {
      startSpan: this.sandbox.spy(() => 'mock-span'),
      __clsNamespace: Symbol('tracer')
    }
  })

  afterEach(() => {
    cls.setContext(_.clone(cls.DEFAULT_CONTEXT))
  })

  describe('#assign', () => {
    it('should assign to current context', () => {
      cls.assign(tracer, { foo: 'bar' })
      cls.assign(tracer, { such: 'wow' })
      cls.assign(tracer, { such: 'so' })

      expect(cls.getContext(tracer)).to.be.eql({
        [tracer.__clsNamespace]: {
          foo: 'bar',
          such: 'so'
        }
      })
    })
  })

  describe('#getRootSpan', () => {
    it('should return with root span', () => {
      cls.startRootSpan(tracer, 'http_request')

      expect(cls.getRootSpan(tracer)).to.be.equal('mock-span')
    })
  })

  describe('#startRootSpan', () => {
    it('should start root span', () => {
      const span = cls.startRootSpan(tracer, 'http_request')

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', undefined)

      expect(cls.getContext(tracer)).to.be.eql({
        [tracer.__clsNamespace]: {
          currentSpan: 'mock-span'
        }
      })

      expect(span).to.be.equal('mock-span')
    })

    it('should start root span that has a parent', () => {
      const parentSpanContext = {}
      cls.startRootSpan(tracer, 'http_request', { childOf: parentSpanContext })

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: parentSpanContext
      })
    })
  })

  describe('#startChildSpan', () => {
    it('should start child span', () => {
      const span = cls.startChildSpan(tracer, 'http_request')

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined
      })

      expect(span).to.be.equal('mock-span')
    })

    it('should start child span that has a parent', () => {
      const parentSpanContext = {}
      cls.setContext({
        [tracer.__clsNamespace]: {
          currentSpan: {
            context: () => parentSpanContext
          }
        }
      })
      cls.startChildSpan(tracer, 'http_request')

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: parentSpanContext
      })
    })

    it('should start child span with options', () => {
      const span = cls.startChildSpan(tracer, 'http_request', {
        tags: { [Tags.HTTP_METHOD]: 'GET' }
      })

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined,
        tags: { [Tags.HTTP_METHOD]: 'GET' }
      })

      expect(span).to.be.equal('mock-span')
    })

    it('should skip invalid parent', () => {
      cls.setContext({
        [tracer.__clsNamespace]: {
          currentSpan: {
            context: () => {}
          }
        }
      })
      cls.startChildSpan(tracer, 'http_request', undefined)

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined
      })
    })
  })
})
