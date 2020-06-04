'use strict'

const express = require('./express')
const expressError = require('./expressError')
const httpClient = require('./httpClient')
const restify = require('./restify')
const koa = require('./koa')
const mali = require('./mali')
const grpcCaller = require('./grpc-caller')

module.exports = [
  express,
  expressError,
  httpClient,
  restify,
  koa,
  mali,
  grpcCaller
]
