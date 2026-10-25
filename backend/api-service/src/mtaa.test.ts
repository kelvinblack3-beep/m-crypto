import { beforeAll, afterAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { safeMode, quoteCurve } from './mtaa-domain'

const db=new SQL('postgres://newly@127.0.0.1:55432/postgres',{max:12})
const key=()=>crypto.randomUUID()
const cmd=async(actor:string,action:string,body:Record<string,unknown>,requestKey=key())=>{
 const rows=await db`SELECT api.mtaa_command(${actor},${action},${JSON.stringify(body)}::jsonb,${requestKey}) AS result`
 return rows[0].result
}
const user=async()=>{
 const id=key(); await cmd(id,'setup',{username:'qa-'+id.slice(0,12),terms:true});await cmd(id,'contact-check',{code:'MTAA-TEST'});return id
}
const fund=async(id:string,amount=100000)=>{
 const dep=await cmd(id,'deposit',{amount});return cmd(id,'deposit-confirm',{depositID:dep.id,outcome:'confirmed'})
}
const balance=async(id:string)=>Number((await db`SELECT balance FROM api.mtaa_accounts WHERE id=${id}`)[0].balance)
beforeAll(async()=>{
 await db.unsafe('CREATE SCHEMA IF NOT EXISTS api')
 for(const name of ['0001_aspiring_puma.sql','0002_mtaa_accounting_rules.sql']){
  const file=await Bun.file(new URL('../drizzle/'+name,import.meta.url)).text()
  for(const statement of file.split('--> statement-breakpoint')) if(statement.trim()) await db.unsafe(statement)
 }
},30000)
afterAll(async()=>{await db.close()})
describe('Fail-closed safety and deterministic curve',()=>{
 test('defaults are test only',()=>expect(()=>safeMode({})).not.toThrow())
 test('mainnet cluster rejected',()=>expect(()=>safeMode({SOLANA_CLUSTER:'mainnet-beta'})).toThrow())
 test('mainnet and unverified RPC rejected',()=>expect(()=>safeMode({SOLANA_RPC_URL:'https://api.mainnet-beta.solana.com'})).toThrow())
 test('live and unimplemented sandbox payments rejected',()=>{expect(()=>safeMode({DARAJA_MODE:'live'})).toThrow();expect(()=>safeMode({DARAJA_MODE:'sandbox'})).toThrow()})
 test('curve buy and exact reverse return same amount',()=>{const buy=quoteCurve(0,1000,15,'buy');const sell=quoteCurve(15,1000,15,'sell');expect(buy.amount).toBe(sell.amount);expect(buy.fee).toBe(0)})
 test('curve slippage and price impact distinguished',()=>{const q=quoteCurve(0,1000,50,'buy');expect(q.priceImpactBps).toBeGreaterThan(0);expect(q.slippageBps).toBe(0)})
 test('supply and malformed quantity rejected',()=>{expect(()=>quoteCurve(99,100,2,'buy')).toThrow();expect(()=>quoteCurve(0,100,1,'sell')).toThrow();expect(()=>quoteCurve(0,100,0.5,'buy')).toThrow()})
})
describe('PostgreSQL financial invariants',()=>{
 test('new user balance is zero',async()=>expect(await balance(await user())).toBe(0))
 test('pending deposit never credits wallet',async()=>{const id=await user();await cmd(id,'deposit',{amount:10000});expect(await balance(id)).toBe(0)})
 test('failed simulated deposit never credits',async()=>{const id=await user();const dep=await cmd(id,'deposit',{amount:10000});await cmd(id,'deposit-confirm',{depositID:dep.id,outcome:'failed'});expect(await balance(id)).toBe(0)})
 test('confirmed deposit is balanced and idempotent',async()=>{const id=await user();const dep=await cmd(id,'deposit',{amount:10000});const k=key();const a=await cmd(id,'deposit-confirm',{depositID:dep.id,outcome:'confirmed'},k);const b=await cmd(id,'deposit-confirm',{depositID:dep.id,outcome:'confirmed'},k);expect(a.reference).toBe(b.reference);expect(await balance(id)).toBe(10000);expect(Number((await db`SELECT sum(delta) AS total FROM api.mtaa_lines WHERE journal_id=${a.reference}`)[0].total)).toBe(0)})
 test('duplicate callback with new key cannot credit twice',async()=>{const id=await user();const dep=await cmd(id,'deposit',{amount:10000});await cmd(id,'deposit-confirm',{depositID:dep.id,outcome:'confirmed'});await expect(cmd(id,'deposit-confirm',{depositID:dep.id,outcome:'confirmed'})).rejects.toThrow();expect(await balance(id)).toBe(10000)})
 test('another user cannot confirm deposit',async()=>{const a=await user();const b=await user();const dep=await cmd(a,'deposit',{amount:1000});await expect(cmd(b,'deposit-confirm',{depositID:dep.id,outcome:'confirmed'})).rejects.toThrow()})
 test('successful zero-fee transfer, receipt and recipient credit',async()=>{const a=await user();await fund(a);const prior=await balance('fixture-neighbour');const receipt=await cmd(a,'transfer',{recipient:'mtaa-lab',amount:20000});expect(receipt.fee).toBe(0);expect(await balance(a)).toBe(80000);expect(await balance('fixture-neighbour')).toBe(prior+20000)})
 test('insufficient funds rolls back every record',async()=>{const a=await user();await expect(cmd(a,'transfer',{recipient:'mtaa-lab',amount:100})).rejects.toThrow();expect(await balance(a)).toBe(0);expect((await db`SELECT id FROM api.mtaa_journals WHERE sender=${a}`).length).toBe(0)})
 test('simultaneous spending cannot spend same funds twice',async()=>{const a=await user();await fund(a,10000);const outcomes=await Promise.allSettled([cmd(a,'transfer',{recipient:'mtaa-lab',amount:8000}),cmd(a,'transfer',{recipient:'mtaa-lab',amount:8000})]);expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await balance(a)).toBe(2000)})
 test('concurrent retry posts exactly once',async()=>{const a=await user();await fund(a,10000);const k=key();const [x,y]=await Promise.all([cmd(a,'transfer',{recipient:'mtaa-lab',amount:1000},k),cmd(a,'transfer',{recipient:'mtaa-lab',amount:1000},k)]);expect(x.reference).toBe(y.reference);expect(await balance(a)).toBe(9000)})
 test('request key reused with different amount is rejected',async()=>{const a=await user();await fund(a);const k=key();await cmd(a,'transfer',{recipient:'mtaa-lab',amount:1000},k);await expect(cmd(a,'transfer',{recipient:'mtaa-lab',amount:2000},k)).rejects.toThrow();expect(await balance(a)).toBe(99000)})
 test('self, zero, negative and over-limit transfers rejected',async()=>{const a=await user();await fund(a);const name=(await db`SELECT username FROM api.mtaa_profiles WHERE id=${a}`)[0].username;for(const body of [{recipient:name,amount:100},{recipient:'mtaa-lab',amount:0},{recipient:'mtaa-lab',amount:-100},{recipient:'mtaa-lab',amount:5000001}])await expect(cmd(a,'transfer',body)).rejects.toThrow()})
 test('posted journals and lines are immutable',async()=>{const a=await user();const r=await fund(a);await expect(db`UPDATE api.mtaa_lines SET delta=1 WHERE journal_id=${r.reference}`).rejects.toThrow();await expect(db`DELETE FROM api.mtaa_journals WHERE id=${r.reference}`).rejects.toThrow()})
 test('unbalanced journal transaction rejected at commit',async()=>{const id=key();await expect(db.begin(async(tx)=>{await tx`INSERT INTO api.mtaa_journals(id,kind,actor,sender,recipient,amount) VALUES(${id},'test','x','system:faucet','fixture-neighbour',100)`;await tx`INSERT INTO api.mtaa_lines(id,journal_id,account_id,delta) VALUES(${key()},${id},'system:faucet',-100),(${key()},${id},'fixture-neighbour',99)`})).rejects.toThrow()})
 test('reversals compensate, never rewrite originals',async()=>{const a=await user();const admin=await user();await db`UPDATE api.mtaa_profiles SET role='admin' WHERE id=${admin}`;const receipt=await fund(a,10000);const reversal=await cmd(admin,'reverse',{reference:receipt.reference,reason:'Test reversal'});expect(reversal.amount).toBe(10000);expect(await balance(a)).toBe(0);expect((await db`SELECT id FROM api.mtaa_journals WHERE id=${receipt.reference}`).length).toBe(1);await expect(cmd(admin,'reverse',{reference:receipt.reference,reason:'Duplicate reversal'})).rejects.toThrow()})
 test('user cannot self-promote or reverse',async()=>{const a=await user();await expect(cmd(a,'promote',{role:'admin'})).rejects.toThrow();await expect(cmd(a,'reverse',{reference:'unknown',reason:'Abuse attempt'})).rejects.toThrow()})
 test('trade buy/sell preserve reserve and supply, duplicate rejected',async()=>{const a=await user();await fund(a);const token=await cmd(a,'create-token',{name:'Test community',ticker:'QA'+Math.random().toString(36).slice(2,6).replace(/[0-9]/g,'A').toUpperCase(),description:'A fictitious learning token',supply:1000,riskAccepted:true});const quote=quoteCurve(0,1000,10,'buy');const k=key();await cmd(a,'trade',{tokenID:token.id,side:'buy',quantity:10,limit:quote.amount},k);await cmd(a,'trade',{tokenID:token.id,side:'buy',quantity:10,limit:quote.amount},k);expect(await balance(a)).toBe(100000-quote.amount);await cmd(a,'trade',{tokenID:token.id,side:'sell',quantity:10,limit:quote.amount});expect(await balance(a)).toBe(100000);const t=(await db`SELECT * FROM api.mtaa_tokens WHERE id=${token.id}`)[0];expect(Number(t.sold)).toBe(0);expect(Number(t.reserve)).toBe(0)})
 test('slippage rejection leaves balance and curve unchanged',async()=>{const a=await user();await fund(a);const token=await cmd(a,'create-token',{name:'Slippage test',ticker:'SLIP',description:'A fictitious learning token',supply:1000,riskAccepted:true});await expect(cmd(a,'trade',{tokenID:token.id,side:'buy',quantity:10,limit:1})).rejects.toThrow();expect(await balance(a)).toBe(100000)})
 test('post permissions, moderation and audit',async()=>{const a=await user();const b=await user();const p=await cmd(a,'post',{body:'Learning how test-only communities work.'});await expect(cmd(b,'delete-post',{target:p.id})).rejects.toThrow();await expect(cmd(b,'moderate',{target:p.id,reason:'Unauthorized'})).rejects.toThrow();await expect(cmd(a,'post',{body:'<script>alert(1)</script>'})).rejects.toThrow();expect((await db`SELECT id FROM api.mtaa_audit WHERE actor=${a} AND action='post'`).length).toBe(1)})
 test('all projections match ledger and every journal balances',async()=>{expect((await db`SELECT a.id FROM api.mtaa_accounts a LEFT JOIN api.mtaa_lines l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>coalesce(sum(l.delta),0)`).length).toBe(0);expect((await db`SELECT journal_id FROM api.mtaa_lines GROUP BY journal_id HAVING sum(delta)<>0`).length).toBe(0)})
})
