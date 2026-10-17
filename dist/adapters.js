/* Display inventory adapter. No reward accounting is performed in this module. */
(() => {
  let scriptPromise;
  const config=()=>window.MONPERKS_CONFIG;
  function loadGoogle(client){
    if(scriptPromise)return scriptPromise;
    scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.async=true;script.crossOrigin='anonymous';
      script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(client);
      script.onload=resolve;script.onerror=()=>{scriptPromise=undefined;script.remove();reject(Error('Ad inventory unavailable'))};
      document.head.append(script);
    });return scriptPromise;
  }
  async function mountDisplayAds(){
    const c=config();if(c.mode==='demo'||!c.ads.google.enabled)return {status:'demo_or_disabled'};
    // A deployment must supply an approved CMP-backed consent resolver. The demo
    // preferences checkbox is intentionally insufficient to enable third-party tags.
    if(typeof window.MONPERKS_AD_CONSENT!=='function')return {status:'cmp_required'};
    if(!await window.MONPERKS_AD_CONSENT())return {status:'consent_required'};
    const {client,slot}=c.ads.google;if(!/^ca-pub-\d{16}$/.test(client)||!/^\d{8,12}$/.test(slot))return {status:'publisher_configuration_required'};
    const target=document.querySelector('[data-display-slot]');if(!target||target.dataset.mounted)return {status:'no_available_slot'};
    const ad=document.createElement('ins');ad.className='adsbygoogle';ad.style.display='block';ad.dataset.adClient=client;ad.dataset.adSlot=slot;ad.dataset.adFormat='auto';ad.dataset.fullWidthResponsive='true';
    target.dataset.mounted='true';target.replaceChildren(ad);
    try{await loadGoogle(client);(window.adsbygoogle=window.adsbygoogle||[]).push({});return {status:'requested'}}catch{target.dataset.mounted='';target.textContent='暂无展示广告';return {status:'no_fill'}}
  }
  window.MONPERKS_ADAPTERS={
    google:{mountDisplayAds,redeemableReward:false},
    meta:{status:'publisher_entitlement_required',webTag:null,redeemableReward:false},
    tiktok:{status:'publisher_entitlement_required',webTag:null,redeemableReward:false}
  };
  window.addEventListener('monperks:route',()=>{mountDisplayAds().catch(()=>{})});
})();
