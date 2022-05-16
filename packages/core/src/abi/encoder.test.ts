import { Interface } from "@ethersproject/abi"
import { expect } from "chai"
import { Wallet } from "ethers"
import { writeFileSync } from "fs"
import MultiCall2 from "../constants/abi/MultiCall2.json"
import { createEncoder } from "./encoder"

const ethersAbi = new Interface(MultiCall2.abi)

const calls = [
  ...[...Array(10)].map(() => ethersAbi.encodeFunctionData('getCurrentBlockGasLimit')),
  ...[...Array(10)].map((_, i) => ethersAbi.encodeFunctionData('getBlockHash', [i])),
]


const address = Wallet.createRandom().address;

function split(calldata: string) {
  let res = calldata.slice(0, 10) + '\n'
  let ptr = 10
  while(ptr < calldata.length) {
    res += calldata.slice(ptr, ptr + 64) + '\n'
    ptr += 64
  }
  return res
}

describe.only('Fast ABI encoder', () => {
  describe('Encoder', () => {
    it.only('can encode multicall v2', () => {
      const calldata = ethersAbi.encodeFunctionData('tryAggregate', [true, calls.map(calldata => [address, calldata])])
      // console.log(calldata.length)
      
      
      const manual = encodeTryAggregate(true, calls.map(calldata => [address, calldata]))
      
      writeFileSync('expected.txt', split(calldata))
      writeFileSync('actual.txt', split(manual))

      expect(manual).to.eq(calldata)
    })

    it.only('bench ethers', () => {
      const callsLong = [...Array(20)].flatMap(() => calls)
      formatBench(bench(() => {
        ethersAbi.encodeFunctionData('tryAggregate', [true, callsLong.map(calldata => [address, calldata])])
      }))
    })

    it.only('bench manual', () => {
      const callsLong = [...Array(20)].flatMap(() => calls)
      formatBench(bench(() => {
        encodeTryAggregate(true, callsLong.map(calldata => [address, calldata]))
      }))
    })
  })
})

const selector = ethersAbi.getSighash('tryAggregate') 

// function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) public view returns (tuple(bool success, bytes returnData)[])
function encodeTryAggregate(b: boolean, calls: [string, string][]) {
  const buffLength = (buf: string) => (buf.length - 2) / 2
  const bufPaddedLength = (buf: string) => Math.ceil(buffLength(buf) / 32) * 32

  let res = selector;

  // head params
  res += b ? '0000000000000000000000000000000000000000000000000000000000000001' : '0000000000000000000000000000000000000000000000000000000000000000';
  res += '0000000000000000000000000000000000000000000000000000000000000040'

  res += calls.length.toString(16).padStart(64, '0')
  let offset = calls.length * 0x20
  for(const call of calls) {
    res += offset.toString(16).padStart(64, '0')
    offset += 3 * 0x20 + bufPaddedLength(call[1])
  }

  for(const call of calls) {
    res += '000000000000000000000000' + call[0].slice(2).toLowerCase()
    res += '0000000000000000000000000000000000000000000000000000000000000040'
    res += buffLength(call[1]).toString(16).padStart(64, '0')
    res += call[1].slice(2).padEnd(bufPaddedLength(call[1]) * 2, '0')
  }

  return res
}


interface BenchResult {
  iterations: number
  timePerIter: bigint;
  iterPerSec: bigint;
}

function bench(func: () => void): BenchResult {
  let totalElapsed = 0n;
  let iterations = 0;
  while(iterations++ < 10_000) {
    const before = process.hrtime.bigint();
    func();
    const after = process.hrtime.bigint();
    totalElapsed += after - before;
    if(totalElapsed > 1_000_000_000n) {
      break;
    }
  }

  const timePerIter = totalElapsed / BigInt(iterations);
  const iterPerSec = 1_000_000_000n * BigInt(iterations) / totalElapsed;
  return { iterations, timePerIter, iterPerSec };
}

function formatBench(result: BenchResult, label?: string) {
  console.log(`${label || 'bench'}: ${result.iterPerSec} iterations/sec, ${result.timePerIter} ns/iter, made ${result.iterations} iters`);
}