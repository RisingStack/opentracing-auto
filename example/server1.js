'use strict'

const jaeger = require('jaeger-client')
const UDPSender = require('jaeger-client/dist/src/reporters/udp_sender').default
// eslint-disable-next-line
const Instrument = require('../src')

const sampler = new jaeger.ConstSampler(true)
const reporter = new jaeger.RemoteReporter(new UDPSender())
const tracer = new jaeger.Tracer('my-server-1', reporter, sampler, {
  tags: {
    gitTag: 'foo'
  }
})
// eslint-disable-next-line
const instrument = new Instrument({
  tracers: [tracer],
  httpTimings: true
})

// eslint-disable-next-line
const http = require('http')
// eslint-disable-next-line
const express = require('express')
// eslint-disable-next-line
const request = require('request-promise-native')

const port = 3000

const app = express()

app.get('/', async (req, res, next) => {
  try {
    await request('http://localhost:3001/site/risingstack')
  } catch (err) {
    next(err)
    return
  }
  res.json({
    status: 'ok'
  })
})

app.use((err, req, res, next) => {
  res.statusCode = 500
  res.json({
    message: err.message
  })
  next()
})

app.listen(port, () => {
  // eslint-disable-next-line
  console.log(`Example server 1 listening on port ${port}!`)
})
