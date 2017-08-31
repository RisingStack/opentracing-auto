# opentracing-auto

[![Build Status](https://travis-ci.org/RisingStack/opentracing-auto.svg?branch=master)](https://travis-ci.org/RisingStack/opentracing-auto)  

Out of the box distributed tracing for [Node.js](https://nodejs.org) applications with OpenTracing.
Support multiple Tracers.

**WARNING: experimental library, do not use in production yet**

## Technologies

- [async_hooks](https://github.com/nodejs/node/blob/master/doc/api/async_hooks.md)
- [OpenTracing](http://opentracing.io/)

**Requirements**

- Node.js, >= v8

## Getting started

```sh
npm install @risingstack/opentracing-auto
```

```js
// must be in the first two lines of your application
const instrument = require('@risingstack/opentracing-auto')
const { Trace } = require('opentracing') // or any OpenTracing compatible tracer like jaeger-client
const tracer1 = new Tracer()
const tracer2 = new Tracer()

const instrument = new Instrument({
  tracers: [tracer1, tracer2]
})

// rest of your code
const express = require('express')
// ...
```

## API

### new Instrument({ tracers: [tracer1, tracer2] })

Instrument modules.

- `tracers`: Array of OpenTracing compatible tracers
  - **required**

### instrument.unpatch()

Unpatch instrumentations

## Instrumentations

- [http, https](https://nodejs.org/api/http.html)
- [express](https://expressjs.com/)
- [restify](http://restify.com/)
- [MongoDB](https://www.npmjs.com/package/mongodb-core)
- [PostgreSQL](https://www.npmjs.com/package/pg)
- [MySQL](https://www.npmjs.com/package/mysql)

## Example

The example require a running MongoDB and Jaeger.

**To start Jaeger and visit it's dashboard:**

```sh
docker run -d -p5775:5775/udp -p6831:6831/udp -p6832:6832/udp -p5778:5778 -p16686:16686 -p14268:14268 jaegertracing/all-in-one:latest && open http://localhost:16686
```

```sh
npm run example
curl http://localhost:3000
open http://localhost:16686
```

![Jaeger Node.js tracing](https://user-images.githubusercontent.com/1764512/26843812-c3198758-4af1-11e7-8aa3-1da55d9e58b6.png)

## Feature ideas

- More database instrumentation: Redis etc.
- More messaging layer instrumentation: HTTP/2, GRPC, RabbitMQ, Kafka etc.
