import * as feathers from 'feathers'

interface Worker {
  constructor(app: feathers.Application, job)

  process(): Promise
}

type QueueConfig = {
  name: string
  concurrency: number
  workerClass?: Worker
  processFn?: (job) => Promise
  options?: {
    prefix?: string
    stallInterval?: number
    nearTermWindow?: number
    delayedDebounce?: number
    redis?: {
      host?: string
      port?: number
      db?: number
      options?: {}
    }
    isWorker?: boolean
    getEvents?: boolean
    sendEvents?: boolean
    storeJobs?: boolean
    ensureScripts?: boolean
    activateDelayedJobs?: boolean
    removeOnSuccess?: boolean
    removeOnFailure?: boolean
    redisScanCount?: number
  }
}

type Payload = any

type JobOptions = {
  id?: string
  retries?: number
  backoff?: {
    strategy: string
    delayFactor: number
  }
  delayUntil?: Date
  timeout?: number
}
