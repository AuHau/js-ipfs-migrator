'use strict'

/* eslint-disable no-console */

// nb. must be ipfs@0.48.0 or below
const IPFS = require('ipfs')
const {
  CID
} = IPFS
const { Key } = require('interface-datastore')
const PIN_DS_KEY = new Key('/local/pins')
const fs = require('fs')
const { CarWriter } = require('@ipld/car')
const path = require('path')
const { Readable } = require('stream')

const TO_PIN = 9000

const main = async () => {
  const ipfs = await IPFS.create({
    profile: 'lowpower'
  })

  const directPins = []

  for (let i = TO_PIN; i < TO_PIN + 10; i++) {
    const data = `hello-${i}`
    const { cid } = await ipfs.add(data, { pin: false })

    await ipfs.pin.add(cid, {
      recursive: false
    })

    directPins.push(cid)
  }

  console.info('const directPins = [')
  console.info(' ', directPins.map(cid => `'${cid}'`).join(',\n  '))
  console.info(']')

  const nonDagPbRecursivePins = []

  for (let i = TO_PIN + 10; i < TO_PIN + 20; i++) {
    const data = { derp: `hello-${i}` }
    const cid = await ipfs.dag.put(data)

    await ipfs.pin.add(cid, {
      recursive: true
    })

    nonDagPbRecursivePins.push(`${cid}`)
  }

  console.info('const nonDagPbRecursivePins = [')
  console.info(' ', nonDagPbRecursivePins.join(',\n  '))
  console.info(']')

  const nonDagPbDirectPins = []

  for (let i = TO_PIN + 20; i < TO_PIN + 30; i++) {
    const data = { derp: `hello-${i}` }
    const cid = await ipfs.dag.put(data)

    await ipfs.pin.add(cid, {
      recursive: false
    })

    nonDagPbDirectPins.push(`${cid}`)
  }

  console.info('const nonDagPbDirectPins = [')
  console.info(' ', nonDagPbDirectPins.join(',\n  '))
  console.info(']')

  console.info('const pinsets = {')

  await writeCar('basic pinset', true)

  for (let i = 0; i < TO_PIN; i++) {
    const data = `hello-${i}`
    await ipfs.add(data)
  }

  await writeCar('multiple buckets pinset')

  console.info('}')

  await ipfs.stop()

  async function writeCar (pinsetName, more) {
    const fileName = `pinset-${pinsetName.replace(/\s/g, '-').replace('-pinset', '')}.car`

    console.info(`  '${pinsetName}': {`)
    console.info(`    car: loadFixture('test/fixtures/${fileName}'),`)

    const buf = await ipfs.libp2p.datastore.get(PIN_DS_KEY)
    const cid = new CID(buf)

    console.info(`    root: new CID('${cid}'),`)

    const { writer, out } = await CarWriter.create([cid])
    Readable.from(out).pipe(fs.createWriteStream(path.join(__dirname, fileName)))

    await walk(cid, writer)

    let pins = 0

    for await (const _ of ipfs.pin.ls()) { // eslint-disable-line no-unused-vars
      pins++
    }

    console.info(`    pins: ${pins}`)
    console.info(`  }${more ? ',' : ''}`)

    await writer.close()
  }

  async function walk (cid, car, cids = {}) {
    if (cids[cid.toString()]) {
      return
    }

    cids[cid.toString()] = true

    const block = await ipfs.block.get(cid)

    car.put({ cid, bytes: block.data })

    const { value: node } = await ipfs.dag.get(cid)

    if (node.Links) {
      for (const link of node.Links) {
        await walk(link.Hash, car, cids)
      }
    }
  }
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
