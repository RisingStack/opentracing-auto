'use strict'

const express = require('./express')
const expressError = require('./expressError')
const httpClient = require('./httpClient')
const restify = require('./restify')
const koa = require('./koa')
const koaV1 = require('./koa_v1')
const mali = require('./mali')
const grpcCaller = require('./grpc-caller')
const httpsClient = require('./https-client')
const sequelize = require('./sequelize')
const ioredis = require('./ioredis')

module.exports = [
  express,
  expressError,
  httpClient,
  restify,
  koa,
  mali,
  grpcCaller,
  httpsClient,
  koaV1,
  sequelize,
  ioredis
]
