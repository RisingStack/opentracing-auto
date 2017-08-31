'use strict'

const { expect } = require('chai')
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

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined
      })

      expect(cls.getContext(tracer)).to.be.eql({
        [tracer.__clsNamespace]: {
          currentSpan: 'mock-span'
        }
      })

      expect(span).to.be.equal('mock-span')
    })

    it('should start root span that has a parent', () => {
      const parentSpanContext = { isValid: true }
      cls.startRootSpan(tracer, 'http_request', parentSpanContext)

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: parentSpanContext
      })
    })

    it('should skip invalid parent', () => {
      const parentSpanContext = { isValid: false }
      cls.startRootSpan(tracer, 'http_request', parentSpanContext)

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined
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
      const parentSpanContext = { isValid: true }
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

    it('should skip invalid parent', () => {
      const parentSpanContext = { isValid: false }
      cls.setContext({
        [tracer.__clsNamespace]: {
          currentSpan: {
            context: () => parentSpanContext
          }
        }
      })
      cls.startChildSpan(tracer, 'http_request', parentSpanContext)

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined
      })
    })
  })
})
