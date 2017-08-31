'use strict'

const mongodbCore = require('mongodb-core')
const monk = require('monk')
const { expect } = require('chai')
const { Tracer, Tags } = require('opentracing')
const cls = require('../cls')
const instrumentation = require('./mongodbCore')

describe('instrumentation: mongodb-core', () => {
  let tracer
  let mockChildSpan
  let db
  let dbSites

  beforeEach(function (done) {
    tracer = new Tracer()
    mockChildSpan = {
      setTag: this.sandbox.spy(),
      log: this.sandbox.spy(),
      finish: this.sandbox.spy()
    }

    this.sandbox.stub(cls, 'startChildSpan').callsFake(() => mockChildSpan)

    instrumentation.patch(mongodbCore, [tracer])

    db = monk('localhost/mydb', done)
    dbSites = db.get('sites')
  })

  afterEach(() => {
    instrumentation.unpatch(mongodbCore)
  })

  describe('#patch', () => {
    it('should start and finish span', async () => {
      const site = {
        name: 'risingstack',
        url: 'https://risingstack.com'
      }
      const result = await dbSites.insert(site)

      expect(result).to.be.eql(site)

      expect(cls.startChildSpan).to.be.calledWith(tracer, `${instrumentation.OPERATION_NAME}_insert`)
      expect(mockChildSpan.setTag).to.have.calledWith(Tags.DB_TYPE, instrumentation.DB_TYPE)
      expect(mockChildSpan.setTag).to.have.calledWith(Tags.DB_STATEMENT, JSON.stringify([site]))
    })

    it('should flag error', async () => {
      db.close() // trigger error

      try {
        await dbSites.insert({
          name: 'risingstack',
          url: 'https://risingstack.com'
        })
      } catch (err) {
        expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
        expect(mockChildSpan.log).to.be.calledWith({
          event: 'error',
          'error.object': err,
          message: err.message,
          stack: err.stack
        })
        return
      }

      throw new Error('Uncaught exception')
    })
  })
})
