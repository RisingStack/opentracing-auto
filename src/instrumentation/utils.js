'use strict'

exports.getOriginUrlWithoutQs = function (originUrl) {
  return originUrl && originUrl.split(/\?/)[0]
}
