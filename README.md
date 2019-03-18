# ZumPay™: Blockchain Relay Agent (ZBRA)

This repository contains the worker that relays new transactions from the ZumPay™ platform to the ZumCoin blockchain.

It is also used by the [ZumPay™ Blockchain Cache API](https://github.com/zumpay-io/zum-blockchain-cache-api) to relay transactions, submit blocks, and request blocktemplates from the network.

## Prerequisites

* [RabbitMQ](https://www.rabbitmq.com/)
* [Node.js](https://nodejs.org/) LTS

## Foreword

We know that this documentation needs cleaned up and made easier to read. We'll compile it as part of the full documentation as the project moves forward.

## Setup

1) Clone this repository to wherever you'd like the API to run:

```bash
git clone https://github.com/zumpay-io/zum-blockchain-relay-agent
```

2) Install the required Node.js modules

```bash
cd zum-blockchain-relay-agent && npm install
```

3) Use your favorite text editor to change the values as necessary in `config.json`

```javascript
{
  "daemon": {
    "host": "localhost",
    "port": 17935
  },
  "queues": {
    "relayAgent": "request.network"
  }
}
```

4) Fire up the script

```bash
export RABBIT_PUBLIC_SERVER=localhost
export RABBIT_PUBLIC_USERNAME=yourrabbitmqusername
export RABBIT_PUBLIC_PASSWORD=yourrabbitmqpassword
node index.js
```

5) Optionally, install PM2 or another process manager to keep the service running.

```bash
npm install -g pm2@latest
pm2 startup
pm2 start index.js --name zum-blockchain-relay-agent -i max
pm2 save
```

###### (c) 2019 ZumPay™ Development Team
