'use strict';
document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page !== 'business-reviews') return;
    if (window.LB_Biz) LB_Biz.initCommonUI('reviews');
    let reviews = [];
    const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    const stars = rating => { const r=Math.max(0,Math.min(5,Number(rating)||0)); return '★'.repeat(r)+'☆'.repeat(5-r); };
    const renderSummary = summary => {
        const total=Number(summary?.total||0), avg=summary?.average;
        const avgEl=document.getElementById('reviewSummaryAvg'), starsEl=document.getElementById('reviewSummaryStars'), countEl=document.getElementById('reviewSummaryCount');
        if(avgEl) avgEl.textContent=avg==null?'—':Number(avg).toFixed(1);
        if(starsEl) starsEl.textContent=avg==null?'☆☆☆☆☆':stars(Math.round(Number(avg)));
        if(countEl) countEl.textContent=`Based on ${total} review${total===1?'':'s'}`;
        const dist=summary?.distribution||{};
        for(let i=1;i<=5;i++){ const pct=total?Math.round((Number(dist[i]||0)/total)*100):0; const bar=document.getElementById(`bar${i}`), pctEl=document.getElementById(`pct${i}`); if(bar)bar.style.width=`${pct}%`; if(pctEl)pctEl.textContent=`${pct}%`; }
    };
    const renderReviews = () => {
        const feed=document.getElementById('reviewsFeed'), empty=document.getElementById('reviewsEmptyState'); if(!feed)return;
        if(!reviews.length){feed.innerHTML='';empty?.classList.remove('hidden');return;} empty?.classList.add('hidden');
        feed.innerHTML=reviews.map(r=>`<div class="review-card"><div class="review-header"><div><span class="rev-cust-name">${esc(r.customer)}</span><div class="rev-stars">${stars(r.rating)}</div></div><span class="rev-date">${esc(r.date)}</span></div><div style="margin-top:8px;font-size:12px;font-weight:700;color:#2E7D32;">🍽️ ${esc(r.menuName)}${r.orderId?` · Order #${esc(r.orderId)}`:''}</div><p class="rev-comment">"${esc(r.comment)}"</p>${r.reply?`<div class="rev-reply-box"><p class="reply-header-text">💬 Your Response:</p><p class="reply-content-text">${esc(r.reply)}</p></div>`:`<button type="button" class="btn btn-outline-secondary btn-xs mt-3 btn-reply-trigger" data-id="${r.id}">Reply to review</button>`}</div>`).join('');
        feed.querySelectorAll('.btn-reply-trigger').forEach(btn=>btn.addEventListener('click',()=>{const r=reviews.find(x=>String(x.id)===String(btn.dataset.id));if(r)openReplyModal(r);}));
    };
    const openReplyModal = review => { document.getElementById('replyReviewId').value=review.id; document.getElementById('replyCustomerName').textContent=review.customer; document.getElementById('replyReviewStars').textContent=stars(review.rating); document.getElementById('replyCustomerComment').textContent=`"${review.comment}"`; const f=document.getElementById('replyFoodName'); if(f)f.textContent=review.menuName||'Food Item'; document.getElementById('reviewReplyText').value=review.reply||''; LB.openModal('replyModal'); };
    const loadReviews = async()=>{
        try{ const res=await fetch('/business/api/reviews',{credentials:'same-origin',headers:{Accept:'application/json'}}); const ct=res.headers.get('content-type')||''; if(!res.ok||!ct.includes('application/json'))throw new Error('Could not load business reviews. Please refresh the page.'); const data=await res.json(); if(!data.success)throw new Error(data.message||'Could not load reviews.'); reviews=data.reviews||[]; renderSummary(data.summary||{}); renderReviews(); }
        catch(e){console.error('Business reviews load error:',e);LB.toast(e.message||'Could not load reviews.','error');}
    };
    document.getElementById('btnCloseReplyModal')?.addEventListener('click',()=>LB.closeModal('replyModal'));
    document.getElementById('reviewReplyForm')?.addEventListener('submit',async e=>{
        e.preventDefault(); const id=document.getElementById('replyReviewId').value, reply=document.getElementById('reviewReplyText').value.trim(), btn=e.currentTarget.querySelector('button[type="submit"]');
        if(!reply){LB.toast('Please enter a response.','error');return;} LB.setLoading(btn,true);
        try{const res=await fetch(`/business/api/reviews/${id}/reply`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({reply})}); const ct=res.headers.get('content-type')||''; if(!res.ok||!ct.includes('application/json'))throw new Error('Could not save the response. Please refresh and try again.'); const data=await res.json(); if(!data.success)throw new Error(data.message||'Could not save the response.'); const i=reviews.findIndex(r=>String(r.id)===String(id)); if(i!==-1&&data.review)reviews[i]=data.review; LB.closeModal('replyModal'); LB.toast(data.message||'Response posted successfully!','success'); renderReviews();}
        catch(err){console.error('Business review reply error:',err);LB.toast(err.message||'Could not save the response.','error');} finally{LB.setLoading(btn,false);}
    });
    renderSummary({total:0,average:null,distribution:{}}); renderReviews(); loadReviews();
});
