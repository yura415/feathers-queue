/* eslint-disable no-console */
'use strict'
class ExampleWorker {
  constructor(app, job) {
    this.app = app
    this.job = job
  }

  async process() {
    console.log('hello from example worker')

    const result = await this.app.service('example-task').find({
      type: 'active',
      queue: 'example-task-test',
      paginate: false,
    })

    for (let job of result) {
      if (job.id === this.job.id)
        console.log('i think i just found myself!', job.id)
    }

    return { some: 'result' }
  }
}

module.exports = ExampleWorker
