'use strict'

const http = require('http')
const request = require('request-promise-native')
const nock = require('nock')
const { expect } = require('chai')
const { Tracer, Tags } = require('opentracing')
const cls = require('../cls')
const instrumentation = require('./httpClient')

describe('instrumentation: httpClient', () => {
  let tracer
  let mockChildSpan

  beforeEach(function () {
    tracer = new Tracer()
    mockChildSpan = {
      setTag: this.sandbox.spy(),
      log: this.sandbox.spy(),
      finish: this.sandbox.spy()
    }

    this.sandbox.stub(cls, 'startChildSpan').callsFake(() => mockChildSpan)

    instrumentation.patch(http, [tracer])
  })

  afterEach(() => {
    instrumentation.unpatch(http)
    nock.cleanAll()
  })

  describe('#patch', () => {
    it('should start and finish span with http', () => {
      nock('http://risingstack.com')
        .get('/')
        .reply(200)

      return request('http://risingstack.com')
        .then(() => {
          expect(cls.startChildSpan).to.be.calledWith(tracer, instrumentation.OPERATION_NAME)
          expect(mockChildSpan.setTag).to.have.calledWith(Tags.HTTP_URL, 'http://risingstack.com:80')
          expect(mockChildSpan.setTag).to.have.calledWith(Tags.HTTP_METHOD, 'GET')
          expect(mockChildSpan.setTag).to.have.calledWith(Tags.SPAN_KIND_RPC_CLIENT, true)
          expect(mockChildSpan.setTag).to.have.calledWith(Tags.HTTP_STATUS_CODE, 200)
          expect(mockChildSpan.finish).to.have.callCount(1)
        })
    })

    it('should start and finish span with https', () =>
      // WARNING: nock doesn't work well with https instrumentation
      // create real request

      request('https://risingstack.com')
        .then(() => {
          expect(cls.startChildSpan).to.be.calledWith(tracer, instrumentation.OPERATION_NAME)
          expect(mockChildSpan.setTag).to.have.calledWith(Tags.HTTP_URL, 'https://risingstack.com:443')
          expect(mockChildSpan.setTag).to.have.calledWith(Tags.HTTP_METHOD, 'GET')
          expect(mockChildSpan.setTag).to.have.calledWith(Tags.SPAN_KIND_RPC_CLIENT, true)
          expect(mockChildSpan.setTag).to.have.calledWith(Tags.HTTP_STATUS_CODE, 200)
          expect(mockChildSpan.finish).to.have.callCount(1)
        })
    )

    it('should flag wrong status codes as error', () => {
      nock('http://risingstack.com')
        .get('/')
        .reply(400)

      return request('http://risingstack.com')
        .catch(() => {
          expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
        })
    })

    it('should flag error', () => {
      nock('http://risingstack.com')
        .get('/')
        .replyWithError('My Error')

      return request('http://risingstack.com')
        .catch((err) => {
          expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
          expect(mockChildSpan.log).to.be.calledWith({
            event: 'error',
            'error.object': err.cause,
            message: err.cause.message,
            stack: err.cause.stack
          })
          expect(mockChildSpan.finish).to.have.callCount(1)
        })
    })
  })
})
