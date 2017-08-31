'use strict'

const { expect } = require('chai')
const { Tracer } = require('opentracing')
const Instrument = require('./instrument')
const instrumentationExpress = require('./instrumentation/express')
const instrumentationHTTPClient = require('./instrumentation/httpClient')

describe('Instrument', () => {
  let instrument

  afterEach(() => {
    instrument.unpatch()
  })

  describe('constructor', () => {
    it('should hook require and apply instrumentation', function () {
      this.sandbox.spy(instrumentationExpress, 'patch')
      this.sandbox.spy(instrumentationHTTPClient, 'patch')

      const tracer1 = new Tracer()
      const tracer2 = new Tracer()
      instrument = new Instrument({ tracers: [tracer1, tracer2] })

      // eslint-disable-next-line
      const express = require('express')
      // eslint-disable-next-line
      const http = require('http')
      // eslint-disable-next-line
      const https = require('https')

      expect(instrumentationExpress.patch).to.be.calledWith(express, [tracer1, tracer2])
      expect(instrumentationHTTPClient.patch).to.be.calledWith(http, [tracer1, tracer2])
    })

    it('should not apply instrumentation for not supported version', function () {
      this.sandbox.stub(instrumentationExpress, 'supportedVersions').value(['1.x'])
      this.sandbox.spy(instrumentationExpress, 'patch')

      const tracer = new Tracer()
      instrument = new Instrument({ tracers: [tracer] })

      // eslint-disable-next-line
      const express = require('express')

      expect(instrumentationExpress.patch).to.be.callCount(0)
    })
  })
})
