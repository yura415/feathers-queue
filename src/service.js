'use strict'

const RethinkDBService = require('feathers-rethinkdb').Service
const Queue = require('bull')
const filter = require('feathers-query-filters')
const Worker = require('./worker')

const JobEvents = ['completed', 'stalled', 'progress', 'failed', 'error']
const JobTypes = ['active', 'waiting', 'completed', 'failed', 'delayed']

class HybridQueueService extends RethinkDBService {
  constructor (options) {
    super(options)
    this.events = options.events || [...JobEvents]
  }

  async setup (app) {
    super.setup(app)
    this._queue = new Queue(this.options.name, this.options.queueOptions)
    this._queue
      .on('stalled', (job) => this.emit('stalled', job))
      .on('progress', (job, progress) => this.emit('progress', job, progress))
      .on('failed', (job, err) => this.emit('failed', job, err))
      .on('error', (err) => this.emit('error', err))

    if (typeof this.options.concurrency !== 'undefined') {
      this.processJobs(this.options.concurrency)
    }
  }

  processJobs (concurrency) {
    return this._queue.process(concurrency, this._process.bind(this))
  }

  create (payload, params) {
    return this._queue.add(payload, Object.assign({}, this.options.jobOptions, params.jobOptions))
  }

  process (job) {
    const worker = new this.options.workerClass({ app: this.app, job })
    return worker.process()
  }

  _process (job) {
    return this.process(job)
      .then(data => super.create({ payload: job.data, data, createdAt: new Date(), jobId: job.id }, {}))
      .then(doc => {
        this.emit('completed', doc)
        return doc._id.toString()
      })
  }

  find (params) {
    if (params.query.$type) {
      const paginate = (params && typeof params.paginate !== 'undefined') ? params.paginate : this.paginate
      const result = this._findInQueue(params, query => filter(query, paginate))

      if (!paginate.default) {
        return result.then(page => page.data)
      }

      return result
    } else {
      return super.find(params)
    }
  }

  async _findInQueue (params, getFilter = filter) {
    let { filters, query } = getFilter(params.query || {})

    if (!query.$type) {
      throw new Error('query.$type must be specified')
    }

    if (!~JobTypes.indexOf(query.$type)) {
      throw new Error('invalid query.$type. valid options are: ' + JobTypes.map(v => '"' + v + '"').join(', '))
    }

    filters.$type = query.$type

    const counts = await this._queue.getJobCounts()
    const total = counts[filters.$type]

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

    const getJobFn = `get${filters.$type[0].toUpperCase()}${filters.$type.slice(1)}`
    const data = await this._queue[getJobFn](skip, skip + limit)

    return {
      total,
      limit: filters.$limit,
      skip: filters.$skip || 0,
      data,
    }
  }
}

module.exports = options => new HybridQueueService(options)
module.exports.Service = HybridQueueService
module.exports.Worker = Worker
