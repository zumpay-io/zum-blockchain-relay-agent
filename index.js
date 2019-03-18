// Copyright (c) 2019 ZumPay Development Team
//
// Please see the included LICENSE file for more information.

'use strict'

const Config = require('./config.json')
const RabbitMQ = require('amqplib')
const cluster = require('cluster')
const util = require('util')
const cpuCount = Math.ceil(require('os').cpus().length / 8)
const ZumCoind = require('zumcoin-rpc').ZumCoind
const daemon = new ZumCoind({
  host: Config.daemon.host,
  port: Config.daemon.port
})

const publicRabbitHost = process.env.RABBIT_PUBLIC_SERVER || 'localhost'
const publicRabbitUsername = process.env.RABBIT_PUBLIC_USERNAME || ''
const publicRabbitPassword = process.env.RABBIT_PUBLIC_PASSWORD || ''

function log (message) {
  console.log(util.format('%s: %s', (new Date()).toUTCString(), message))
}

function spawnNewWorker () {
  cluster.fork()
}

/* Helps us to build the RabbitMQ connection string */
function buildConnectionString (host, username, password) {
  log(util.format('Setting up connection to %s@%s...', username, host))
  var result = ['amqp://']

  if (username.length !== 0 && password.length !== 0) {
    result.push(username + ':')
    result.push(password + '@')
  }

  result.push(host)

  return result.join('')
}

if (cluster.isMaster) {
  console.log('Starting ZumPay Blockchain Relay Agent...')

  for (var cpuThread = 0; cpuThread < cpuCount; cpuThread++) {
    spawnNewWorker()
  }

  cluster.on('exit', (worker, code, signal) => {
    log(util.format('worker %s died', worker.process.pid))
    spawnNewWorker()
  })
} else if (cluster.isWorker) {
  (async function () {
    try {
      /* Set up our access to the necessary RabbitMQ systems */
      var publicRabbit = await RabbitMQ.connect(buildConnectionString(publicRabbitHost, publicRabbitUsername, publicRabbitPassword))
      var publicChannel = await publicRabbit.createChannel()

      await publicChannel.assertQueue(Config.queues.relayAgent, {
        durable: true
      })

      publicChannel.prefetch(1)

      /* Looks like we received a request */
      publicChannel.consume(Config.queues.relayAgent, async function (message) {
        if (message !== null) {
          /* Parse the incoming message */
          const payload = JSON.parse(message.content.toString())

          if (payload.rawTransaction) {
            /* Attempt to send the transaction to the requested daemon */
            daemon.sendRawTransaction({
              tx: payload.rawTransaction
            }).then((response) => {
              /* Send the daemon's response back to the worker that requested
               we do the work for them */
              publicChannel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(response)), {
                correlationId: message.properties.correlationId
              })

              /* We got a response to the request, we're done here */
              log(util.format('[INFO] Worker #%s sent transaction [%s] via %s:%s', cluster.worker.id, payload.hash, Config.daemon.host, Config.daemon.port))
              return publicChannel.ack(message)
            }).catch((error) => {
              /* An error occurred */
              log(util.format('[INFO] Worker #%s failed to send transaction [%s] via %s:%s', cluster.worker.id, payload.hash, Config.daemon.host, Config.daemon.port))

              const reply = {
                error: error.toString()
              }

              publicChannel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(reply)), {
                correlationId: message.properties.correlationId
              })

              return publicChannel.ack(message)
            })
          } else if (payload.blockBlob) {
            /* Attempt to send the block to the requested daemon */
            daemon.submitBlock({
              blockBlob: payload.blockBlob
            }).then((response) => {
              /* Send the daemon's response back to the worker that requested
               we do the work for them */
              publicChannel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(response)), {
                correlationId: message.properties.correlationId
              })

              /* We got a response to the request, we're done here */
              log(util.format('[INFO] Worker #%s submitted block [%s] via %s:%s', cluster.worker.id, payload.blockBlob, Config.daemon.host, Config.daemon.port))
              return publicChannel.ack(message)
            }).catch((error) => {
              /* An error occurred */
              log(util.format('[INFO] Worker #%s failed to submit block [%s] via %s:%s', cluster.worker.id, payload.blockBlob, Config.daemon.host, Config.daemon.port))

              const reply = {
                error: error.toString()
              }

              publicChannel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(reply)), {
                correlationId: message.properties.correlationId
              })

              return publicChannel.ack(message)
            })
          } else if (payload.walletAddress && payload.reserveSize) {
            /* Attempt to get the block template from the requested daemon */
            daemon.getBlockTemplate({
              walletAddress: payload.walletAddress,
              reserveSize: payload.reserveSize
            }).then((response) => {
              /* Send the daemon's response back to the worker that requested
               we do the work for them */
              publicChannel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(response)), {
                correlationId: message.properties.correlationId
              })

              /* We got a response to the request, we're done here */
              log(util.format('[INFO] Worker #%s received blocktemplate for [%s] via %s:%s', cluster.worker.id, payload.walletAddress, Config.daemon.host, Config.daemon.port))
              return publicChannel.ack(message)
            }).catch((error) => {
              /* An error occurred */
              log(util.format('[INFO] Worker #%s failed retrieve blocktemplate for [%s] via %s:%s', cluster.worker.id, payload.walletAddress, Config.daemon.host, Config.daemon.port))

              const reply = {
                error: error.toString()
              }

              publicChannel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(reply)), {
                correlationId: message.properties.correlationId
              })

              return publicChannel.ack(message)
            })
          } else {
            /* We don't know how to handle this */
            return publicChannel.nack(message)
          }
        }
      })
    } catch (e) {
      log(util.format('Error in worker #%s: %s', cluster.worker.id, e.toString()))
      cluster.worker.kill()
    }

    log(util.format('Worker #%s awaiting requests', cluster.worker.id))
  }())
}
