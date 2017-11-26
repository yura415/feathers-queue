'use strict'

class Worker {
  constructor (options) {
    this.app = options.app
    this.job = options.job
    this.payload = options.job.data
  }

  process () {
    return Promise.reject(new Error('not implemented'))
  }
}

module.exports = Worker
