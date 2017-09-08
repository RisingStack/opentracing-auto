'use strict'

const request = require('super-request')
const { expect } = require('chai')
const { Tracer, Tags } = require('opentracing')
const restify = require('restify')
const cls = require('../cls')
const instrumentation = require('./restify')

describe('instrumentation: restify', () => {
  let tracer
  let mockSpan

  beforeEach(function () {
    tracer = new Tracer()
    mockSpan = {
      setTag: this.sandbox.spy(),
      log: this.sandbox.spy(),
      finish: this.sandbox.spy()
    }

    this.sandbox.stub(cls, 'startRootSpan').callsFake(() => mockSpan)

    instrumentation.patch(restify, [tracer])
  })

  afterEach(() => {
    instrumentation.unpatch(restify)
  })

  describe('#patch', () => {
    it('should create a span without parent', async () => {
      // test
      const server = restify.createServer()
      server.get('/', (req, res) => res.send('ok'))

      await request(server)
        .get('/')
        .expect(200)
        .end()

      expect(cls.startRootSpan).to.be.calledWith(tracer, instrumentation.OPERATION_NAME)

      expect(mockSpan.setTag).to.be.calledWith(Tags.HTTP_URL, '/')
      expect(mockSpan.setTag).to.be.calledWith(Tags.HTTP_METHOD, 'GET')
      expect(mockSpan.setTag).to.be.calledWith(Tags.SPAN_KIND_RPC_SERVER, true)
      expect(mockSpan.log).to.be.calledWith({ peerRemoteAddress: '::ffff:127.0.0.1' })
      expect(mockSpan.setTag).to.be.calledWith(instrumentation.TAG_REQUEST_PATH, '/')
      expect(mockSpan.setTag).to.be.calledWith(Tags.HTTP_STATUS_CODE, 200)
      expect(mockSpan.finish).to.have.callCount(1)
    })

    it('should create a span with parent', async () => {
      const headers = {}
      const parentSpan = tracer.startSpan('http_request')
      tracer.inject(parentSpan, headers)

      const server = restify.createServer()
      server.get('/', (req, res) => res.send('ok'))

      await request(server)
        .get('/')
        .headers(headers)
        .expect(200)
        .end()

      expect(cls.startRootSpan).to.be.calledWith(tracer, instrumentation.OPERATION_NAME, {
        childOf: parentSpan.context()
      })
    })

    it('should set error tag for > 3xx status codes', async () => {
      const server = restify.createServer()
      server.get('/', (req, res) => {
        res.statusCode = 400
        res.send('ok')
      })

      await request(server)
        .get('/')
        .expect(400)
        .end()

      expect(mockSpan.setTag).to.be.calledWith(Tags.HTTP_STATUS_CODE, 400)
      expect(mockSpan.setTag).to.be.calledWith(Tags.ERROR, true)
      expect(mockSpan.finish).to.have.callCount(1)
    })
  })
})
