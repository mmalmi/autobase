const test = require('tape')
const Hypercore = require('hypercore-x')
const ram = require('random-access-memory')

const { bufferize, causalValues, indexedValues } = require('../helpers')
const AutobaseCore = require('../../core')

test('simple rebase', async t => {
  const output = new Hypercore(ram)
  const writerA = new Hypercore(ram)
  const writerB = new Hypercore(ram)
  const writerC = new Hypercore(ram)

  const base = new AutobaseCore([writerA, writerB, writerC])

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 3; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)

    t.same(indexed.map(v => v.value), bufferize(['a0', 'b1', 'b0', 'c2', 'c1', 'c0']))
    t.same(index.status.added, 6)
    t.same(index.status.removed, 0)
    t.same(output.length, 7)
  }

  // Add 3 more records to A -- should switch fork ordering
  for (let i = 1; i < 4; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), bufferize(['b1', 'b0', 'c2', 'c1', 'c0', 'a3', 'a2', 'a1', 'a0']))
    t.same(index.status.added, 9)
    t.same(index.status.removed, 6)
    t.same(output.length, 10)
  }

  t.end()
})

test('rebasing with causal writes preserves clock', async t => {
  const output = new Hypercore(ram)
  const writerA = new Hypercore(ram)
  const writerB = new Hypercore(ram)
  const writerC = new Hypercore(ram)

  const base = new AutobaseCore([writerA, writerB, writerC])

  // Create three causally-linked forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest())
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest())
  }
  for (let i = 0; i < 3; i++) {
    await base.append(writerC, `c${i}`, await base.latest())
  }

  const index = base.createRebaser(output)
  const indexed = await indexedValues(index)
  t.same(indexed.map(v => v.value), bufferize(['c2', 'c1', 'c0', 'b1', 'b0', 'a0']))
  t.same(index.status.added, 6)
  t.same(index.status.removed, 0)
  t.same(output.length, 7)

  for (let i = 2; i < index.length; i++) {
    const prev = await index.get(i - 1)
    const node = await index.get(i)
    t.true(prev.lte(node))
  }

  t.end()
})

test('does not over-truncate', async t => {
  const output = new Hypercore(ram)
  const writerA = new Hypercore(ram)
  const writerB = new Hypercore(ram)
  const writerC = new Hypercore(ram)

  const base = new AutobaseCore([writerA, writerB, writerC])

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 5; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), bufferize(['a0', 'b1', 'b0', 'c4', 'c3', 'c2', 'c1', 'c0']))
    t.same(index.status.added, 8)
    t.same(index.status.removed, 0)
    t.same(output.length, 9)
  }

  // Add 3 more records to A -- should switch fork ordering (A after C)
  for (let i = 1; i < 4; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), bufferize(['b1', 'b0', 'a3', 'a2', 'a1', 'a0', 'c4', 'c3', 'c2', 'c1', 'c0']))
    t.same(index.status.added, 6)
    t.same(index.status.removed, 3)
    t.same(output.length, 12)
  }

  // Add 1 more record to B -- should not cause any reordering
  await base.append(writerB, 'b2', await base.latest(writerB))

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), bufferize(['b2', 'b1', 'b0', 'a3', 'a2', 'a1', 'a0', 'c4', 'c3', 'c2', 'c1', 'c0']))
    t.same(index.status.added, 1)
    t.same(index.status.removed, 0)
    t.same(output.length, 13)
  }

  t.end()
})

// TODO: Should cutting out a writer then indexing into an existing index be supported?
test.skip('can cut out a writer', async t => {
  const output = new Hypercore(ram)
  const writerA = new Hypercore(ram)
  const writerB = new Hypercore(ram)
  const writerC = new Hypercore(ram)

  const base = new AutobaseCore([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 5; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), bufferize(['a0', 'b1', 'b0', 'c4', 'c3', 'c2', 'c1', 'c0']))
    t.same(index.status.added, 8)
    t.same(index.status.removed, 0)
    t.same(output.length, 9)
  }

  // Cut out writer B. Should truncate 3
  const base2 = new AutobaseCore([writerA, writerC])

  {
    const index = base2.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), bufferize(['a0', 'c4', 'c3', 'c2', 'c1', 'c0']))
    t.same(index.status.added, 2) // a0 and c4 are reindexed
    t.same(index.status.removed, 4) // a0 and c4 are both popped and reindexed
    t.same(output.length, 7)
  }

  t.end()
})

// TODO: Should cutting out a writer then indexing into an existing index be supported?
test.skip('can cut out a writer, causal writes', async t => {
  const output = new Hypercore(ram)
  const writerA = new Hypercore(ram)
  const writerB = new Hypercore(ram)
  const writerC = new Hypercore(ram)

  const base = new AutobaseCore([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest([writerB, writerA]))
  }
  for (let i = 0; i < 5; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const index = await base.rebaseInto(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), ['b1', 'b0', 'a0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(index.added, 8)
    t.same(index.removed, 0)
    t.same(output.length, 9)
  }

  // Cut out writer B. Should truncate 3
  const base2 = new AutobaseCore([writerA, writerC])

  {
    const index = await base2.rebaseInto(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), ['a0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(index.added, 1) // a0 is reindexed
    t.same(index.removed, 3) // a0, b1, and b0 are popped, a0 is reindexed
    t.same(output.length, 7)
  }

  t.end()
})

// TODO: Should cutting out a writer then indexing into an existing index be supported?
test.skip('can cut out a writer, causal writes interleaved', async t => {
  const output = new Hypercore(ram)
  const writerA = new Hypercore(ram)
  const writerB = new Hypercore(ram)

  const base = new AutobaseCore([writerA, writerB])

  for (let i = 0; i < 6; i++) {
    if (i % 2) {
      await base.append(writerA, `a${i}`, await base.latest([writerA, writerB]))
    } else {
      await base.append(writerB, `b${i}`, await base.latest([writerA, writerB]))
    }
  }

  {
    const index = await base.rebaseInto(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), ['a5', 'b4', 'a3', 'b2', 'a1', 'b0'])
    t.same(index.added, 6)
    t.same(index.removed, 0)
    t.same(output.length, 7)
  }

  const base2 = new AutobaseCore([writerA])

  {
    const output = await causalValues(base2)
    t.same(output.map(v => v.value), ['a5', 'a3', 'a1'])
  }

  {
    const index = await base2.rebaseInto(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), ['a5', 'a3', 'a1'])
    t.same(index.added, 3)
    t.same(index.removed, 6)
    t.same(output.length, 4)
  }

  t.end()
})

test('many writers, no causal writes', async t => {
  const NUM_WRITERS = 10
  const NUM_APPENDS = 11

  const output = new Hypercore(ram)
  const writers = []

  for (let i = 1; i < NUM_WRITERS + 1; i++) {
    const writer = new Hypercore(ram)
    writers.push(writer)
  }

  const base = new AutobaseCore(writers)
  for (let i = 1; i < NUM_WRITERS + 1; i++) {
    const writer = writers[i - 1]
    for (let j = 0; j < i; j++) {
      await base.append(writer, `w${i}-${j}`, await base.latest(writer))
    }
  }

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.length, (NUM_WRITERS * (NUM_WRITERS + 1)) / 2)
  }

  const middleWriter = writers[Math.floor(writers.length / 2)]
  const decodedMiddleWriter = base.decodeInput(middleWriter)

  // Appending to the middle writer NUM_APPEND times should shift it to the back of the index.
  for (let i = 0; i < NUM_APPENDS; i++) {
    await base.append(middleWriter, `new entry ${i}`, await base.latest(middleWriter))
  }

  const index = base.createRebaser(output, {
    unwrap: true
  })
  await index.update()

  for (let i = 1; i < NUM_APPENDS + Math.floor(writers.length / 2) + 1; i++) {
    const latestNode = await index.get(i)
    const val = latestNode.toString('utf-8')
    t.same(val, (await decodedMiddleWriter.get(i)).value.toString('utf-8'))
  }

  t.end()
})

test('double-rebasing is a no-op', async t => {
  const output = new Hypercore(ram)
  const writerA = new Hypercore(ram)
  const writerB = new Hypercore(ram)
  const writerC = new Hypercore(ram)

  const base = new AutobaseCore([writerA, writerB, writerC])

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 3; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), bufferize(['a0', 'b1', 'b0', 'c2', 'c1', 'c0']))
    t.same(index.status.added, 6)
    t.same(index.status.removed, 0)
    t.same(output.length, 7)
  }

  {
    const index = base.createRebaser(output)
    const indexed = await indexedValues(index)
    t.same(indexed.map(v => v.value), bufferize(['a0', 'b1', 'b0', 'c2', 'c1', 'c0']))
    t.same(index.status.added, 0)
    t.same(index.status.removed, 0)
    t.same(output.length, 7)
  }

  t.end()
})

test('remote rebasing selects longest index', async t => {
  const writerA = new Hypercore(ram)
  const writerB = new Hypercore(ram)
  const writerC = new Hypercore(ram)

  const output1 = new Hypercore(ram)
  const output2 = new Hypercore(ram)
  const output3 = new Hypercore(ram)

  const base = new AutobaseCore([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 3; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  await base.rebase(output1)

  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  await base.rebase(output2)

  for (let i = 0; i < 1; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }
  await base.rebase(output3)

  {
    // Should not have to modify output3
    const reader = base.createRebaser([output3], { autocommit: false })
    await reader.update()
    t.same(reader.status.added, 0)
    t.same(reader.status.removed, 0)
    t.same(reader.length, 7)
  }

  {
    // Should not have to add B and C
    const reader = base.createRebaser([output1], { autocommit: false })
    await reader.update()
    t.same(reader.status.added, 3)
    t.same(reader.status.removed, 0)
    t.same(reader.length, 7)
  }

  {
    // Should select output2
    const reader = base.createRebaser([output1, output2])
    await reader.update()
    t.same(reader.status.added, 1)
    t.same(reader.status.removed, 0)
    t.same(reader.length, 7)
  }

  {
    // Should select output3
    const reader = base.createRebaser([output1, output2, output3])
    await reader.update()
    t.same(reader.status.added, 0)
    t.same(reader.status.removed, 0)
    t.same(reader.length, 7)
  }

  t.end()
})
