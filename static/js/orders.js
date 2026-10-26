'use strict';
let currentReviewOrderId=null,currentReviewMenuId=null,selectedReviewRating=0;
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
function updateReviewStars(){document.querySelectorAll('.review-star-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.rating)<=selectedReviewRating));}
function openFoodReviewModal(order,item){
    const m=document.getElementById('foodReviewModal');
    if(!m)return;

    const container=m.querySelector('.modal-container');
    const orderIdEl=document.getElementById('reviewOrderId');
    const menuIdEl=document.getElementById('reviewMenuId');
    const foodNameEl=document.getElementById('reviewFoodName');
    const businessNameEl=document.getElementById('reviewBusinessName');
    const orderLabelEl=document.getElementById('foodReviewOrderLabel');
    const commentEl=document.getElementById('reviewComment');
    const ratingEl=document.getElementById('reviewRating');
    const titleEl=document.getElementById('foodReviewTitle');
    const submitBtn=document.getElementById('submitFoodReviewBtn');

    if(!orderIdEl||!menuIdEl||!foodNameEl||!businessNameEl||!orderLabelEl||!commentEl||!ratingEl||!titleEl||!submitBtn){
        console.error('LocalBites review modal: required element is missing.');
        return;
    }

    currentReviewOrderId=order.id;
    currentReviewMenuId=item.menuId;
    selectedReviewRating=Number(item.reviewRating||0);

    orderIdEl.value=order.id;
    menuIdEl.value=item.menuId;
    foodNameEl.textContent=item.name||'Food Item';
    businessNameEl.textContent=order.businessName||'';
    orderLabelEl.textContent=`Order #${order.id} • ${order.dateFormatted||'Recent Order'}`;
    commentEl.value=item.reviewComment||'';
    ratingEl.value=selectedReviewRating;
    titleEl.textContent=item.reviewed?'Edit Your Review':'Review Food Item';
    submitBtn.textContent=item.reviewed?'Update Review':'Submit Review';

    updateReviewStars();

    /*
     * common.css controls .modal-overlay with opacity/pointer-events.
     * Use an inline !important display value here because this customer
     * modal starts with display:none in orders.html. This guarantees the
     * review dialog itself becomes visible instead of showing only the
     * blurred backdrop.
     */
    m.style.setProperty('display','flex','important');
    m.classList.add('active');
    if(container){
        container.style.display='block';
        container.style.visibility='visible';
        container.style.opacity='1';
        container.style.transform='none';
    }

    m.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';

    setTimeout(()=>document.getElementById('reviewComment')?.focus(),50);
}
function closeFoodReviewModal(){
    const m=document.getElementById('foodReviewModal');
    if(!m)return;
    m.classList.remove('active');
    m.style.setProperty('display','none','important');
    m.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    currentReviewOrderId=null;
    currentReviewMenuId=null;
}
async function submitFoodReview(e){e.preventDefault();const rating=Number(document.getElementById('reviewRating').value),review=document.getElementById('reviewComment').value.trim(),btn=document.getElementById('submitFoodReviewBtn');if(!currentReviewOrderId||!currentReviewMenuId){LB.toast('Please select a food item to review.','error');return;}if(rating<1||rating>5){LB.toast('Please select a rating from 1 to 5 stars.','error');return;}LB.setLoading(btn,true);try{const res=await fetch('/customer/api/reviews',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({order_id:currentReviewOrderId,menu_id:currentReviewMenuId,rating,review})});const ct=res.headers.get('content-type')||'';if(!res.ok||!ct.includes('application/json'))throw new Error('Could not submit your review. Please refresh and try again.');const data=await res.json();if(!data.success)throw new Error(data.message||'Could not submit your review.');closeFoodReviewModal();LB.toast(data.message||'Review submitted successfully!','success');loadOrders();}catch(err){console.error('Review submission error:',err);LB.toast(err.message||'Could not submit your review.','error');}finally{LB.setLoading(btn,false);}}
async function loadOrders(){const c=document.getElementById('ordersList');if(!c)return;try{const res=await fetch('/customer/api/orders/my-orders',{credentials:'same-origin',headers:{Accept:'application/json'}});const ct=res.headers.get('content-type')||'';if(!res.ok||!ct.includes('application/json'))throw new Error('Could not load your orders. Please sign in again.');const data=await res.json();if(!data.success||!data.orders||!data.orders.length){c.innerHTML='<div style="text-align:center;padding:48px 16px;color:var(--clr-text-3);"><i class="fa-solid fa-receipt" style="font-size:48px;color:#d1d5db;margin-bottom:16px;"></i><h3 style="font-size:16px;font-weight:700;color:#374151;">No Orders Yet</h3><p style="font-size:13px;margin-top:4px;">Looks like you haven\'t placed any orders yet.</p><a href="/customer/dashboard" class="btn btn-primary" style="display:inline-block;margin-top:16px;padding:10px 20px;text-decoration:none;border-radius:8px;">Explore Kitchens</a></div>';return;}c.innerHTML=data.orders.map(order=>{const st=String(order.status||'').toLowerCase(),done=st==='completed'||st==='delivered',sc=done?'status-completed':(st==='cancelled'?'status-cancelled':'status-pending');const items=(order.items||[]).map(item=>{const rb=done&&item.menuId?`<button type="button" class="btn-review-item ${item.reviewed?'reviewed':''}" data-order-id="${order.id}" data-menu-id="${item.menuId}">${item.reviewed?'✓ Edit Review':'⭐ Rate & Review'}</button>`:'';return `<div class="order-item-row" style="display:flex;flex-direction:column;gap:6px;align-items:stretch;"><div style="display:flex;justify-content:space-between;gap:10px;"><span>${item.quantity}x ${esc(item.name)}</span><span>₹${(Number(item.price)*Number(item.quantity)).toFixed(2)}</span></div>${rb?`<div class="order-review-actions">${rb}</div>`:''}</div>`;}).join('');return `<div class="order-card"><div class="order-header"><div><h3 style="font-size:15px;font-weight:700;color:#111827;">${esc(order.businessName)}</h3><span style="font-size:11px;color:#6b7280;">Order #${order.id} • ${esc(order.dateFormatted)}</span></div><span class="order-status ${sc}">${esc(order.status)}</span></div><div style="padding:8px 0;border-bottom:1px dashed #e5e7eb;">${items}</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:10px;flex-wrap:wrap;"><span style="font-size:12px;font-weight:600;color:#6b7280;">Payment: ${esc(order.paymentMethod)}</span><span style="font-size:15px;font-weight:800;color:#FF6B35;">Total: ₹${Number(order.totalAmount).toFixed(2)}</span></div>${st==='out_for_delivery'&&String(order.deliveryType||'').toLowerCase()==='delivery'?`<button type="button" class="btn-track-delivery" onclick="openDeliveryTracking(${order.id})" style="width:100%;margin-top:12px;padding:11px 16px;border:none;border-radius:9px;background:#FF6B35;color:#fff;font-size:13px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-location-dot"></i> Track Delivery</button>`:''}</div>`;}).join('');window.LB_CUSTOMER_ORDERS=data.orders;document.querySelectorAll('.btn-review-item').forEach(b=>b.addEventListener('click',()=>{const o=window.LB_CUSTOMER_ORDERS.find(x=>String(x.id)===String(b.dataset.orderId)),i=o?.items?.find(x=>String(x.menuId)===String(b.dataset.menuId));if(o&&i)openFoodReviewModal(o,i);}));}catch(err){console.error('Orders load error:',err);c.innerHTML=`<div style="text-align:center;padding:32px;color:#ef4444;"><p>${esc(err.message||'Could not load your orders. Please try refreshing.')}</p></div>`;}}
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('closeFoodReviewModal')?.addEventListener('click',closeFoodReviewModal);document.getElementById('cancelFoodReviewBtn')?.addEventListener('click',closeFoodReviewModal);document.getElementById('foodReviewForm')?.addEventListener('submit',submitFoodReview);document.querySelectorAll('.review-star-btn').forEach(b=>b.addEventListener('click',()=>{selectedReviewRating=Number(b.dataset.rating);document.getElementById('reviewRating').value=selectedReviewRating;updateReviewStars();}));document.getElementById('foodReviewModal')?.addEventListener('click',e=>{if(e.target.id==='foodReviewModal')closeFoodReviewModal();});loadOrders();});
function openDeliveryTracking(orderId){window.location.href=`/customer/tracking?order_id=${orderId}`;}
