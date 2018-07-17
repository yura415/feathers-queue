/* eslint-disable no-unused-vars */
'use strict'

const assert = require('assert')
const Queue = require('bee-queue')
const { filterQuery } = require('@feathersjs/commons')
const serializeError = require('serialize-error')

const JobTypes = [ 'active', 'waiting', 'delayed', 'succeeded', 'failed' ]
const CustomEvents = [ 'completed', 'failed', 'progress' ]

class QueueService {
	constructor(options) {
		this.options = Object.assign({}, options)
		this.events = options.events || [ ...CustomEvents ]
		this.paginate = options.paginate || {}
		this.queue = {}
		this._queues = []
	}

	async setup(app) {
		this.app = app
	}

	/**
	 * @param params
	 * @returns {*}
	 */
	find(params) {
		const paginate =
			params && typeof params.paginate !== 'undefined'
				? params.paginate
				: this.paginate
		const result = this._find(params, query => filterQuery(query, paginate))

		if (!paginate.default) {
			return result.then(page => page.data)
		}

		return result
	}

	get(id, params) {
		const queue = this._queue(params)
		return queue.getJob(id).then(job => serialize(job))
	}

	remove(id, params) {
		const queue = this._queue(params)
		if (Array.isArray(id)) {
			return Promise.all(id.map(id => this._remove(id, queue)))
		}
		return this._remove(id, queue)
	}

	/**
	 * @param {Payload} payload
	 * @param {feathers.Params & {queue: string, job?:JobOptions}} params
	 * @returns {Promise.<Job>}
	 */
	create(payload, params) {
		const queue = this._queue(params)
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
		if (params.jobId) {
			job.setId(params.jobId)
		}
		return job.save().then(job => (params.raw ? job : serialize(job)))
	}

	/**
	 * @param {QueueConfig} config
	 */
	setupQueue(config) {
		const queue = new Queue(
			config.name,
			Object.assign({}, this.options.queue, config.options),
		)
		if (config.workerClass) {
			queue.process(config.concurrency, job => {
				return new config.workerClass(this.app, job).process()
			})
		} else if (config.processFn) {
			assert.ok(config.processFn)
			queue.process(config.concurrency, config.processFn)
		}
		queue.on('error', err => {
			this.emit('error', { queue: config.name, err: serializeError(err) })
		})
		queue.on('ready', () => {
			this.emit('ready', { queue: config.name })
		})
		queue.on('job succeeded', (jobId, result) =>
			this.emit('completed', { jobId, result }),
		)
		queue.on('job failed', (jobId, err) =>
			this.emit('failed', { jobId, err: serializeError(err) }),
		)
		queue.on('job progress', (jobId, progress) =>
			this.emit('progress', { jobId, progress }),
		)
		this.queue[config.name] = queue
		this._queues.push(config.name)
	}

	/**
	 * @param params
	 * @param getFilter
	 * @returns {Promise.<*>}
	 * @private
	 */
	async _find(params, getFilter = filterQuery) {
		let { filters } = getFilter(params.query || {})

		if (!params.type) {
			throw new Error('params.type must be specified')
		}

		if (!~JobTypes.indexOf(params.type)) {
			throw new Error(
				'invalid type. valid options are: ' +
					JobTypes.map(v => '"' + v + '"').join(', '),
			)
		}

		const queue = this._queue(params)
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
		const limit = filters.$limit || total - skip

		const data = await queue.getJobs(params.type, {
			start: skip,
			end: skip + limit,
		})

		return {
			total,
			limit: filters.$limit,
			skip: filters.$skip || 0,
			data: params.provider && !params.raw ? data.map(serialize) : data,
		}
	}

	_remove(id, queue) {
		return queue.getJob(id).then(job => job.remove())
	}

	_queue(params) {
		let queue
		if (!params.queue && this._queues.length === 1) {
			queue = this.queue[this._queues[0]]
		} else if (params.queue) {
			queue = this.queue[params.queue]
		}
		assert.ok(queue, 'no such queue ' + params.queue)
		return queue
	}
}

module.exports = options => new QueueService(options)
module.exports.Service = QueueService

function serialize(job) {
	return (
		job && {
			id: job.id,
			data: job.data,
			progress: job.progress,
			status: job.status,
		}
	)
}
