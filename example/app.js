/* eslint-disable no-console */
const feathers = require('@feathersjs/feathers')
const express = require('@feathersjs/express')
const socketio = require('@feathersjs/socketio')
const handler = require('@feathersjs/errors/handler')
const service = require('../src')

// Create a feathers instance.
const app = express(feathers())
// Enable Socket.io
	.configure(socketio())
// Turn on JSON parser for REST services
	.use(express.json())
// Turn on URL-encoded parser for REST services
	.use(express.urlencoded({ extended: true }))

app.use(
	'/example-task',
	service({
		name: 'example-task',
		paginate: {
			default: 10,
			max: 50,
		},
	}),
)

app.use(handler())

app.service('example-task').setupQueue({
	name: 'example-task-test',
	concurrency: 10,
	workerClass: require('./example-worker'),
	options: {
		removeOnSuccess: false,
		removeOnFailure: false,
	},
})

app
	.service('example-task')
	.create(
		{
			test: 123,
		},
		{
			queue: 'example-task-test',
		},
	)
	.then(job => {
		job.on('succeeded', result => console.log('job succeeded', result))
		job.on('retrying', err => console.error('job retrying', err))
		job.on('failed', err => console.error('job failed', err))
	})
	.catch(err => console.error(err))

// Start the server
const server = app.listen(3030)
server.on('listening', function() {
	console.log('Feathers Tasks service running on 127.0.0.1:3030')
})
