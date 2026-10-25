export function safeMode(env: { SOLANA_CLUSTER?: string; SOLANA_RPC_URL?: string; DARAJA_MODE?: string }) {
  if ((env.SOLANA_CLUSTER ?? 'devnet') !== 'devnet') throw new Error('Mainnet rejected')
  if ((env.DARAJA_MODE ?? 'local') !== 'local') throw new Error('Only local simulation is implemented; external payment processing disabled')
  if (env.SOLANA_RPC_URL && env.SOLANA_RPC_URL !== 'https://api.devnet.solana.com') throw new Error('Unverified RPC rejected')
}
export function quoteCurve(sold: number, supply: number, quantity: number, side: 'buy'|'sell') {
 if (![sold,supply,quantity].every(Number.isSafeInteger) || quantity<1 || quantity>10000 || sold<0 || sold>supply || (side==='buy' && sold+quantity>supply) || (side==='sell' && quantity>sold)) throw new Error('Invalid curve quantity')
 const total=side==='buy'?quantity*100+quantity*(2*sold+quantity-1)/2:quantity*100+quantity*(2*sold-quantity-1)/2
 const spot=side==='buy'?100+sold:99+sold
 const impactBps=Math.round(Math.abs(total/quantity-spot)/spot*10000)
 return {amount:total,quantity,side,fee:0,spotPriceCents:spot,priceImpactBps:impactBps,slippageBps:0,limit:total,recordType:'simulated_trade' as const}
}
