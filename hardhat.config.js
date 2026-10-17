// Local Cancun execution tests only. This does not emulate Monad gas pricing.
export default {
  solidity: '0.8.28',
  networks: { test: {type:'edr-simulated',chainId:1337,chainType:'l1',hardfork:'cancun'} }
};
