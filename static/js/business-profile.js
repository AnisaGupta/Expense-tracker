/** LocalBites — MySQL-backed Business Profile */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    if (document.body.dataset.page !== 'business-profile') return;
    LB_Biz.initCommonUI('profile');

    let business = null;

    const readJson = async (response) => {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(
                response.status === 401 || response.status === 403
                    ? 'Your business session has expired. Please log in again.'
                    : `Server returned an unexpected response (${response.status}). Please check the Flask terminal for the error.`
            );
        }
        return response.json();
    };

    const loadProfile = async () => {
        const response = await fetch('/business/api/profile');
        const data = await readJson(response);
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not load profile.');
        business = data.business;
        return business;
    };

    const populate = () => {
        const p=business;
        const set=(id,v)=>{const el=document.getElementById(id); if(el) el.value=v??'';};
        set('profBizName',p.name); set('profOwnerName',p.owner); set('profEmail',p.email); set('profPhone',p.phone);
        set('profBizType',p.type); set('profOpeningTime',p.opening_time); set('profClosingTime',p.closing_time);
        set('profDesc',p.description); set('profAddress',p.address); set('profCity',p.city); set('profPincode',p.pincode);
        set('profLat',p.latitude); set('profLng',p.longitude);
        const logoPreview=document.getElementById('profileLogoPreview');
        if(logoPreview && p.logoUrl) logoPreview.src=p.logoUrl;
        const services=p.services||{};
        const d=document.getElementById('srvDelivery'), s=document.getElementById('srvSelfPickup');
        if(d)d.checked=!!services.delivery; if(s)s.checked=!!services.selfPickup;
        const badge=document.getElementById('profileVerificationBadge'), remarks=document.getElementById('profileVerificationRemarks');
        if(badge){ const status=p.verificationStatus||'pending'; badge.className=`v-badge ${status}`; badge.textContent=status==='approved'?'Approved':status==='rejected'?'Rejected':'Pending Admin Verification'; }
        if(remarks) remarks.textContent=p.verificationStatus==='approved'?'Your business registration is verified. Live orders are enabled.':'Your business registration is currently under admin verification.';
    };

    const initLogoPreview = () => {
        const input=document.getElementById('profileLogoInput'), btn=document.getElementById('btnUploadLogo'), preview=document.getElementById('profileLogoPreview');
        btn?.addEventListener('click',()=>input?.click());
        input?.addEventListener('change',async e=>{
            const file=e.target.files?.[0]; if(!file)return;
            if(!/\.(jpg|jpeg|png)$/i.test(file.name)||file.size>2*1024*1024){LB.toast('Invalid logo. Accepted: JPG, PNG · Max 2 MB','error'); input.value=''; return;}

            const reader=new FileReader();
            reader.onload=ev=>{ if(preview) preview.src=ev.target.result; };
            reader.readAsDataURL(file);

            try {
                const formData=new FormData();
                formData.append('logo', file);
                const response=await fetch('/business/api/profile/logo',{method:'POST',body:formData});
                const data=await readJson(response);
                if(!response.ok || !data.success) throw new Error(data.message || 'Failed to save logo.');

                business=data.business || business || {};
                if(data.logoUrl){
                    business.logoUrl=data.logoUrl;
                    if(preview) preview.src=data.logoUrl;
                }

                const state=LB_Biz.getState();
                LB_Biz.saveState({
                    ...state,
                    profile:{...state.profile,logo:data.logoUrl || business.logoUrl || ''}
                });
                LB_Biz.initCommonUI('profile');
                LB.toast('Business logo updated successfully!','success');
            } catch(err) {
                console.error(err);
                LB.toast(err.message,'error');
            } finally {
                input.value='';
            }
        });
    };

    document.getElementById('profileEditForm')?.addEventListener('submit', async e=>{
        e.preventDefault(); const form=e.currentTarget; if(!LB.validateForm(form))return;
        const payload={
            business_name:document.getElementById('profBizName').value.trim(), owner_name:document.getElementById('profOwnerName').value.trim(),
            email:document.getElementById('profEmail').value.trim(), phone:document.getElementById('profPhone').value.trim(),
            business_type:document.getElementById('profBizType').value, opening_time:document.getElementById('profOpeningTime').value,
            closing_time:document.getElementById('profClosingTime').value, description:document.getElementById('profDesc').value.trim(),
            address:document.getElementById('profAddress').value.trim(), city:document.getElementById('profCity').value.trim(),
            pincode:document.getElementById('profPincode').value.trim(), latitude:document.getElementById('profLat').value.trim(),
            longitude:document.getElementById('profLng').value.trim(), services:{delivery:document.getElementById('srvDelivery').checked,selfPickup:document.getElementById('srvSelfPickup').checked}
        };
        try{
            const response=await fetch('/business/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            const data=await readJson(response);
            if(!response.ok||!data.success)throw new Error(data.message||'Failed to save profile.');
            business=data.business||await loadProfile();
            populate(); LB.toast('Business profile saved successfully.','success');
            LB_Biz.initCommonUI('profile');
        }catch(err){console.error(err);LB.toast(err.message,'error');}
    });

    try { await loadProfile(); populate(); initLogoPreview(); }
    catch(e){ console.error(e); LB.toast(e.message,'error'); }
});
