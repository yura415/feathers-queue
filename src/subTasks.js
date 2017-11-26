'use strict'

class SubTasks {
  constructor (job) {
    this._job = job
    this._subTasks = []
  }

  create (payload, options, queue) {
    return queue.add(Object.assign({}, payload, { _parent: this._job.id }), options)
      .then(job => {
        this._subTasks.push(job)
        return job
      })
  }

  async restore (queue) {
    const jobCounts = await queue.getJobCounts()
    this._restoreIfChild(await queue.getDelayed(0, jobCounts.delayed))
    this._restoreIfChild(await queue.getWaiting(0, jobCounts.waiting))
    this._restoreIfChild(await queue.getActive(0, jobCounts.active))
  }

  wait () {
    return Promise.all(this._subTasks.map(job => job.finished()))
  }

  _restoreIfChild (jobs) {
    for (let job of jobs) {
      if (job.data._parent === this._job.id) {
        this._subTasks.push(job)
      }
    }
  }
}

module.exports = job => new SubTasks(job)
