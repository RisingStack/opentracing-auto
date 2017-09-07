'use strict'

const jaeger = require('jaeger-client')
const UDPSender = require('jaeger-client/dist/src/reporters/udp_sender').default
// eslint-disable-next-line
const Instrument = require('../src')

const sampler = new jaeger.RateLimitingSampler(1)
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

const port = 3000

const app = express()

app.get('/', (req, res, next) => {
  http
    .get('http://localhost:3001/site/risingstack', (getRes) => {
      if (getRes.statusCode > 399) {
        res.statusCode = getRes.statusCode
        res.json({ status: 'upstream error' })
        return
      }

      res.on('end', () => {
        res.send('Hello World!')
      })
    })
    .on('error', (err) => {
      next(err)
    })
})

app.use((err, req, res, next) => {
  next(err)
})

app.listen(port, () => {
  // eslint-disable-next-line
  console.log(`Example server 1 listening on port ${port}!`)
})
