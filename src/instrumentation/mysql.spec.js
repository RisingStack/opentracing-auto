'use strict'

const mysql = require('mysql')
const knex = require('knex')
const { expect } = require('chai')
const { Tracer, Tags } = require('opentracing')
const cls = require('../cls')
const instrumentation = require('./mysql')

describe('instrumentation: mysql', () => {
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

    instrumentation.patch(mysql, [tracer])

    db = knex({
      client: 'mysql',
      connection: process.env.MYSQL_URI
    })
  })

  afterEach(() => {
    instrumentation.unpatch(mysql)
  })

  describe('#patch', () => {
    it('should start and finish span', async () => {
      const query = 'SELECT 1 AS result'
      const result = await db.raw(query)

      expect(result[0]).to.be.eql([{ result: 1 }])

      expect(cls.startChildSpan).to.be.calledWith(tracer, `${instrumentation.OPERATION_NAME}_query`)
      expect(mockChildSpan.setTag).to.have.calledWith(Tags.DB_TYPE, instrumentation.DB_TYPE)
      expect(mockChildSpan.setTag).to.have.calledWith(Tags.DB_STATEMENT, query)

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
          message: 'ER_BAD_FIELD_ERROR: Unknown column \'invalid\' in \'field list\'',
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
