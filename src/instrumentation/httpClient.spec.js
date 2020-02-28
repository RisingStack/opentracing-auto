const axios = require('axios')
const http = require('http')
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
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('#patch', () => {
    beforeEach(() => {
      instrumentation.patch(http, [tracer])
    })

    afterEach(() => {
      instrumentation.unpatch(http)
    })

    it('should start and finish span with http', async () => {
      nock('http://risingstack.com')
        .get('/foo')
        .reply(200)

      await axios.get('http://risingstack.com:80/foo', {
        query: { token: 'secret' }
      })

      expect(cls.startChildSpan).to.be.calledWith(tracer, instrumentation.OPERATION_NAME, {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          [Tags.HTTP_URL]: 'http://risingstack.com:80/foo',
          [Tags.HTTP_METHOD]: 'GET'
        }
      })
      expect(mockChildSpan.setTag).to.have.calledWith(Tags.HTTP_STATUS_CODE, 200)
      expect(mockChildSpan.finish).to.have.callCount(1)
    })

    it('should finish span when response is not in flow mode', (done) => {
      // nock doesn't emit socket close
      http.get('http://risingstack.com', (res) => {
        res.socket.on('close', () => {
          expect(mockChildSpan.finish).to.have.callCount(1)
          done()
        })
      })
        .on('error', done)
    })

    it('should start and finish span with https', async () => {
      nock('https://risingstack.com')
        .get('/')
        .reply(200)

      await axios.get('https://risingstack.com/')

      expect(cls.startChildSpan).to.be.calledWith(tracer, instrumentation.OPERATION_NAME, {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          [Tags.HTTP_URL]: 'https://risingstack.com/',
          [Tags.HTTP_METHOD]: 'GET'
        }
      })
      expect(mockChildSpan.setTag).to.have.calledWith(Tags.HTTP_STATUS_CODE, 200)
      expect(mockChildSpan.finish).to.have.callCount(1)
    })

    it('should flag wrong status codes as error', () => {
      nock('http://risingstack.com')
        .get('/')
        .reply(400)

      return axios.get('http://risingstack.com')
        .catch(() => {
          expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
        })
    })

    it('should flag error', () => {
      nock('http://risingstack.com')
        .get('/')
        .replyWithError('My Error')

      return axios.get('http://risingstack.com')
        .catch((err) => {
          expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
          expect(mockChildSpan.log).to.be.calledWith({
            event: 'error',
            'error.object': err,
            message: err.message,
            stack: err.stack
          })
          expect(mockChildSpan.finish).to.have.callCount(1)
        })
    })
  })

  describe('httpTimings option', () => {
    beforeEach(() => {
      instrumentation.patch(http, [tracer], { httpTimings: true })
    })

    afterEach(() => {
      instrumentation.unpatch(http)
    })

    it('should add HTTP timings when response is in flow mode', async function () {
      this.sandbox.spy(tracer, 'startSpan')

      await axios.get('http://risingstack.com')

      expect(tracer.startSpan).to.be.calledWith(instrumentation.OPERATION_NAME_DNS_LOOKUP)
      expect(tracer.startSpan).to.be.calledWith(instrumentation.OPERATION_NAME_CONNECTION)
      expect(tracer.startSpan).to.be.calledWith(instrumentation.OPERATION_NAME_TIME_TO_FIRST_BYTE)
      expect(tracer.startSpan).to.be.calledWith(instrumentation.OPERATION_NAME_CONTENT_TRANSFER)
    })
  })
})
