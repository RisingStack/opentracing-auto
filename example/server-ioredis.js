'use strict'

const jaeger = require('jaeger-client')
const UDPSender = require('jaeger-client/dist/src/reporters/udp_sender').default
// eslint-disable-next-line
const Instrument = require('../src')

const sampler = new jaeger.ConstSampler(true)
const reporter = new jaeger.RemoteReporter(new UDPSender())
const tracer = new jaeger.Tracer('my-server-ioredis', reporter, sampler, {
  tags: {
    gitTag: 'ioredis'
  }
})
// eslint-disable-next-line
new Instrument({ tracers: [tracer] })

const express = require('express')
const Redis = require('ioredis')

const redis = new Redis()
const port = 3000
const app = express()

app.get('/', async (req, res) => {
  redis.set('foo', 'bar')
  redis.get('foo', (err, result) => res.json(result))
})

app.listen(port, () => {
  // eslint-disable-next-line
  console.log(`Example server ioredis listening on port ${port}!`)
})
