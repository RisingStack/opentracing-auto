'use strict'

const request = require('super-request')
const { expect } = require('chai')
const { Tracer, Tags } = require('opentracing')
const express = require('express')
const cls = require('../cls')
const instrumentation = require('./expressError')

describe('instrumentation: expressError', () => {
  let tracer
  let mockRootSpan
  let mockChildSpan

  beforeEach(function () {
    tracer = new Tracer()
    mockRootSpan = {
      setTag: this.sandbox.spy()
    }
    mockChildSpan = {
      setTag: this.sandbox.spy(),
      log: this.sandbox.spy(),
      finish: this.sandbox.spy()
    }

    this.sandbox.stub(cls, 'getRootSpan').callsFake(() => mockRootSpan)
    this.sandbox.stub(cls, 'startChildSpan').callsFake(() => mockChildSpan)

    instrumentation.patch(express, [tracer])
  })

  afterEach(() => {
    instrumentation.unpatch(express)
  })

  describe('#patch', () => {
    it('should catch error when error middleware is presented', async () => {
      const err = new Error('My Error')
      const app = express()

      app.get('/', (req, res, next) => next(err))
      app.use((error, req, res, next) => {
        res.statusCode = 500
        res.end()
        next()
      })

      await request(app)
        .get('/')
        .expect(500)
        .end()

      expect(cls.startChildSpan).to.be.calledWith(tracer, instrumentation.OPERATION_NAME)

      expect(mockRootSpan.setTag).to.be.calledWith(Tags.ERROR, true)
      expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
      expect(mockChildSpan.log).to.be.calledWith({
        event: 'error',
        'error.object': err,
        message: err.message,
        stack: err.stack
      })
      expect(mockChildSpan.finish).to.have.callCount(1)
    })

    it('should catch error when error middleware is not presented', async function () {
      // express logs to console when there is no error mw presented
      this.sandbox.stub(console, 'error').callsFake(() => {})

      const err = new Error('My Error')
      const app = express()

      app.get('/', (req, res, next) => next(err))
      // dummy middleware, we hook for use
      app.use((req, res, next) => next())

      await request(app)
        .get('/')
        .expect(500)
        .end()

      expect(cls.startChildSpan).to.be.calledWith(tracer, instrumentation.OPERATION_NAME)

      expect(mockRootSpan.setTag).to.be.calledWith(Tags.ERROR, true)
      expect(mockChildSpan.setTag).to.be.calledWith(Tags.ERROR, true)
      expect(mockChildSpan.log).to.be.calledWith({
        event: 'error',
        'error.object': err,
        message: err.message,
        stack: err.stack
      })
      expect(mockChildSpan.finish).to.have.callCount(1)
    })

    it('should catch error once when multiple middleware is applied', async function () {
      // express logs to console when there is no error mw presented
      this.sandbox.stub(console, 'error').callsFake(() => {})

      const err = new Error('My Error')
      const app = express()

      app.get('/', (req, res, next) => next(err))
      // dummy middleware, we hook for use
      app.use((req, res, next) => next())
      app.use((req, res, next) => next())
      app.use((req, res, next) => next())

      await request(app)
        .get('/')
        .expect(500)
        .end()

      expect(mockChildSpan.finish).to.have.callCount(1)
    })
  })
})
