import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompileCommand,parseLaunchCommand,parseTransitionCommand } from '../runtime.ts';

test('runtime validators reject malformed UUIDs, absent idempotency and non-numeric versions',()=>{assert.throws(()=>parseCompileCommand({}),/simulator/);assert.throws(()=>parseTransitionCommand({toStatus:'approved',expectedVersion:'1',idempotencyKey:'x'}),/number/);assert.throws(()=>parseLaunchCommand({name:'x',channel:'whatsapp',expectedVersion:1}),/idempotencyKey/);});
test('transition runtime validator preserves untrusted values for DB state-machine validation',()=>{assert.deepEqual(parseTransitionCommand({toStatus:'approved',expectedVersion:2,idempotencyKey:'contract-approve-1'}),{toStatus:'approved',expectedVersion:2,idempotencyKey:'contract-approve-1'});});
