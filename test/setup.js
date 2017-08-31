'use strict'

const sinon = require('sinon')
const chai = require('chai')
const sinonChai = require('sinon-chai')

// postgres
const pgUser = process.env.PG_USER || process.env.USER || 'root'
const pgPw = process.env.PG_PASSWORD || ''
const pgDB = process.env.PG_DATABASE || 'test'
process.env.PG_URI = process.env.PG_URI || `postgres://${pgUser}:${pgPw}@localhost:5432/${pgDB}`

// mysql
const mysqlUser = process.env.MYSQL_USER || 'root'
const mysqlPw = process.env.MYSQL_PASSWORD || ''
const mysqlDB = process.env.MYSQL_DATABASE || 'test'
process.env.MYSQL_URI = process.env.MYSQL_URI || `mysql://${mysqlUser}:${mysqlPw}@localhost:3306/${mysqlDB}`

// mongodb
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test'

before(() => {
  chai.use(sinonChai)
})

beforeEach(function beforeEach () {
  this.sandbox = sinon.sandbox.create()
})

afterEach(function afterEach () {
  this.sandbox.restore()
})
