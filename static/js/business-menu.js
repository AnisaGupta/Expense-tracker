/**
 * ============================================================
 *  LocalBites — Menu Management Controller (business-menu.js)
 *  Orchestrates Search, Veg/Non-Veg Filters, Availability Toggles,
 *  and Menu Item CRUD Operations against the real backend API
 *  (routes/business.py: /business/api/menu, /business/api/categories).
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page !== 'business-menu') return;

    // Load common shell UI binder for Menu
    LB_Biz.initCommonUI('menu');

    // In-memory cache of the current business's real menu, loaded from
    // the server on page load and refreshed after every write.
    let menuCache = [];

    const apiRequest = async (url, options = {}) => {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            ...options,
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* no body */ }
        if (!res.ok || (data && data.success === false)) {
            const message = (data && data.message) || 'Something went wrong. Please try again.';
            throw new Error(message);
        }
        return data;
    };

    const loadMenu = async () => {
        try {
            const data = await apiRequest('/business/api/menu');
            menuCache = data.menu || [];
        } catch (e) {
            LB.toast(e.message, 'error');
            menuCache = [];
        }
        renderMenuList();
    };

    // ── RENDER MENU LIST ──
    const renderMenuList = () => {
        const grid = document.getElementById('menuGrid');
        const emptyState = document.getElementById('menuEmptyState');

        const search = document.getElementById('menuSearchInput').value.toLowerCase();
        const category = document.getElementById('menuFilterCategory').value;
        const type = document.getElementById('menuFilterType').value;

        // Apply filters
        let items = [...menuCache];
        if (search) {
            items = items.filter(i => i.name.toLowerCase().includes(search) || i.desc.toLowerCase().includes(search));
        }
        if (category !== 'all') {
            items = items.filter(i => i.category === category);
        }
        if (type !== 'all') {
            items = items.filter(i => i.type === type);
        }

        grid.innerHTML = "";
        if (items.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');

            items.forEach(i => {
                const card = document.createElement('div');
                card.className = `menu-item-card ${i.available ? '' : 'disabled'}`;

                const prepTimeText = `${i.prepTime} mins`;
                const catLabels = {
                    mess: "Mess Special",
                    tiffin: "Tiffin Plan",
                    meals: "Meal / Combo",
                    extras: "Sides & Extras",
                    sweets: "Sweet / Dessert"
                };

                card.innerHTML = `
                    <div class="menu-item-img-wrap">
                        <img src="${i.imageUrl || '/static/images/LocalBites.png'}" alt="${i.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22170%22><rect width=%22300%22 height=%22170%22 fill=%22%23eaeaea%22/><text x=%2250%25%22 y=%2250%25%22 font-size=%2218%22 fill=%22%23777%22 font-family=%22sans-serif%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22>${i.name}</text></svg>';">
                        <div class="menu-item-labels">
                            <span class="category-tag">${catLabels[i.category] || "Dish"}</span>
                            <span class="diet-badge ${i.type}">
                                <span class="diet-symbol"></span> ${i.type === 'veg' ? 'Veg' : 'Non-Veg'}
                            </span>
                        </div>
                    </div>
                    <div class="menu-item-body">
                        <h3 class="menu-item-title">${i.name}</h3>
                        <p class="menu-item-desc">${i.desc}</p>
                        <span style="font-size:var(--fs-12); font-weight:700; color:var(--clr-text-3); margin-bottom:var(--sp-2);">⏱️ Prep time: ${prepTimeText}</span>
                        <div class="menu-item-footer">
                            <span class="menu-item-price">₹${i.price}</span>
                            <div class="menu-item-actions">
                                <label class="switch-container" title="Toggle Availability">
                                    <input type="checkbox" class="switch-input menu-availability-toggle" data-id="${i.id}" ${i.available ? 'checked' : ''}>
                                    <span class="switch-slider"></span>
                                </label>
                                <button class="btn-icon-only menu-edit-btn" data-id="${i.id}" title="Edit food details">
                                    <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button class="btn-icon-only danger menu-delete-btn" data-id="${i.id}" title="Delete food item">
                                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });

            bindMenuActionEvents();
        }
    };

    /**
     * Bind actions click events
     */
    const bindMenuActionEvents = () => {
        // Toggle Availability
        document.querySelectorAll('.menu-availability-toggle').forEach(chk => {
            chk.addEventListener('change', async () => {
                const itemId = chk.dataset.id;
                const item = menuCache.find(i => i.id === itemId);
                if (!item) return;

                const nextAvailable = chk.checked;
                try {
                    await apiRequest(`/business/api/menu/${itemId}/availability`, {
                        method: 'PATCH',
                        body: JSON.stringify({ available: nextAvailable }),
                    });
                    item.available = nextAvailable;
                    LB.toast(`"${item.name}" is now ${item.available ? 'Listed' : 'Hidden'} for ordering.`, 'info');
                    renderMenuList();
                } catch (e) {
                    chk.checked = !nextAvailable; // revert on failure
                    LB.toast(e.message, 'error');
                }
            });
        });

        // Delete menu item
        document.querySelectorAll('.menu-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const itemId = btn.dataset.id;
                const item = menuCache.find(i => i.id === itemId);
                if (!item || !confirm(`Are you sure you want to remove "${item.name}"?`)) return;

                try {
                    await apiRequest(`/business/api/menu/${itemId}`, { method: 'DELETE' });
                    menuCache = menuCache.filter(i => i.id !== itemId);
                    LB.toast(`"${item.name}" deleted successfully.`, 'success');
                    renderMenuList();
                } catch (e) {
                    LB.toast(e.message, 'error');
                }
            });
        });

        // Edit menu item modal opener
        document.querySelectorAll('.menu-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = btn.dataset.id;
                const item = menuCache.find(i => i.id === itemId);
                if (item) {
                    openFoodModal(item);
                }
            });
        });
    };

    /**
     * Food item CRUD modal controller
     */
    const openFoodModal = (item = null) => {
        const modalTitle = document.getElementById('foodModalTitle');
        const submitBtnLabel = document.getElementById('foodFormSubmitLabel');
        const idField = document.getElementById('foodItemId');
        const form = document.getElementById('foodItemForm');

        // Reset error flags
        form.querySelectorAll('.form-err').forEach(e => e.remove());
        form.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(i => i.style.borderColor = '');

        if (item) {
            // Edit mode
            modalTitle.textContent = "Edit Food Item";
            submitBtnLabel.textContent = "Save Changes";
            idField.value = item.id;

            document.getElementById('foodName').value = item.name;
            document.getElementById('foodCategory').value = item.category;
            document.getElementById('foodPrice').value = item.price;
            document.getElementById('foodType').value = item.type;
            document.getElementById('foodPrepTime').value = item.prepTime;
            document.getElementById('foodDesc').value = item.desc;
            document.getElementById('foodImageUrl').value = item.imageUrl || '';
            document.getElementById('foodAvailable').checked = item.available;
        } else {
            // Add mode
            modalTitle.textContent = "Add Food Item";
            submitBtnLabel.textContent = "Add Food Item";
            idField.value = "";
            form.reset();
            document.getElementById('foodAvailable').checked = true;
        }

        LB.openModal('foodModal');
    };

    // Initialize events
    const initEvents = () => {
        // Toggles category and search changes
        document.getElementById('menuSearchInput').addEventListener('input', renderMenuList);
        document.getElementById('menuFilterCategory').addEventListener('change', renderMenuList);
        document.getElementById('menuFilterType').addEventListener('change', renderMenuList);

        // Modals triggers
        document.getElementById('btnAddFoodOpen').addEventListener('click', () => openFoodModal(null));
        document.getElementById('btnAddFoodEmptyBtn').addEventListener('click', () => openFoodModal(null));
        document.getElementById('btnCloseFoodModal').addEventListener('click', () => LB.closeModal('foodModal'));

        // Form Submit handler
        const form = document.getElementById('foodItemForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!LB.validateForm(form)) return;

            const id = document.getElementById('foodItemId').value;
            const payload = {
                name: document.getElementById('foodName').value,
                category: document.getElementById('foodCategory').value,
                price: parseFloat(document.getElementById('foodPrice').value),
                type: document.getElementById('foodType').value,
                prepTime: parseInt(document.getElementById('foodPrepTime').value, 10),
                desc: document.getElementById('foodDesc').value,
                imageUrl: document.getElementById('foodImageUrl').value,
                available: document.getElementById('foodAvailable').checked,
            };

            const submitBtn = document.getElementById('btnFoodSubmit');
            if (submitBtn) submitBtn.disabled = true;

            try {
                if (id) {
                    const data = await apiRequest(`/business/api/menu/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload),
                    });
                    const idx = menuCache.findIndex(i => i.id === id);
                    if (idx !== -1) menuCache[idx] = data.item;
                    LB.toast(`"${payload.name}" updated successfully.`, 'success');
                } else {
                    const data = await apiRequest('/business/api/menu', {
                        method: 'POST',
                        body: JSON.stringify(payload),
                    });
                    menuCache.push(data.item);
                    LB.toast(`"${payload.name}" added successfully.`, 'success');
                }

                LB.closeModal('foodModal');
                renderMenuList();
            } catch (err) {
                LB.toast(err.message, 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    };

    // Start
    initEvents();
    loadMenu();
});
