'use strict'

const redis = require('redis')
const { expect } = require('chai')
const { Tracer, Tags } = require('opentracing')
const cls = require('../cls')
const instrumentation = require('./redis')

describe('instrumentation: redis', () => {
  let tracer
  let mockChildSpan
  let client

  beforeEach(function () {
    tracer = new Tracer()
    mockChildSpan = {
      setTag: this.sandbox.spy(),
      log: this.sandbox.spy(),
      finish: this.sandbox.spy()
    }

    this.sandbox.stub(cls, 'startChildSpan').callsFake(() => mockChildSpan)

    instrumentation.patch(redis, [tracer])

    client = redis.createClient()
  })

  afterEach(() => {
    client.quit()
    instrumentation.unpatch(redis)
  })

  describe('#patch', () => {
    it('should start and finish span', (done) => {
      client.set('string key', 'string val', (err, replies) => {
        expect(replies).to.be.eql('OK')
        expect(cls.startChildSpan).to.be.calledWith(tracer, 'redis_set', {
          tags: {
            [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
            [Tags.DB_TYPE]: instrumentation.DB_TYPE,
            [Tags.DB_STATEMENT]: 'set string key,string val'
          }
        })

        // FIXME: is this an issue?
        // expect(mockChildSpan.finish).to.have.callCount(1)

        done(err)
      })
    })

    it('should flag error', (done) => {
      client.set('query', (err) => {
        const errorMessage = 'ERR wrong number of arguments for \'set\' command'

        expect(err.message).to.be.equal(errorMessage)
        expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
        expect(mockChildSpan.log).to.be.calledWith({
          event: 'error',
          'error.object': err,
          message: errorMessage,
          stack: err.stack
        })

        // FIXME: is this an issue?
        // expect(mockChildSpan.finish).to.have.callCount(1)

        done()
      })
    })

    it('should skip untracked command', (done) => {
      client.info((err) => {
        expect(cls.startChildSpan).to.have.callCount(0)

        done(err)
      })
    })
  })
})
