// ══════════════════════════════════════════════════════════════════
//  REMEMBER ME — 24-hour token (H12)
// ══════════════════════════════════════════════════════════════════
// Storage key derived from APP.shortName so it updates automatically when temple changes
const _RMK = ((typeof APP !== "undefined" && APP.shortName) ? APP.shortName.toLowerCase() : "mandir") + "_remember_token";
function saveRememberToken(userId,name,role,email,token){
  try{localStorage.setItem(_RMK,JSON.stringify({userId,name,role,email:email||"",sessionToken:token||"",expiry:Date.now()+24*60*60*1000}));}catch(e){}
}
function loadRememberToken(){
  try{const r=JSON.parse(localStorage.getItem(_RMK)||"null");if(r&&Date.now()<r.expiry)return r;localStorage.removeItem(_RMK);}catch(e){}return null;
}
function clearRememberToken(){try{localStorage.removeItem(_RMK);}catch(e){}}

// Auto-redirect if valid remember-me token exists
(function(){
  try{
    // First check normal session
    const s=JSON.parse(localStorage.getItem("session")||"null");
    if(s&&Date.now()<s.expiry&&(s.role==="Admin"||s.role==="User")){
      location.replace(s.role==="Admin"?"admin.html":"user.html");return;
    }
    // Then check remember-me token
    const t=loadRememberToken();
    if(t&&(t.role==="Admin"||t.role==="User")){
      // [FIX-24H] Previously hardcoded expiry:Date.now()+30*60*1000 here, which
      // silently capped a 24h remember-me session down to 30 min on every page
      // load — even though the remember token itself (t.expiry) is still valid
      // for up to 24h. Reuse t.expiry directly so the client-side session
      // window matches what "remember me" actually promised.
      localStorage.setItem("session",JSON.stringify({userId:t.userId,name:t.name,role:t.role,email:t.email||"",sessionToken:t.sessionToken||"",expiry:t.expiry}));
      location.replace(t.role==="Admin"?"admin.html":"user.html");
    }
  }catch(e){}
})();

// Block back-button re-entry after logout
history.pushState(null,"",location.href);
window.addEventListener("popstate",function(){history.pushState(null,"",location.href);});
window.addEventListener("pageshow",function(e){
  if(e.persisted){
    try{const s=JSON.parse(localStorage.getItem("session")||"null");
      if(!s||Date.now()>s.expiry){localStorage.clear();sessionStorage.clear();}
      else{location.replace(s.role==="Admin"?"admin.html":"user.html");}
    }catch(err){localStorage.clear();}
  }
});

// ══════════════════════════════════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════════════════════════════════
function toast(msg,type){
  const wrap=document.getElementById("_tw");
  const bg=type==="error"?"#e74c3c":type==="warn"?"#e67e22":"#27ae60";
  const icon=type==="error"?"✕":type==="warn"?"⚠":"✓";
  const item=document.createElement("div");item.className="ti";item.style.background=bg;
  const ic=document.createElement("span");ic.style.fontSize="16px";ic.textContent=icon;
  const ms=document.createElement("span");ms.style.flex="1";ms.textContent=msg;
  const bar=document.createElement("div");bar.className="tb";
  item.appendChild(ic);item.appendChild(ms);item.appendChild(bar);wrap.appendChild(item);
  setTimeout(()=>{item.classList.add("to_");setTimeout(()=>item.remove(),320);},3500);
}
function setMsg(id,text,type){
  const el=document.getElementById(id);if(!el)return;
  if(!text){el.className="msg-box";el.innerHTML="";return;}
  el.className="msg-box "+(type||"");
  if(type==="pending"){
    el.innerHTML=`<div class="pend-title">⏳ Registration Under Review</div><div class="pend-sub">${text}</div>`;
  }else{el.textContent=text;}
}
async function sha256(str){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ── getData/postData (login.html has its own copy — no app.js dependency)
// NOTE: Both getData() and postData() are JSONP calls implemented via a
// dynamically-created <script src="..."> tag — this is a GET request under
// the hood in both cases, regardless of the "postData" name. There is no
// real HTTP POST anywhere in this file. Every field passed to postData(),
// including OTPs and password hashes, is serialized into the URL query
// string via URLSearchParams. This is a known constraint of talking to a
// Google Apps Script backend via JSONP (works around Apps Script's CORS
// limitations for true cross-origin POST), but it does mean sensitive
// values can end up in browser history and any server/proxy access logs
// — do not assume anything sent through postData() stays out of the URL.
let _cbId=0;
function getData(action){
  return new Promise((resolve,reject)=>{
    _cbId++;const cb="cb_"+_cbId+"_"+Date.now();
    const s=document.createElement("script");let done=false;
    window[cb]=function(d){if(done)return;done=true;clearTimeout(t);delete window[cb];s.remove();resolve(d);};
    const t=setTimeout(()=>{if(done)return;done=true;try{delete window[cb];s.remove();}catch(e){}reject(new Error("Request timed out."));},20000);
    s.onerror=function(){if(done)return;done=true;clearTimeout(t);try{delete window[cb];s.remove();}catch(e){}reject(new Error("Network error."));};
    s.src=API_URL+"?action="+action+"&callback="+cb;document.body.appendChild(s);
  });
}
function postData(data){
  return new Promise((resolve,reject)=>{
    _cbId++;const cb="cb_post_"+_cbId+"_"+Date.now();
    const s=document.createElement("script");let done=false;
    window[cb]=function(r){if(done)return;done=true;clearTimeout(t);delete window[cb];s.remove();resolve(r);};
    const t=setTimeout(()=>{if(done)return;done=true;try{delete window[cb];s.remove();}catch(e){}reject(new Error("Request timed out."));},20000);
    s.onerror=function(){if(done)return;done=true;clearTimeout(t);try{delete window[cb];s.remove();}catch(e){}reject(new Error("Network error."));};
    s.src=API_URL+"?"+new URLSearchParams(data).toString()+"&callback="+cb;document.body.appendChild(s);
  });
}

function setSessionTokenOnServer(userId,token,rememberMe){
  // Returns a Promise that resolves when the token is confirmed written (or after timeout/error).
  // This allows doLogin() to await it before redirecting, preventing SESSION_TOKEN_MISMATCH
  // and VERIFY_SESSION_ERROR caused by the page loading before the token hits the server.
  // [FIX-24H] rememberMe wasn't previously sent to the server at all, so setSessionToken
  // always granted a 30-min server-side window regardless of the checkbox — the audit
  // log showed SESSION_EXPIRED at 30 min even when "remember me" was checked.
  return new Promise(function(resolve){
    function _attempt(n){
      try{
        const cb="cb_sst_"+Date.now()+"_"+n;
        const s=document.createElement("script");let done=false;
        window[cb]=function(){if(done)return;done=true;try{delete window[cb];s.remove();}catch(e){}resolve();};
        s.onerror=function(){
          if(done)return;done=true;try{delete window[cb];s.remove();}catch(e){};
          if(n===1){setTimeout(()=>_attempt(2),2000);}else{resolve();} // resolve after retry so we don't block forever
        };
        s.src=API_URL+"?action=setSessionToken&userId="+encodeURIComponent(userId)+"&token="+encodeURIComponent(token)+"&rememberMe="+(rememberMe?"1":"0")+"&callback="+cb;
        document.body.appendChild(s);
        // Timeout safety: resolve after 5s max so redirect is never stuck
        setTimeout(()=>{if(!done){done=true;try{delete window[cb];s.remove();}catch(e){}}resolve();},5000);
      }catch(e){resolve();}
    }
    _attempt(1);
  });
}

// ══════════════════════════════════════════════════════════════════
//  LOGIN RATE LIMITING
// ══════════════════════════════════════════════════════════════════
const _LR={
  MAX:5,MS:5*60*1000,KC:"_lr_count",KL:"_lr_lock",
  getCount(){return parseInt(sessionStorage.getItem(this.KC)||"0",10);},
  getLockEnd(){return parseInt(sessionStorage.getItem(this.KL)||"0",10);},
  isLocked(){
    const e=this.getLockEnd();
    if(e&&Date.now()<e)return true;
    if(e&&Date.now()>=e){sessionStorage.removeItem(this.KL);sessionStorage.removeItem(this.KC);}
    return false;
  },
  recordFail(){
    let c=this.getCount()+1;sessionStorage.setItem(this.KC,String(c));
    if(c>=this.MAX){const le=Date.now()+this.MS;sessionStorage.setItem(this.KL,String(le));return{locked:true};}
    return{locked:false,remaining:this.MAX-c};
  },
  clear(){sessionStorage.removeItem(this.KC);sessionStorage.removeItem(this.KL);},
  remainingMs(){return Math.max(0,this.getLockEnd()-Date.now());}
};

function _loginGuard(){
  // Check server-side rate lock (persists across tab close/reopen via sessionStorage)
  try{
    const _srl=parseInt(sessionStorage.getItem("_server_rl_lock")||"0",10);
    if(_srl&&Date.now()<_srl){
      const mins=Math.ceil((_srl-Date.now())/60000);
      setMsg("loginMsg","🔒 Too many failed attempts. Wait "+mins+" min"+(mins>1?"s":"")+" before retrying.","error");
      const btn=document.getElementById("loginBtn");if(btn)btn.disabled=true;
      setTimeout(()=>{sessionStorage.removeItem("_server_rl_lock");const b=document.getElementById("loginBtn");if(b)b.disabled=false;setMsg("loginMsg","","");},_srl-Date.now()+500);
      return false;
    }else if(_srl){sessionStorage.removeItem("_server_rl_lock");}
  }catch(e){}
  const mobile=(document.getElementById("mobile")?.value||"").trim();
  if(mobile&&!/^[6-9]\d{9}$/.test(mobile)){
    setMsg("loginMsg","❌ Please enter a valid 10-digit Indian mobile number.","error");return false;
  }
  if(_LR.isLocked()){
    const mins=Math.ceil(_LR.remainingMs()/60000);
    setMsg("loginMsg","🔒 Too many attempts. Wait "+mins+" min"+(mins>1?"s":"")+" before retrying.","error");
    const btn=document.getElementById("loginBtn");if(btn)btn.disabled=true;
    setTimeout(()=>{if(!_LR.isLocked()){const b=document.getElementById("loginBtn");if(b)b.disabled=false;setMsg("loginMsg","","");}},_LR.remainingMs()+500);
    return false;
  }
  return true;
}
function _loginFail(){
  const r=_LR.recordFail();
  if(r.locked){
    const mins=Math.ceil(_LR.MS/60000);
    setMsg("loginMsg","🔒 Too many failed attempts. Locked for "+mins+" minutes.","error");
    const btn=document.getElementById("loginBtn");if(btn)btn.disabled=true;
  }else if(r.remaining<=2){
    setTimeout(()=>{const el=document.getElementById("loginMsg");if(el&&el.textContent)el.textContent+=" ("+r.remaining+" attempt"+(r.remaining!==1?"s":"")+" remaining)";},50);
  }
}
function _loginSuccess(){_LR.clear();}

// ══════════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════════
async function doLogin(){
  document.getElementById("retryBtn").style.display="none";
  if(!_loginGuard())return;
  const mobile=document.getElementById("mobile").value.trim();
  const password=document.getElementById("password").value;
  if(!mobile||!password){setMsg("loginMsg","Please enter both mobile number and password.","error");return;}
  const btn=document.getElementById("loginBtn");
  btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';
  setMsg("loginMsg","","");
  try{
    const hashedPwd=await sha256(password);
    const res=await new Promise((resolve,reject)=>{
      const cbName="handleLogin_"+Date.now();const s=document.createElement("script");let done=false;
      window[cbName]=function(r){if(done)return;done=true;clearTimeout(timer);delete window[cbName];s.remove();resolve(r);};
      const timer=setTimeout(()=>{if(done)return;done=true;delete window[cbName];s.remove();reject(new Error("Request timed out."));},15000);
      s.onerror=function(){if(done)return;done=true;clearTimeout(timer);delete window[cbName];s.remove();reject(new Error("Network error."));};
      s.src=API_URL+"?action=login&mobile="+encodeURIComponent(mobile)+"&password="+hashedPwd+"&callback="+cbName;
      document.body.appendChild(s);
    });
    if(res.status==="success"){
      const user=res.user;delete user.Password;
      const sessionToken=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,"0")).join("");
      // [FIX-24H] previously hardcoded expiry:Date.now()+30*60*1000 here regardless
      // of the "remember me" checkbox — the client-side session window (used by
      // _checkAdminSession's page-gating) was capped at 30 min even when the box
      // was checked. Now matches the same window granted server-side.
      const rememberMeChecked=document.getElementById("rememberMe").checked;
      const clientTtlMs=rememberMeChecked?24*60*60*1000:30*60*1000;
      const sessionData={userId:user.UserId,name:user.Name,role:user.Role,email:user.Email||"",photoURL:user.PhotoURL||"",expiry:Date.now()+clientTtlMs,sessionToken};
      localStorage.setItem("session",JSON.stringify(sessionData));
      if(rememberMeChecked){
        saveRememberToken(user.UserId,user.Name,user.Role,user.Email||"",sessionToken);
      }
      try{const bc=new BroadcastChannel("mandir_session");bc.postMessage({type:"SESSION_REVOKED",userId:String(user.UserId)});setTimeout(()=>bc.close(),500);}catch(e){}
      // Show last-login info — convert ISO UTC string to IST dd-MM-yyyy HH:mm:ss
      function _fmtLastLogin(raw) {
        if (!raw) return "";
        try {
          if (/^\d{2}-\d{2}-\d{4}/.test(String(raw))) return String(raw); // already formatted
          const d = new Date(raw);
          if (isNaN(d.getTime())) return String(raw);
          const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
          const dd  = String(ist.getUTCDate()).padStart(2,"0");
          const mm  = String(ist.getUTCMonth()+1).padStart(2,"0");
          const hh  = String(ist.getUTCHours()).padStart(2,"0");
          const mi  = String(ist.getUTCMinutes()).padStart(2,"0");
          const ss  = String(ist.getUTCSeconds()).padStart(2,"0");
          return dd+"-"+mm+"-"+ist.getUTCFullYear()+" "+hh+":"+mi+":"+ss;
        } catch(e) { return String(raw); }
      }
      const lastLoginStr = res.lastLogin ? " · Last login: "+_fmtLastLogin(res.lastLogin) : "";
      setMsg("loginMsg","✓ Login successful! Redirecting..."+lastLoginStr,"success");
      _loginSuccess();
      // FIX: Await token write BEFORE redirecting. This prevents SESSION_TOKEN_MISMATCH
      // and VERIFY_SESSION_ERROR that occurred when admin.html loaded and called getAllData/
      // getEmailQuota before the new sessionToken was persisted on the server.
      setSessionTokenOnServer(String(user.UserId),sessionToken,rememberMeChecked).then(function(){
        location.href=user.Role==="Admin"?"admin.html":"user.html";
      });
    }else if(res.status==="pending"){
      setMsg("loginMsg","Your account is awaiting approval. You'll receive an email once the household admin reviews your request.","pending");
    }else if(res.status==="error"){
      // Use server's errorCode to highlight the exact field — no guessing
      const code = res.errorCode || "";
      const msg  = res.message  || "Login failed. Please try again.";
      if(code==="mobile_not_found"){
        setMsg("loginMsg","❌ "+msg,"error");
        document.getElementById("mobile").classList.add("field-err");
      }else if(code==="wrong_password"){
        setMsg("loginMsg","❌ "+msg,"error");
        document.getElementById("password").classList.add("field-err");
      }else if(code==="rate_limited"){
        setMsg("loginMsg","🔒 "+msg,"error");
        // Lock the client button for the full 15-min server window so no further
        // requests fire. This complements the server-side CacheService block.
        const _serverLockMs=15*60*1000;
        const _lockEnd=Date.now()+_serverLockMs;
        try{sessionStorage.setItem("_server_rl_lock",String(_lockEnd));}catch(e){}
        const btn=document.getElementById("loginBtn");if(btn)btn.disabled=true;
        setTimeout(()=>{
          try{sessionStorage.removeItem("_server_rl_lock");}catch(e){}
          const b=document.getElementById("loginBtn");if(b)b.disabled=false;
          setMsg("loginMsg","","");
        },_serverLockMs);
      }else{
        // account_rejected, account_inactive, account_invalid — no field highlight
        setMsg("loginMsg","❌ "+msg,"error");
      }
      _loginFail();
    }else{
      setMsg("loginMsg","❌ Unexpected response from server. Please try again.","error");
      _loginFail();
    }
  }catch(err){
    const errMsg = (err.message||"").toLowerCase();
    let reason = "";
    let icon = "fa-circle-exclamation";
    if(errMsg.includes("timed out")||errMsg.includes("timeout")){
      reason = "⏱️ Request timed out — the server took too long to respond.";
      icon = "fa-clock";
    } else if(errMsg.includes("network error")||errMsg.includes("failed to fetch")||errMsg.includes("networkerror")){
      reason = "📶 Network error — check your internet connection and try again.";
      icon = "fa-wifi";
    } else if(errMsg.includes("offline")||!navigator.onLine){
      reason = "📴 You appear to be offline — please check your connection.";
      icon = "fa-wifi";
    } else if(errMsg.includes("load")||errMsg.includes("script")){
      reason = "🌐 Could not reach the server — you may have a weak connection.";
      icon = "fa-signal";
    } else {
      reason = "⚠️ Connection error — please try again.";
    }
    setMsg("loginMsg","❌ "+reason,"error");
    // Always show retry button for network/connection errors
    const retryBtn = document.getElementById("retryBtn");
    if(retryBtn){
      retryBtn.style.display="block";
      retryBtn.innerHTML='<i class="fa-solid fa-rotate-right"></i> Retry Login';
    }
  }finally{
    btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> Secure Login';
  }
}
document.addEventListener("keydown",e=>{if(e.key==="Enter")doLogin();});
// Clear field-err highlight when user edits login fields
["mobile","password"].forEach(function(id){
  const el=document.getElementById(id);
  if(el)el.addEventListener("input",function(){el.classList.remove("field-err");});
});

// ══════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD — 3-step: mobile → masked email confirm → OTP + new pwd
//  Security: mobile-first lookup, masked email display, 6-box OTP,
//  60s resend cooldown, max 3 OTP sends/15min, fetch POST for reset
// ══════════════════════════════════════════════════════════════════
let _fp = { userId: null, mobile: null, maskedEmail: null, otpSent: false, sendCount: 0, sendLockUntil: 0 };
const FP_MAX_SENDS = 3, FP_LOCK_MS = 15 * 60 * 1000, FP_RESEND_COOLDOWN = 60;

function openForgotModal(){
  _fp = { userId:null, mobile:null, maskedEmail:null, otpSent:false, sendCount:0, sendLockUntil:0 };
  ['resetMsg1','resetMsg2','resetMsg3'].forEach(id=>setMsg(id,'',''));
  const mob = document.getElementById('resetMobile'); if(mob) mob.value = '';
  ['newPassword','newPasswordConfirm'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const sf=document.getElementById('resetStrengthFill'); if(sf)sf.style.width='0';
  const sl=document.getElementById('resetStrengthLabel'); if(sl)sl.textContent='';
  _fpShowStep(1);
  document.getElementById('forgotModal').style.display='flex';
  setTimeout(()=>{const m=document.getElementById('resetMobile');if(m)m.focus();},100);
}
function closeForgotModal(){ document.getElementById('forgotModal').style.display='none'; }
function _fpShowStep(n){
  [1,2,3].forEach(i=>{
    const s=document.getElementById('resetStep'+i); if(s)s.style.display=(i===n?'block':'none');
    const h=document.getElementById('forgotHeader'+i); if(h)h.style.display=(i===n?'':'none');
  });
}

// Step 1: look up by mobile, get masked email back
async function fpLookupMobile(){
  const mobile = (document.getElementById('resetMobile')||{}).value.trim();
  if(!mobile || !/^[6-9]\d{9}$/.test(mobile)){
    setMsg('resetMsg1','❌ Enter a valid 10-digit Indian mobile number.','error'); return;
  }
  const btn = document.getElementById('fpLookupBtn');
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Looking up...';
  setMsg('resetMsg1','','');
  try {
    const res = await postData({action:'lookupMobileForReset', mobile});
    if(res && res.status==='success'){
      _fp.userId = res.userId;
      _fp.mobile = mobile;
      _fp.maskedEmail = res.maskedEmail || '';
      document.getElementById('fpMaskedEmailDisplay').textContent = _fp.maskedEmail;
      document.getElementById('forgotMaskedEmailSub').textContent = 'OTP will be sent to your registered email';
      _fpShowStep(2);
    } else {
      // Generic message — don't reveal if mobile exists or not (security)
      setMsg('resetMsg1','❌ '+(res?.message||'No account found for this mobile number.'),'error');
    }
  } catch(err){ setMsg('resetMsg1','❌ '+(err.message||'Network error. Please try again.'),'error'); }
  finally{ btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-magnifying-glass"></i> Find My Account'; }
}
function fpGoBack(){ _fpShowStep(1); }

// Step 2: send OTP to the masked (server-known) email
async function fpSendOtp(){
  if(Date.now() < _fp.sendLockUntil){
    const mins = Math.ceil((_fp.sendLockUntil - Date.now())/60000);
    setMsg('resetMsg2','🔒 Too many OTP requests. Please wait '+mins+' minute(s).','error'); return;
  }
  if(_fp.sendCount >= FP_MAX_SENDS){
    _fp.sendLockUntil = Date.now() + FP_LOCK_MS; _fp.sendCount = 0;
    setMsg('resetMsg2','🔒 Too many OTP requests. Please wait 15 minutes.','error'); return;
  }
  const btn = document.getElementById('fpSendOtpBtn');
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
  setMsg('resetMsg2','','');
  try {
    const res = await postData({action:'sendForgotPasswordOTP', userId: _fp.userId});
    if(res && res.status==='success'){
      _fp.sendCount++;
      _fp.otpSent = true;
      _fpShowStep(3);
      _fpInitOtpBoxes();
      _fpStartResendTimer();
      setMsg('resetMsg3','','');
    } else {
      setMsg('resetMsg2','❌ '+(res?.message||'Failed to send OTP.'),'error');
    }
  } catch(err){ setMsg('resetMsg2','❌ '+(err.message||'Network error.'),'error'); }
  finally{ btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Send OTP to This Email'; }
}

// Step 3: OTP boxes init
function _fpInitOtpBoxes(){
  const boxes = document.querySelectorAll('#fpOtpBoxes .otp-box');
  boxes.forEach((box,i)=>{
    box.value='';
    box.classList.remove('otp-err');
    box.oninput=function(e){
      const v=e.target.value.replace(/\D/g,'');
      e.target.value=v.slice(0,1);
      if(v && i<5) boxes[i+1].focus();
    };
    box.onkeydown=function(e){
      if(e.key==='Backspace' && !box.value && i>0){ boxes[i-1].focus(); boxes[i-1].value=''; }
    };
    box.onpaste=function(e){
      e.preventDefault();
      const txt=(e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
      boxes.forEach((b,j)=>{ b.value=txt[j]||''; });
      boxes[Math.min(txt.length,5)].focus();
    };
  });
  setTimeout(()=>boxes[0].focus(),100);
}
function _fpGetOtp(){ return Array.from(document.querySelectorAll('#fpOtpBoxes .otp-box')).map(b=>b.value).join(''); }
function _fpMarkOtpErr(){
  document.querySelectorAll('#fpOtpBoxes .otp-box').forEach(b=>b.classList.add('otp-err'));
  setTimeout(()=>document.querySelectorAll('#fpOtpBoxes .otp-box').forEach(b=>b.classList.remove('otp-err')),1200);
}

// Resend cooldown timer
let _fpResendInterval = null;
function _fpStartResendTimer(){
  const btn=document.getElementById('fpResendBtn'); const lbl=document.getElementById('fpResendTimer');
  if(btn) btn.style.display='none';
  let secs=FP_RESEND_COOLDOWN;
  if(lbl) lbl.textContent='Resend in '+secs+'s';
  clearInterval(_fpResendInterval);
  _fpResendInterval=setInterval(()=>{
    secs--;
    if(secs<=0){ clearInterval(_fpResendInterval); if(lbl)lbl.textContent=''; if(btn)btn.style.display=''; }
    else { if(lbl) lbl.textContent='Resend in '+secs+'s'; }
  },1000);
}
async function fpResendOtp(){
  if(Date.now() < _fp.sendLockUntil){ setMsg('resetMsg3','🔒 Rate limited. Please wait.','error'); return; }
  if(_fp.sendCount >= FP_MAX_SENDS){ _fp.sendLockUntil=Date.now()+FP_LOCK_MS; _fp.sendCount=0; setMsg('resetMsg3','🔒 Too many requests. Wait 15 min.','error'); return; }
  const btn=document.getElementById('fpResendBtn'); if(btn){btn.style.display='none';}
  const lbl=document.getElementById('fpResendTimer'); if(lbl)lbl.textContent='Sending...';
  try{
    const res=await postData({action:'sendForgotPasswordOTP', userId:_fp.userId});
    if(res&&res.status==='success'){ _fp.sendCount++; _fpInitOtpBoxes(); _fpStartResendTimer(); toast('OTP resent!'); setMsg('resetMsg3','',''); }
    else { setMsg('resetMsg3','❌ '+(res?.message||'Failed to resend.'),'error'); if(lbl)lbl.textContent=''; if(btn)btn.style.display=''; }
  }catch(err){ setMsg('resetMsg3','❌ '+(err.message||'Network error.'),'error'); if(lbl)lbl.textContent=''; if(btn)btn.style.display=''; }
}

// Step 3: verify OTP + new password → resetPassword POST
async function fpVerifyAndReset(){
  const otp = _fpGetOtp();
  const newPass = (document.getElementById('newPassword')||{}).value;
  const confirmPass = (document.getElementById('newPasswordConfirm')||{}).value;
  if(!otp || otp.length < 6){ _fpMarkOtpErr(); setMsg('resetMsg3','❌ Please enter the 6-digit OTP.','error'); return; }
  if(!newPass || newPass.length < 8){ setMsg('resetMsg3','❌ Password must be at least 8 characters.','error'); return; }
  if(newPass !== confirmPass){ setMsg('resetMsg3','❌ Passwords do not match.','error'); return; }
  const btn = document.getElementById('fpResetBtn');
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
  setMsg('resetMsg3','','');
  try {
    const hashedNew = await sha256(newPass);
    // NOTE: postData() is JSONP-over-GET (see the note near its definition
    // above) — the OTP and hashed new password ARE included in this request's
    // URL, not sent as a POST body. This comment previously claimed otherwise.
    const res = await postData({action:'resetPassword', UserId: _fp.userId, otp, NewPassword: hashedNew});
    if(res && res.status==='success'){
      clearInterval(_fpResendInterval);
      toast('✅ Password updated! Please login again.','success');
      closeForgotModal();
    } else {
      _fpMarkOtpErr();
      setMsg('resetMsg3','❌ '+(res?.message||'Invalid or expired OTP.'),'error');
    }
  } catch(err){ setMsg('resetMsg3','❌ '+(err.message||'Network error.'),'error'); }
  finally{ btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check-circle"></i> Update Password'; }
}

// ══════════════════════════════════════════════════════════════════
//  PASSWORD STRENGTH METER
// ══════════════════════════════════════════════════════════════════
function checkPwdStrength(val,fillId,labelId){
  const fill=document.getElementById(fillId);const label=document.getElementById(labelId);
  if(!fill||!label)return;
  if(!val){fill.style.width="0";label.textContent="";return;}
  let score=0;
  if(val.length>=8)score++;if(val.length>=12)score++;
  if(/[A-Z]/.test(val))score++;if(/[0-9]/.test(val))score++;if(/[^A-Za-z0-9]/.test(val))score++;
  const levels=[{w:"20%",bg:"#e74c3c",t:"Weak"},{w:"40%",bg:"#e67e22",t:"Fair"},{w:"60%",bg:"#f7a01a",t:"Good"},{w:"80%",bg:"#2ecc71",t:"Strong"},{w:"100%",bg:"#27ae60",t:"Very Strong"}];
  const lv=levels[Math.min(score,4)];
  fill.style.width=lv.w;fill.style.background=lv.bg;label.style.color=lv.bg;label.textContent=lv.t;
}

// ══════════════════════════════════════════════════════════════════
//  SHOW/HIDE PASSWORD TOGGLES
// ══════════════════════════════════════════════════════════════════
function _pwdToggle(iconId,inputId){
  const icon=document.getElementById(iconId);const inp=document.getElementById(inputId);
  if(!icon||!inp)return;
  icon.addEventListener("click",function(){
    if(inp.type==="password"){inp.type="text";this.classList.replace("fa-eye","fa-eye-slash");this.style.color="#f7a01a";}
    else{inp.type="password";this.classList.replace("fa-eye-slash","fa-eye");this.style.color="#aaa";}
  });
}
_pwdToggle("togglePassword","password");
_pwdToggle("toggleNewPwd","newPassword");
_pwdToggle("toggleRegPwd","reg_password");
_pwdToggle("toggleRegConfirm","reg_confirm");

// ══════════════════════════════════════════════════════════════════
//  FIELD-LEVEL ERROR HELPERS
// ══════════════════════════════════════════════════════════════════
function setFieldErr(inputId,msg){
  const el=document.getElementById(inputId);if(!el)return;
  el.classList.add("field-err");
  const existing=el.parentElement.nextElementSibling;
  if(existing&&existing.classList.contains("field-err-msg"))existing.remove();
  if(msg){const sp=document.createElement("span");sp.className="field-err-msg";sp.textContent=msg;el.parentElement.insertAdjacentElement("afterend",sp);}
  el.addEventListener("input",function clr(){el.classList.remove("field-err");const e2=el.parentElement.nextElementSibling;if(e2&&e2.classList.contains("field-err-msg"))e2.remove();el.removeEventListener("input",clr);},{once:true});
}
function clearFieldErrors(){
  document.querySelectorAll(".field-err").forEach(e=>e.classList.remove("field-err"));
  document.querySelectorAll(".field-err-msg").forEach(e=>e.remove());
}

// ══════════════════════════════════════════════════════════════════
//  INIT — version footer + lockout-state reflection after page ready
// ══════════════════════════════════════════════════════════════════
window.addEventListener("load",function(){
  // Show version
  if(typeof APP!=="undefined"&&APP.version){
    const vf=document.getElementById("versionFooter");
    if(vf)vf.textContent="v"+APP.version+" · "+(APP.name||"");
  }
  // Reflect any existing lockout state immediately, instead of waiting for
  // the user to click Login once and get bounced by _loginGuard().
  try{
    const _srl=parseInt(sessionStorage.getItem("_server_rl_lock")||"0",10);
    if(_srl&&Date.now()<_srl){
      const mins=Math.ceil((_srl-Date.now())/60000);
      setMsg("loginMsg","🔒 Too many failed attempts. Wait "+mins+" min"+(mins>1?"s":"")+" before retrying.","error");
      const btn=document.getElementById("loginBtn");if(btn)btn.disabled=true;
      setTimeout(()=>{sessionStorage.removeItem("_server_rl_lock");const b=document.getElementById("loginBtn");if(b)b.disabled=false;setMsg("loginMsg","","");},_srl-Date.now()+500);
    }else if(_LR.isLocked()){
      const mins=Math.ceil(_LR.remainingMs()/60000);
      setMsg("loginMsg","🔒 Too many attempts. Wait "+mins+" min"+(mins>1?"s":"")+" before retrying.","error");
      const btn=document.getElementById("loginBtn");if(btn)btn.disabled=true;
      setTimeout(()=>{if(!_LR.isLocked()){const b=document.getElementById("loginBtn");if(b)b.disabled=false;setMsg("loginMsg","","");}},_LR.remainingMs()+500);
    }
  }catch(e){}
  // NOTE: previously also fetched getChatbotConfig() here to populate a
  // #timingsBar/#timingsText element — neither exists in login.html, so
  // that call was firing on every page load for a UI that can never appear.
  // Removed. If you want a timings bar on the login page, add the markup
  // back and this fetch can be restored.
});

// ══════════════════════════════════════════════════════════════════
//  REGISTRATION — details + T&C first, 6-box OTP last
//  Security: all validation before OTP send, OTP = final submit gate,
//  registerUser POST atomic (verify OTP + write row together),
//  rate-limit: max 3 OTP sends / 15 min, 60s resend cooldown
// ══════════════════════════════════════════════════════════════════
let _reg = { otpKey: null, email: null, sendCount: 0, sendLockUntil: 0 };
const REG_MAX_SENDS = 3, REG_LOCK_MS = 15 * 60 * 1000, REG_RESEND_COOLDOWN = 60;

// ══════════════════════════════════════════════════════════════════
//  REGISTRATION — REAL-TIME FIELD VALIDATION
//  Each required field is checked on oninput. The submit button is
//  disabled until every field passes its rule. Server-side validation
//  still runs as the final safety net — this never replaces it.
// ══════════════════════════════════════════════════════════════════
const _REG_RULES = {
  reg_name:    v => v.trim().length >= 2    ? '' : 'Min 2 characters required.',
  reg_mobile:  v => /^[6-9]\d{9}$/.test(v.trim()) ? '' : 'Enter valid 10-digit mobile (starts 6–9).',
  reg_email:   v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address.',
  reg_password:v => v.length >= 8           ? '' : 'Password must be at least 8 characters.',
  reg_confirm: v => {
    const p = document.getElementById('reg_password')?.value || '';
    if(!v) return 'Please confirm your password.';
    return v === p ? '' : 'Passwords do not match.';
  },
  reg_village: v => v.trim().length > 0     ? '' : 'Village / town is required.',
};

// Show or clear inline error under a field. Returns true if field is valid.
function _regShowFieldState(id, errMsg){
  const el = document.getElementById(id); if(!el) return true;
  // Remove existing inline error span
  let next = el.parentElement.nextElementSibling;
  if(next && next.classList.contains('field-err-msg')) next.remove();
  if(errMsg){
    el.classList.add('field-err');
    const sp = document.createElement('span');
    sp.className = 'field-err-msg'; sp.textContent = errMsg;
    el.parentElement.insertAdjacentElement('afterend', sp);
    return false;
  } else {
    el.classList.remove('field-err');
    return true;
  }
}

// Called oninput on each field — validates that field only, then updates button state
function regValidateField(id){
  const el = document.getElementById(id); if(!el) return;
  const rule = _REG_RULES[id]; if(!rule) return;
  const val = el.value;
  // Only show error after user has typed something (not on first empty focus)
  const err = val.length > 0 ? rule(val) : '';
  _regShowFieldState(id, err);
  _regUpdateSubmitBtn();
}

// Checks ALL required fields silently and enables/disables the submit button
function _regUpdateSubmitBtn(){
  const btn = document.getElementById('regSendOtpBtn'); if(!btn) return;
  let allOk = true;
  for(const id in _REG_RULES){
    const el = document.getElementById(id); if(!el) continue;
    if(el.value.length === 0 || _REG_RULES[id](el.value) !== ''){
      allOk = false; break;
    }
  }
  btn.disabled = !allOk;
  btn.style.opacity = allOk ? '1' : '0.55';
}

// Full validate-all on submit click (returns false to block if anything fails)
function _regValidateAll(){
  let ok = true;
  for(const id in _REG_RULES){
    const el = document.getElementById(id); if(!el) continue;
    const err = _REG_RULES[id](el.value);
    if(!_regShowFieldState(id, err)) ok = false;
  }
  return ok;
}

// ══════════════════════════════════════════════════════════════════
function openRegisterModal(){
  _reg = { otpKey:null, email:null, sendCount:0, sendLockUntil:0 };
  ['reg_name','reg_mobile','reg_email','reg_password','reg_confirm','reg_village','reg_address','reg_dob'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  clearFieldErrors();
  ['regStrengthFill'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.width='0';});
  ['regStrengthLabel'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='';});
  setMsg('regMsg','',''); setMsg('regOtpMsg','','');
  const tcCb=document.getElementById('reg_tc'); if(tcCb){tcCb.checked=false;tcCb.disabled=true;}
  const tcErr=document.getElementById('tcErrMsg'); if(tcErr)tcErr.style.display='none';
  // Show details form first, hide OTP step and success
  document.getElementById('regForm').style.display='block';
  document.getElementById('regOtpStep').style.display='none';
  document.getElementById('regSuccess').style.display='none';
  document.getElementById('regHeader1').style.display='';
  document.getElementById('regHeader2').style.display='none';
  document.getElementById('registerModal').style.display='flex';
  // Cap DOB picker at today — no future birthdates.
  // Uses local date components rather than toISOString() (which is UTC and
  // would be a day behind for IST users in the ~5.5hr window after midnight IST).
  const dobEl=document.getElementById('reg_dob');
  if(dobEl){
    const _today=new Date();
    const _y=_today.getFullYear(), _m=String(_today.getMonth()+1).padStart(2,'0'), _d=String(_today.getDate()).padStart(2,'0');
    dobEl.max=_y+'-'+_m+'-'+_d;
  }
  // Disable submit until all fields are valid
  const btn=document.getElementById('regSendOtpBtn');
  if(btn){btn.disabled=true;btn.style.opacity='0.55';}
  setTimeout(()=>{const n=document.getElementById('reg_name');if(n)n.focus();},100);
}
function closeRegisterModal(){ document.getElementById('registerModal').style.display='none'; }
function regGoBackToForm(){
  document.getElementById('regOtpStep').style.display='none';
  document.getElementById('regForm').style.display='block';
  document.getElementById('regHeader1').style.display='';
  document.getElementById('regHeader2').style.display='none';
  setMsg('regOtpMsg','','');
}

// "Send Verification Code" — validates all fields + T&C, then sends OTP
async function regSendOtp(){
  clearFieldErrors(); setMsg('regMsg','','');
  // Rate limit check
  if(Date.now() < _reg.sendLockUntil){
    const mins=Math.ceil((_reg.sendLockUntil-Date.now())/60000);
    setMsg('regMsg','🔒 Too many OTP requests. Please wait '+mins+' minute(s).','error'); return;
  }
  if(_reg.sendCount >= REG_MAX_SENDS){
    _reg.sendLockUntil=Date.now()+REG_LOCK_MS; _reg.sendCount=0;
    setMsg('regMsg','🔒 Too many OTP requests. Please wait 15 minutes.','error'); return;
  }
  // Full field validation (catches any field not yet touched by oninput)
  if(!_regValidateAll()) return;
  // T&C check
  const tcCb=document.getElementById('reg_tc');
  if(!tcCb||!tcCb.checked){
    const tcErr=document.getElementById('tcErrMsg'); if(tcErr)tcErr.style.display='block';
    const tcRow=document.getElementById('tcRow');
    if(tcRow){tcRow.style.transition='transform .1s';tcRow.style.transform='translateX(-4px)';setTimeout(()=>{tcRow.style.transform='translateX(4px)';setTimeout(()=>{tcRow.style.transform='translateX(0)';},80);},80);}
    return;
  }
  const tcErr=document.getElementById('tcErrMsg'); if(tcErr)tcErr.style.display='none';
  const email=document.getElementById('reg_email').value.trim();
  const btn=document.getElementById('regSendOtpBtn');
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
  try {
    const res=await postData({action:'sendRegistrationOTP', email});
    if(res && res.status==='success'){
      _reg.otpKey = res.otpKey || email;
      _reg.email = email;
      _reg.sendCount++;
      // Switch to OTP step
      document.getElementById('regForm').style.display='none';
      document.getElementById('regOtpStep').style.display='block';
      document.getElementById('regHeader1').style.display='none';
      document.getElementById('regHeader2').style.display='';
      document.getElementById('regLockedEmail').textContent='OTP sent to: '+email;
      document.getElementById('regOtpSub').textContent='Enter the 6-digit code sent to '+email;
      _regInitOtpBoxes();
      _regStartResendTimer();
      setMsg('regOtpMsg','','');
    } else {
      setMsg('regMsg','❌ '+(res?.message||'Failed to send OTP. Please try again.'),'error');
    }
  } catch(err){ setMsg('regMsg','❌ '+(err.message||'Network error.'),'error'); }
  finally{ btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Send Verification Code'; }
}

// OTP box wiring for registration
function _regInitOtpBoxes(){
  const boxes=document.querySelectorAll('#regOtpBoxes .reg-otp-box');
  boxes.forEach((box,i)=>{
    box.value=''; box.classList.remove('otp-err');
    box.oninput=function(e){
      const v=e.target.value.replace(/\D/g,'');
      e.target.value=v.slice(0,1);
      if(v && i<5) boxes[i+1].focus();
    };
    box.onkeydown=function(e){
      if(e.key==='Backspace'&&!box.value&&i>0){boxes[i-1].focus();boxes[i-1].value='';}
    };
    box.onpaste=function(e){
      e.preventDefault();
      const txt=(e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
      boxes.forEach((b,j)=>{b.value=txt[j]||'';});
      boxes[Math.min(txt.length,5)].focus();
    };
  });
  setTimeout(()=>boxes[0].focus(),100);
}
function _regGetOtp(){ return Array.from(document.querySelectorAll('#regOtpBoxes .reg-otp-box')).map(b=>b.value).join(''); }
function _regMarkOtpErr(){
  document.querySelectorAll('#regOtpBoxes .reg-otp-box').forEach(b=>b.classList.add('otp-err'));
  setTimeout(()=>document.querySelectorAll('#regOtpBoxes .reg-otp-box').forEach(b=>b.classList.remove('otp-err')),1200);
}

let _regResendInterval=null;
function _regStartResendTimer(){
  const btn=document.getElementById('regResendBtn'); const lbl=document.getElementById('regResendTimer');
  if(btn)btn.style.display='none';
  let secs=REG_RESEND_COOLDOWN;
  if(lbl)lbl.textContent='Resend in '+secs+'s';
  clearInterval(_regResendInterval);
  _regResendInterval=setInterval(()=>{
    secs--;
    if(secs<=0){clearInterval(_regResendInterval);if(lbl)lbl.textContent='';if(btn)btn.style.display='';}
    else{if(lbl)lbl.textContent='Resend in '+secs+'s';}
  },1000);
}
async function regResendOtp(){
  if(Date.now()<_reg.sendLockUntil){setMsg('regOtpMsg','🔒 Rate limited. Please wait.','error');return;}
  if(_reg.sendCount>=REG_MAX_SENDS){_reg.sendLockUntil=Date.now()+REG_LOCK_MS;_reg.sendCount=0;setMsg('regOtpMsg','🔒 Too many requests. Wait 15 min.','error');return;}
  const btn=document.getElementById('regResendBtn');if(btn)btn.style.display='none';
  const lbl=document.getElementById('regResendTimer');if(lbl)lbl.textContent='Sending...';
  try{
    const res=await postData({action:'sendRegistrationOTP',email:_reg.email});
    if(res&&res.status==='success'){_reg.otpKey=res.otpKey||_reg.email;_reg.sendCount++;_regInitOtpBoxes();_regStartResendTimer();toast('OTP resent!');setMsg('regOtpMsg','','');}
    else{setMsg('regOtpMsg','❌ '+(res?.message||'Failed to resend.'),'error');if(lbl)lbl.textContent='';if(btn)btn.style.display='';}
  }catch(err){setMsg('regOtpMsg','❌ '+(err.message||'Network error.'),'error');if(lbl)lbl.textContent='';if(btn)btn.style.display='';}
}

// OTP verified → registerUser POST (atomic: verify OTP + write row in one call)
async function regVerifyAndSubmit(){
  const otp=_regGetOtp();
  if(!otp||otp.length<6){_regMarkOtpErr();setMsg('regOtpMsg','❌ Please enter the 6-digit OTP.','error');return;}
  const btn=document.getElementById('regVerifyBtn');
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
  setMsg('regOtpMsg','','');
  try{
    const name=document.getElementById('reg_name').value.trim();
    const mobile=document.getElementById('reg_mobile').value.trim();
    const email=_reg.email;
    const pwd=document.getElementById('reg_password').value;
    const village=document.getElementById('reg_village').value.trim();
    const address=document.getElementById('reg_address').value.trim();
    const rawDob=document.getElementById('reg_dob')?.value||''; // YYYY-MM-DD from <input type="date">
    // Convert YYYY-MM-DD → DD-MM-YYYY for consistent sheet storage
    const dob=rawDob ? rawDob.split('-').reverse().join('-') : '';
    const hashedPwd=await sha256(pwd);

    const res=await postData({
      action:'registerUser',
      otpKey:_reg.otpKey, otp,
      Name:name, Mobile:mobile, Email:email,
      Password:hashedPwd, Village:village, Address:address, DOB:dob
    });
    if(res&&res.status==='success'){
      clearInterval(_regResendInterval);
      document.getElementById('regOtpStep').style.display='none';
      document.getElementById('regHeader2').style.display='none';
      document.getElementById('regSuccess').style.display='block';
      document.getElementById('regSuccessMsg').innerHTML=
        'Hi <b>'+escapeHtml(name)+'</b>, your request has been sent to the household admin for review.<br/><br/>'+
        'You will receive an email at <b>'+escapeHtml(email)+'</b> once approved.';
    }else if(res&&res.message&&(res.message.toLowerCase().includes('mobile')||res.message.toLowerCase().includes('otp'))){
      if(res.message.toLowerCase().includes('otp')||res.message.toLowerCase().includes('invalid')||res.message.toLowerCase().includes('expired')){
        _regMarkOtpErr(); setMsg('regOtpMsg','❌ '+(res.message||'Invalid or expired OTP.'),'error');
      } else {
        // Duplicate mobile/email — go back to form
        regGoBackToForm();
        if(res.message.toLowerCase().includes('mobile')) setFieldErr('reg_mobile',res.message);
        else if(res.message.toLowerCase().includes('email')) setFieldErr('reg_email',res.message);
        else setMsg('regMsg','❌ '+res.message,'error');
      }
    }else{
      setMsg('regOtpMsg','❌ '+(res?.message||'Registration failed. Please try again.'),'error');
    }
  }catch(err){
    setMsg('regOtpMsg','❌ '+(err.message||'Network error.'),'error');
  }finally{
    btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check-circle"></i> Verify &amp; Complete Registration';
  }
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function openTCModal(){
  document.getElementById("tcModal").style.display="flex";
  // Reset scroll area
  const sa=document.getElementById("tcScrollArea");
  if(sa)sa.scrollTop=0;
  document.getElementById("tcScrollHint").style.display="flex";
  document.getElementById("tcAcceptArea").style.display="none";
}
function closeTCModal(){document.getElementById("tcModal").style.display="none";}
function checkTCScroll(){
  const sa=document.getElementById("tcScrollArea");
  if(!sa)return;
  // Show accept button when user has scrolled at least 85% of the content
  if(sa.scrollTop+sa.clientHeight >= sa.scrollHeight*0.85){
    document.getElementById("tcScrollHint").style.display="none";
    document.getElementById("tcAcceptArea").style.display="block";
  }
}
function acceptTC(){
  const cb=document.getElementById("reg_tc");
  if(cb){cb.checked=true;cb.disabled=false;}
  const err=document.getElementById("tcErrMsg");if(err)err.style.display="none";
  closeTCModal();
  toast("✅ Terms accepted!");
}

// Wire confirm-password and new-password-confirm show/hide toggles
_pwdToggle("toggleNewPwdConfirm","newPasswordConfirm");