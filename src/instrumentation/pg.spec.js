const pg = require('pg')
const knex = require('knex')
const { expect } = require('chai')
const { Tracer, Tags } = require('opentracing')
const cls = require('../cls')
const instrumentation = require('./pg')

describe('instrumentation: pg', () => {
  let tracer
  let mockChildSpan
  let db

  beforeEach(function () {
    tracer = new Tracer()
    mockChildSpan = {
      setTag: this.sandbox.spy(),
      log: this.sandbox.spy(),
      finish: this.sandbox.spy()
    }

    this.sandbox.stub(cls, 'startChildSpan').callsFake(() => mockChildSpan)

    instrumentation.patch(pg, [tracer])

    db = knex({
      client: 'pg',
      connection: process.env.PG_URI
    })
  })

  afterEach(() => {
    instrumentation.unpatch(pg)
  })

  describe('#patch', () => {
    it('should start and finish span', async () => {
      const query = 'SELECT 1 AS result'
      const { rows } = await db.raw(query)

      expect(rows).to.be.eql([{ result: 1 }])

      expect(cls.startChildSpan).to.be.calledWith(tracer, `${instrumentation.OPERATION_NAME}_query`, {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          [Tags.DB_TYPE]: instrumentation.DB_TYPE,
          [Tags.DB_STATEMENT]: query
        }
      })

      // FIXME: only with ../instrument.js tests together
      // expect(mockChildSpan.finish).to.have.callCount(1)
    })

    it('should flag error', async () => {
      const query = 'SELECT invalid AS result'

      try {
        await db.raw(query)
      } catch (err) {
        expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
        expect(mockChildSpan.log).to.be.calledWith({
          event: 'error',
          'error.object': err,
          message: 'column "invalid" does not exist',
          stack: err.stack
        })
        // FIXME: only with ../instrument.js tests together
        // expect(mockChildSpan.finish).to.have.callCount(1)
        return
      }

      throw new Error('Uncaught exception')
    })
  })
})
