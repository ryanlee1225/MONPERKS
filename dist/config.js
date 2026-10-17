// Public configuration only. Never put provider secrets or signing keys here.
window.MONPERKS_CONFIG = {
  brand: 'MONPERKS',
  mode: 'demo',
  chain: {id:10143,hex:'0x279f',name:'Monad Testnet',rpc:'https://testnet-rpc.monad.xyz',explorer:'https://testnet.monadscan.com'},
  pointsPerUsdt:1000,
  minimumRedeemPoints:1000,
  socials:{x:'',discord:'',telegram:'',instagram:'',tiktok:''},
  ads:{google:{enabled:false,client:'',slot:''},meta:{enabled:false},tiktok:{enabled:false}},
  // Exact reward token must be verified on the selected network before live use.
  rewardTokenAddress:'',
  distributorAddress:''
};
