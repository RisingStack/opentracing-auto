'use strict'

const path = require('path')
const debug = require('debug')('opentracing-auto:instrument')
const semver = require('semver')
const _ = require('lodash')
const hook = require('require-in-the-middle')
const uuidv4 = require('uuid/v4')
let instrumentations = require('./instrumentation')

/**
* @class Instrument
*/
class Instrument {
  /**
   * constructor
   * @params {Object} options
   * @param {Array<Tracer>} options.tracers - tracers
   * @param {Boolean} httpTimings - if enable httpTimings, defaults to false
   * @param {Array<String>} enables - enable instruments
   */
  constructor ({
    tracers = [],
    httpTimings = false,
    enables = []
  }) {
    if (!_.isArray(tracers)) {
      throw new Error('tracers is required')
    }

    this._tracers = tracers
    this._instrumented = new Map()
    this._options = Object.assign(
      {},
      {
        httpTimings,
        enables
      }
    )

    this._tracers = this._tracers.map((tracer) => {
      tracer.__clsNamespace = uuidv4()

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
    // Use all if not specify
    if (this._options.enables && this._options.enables.length) {
      instrumentations = _.pick(instrumentations, this._options.enables)
    }

    const instrumentedModules = _.uniq(instrumentations.map((instrumentation) => instrumentation.module))

    // Instrunent modules: hook require
    hook(instrumentedModules, (moduleExports, moduleName, moduleBaseDir) =>
      this.hookModule(moduleExports, moduleName, moduleBaseDir))

    debug('Patched')
  }

  /**
  * Manually hook a module, useful when require-in-the-middle does not work,
  * such as when you are using ESM.
  * @method hookModule
  * @param {Object} module
  * @param {string} moduleName
  * @param {string} moduleBaseDir
  */
  hookModule (moduleExports, moduleName, moduleBaseDir) {
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
        // Core modules don't have version number
        if (_.isUndefined(moduleVersion) || !_.isArray(instrumentation.supportedVersions)) {
          return true
        }

        return instrumentation.supportedVersions.some((supportedVersion) =>
          semver.satisfies(moduleVersion, supportedVersion))
      })
      .forEach((instrumentation) => {
        instrumentation.patch(moduleExports, this._tracers, this._options)
        this._instrumented.set(moduleExports, instrumentation)

        debug(`Instrumentation "${instrumentation.name}" applied on module "${moduleName}"`, {
          moduleVersion,
          supportedVersions: instrumentation.supportedVersions
        })
      })

    return moduleExports
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
