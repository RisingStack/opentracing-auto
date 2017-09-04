'use strict'

const path = require('path')
const debug = require('debug')('opentracing-auto:instrument')
const semver = require('semver')
const _ = require('lodash')
const hook = require('require-in-the-middle')
const instrumentations = require('./instrumentation')

/**
* @class Instrument
*/
class Instrument {
  constructor ({
    tracers = []
  }) {
    if (!_.isArray(tracers)) {
      throw new Error('tracers is required')
    }

    this._tracers = tracers
    this._instrumented = new Map()

    this._tracers = this._tracers.map((tracer) => {
      tracer.__clsNamespace = Symbol('tracer')

      return tracer
    })

    this.patch()

    debug(`Instrument created with ${this._tracers.length} tracer(s)`)
  }

  /**
  * Applies specified fn of instrumentations
  * @method patch
  */
  patch () {
    const instrumentedModules = _.uniq(instrumentations.map((instrumentation) => instrumentation.module))

    // Instrunent modules: hook require
    hook(instrumentedModules, (moduleExports, moduleName, moduleBaseDir) => {
      let moduleVersion

      // Look for version in package.json
      if (moduleBaseDir) {
        const packageJSON = path.join(moduleBaseDir, 'package.json')
        // eslint-disable-next-line
        moduleVersion = require(packageJSON).version
      }

      // Apply instrumentations
      instrumentations
        .filter((instrumentation) => instrumentation.module === moduleName)
        .filter((instrumentation) => {
          if (_.isUndefined(moduleVersion) || !_.isArray(instrumentation.supportedVersions)) {
            return true
          }

          return instrumentation.supportedVersions.some((supportedVersion) =>
            semver.satisfies(moduleVersion, supportedVersion)
          )
        })
        .forEach((instrumentation) => {
          instrumentation.patch(moduleExports, this._tracers)
          this._instrumented.set(moduleExports, instrumentation)

          debug(`Instrumentation "${instrumentation.name}" applied on module "${moduleName}"`, {
            moduleVersion,
            supportedVersions: instrumentation.supportedVersions
          })
        })

      return moduleExports
    })

    debug('Patched')
  }

  /**
  * Applies unpatch fn of instrumentations
  * @method unpatch
  */
  unpatch () {
    this._instrumented.forEach((instrumentation, moduleExports) => {
      instrumentation.unpatch(moduleExports)
    })

    debug('Unpatched')
  }
}

module.exports = Instrument
