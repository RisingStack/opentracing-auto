'use strict'

const jaeger = require('jaeger-client')
const UDPSender = require('jaeger-client/dist/src/reporters/udp_sender').default
// eslint-disable-next-line
const Instrument = require('../src')

const sampler = new jaeger.ConstSampler(true)
const reporter = new jaeger.RemoteReporter(new UDPSender())
const tracer = new jaeger.Tracer('my-server-pg', reporter, sampler, {
  tags: {
    gitTag: 'foobar'
  }
})
// eslint-disable-next-line
const instrument = new Instrument({ tracers: [tracer] })

const knex = require('knex')
const express = require('express')

// postgres config
const pgUser = process.env.PG_USER || process.env.USER || 'root'
const pgPw = process.env.PG_PASSWORD || ''
const pgDB = process.env.PG_DATABASE || 'postgres'

const pg = knex({
  client: 'pg',
  connection: process.env.PG_URI || `postgres://${pgUser}:${pgPw}@localhost:5432/${pgDB}`
})

const port = 3000

const app = express()

app.get('/', async (req, res, next) => {
  const result = await pg('pg_catalog.pg_type')
    .select('typname')
    .orderBy('typname')
    .limit(10)

  res.json(result)
  next()
})

app.use((err, req, res, next) => {
  next(err)
})

app.listen(port, () => {
  // eslint-disable-next-line
  console.log(`Example server PG listening on port ${port}!`)
})
