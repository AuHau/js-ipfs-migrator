/* eslint-env mocha */
/* eslint-disable max-nested-callbacks */
'use strict'

const { expect } = require('aegir/utils/chai')
const cbor = require('cborg')
const migration = require('../../migrations/migration-9')
const { cidToKey, PIN_DS_KEY } = require('../../migrations/migration-9/utils')
const { createStore } = require('../../src/utils')
const CID = require('cids')
const { CarReader } = require('@ipld/car')
const loadFixture = require('aegir/utils/fixtures')
const multibase = require('multibase')
const batch = require('it-batch')
const { isBrowser } = require('wherearewe')

function pinToCid (key, pin) {
  const buf = multibase.encoding('base32upper').decode(key.toString().split('/').pop())
  return new CID(pin.version || 0, pin.codec || 'dag-pb', buf)
}

/**
 * The test data is generated by the file /test/fixtures/generate-car-files.js
 * nb. you need to `npm install ipfs@0.48.1` or below in a place it can `require`
 * it from before running it
 *
 * @type {Record<string, any>}
 */
const pinsets = {
  'basic pinset': {
    car: loadFixture('test/fixtures/pinset-basic.car'),
    root: new CID('QmeKxgcTtiE1XfvwcVf8wc65GgMmZumEtXK6YJKuvf3VYx'),
    pins: 31
  }
}

if (!isBrowser) {
  // this pinset is too big for browser storage
  pinsets['multiple bucket pinset'] = {
    car: loadFixture('test/fixtures/pinset-multiple-buckets.car'),
    root: new CID('QmPGd36dodHj1LQtVWK3LcBVkkVWvfXHEwBHnMpN6tu4BD'),

    // we need at least 8192 pins in order to create a new bucket
    pins: 9031
  }
} else {
  navigator.storage.estimate().then(console.log) // eslint-disable-line no-console
}

const directPins = [
  'QmTgj3HVGSuCckhJURLbaBuhPgArb36MEkRhvh5A7WkiFR',
  'QmaLHnphKK4dBk9TuRe5uQMLztQgJ7VbAeaMR8LErHGkcH',
  'QmRnkQuzXiZSQ5DtXfkSsMtL6PyKTK1HBqUxcD8zmgQLQi',
  'QmfDfLw7rrzedHn7XUc7q5UNPyekREE1hFZrwDWfCNBqg8',
  'QmdSzyeG1wALG5vaDP75f8QqcZWRcU4EDtkeY9LnB38eP2',
  'QmR2iwMMYNcCJNcC73ku37QD3oeeV98jUdT2c2xTsaMYvR',
  'QmQMQrVxtNN5JsWVDWtpFyUkjbm8sNbSjy364pGQdfgSx2',
  'QmNgWoYcmsqs6uUhFysC7BjfKTbYXWnL3edpLQJSsWdRqF',
  'QmUjoRPzozKhjJyxkJaP1rgnp6Lvp43fCA247kyCZsGrhN',
  'QmciA8jujqBJmCsnUgp9uXwW4HEzhg7vH4oPKBeiJu5cXC'
]

const nonDagPbRecursivePins = [
  'bafyreigv7udtoqiouyeelfijgfix42yc44zsqncbmar6jadq7xfs4mgg4e',
  'bafyreif4nfemzpljifoquq5dqjgmddhiv53b66zbr7ul3goeahyhphxyhq',
  'bafyreif2d33ncuaeeb37jnjylbgrgot3acpy5g33rs5rqvbxxmcnei6tua',
  'bafyreig2zauiy4t5ltjwoaf6tjbdnanah4q6qz5ilol3g2bwfrblpcv2bm',
  'bafyreiglffsxrbgxrnlx7wu2n5rsdtd73ih7zf65pormaarrqr26uhczxa',
  'bafyreiboyxf575xniqegisc2okkerinv4gehmlmjrybcfsc4fbnkhn77te',
  'bafyreif7z4hkico2i4kv3q36ix2qb5g4y62q2filnlmqrkzzbkwt3ewtya',
  'bafyreiczsrn43dxizcmwav2gkjbrvngmqcmdywq7nwyb7a3vn5hssudhr4',
  'bafyreiguc2wwt77l63uan4opi6bo6b4uuizbmfhbx3izb5ca7qp2rtp2xi',
  'bafyreihkjb36nob7cezu3m5psjqo46cturnut4fi6x3fj7md4eiefsinsy'
]

const nonDagPbDirectPins = [
  'bafyreibuvrik6o3lyantziriciygeb6jbwocvd7kwtozrjo37n6dki5aom',
  'bafyreicn35rsdstjo2574mtympyup2a6rh7tb5pip3seg6s6j6epe7jduu',
  'bafyreiang6jqksnq7ka3vajo3jvxo624nzt2wskn422sdrjl2cbald4ckq',
  'bafyreie3f7gzq4dvdqitq75bxtkocjpfcny5dta3dzg4gi76q6ql3blfrq',
  'bafyreic54zlg7mq5tojnpj73qc5acjyyzz2kxksmtceavb6q4fryeksp6i',
  'bafyreih3zs3htz6qun62ogeqdlf2iyyw3zkfngelfjgrft3bjeeqegxwiq',
  'bafyreigebeyuxa37qu7p2bxpjn7wlf4itkgwfjiqzetraihvhobs6z4fw4',
  'bafyreigpw4hiw2uggape2nkd7dts3x7lpkpczmmfojtzofmodjkjfcikxq',
  'bafyreifumpjckmmnsiqmpfg4vsxgihjb3pwtygdjqiu6ztabswguko52xm',
  'bafyreiamyrx7wjuxyewnjsu6vfj2u4jzqz2tclukgzwuinic6zbukazgci'
]

async function bootstrapBlocks (blockstore, datastore, { car: carBuf, root: expectedRoot }) {
  const car = await CarReader.fromBytes(carBuf)
  const [actualRoot] = await car.getRoots()

  expect(actualRoot.toString()).to.equal(expectedRoot.toString())
  await blockstore.open()

  const concurrency = 50

  for await (const blocks of batch(car.blocks(), concurrency)) {
    const batch = blockstore.batch()

    for await (const { cid, bytes } of blocks) {
      batch.put(cidToKey(new CID(cid.toString())), bytes)
    }

    await batch.commit()
  }

  await blockstore.close()

  await datastore.open()
  await datastore.put(PIN_DS_KEY, actualRoot.multihash.bytes)
  await datastore.close()
}

async function assertPinsetRootIsPresent (datastore, pinset) {
  await datastore.open()
  const buf = await datastore.get(PIN_DS_KEY)
  await datastore.close()
  const cid = new CID(buf)
  expect(cid.toString()).to.equal(pinset.root.toString())
}

module.exports = (setup, cleanup, repoOptions) => {
  describe('migration 9', function () {
    this.timeout(1000 * 1000)

    let dir
    let datastore
    let blockstore
    let pinstore

    beforeEach(async () => {
      dir = await setup()

      blockstore = createStore(dir, 'blocks', repoOptions)
      datastore = createStore(dir, 'datastore', repoOptions)
      pinstore = createStore(dir, 'pins', repoOptions)
    })

    afterEach(async () => {
      await cleanup(dir)
    })

    describe('empty repo', () => {
      describe('forwards', () => {
        it('should migrate pins forward', async () => {
          await migration.migrate(dir, repoOptions, () => {})
        })
      })

      describe('backwards', () => {
        it('should migrate pins backward', async () => {
          await migration.revert(dir, repoOptions, () => {})
        })
      })
    })

    Object.keys(pinsets).forEach(title => {
      const pinset = pinsets[title]
      const pinned = {}

      describe(title, () => {
        describe('forwards', () => {
          beforeEach(async () => {
            await bootstrapBlocks(blockstore, datastore, pinset)
            await assertPinsetRootIsPresent(datastore, pinset)
          })

          it('should migrate pins forward', async () => {
            await migration.migrate(dir, repoOptions, () => {})

            await pinstore.open()
            let migratedDirect = 0
            let migratedNonDagPBRecursive = 0

            for await (const { key, value } of pinstore.query({})) {
              pinned[key] = value

              const pin = cbor.decode(value)

              const cid = pinToCid(key, pin)

              if (directPins.includes(`${cid}`) || nonDagPbDirectPins.includes(`${cid}`)) {
                expect(pin.depth).to.equal(0)
                migratedDirect++
              } else {
                expect(pin.depth).to.equal(Infinity)
              }

              if (nonDagPbRecursivePins.includes(`${cid}`)) {
                migratedNonDagPBRecursive++
              }
            }

            await pinstore.close()

            expect(migratedDirect).to.equal(directPins.length + nonDagPbDirectPins.length)
            expect(migratedNonDagPBRecursive).to.equal(nonDagPbRecursivePins.length)
            expect(Object.keys(pinned)).to.have.lengthOf(pinset.pins)

            await datastore.open()
            await expect(datastore.has(PIN_DS_KEY)).to.eventually.be.false()
            await datastore.close()
          })
        })

        describe('backwards', () => {
          beforeEach(async () => {
            await pinstore.open()

            for (const key of Object.keys(pinned)) {
              await pinstore.put(key, pinned[key])
            }

            await pinstore.close()
          })

          it('should migrate pins backward', async () => {
            await migration.revert(dir, repoOptions, () => {})

            await assertPinsetRootIsPresent(datastore, pinset)
          })
        })
      })
    })
  })
}
