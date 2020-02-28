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

const express = require('express')
const axios = require('axios')

const port = 3000

const app = express()

app.get('/', async (req, res, next) => {
  try {
    await axios.get('http://localhost:3001/site/risingstack')
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
