const { expect } = require('chai')
const { Tags } = require('opentracing')
const cls = require('cls-hooked')
const uuidv4 = require('uuid/v4')
const session = require('./cls')

describe('cls', () => {
  let tracer

  beforeEach(function (done) {
    session.run(() => {
      tracer = {
        startSpan: this.sandbox.spy(() => 'mock-span'),
        __clsNamespace: uuidv4()
      }
      session.set(tracer.__clsNamespace, {})
      done()
    })
  })

  afterEach(() => {
    cls.reset()
  })

  describe('#startRootSpan', () => {
    it('should start root span', () => {
      const span = session.startRootSpan(tracer, 'http_request')

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', undefined)

      expect(session.getContext(tracer)).to.be.eql('mock-span')

      expect(span).to.be.equal('mock-span')
    })

    it('should start root span that has a root', () => {
      const rootSpanContext = {}
      session.startRootSpan(tracer, 'http_request', { childOf: rootSpanContext })

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: rootSpanContext
      })
    })
  })

  describe('#startChildSpan', () => {
    it('should start child span', () => {
      const span = session.startChildSpan(tracer, 'http_request')

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined
      })

      expect(span).to.be.equal('mock-span')
    })

    it('should start child span that has a root', () => {
      const rootSpanContext = {}
      const rootSpan = {
        context: () => rootSpanContext
      }
      session.setContext(tracer, rootSpan)
      session.startChildSpan(tracer, 'http_request')

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: rootSpanContext
      })
    })

    it('should start child span with options', () => {
      const span = session.startChildSpan(tracer, 'http_request', {
        tags: { [Tags.HTTP_METHOD]: 'GET' }
      })

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined,
        tags: { [Tags.HTTP_METHOD]: 'GET' }
      })

      expect(span).to.be.equal('mock-span')
    })

    it('should skip invalid root', () => {
      const rootSpan = {
        context: () => {}
      }

      session.setContext(rootSpan)
      session.startChildSpan(tracer, 'http_request', undefined)

      expect(tracer.startSpan).to.be.calledWithExactly('http_request', {
        childOf: undefined
      })
    })
  })
})
