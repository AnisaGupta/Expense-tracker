/**
 * ============================================================
 *  LocalBites — Common/Shared JavaScript (common.js)
 *  Contains global systems: Navigation, Validations, Toasts, Ripple, Modals, Geolocation placeholders
 * ============================================================
 */

'use strict';

window.LB = (() => {

    /**
     * Navigation with smooth exit animation
     */
    const navigate = (url, delay = 300) => {
        document.body.classList.add('page-exiting');
        setTimeout(() => { window.location.href = url; }, delay);
    };

    /**
     * Create material-style ripple on click
     */
    const ripple = (e, el) => {
        const r = document.createElement('span');
        const d = Math.max(el.offsetWidth, el.offsetHeight) * 2;
        const rect = el.getBoundingClientRect();
        
        // Touch or mouse coordinates
        const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left + rect.width / 2);
        const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : rect.top + rect.height / 2);

        const cx = clientX - rect.left - d / 2;
        const cy = clientY - rect.top - d / 2;

        r.className = 'ripple';
        Object.assign(r.style, {
            width: `${d}px`,
            height: `${d}px`,
            left: `${cx}px`,
            top: `${cy}px`,
        });
        el.appendChild(r);
        r.addEventListener('animationend', () => r.remove(), { once: true });
    };

    // ── GLOBAL SIDE DRAWER CONTROLS ──
document.addEventListener('DOMContentLoaded', () => {
    const menuTrigger = document.getElementById('menuTrigger');
    const sideDrawer = document.getElementById('sideDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const closeDrawerBtn = document.getElementById('closeDrawerBtn');

    const openDrawer = () => {
        sideDrawer?.classList.add('active');
        drawerOverlay?.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeDrawer = () => {
        sideDrawer?.classList.remove('active');
        drawerOverlay?.classList.remove('active');
        document.body.style.overflow = '';
    };

    menuTrigger?.addEventListener('click', openDrawer);
    closeDrawerBtn?.addEventListener('click', closeDrawer);
    drawerOverlay?.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sideDrawer?.classList.contains('active')) {
            closeDrawer();
        }
    });

    // Notification toast fallback
    document.getElementById('notifBell')?.addEventListener('click', () => {
        if (window.LB) LB.toast('You have no new notifications.', 'info');
    });
});

    /**
     * Switch screen within auth cards
     */
    const showScreen = (id, reverse = false) => {
        document.querySelectorAll('.auth-screen').forEach(s => {
            s.classList.remove('active', 'slide-back');
        });
        const target = document.getElementById(id);
        if (!target) return;
        if (reverse) target.classList.add('slide-back');
        target.classList.add('active');
    };

    /**
     * Toggle button loading indicators
     */
    const setLoading = (btn, isLoading) => {
        if (!btn) return;
        btn.classList.toggle('loading', isLoading);
        btn.disabled = isLoading;
    };

    /**
     * Toast System
     */
    const toast = (msg, type = 'info', duration = 3500, action = null) => {
        let host = document.querySelector('.toast-host');
        if (!host) {
            host = document.createElement('div');
            host.className = 'toast-host';
            document.body.appendChild(host);
        }

        const emojis = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `
            <span class="toast-emoji">${emojis[type] ?? emojis.info}</span>
            <span class="toast-msg">${msg}</span>
            ${action ? `<button type="button" class="toast-action">${action.label}</button>` : ''}
            <button class="toast-close" aria-label="Dismiss">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;

        const remove = () => {
            el.classList.add('out');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        };

        el.querySelector('.toast-close').addEventListener('click', remove);
        if (action) {
            el.querySelector('.toast-action').addEventListener('click', () => {
                action.onClick();
                remove();
            });
        }
        host.appendChild(el);
        setTimeout(remove, duration);
    };

    /**
     * Form Validation Helper
     */
    const validateForm = (formElement) => {
        if (!formElement) return true;
        let isValid = true;
        const inputs = formElement.querySelectorAll('[required]');

        inputs.forEach(input => {
            const parent = input.closest('.form-group') || input.parentElement;
            let errText = parent.querySelector('.form-err');
            if (errText) errText.remove();
            input.style.borderColor = '';

            if (!input.value.trim()) {
                showInputError(input, 'This field is required');
                isValid = false;
            } else if (input.type === 'email' && !validateEmail(input.value)) {
                showInputError(input, 'Please enter a valid email address');
                isValid = false;
            } else if (input.id === 'regConfirmPw' || input.id === 'confirmPassword' || input.id === 'fpConfirmPw' || input.id === 'bizConfirmPw') {
                const pwField = formElement.querySelector('input[type="password"]:not([id*="Confirm"])');
                if (pwField && input.value !== pwField.value) {
                    showInputError(input, 'Passwords do not match');
                    isValid = false;
                }
            } else if (input.type === 'password' && input.value.length < 8 && !input.id.includes('Confirm')) {
                showInputError(input, 'Password must be at least 8 characters long');
                isValid = false;
            }
        });

        return isValid;
    };

    const showInputError = (input, message) => {
        const parent = input.closest('.form-group') || input.parentElement;
        input.style.borderColor = 'var(--clr-error)';
        const err = document.createElement('div');
        err.className = 'form-err';
        err.style.color = 'var(--clr-error)';
        err.style.fontSize = 'var(--fs-12)';
        err.style.marginTop = 'var(--sp-1)';
        err.innerHTML = `⚠️ ${message}`;
        parent.appendChild(err);
    };

    const validateEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    /**
     * Modal controls
     */
    const openModal = (id) => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    const closeModal = (id) => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    };

    

    /**
     * Log out of the current session
     */
    const logout = (endpoint, redirectTo) => {
        return fetch(endpoint, { method: 'POST' })
            .catch(() => {})
            .then(() => navigate(redirectTo));
    };

    /**
     * Password Visibility Toggler
     */
    const initPasswordToggles = () => {
        document.querySelectorAll('.pw-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const inp = btn.previousElementSibling;
                if (!inp) return;
                const isPw = inp.type === 'password';
                inp.type = isPw ? 'text' : 'password';
                btn.innerHTML = isPw ? `
                    <svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ` : `
                    <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                `;
            });
        });
    };

    // Auto-bind common elements on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        initPasswordToggles();
        
        const backBtn = document.getElementById('globalBack');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const dest = backBtn.dataset.dest || '/role';
                navigate(dest);
            });
        }
    });

    return {
        navigate,
        ripple,
        showScreen,
        setLoading,
        toast,
        validateForm,
        openModal,
        closeModal,
        logout
    };

})();
// ==========================================
// Global Cart Count Initializer
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const cartBadge = document.getElementById('cartItemCountBadge');
    if (!cartBadge) return;
    fetch('/customer/api/cart/count', {method:'GET',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'}})
    .then(res => { const ct=res.headers.get('content-type')||''; if(!res.ok||!ct.includes('application/json')) return null; return res.json(); })
    .then(data => { if(data && data.total_items !== undefined) cartBadge.innerText=data.total_items; })
    .catch(err => console.warn('Cart count unavailable:', err));
});

function addToCartApi(menuId, forceClear = false) {
    fetch('/customer/api/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_id: menuId, quantity: 1, force_clear: forceClear })
    })
    .then(res => res.json())
    .then(data => {
        if (data.conflict) {
            if (confirm(data.message)) { addToCartApi(menuId, true); }
            return;
        }
        if (data.success) {
            document.getElementById('cartItemCountBadge').innerText = data.total_items;
            updateButtonUI(menuId, data.item_quantity || 1);
        }
    });
}

function updateQtyApi(menuId, newQty) {
    fetch('/customer/api/cart/update-qty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_id: menuId, quantity: newQty })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // Update the top navbar cart badge safely
            const cartBadge = document.getElementById('cartItemCountBadge');
            if (cartBadge && data.total_items !== undefined) {
                cartBadge.innerText = data.total_items;
            }
            
            // Only update button UI if the server explicitly returns a valid item_quantity,
            // otherwise keep our local optimistic state so it doesn't glitch back to "ADD".
            if (data.item_quantity !== undefined && data.item_quantity !== null) {
                updateButtonUI(menuId, data.item_quantity);
            }
        } else {
            console.error("Cart update failed:", data.message);
        }
    })
    .catch(err => console.error("Error updating qty:", err));
}

function adjustQty(identifier, change) {
    const payload = { change: change };
    
    // If we are on the cart page, send cart_item_id. Otherwise, send menu_id.
    if (window.location.pathname.includes('cart') || window.location.pathname.includes('checkout')) {
        payload.cart_item_id = identifier;
    } else {
        payload.menu_id = identifier;
    }

    fetch('/customer/api/cart/update-qty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const cartBadge = document.getElementById('cartItemCountBadge');
            if (cartBadge && data.total_items !== undefined) {
                cartBadge.innerText = data.total_items;
            }

            if (window.location.pathname.includes('cart') || window.location.pathname.includes('checkout')) {
                window.location.reload();
                return;
            }

            const spans = document.querySelectorAll(`[data-menu-id="${identifier}"] .qty-val, #qty-val-${identifier}`);
            spans.forEach(span => {
                span.innerText = data.new_quantity;
            });
        } else {
            console.error("Cart update failed:", data.message);
        }
    })
    .catch(err => console.error("Error updating qty:", err));
}

function updateButtonUI(menuId, qty) {
    const containers = document.querySelectorAll(`[data-menu-id="${menuId}"]`);

    containers.forEach(container => {
        const isMostOrdered = container.classList.contains('most-ordered-cart-action');

        if (isMostOrdered) {
            // IMPORTANT: Do not replace the action container's HTML.
            // The ADD button and quantity control already exist in the card.
            // We only toggle visibility and update the number. This keeps the
            // card's layout completely stable when the cart changes.
            const addButton = container.querySelector('.most-ordered-add-btn');
            const qtyControl = container.querySelector('.most-ordered-qty-control');
            const qtyValue = container.querySelector('.qty-val');

            if (qtyValue) {
                qtyValue.innerText = qty;
            }

            if (addButton) {
                addButton.hidden = Number(qty) > 0;
            }

            if (qtyControl) {
                qtyControl.hidden = Number(qty) <= 0;
            }

            return;
        }

        if (qty > 0) {
            container.innerHTML = `
                <div style="display: flex; align-items: center; border: 1px solid #FF6B35; border-radius: 8px; background: #fff; overflow: hidden; height: 34px;">
                    <button type="button" onclick="adjustQty('${menuId}', -1)" style="background: #fff; border: none; color: #FF6B35; padding: 0 10px; font-weight: 700; cursor: pointer;">-</button>
                    <span class="qty-val" style="padding: 0 8px; font-weight: 700; font-size: 14px; color: #333; min-width: 20px; text-align: center;">${qty}</span>
                    <button type="button" onclick="adjustQty('${menuId}', 1)" style="background: #fff; border: none; color: #FF6B35; padding: 0 10px; font-weight: 700; cursor: pointer;">+</button>
                </div>
            `;
        } else {
            container.innerHTML = `
                <button type="button" onclick="addToCartApi('${menuId}')" style="background: #fff; border: 1px solid #FF6B35; color: #FF6B35; font-weight: 700; padding: 6px 24px; border-radius: 8px; cursor: pointer;">
                    ADD
                </button>
            `;
        }
    });
}
