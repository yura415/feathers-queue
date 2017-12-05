'use strict'

const assert = require('assert')
const Queue = require('bee-queue')
const filter = require('feathers-query-filters')

const JobTypes = ['active', 'waiting', 'completed', 'failed', 'delayed']
const CustomEvents = ['completed', 'failed']

class QueueService {
  constructor (options) {
    this.options = Object.assign({}, options)
    this.events = options.events || [...CustomEvents]
    this.paginate = options.paginate || {}
    this.queue = {}
    this._queues = []
  }

  async setup (app) {
    this.app = app
  }

  /**
   * @param params
   * @returns {*}
   */
  find (params) {
    const paginate = (params && typeof params.paginate !== 'undefined') ? params.paginate : this.paginate
    const result = this._find(params, query => filter(query, paginate))

    if (!paginate.default) {
      return result.then(page => page.data)
    }

    return result
  }

  get (id, params) {
    let queue
    if (!params.queue && this._queues.length === 1) {
      queue = this.queue[this._queues[0]]
    } else if (params.queue) {
      queue = this.queue[params.queue]
    }
    assert.ok(queue, 'no queue ' + params.queue)

    return queue.getJob(id)
      .then(job => params.provider ? serialize(job) : job)
  }

  /**
   * @param {Payload} payload
   * @param {feathers.Params & {queue: string, job?:JobOptions}} params
   * @returns {Promise.<Job>}
   */
  create (payload, params) {
    let queue
    if (!params.queue && this._queues.length === 1) {
      queue = this.queue[this._queues[0]]
    } else if (params.queue) {
      queue = this.queue[params.queue]
    }
    assert.ok(queue, 'no queue ' + params.queue)
    const job = queue.createJob(payload)
    const jobOptions = Object.assign({}, this.options.job, params.job)
    if (!isNaN(jobOptions.retries)) {
      job.retries(jobOptions.retries)
    }
    if (jobOptions.backoff) {
      assert.ok(jobOptions.backoff.strategy)
      assert.ok(jobOptions.backoff.delayFactor)
      job.backoff(jobOptions.backoff.strategy, jobOptions.backoff.delayFactor)
    }
    if (!isNaN(+jobOptions.delayUntil)) {
      job.delayUntil(jobOptions.delayUntil)
    }
    if (!isNaN(jobOptions.timeout)) {
      job.timeout(jobOptions.timeout)
    }
    return job.save()
      .then(job => params.provider ? serialize(job) : job)
  }

  /**
   * @param {QueueConfig} config
   */
  setupQueue (config) {
    const queue = this.queue[config.name] = new Queue(config.name, Object.assign({}, this.options.queue, config.options))
    if (config.workerClass) {
      queue.process(config.concurrency, (job) => {
        return new config.workerClass(this.app, job).process()
      })
    } else {
      assert.ok(config.processFn)
      queue.process(config.concurrency, config.processFn)
    }
    queue.on('job succeeded', (job, result) => this.emit('completed', job.id, result))
    queue.on('job failed', (job, err) => this.emit('failed', job.id, err))
    this._queues.push(config.name)
  }

  /**
   * @param params
   * @param getFilter
   * @returns {Promise.<*>}
   * @private
   */
  async _find (params, getFilter = filter) {
    let { filters } = getFilter(params.query || {})

    if (!params.type) {
      throw new Error('params.type must be specified')
    }

    if (!~JobTypes.indexOf(params.type)) {
      throw new Error('invalid type. valid options are: ' + JobTypes.map(v => '"' + v + '"').join(', '))
    }

    let queue
    if (!params.queue && this._queues.length === 1) {
      queue = this.queue[this._queues[0]]
    } else if (params.queue) {
      queue = this.queue[params.queue]
    }
    assert.ok(queue, 'no queue ' + params.queue)
    const counts = await queue.checkHealth()
    const total = counts[params.type]

    if (filters.$limit === 0) {
      return {
        total,
        limit: filters.$limit,
        skip: filters.$skip || 0,
        data: [],
      }
    }

    const skip = filters.$skip || 0
    const limit = filters.$limit || (total - skip)

    const data = await queue.getJobs(params.type, { start: skip, end: skip + limit })

    return {
      total,
      limit: filters.$limit,
      skip: filters.$skip || 0,
      data: params.provider ? data.map(serialize) : data,
    }
  }
}

module.exports = options => new QueueService(options)
module.exports.Service = QueueService

function serialize (job) {
  return {
    id: job.id,
    data: job.data,
    progress: job.progress,
    status: job.status,
  }
}
