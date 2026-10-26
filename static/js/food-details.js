/**
 * ============================================================
 * LocalBites — Customer Food Details Module
 * ============================================================
 * Handles:
 * - Business + menu loading
 * - Category / diet filters
 * - Search
 * - Favorites
 * - Food details modal
 * - Cart
 * - Add / remove / quantity update
 * - MySQL cart synchronization
 * - Different-restaurant cart handling
 * - Checkout
 * - Reviews
 * ============================================================
 */

'use strict';
const LB_FOOD_ESCAPE=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');
document.addEventListener('DOMContentLoaded', async () => {

    // =========================================================
    // LOAD BUSINESS + MENU DATA
    // =========================================================

    const urlParams = new URLSearchParams(window.location.search);

    let providerId =
        urlParams.get('biz') ||
        urlParams.get('id') ||
        sessionStorage.getItem('selected_provider_id');

    const FALLBACK_IMAGE =
        '/static/images/food/indian_thali_meal.png';

    if (
        !providerId ||
        providerId === 'null' ||
        providerId === 'undefined' ||
        providerId === '0'
    ) {
        LB.toast(
            'No valid business selected. Redirecting to dashboard...',
            'error'
        );

        setTimeout(() => {
            LB.navigate('/customer/dashboard');
        }, 1500);

        return;
    }

    sessionStorage.setItem(
        'selected_provider_id',
        providerId
    );

    let provider = null;
    let providerMenu = [];

    try {

        const res = await fetch(
            `/customer/api/businesses/${providerId}`,
            {
                credentials: 'same-origin'
            }
        );

        const data = await res.json();

        if (!res.ok || !data.business) {
            throw new Error(
                data.message ||
                `Business #${providerId} not found.`
            );
        }

        provider = data.business;

        providerMenu = (provider.menu || []).map(item => ({
            ...item,

            // Convert IDs to strings everywhere
            id: String(item.id),

            veg: item.type === 'veg',

            prep: `${item.prepTime || 15} mins`,

            rating: item.rating ?? null,
            reviewCount: Number(item.reviewCount || 0),

            bestseller: false,

            ingredients: ''
        }));

    } catch (error) {

        console.error(
            'Business/menu fetch error:',
            error
        );

        LB.toast(
            error.message ||
            "Couldn't load this business right now.",
            'error'
        );

        setTimeout(() => {
            LB.navigate('/customer/dashboard');
        }, 2000);

        return;
    }


    // =========================================================
    // SAFE TEXT HELPER
    // =========================================================

    const safeSet = (id, text) => {

        const element =
            document.getElementById(id);

        if (element) {
            element.textContent = text;
        }
    };


    // =========================================================
    // BUSINESS INFORMATION
    // =========================================================

    safeSet(
        'lblBizName',
        provider.name || 'Local Kitchen'
    );

    safeSet(
        'lblBizType',
        provider.typeLabel || ''
    );

    safeSet(
        'lblBizAddress',
        provider.address || ''
    );

    const businessReviews = provider.reviews || [];
    const businessReviewCount = businessReviews.length;
    const businessAverage = businessReviewCount ? businessReviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / businessReviewCount : null;
    safeSet('lblBizRating', businessAverage == null ? '★ New' : `★ ${businessAverage.toFixed(1)}`);
    safeSet('lblBizReviews', `${businessReviewCount} Review${businessReviewCount !== 1 ? 's' : ''}`);
    safeSet('foodReviewsSummaryPill', businessReviewCount ? `⭐ ${businessAverage.toFixed(1)} (${businessReviewCount} review${businessReviewCount !== 1 ? 's' : ''})` : '⭐ New · No reviews yet');

    const formatTime = (value) => {
        if (!value) return '';
        const parts = String(value).split(':');
        if (parts.length < 2) return String(value);
        const hour = Number(parts[0]);
        const minute = parts[1];
        if (!Number.isFinite(hour)) return String(value);
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${String(hour12).padStart(2, '0')}:${minute} ${suffix}`;
    };

    const providerHours = provider.hours || (
        provider.openingTime && provider.closingTime
            ? `${formatTime(provider.openingTime)} - ${formatTime(provider.closingTime)}`
            : ''
    );

    safeSet(
        'lblBizTime',
        providerHours || '—'
    );

    safeSet(
        'lblBizDistance',
        String(provider.menuItemCount || 0)
    );

    safeSet(
        'lblContactPhone',
        provider.phone || 'N/A'
    );

    safeSet(
        'lblContactEmail',
        provider.email || 'N/A'
    );

    safeSet(
        'lblBizHoursFull',
        providerHours ||
        'Hours not set by this business yet.'
    );

    safeSet(
        'lblBizAboutHeading',
        `About ${provider.name || 'Business'}`
    );

    safeSet(
        'lblBizDesc',
        provider.description ||
        'No description provided yet.'
    );


    // =========================================================
    // BUSINESS OPEN/CLOSED STATUS
    // =========================================================

    const statusEl =
        document.getElementById('lblBizStatus');

    if (statusEl) {

        if (provider.open === true) {

            statusEl.textContent = 'Open Now';

            statusEl.className =
                'biz-status-badge open';

        } else if (provider.open === false) {

            statusEl.textContent = 'Closed';

            statusEl.className =
                'biz-status-badge closed';

        } else {

            statusEl.textContent =
                'Hours not set';

            statusEl.className =
                'biz-status-badge';
        }
    }


    // =========================================================
    // STATE
    // =========================================================

    let cart =
        JSON.parse(
            sessionStorage.getItem('lb_cart')
        ) || [];

    let currentFilter = 'all';

    let currentDietFilter = 'all';

    let selectedModalItem = null;


    // Normalize old sessionStorage IDs
    cart = cart.map(item => ({
        ...item,
        id: String(item.id),
        qty: Number(item.qty) || 1,
        price: Number(item.price) || 0
    }));

    sessionStorage.setItem(
        'lb_cart',
        JSON.stringify(cart)
    );


    // =========================================================
    // CART HELPER FUNCTIONS
    // =========================================================

    const findCartItem = (itemId) => {

        return cart.find(
            item =>
                String(item.id) ===
                String(itemId)
        );
    };


    const findMenuItem = (itemId) => {

        return providerMenu.find(
            item =>
                String(item.id) ===
                String(itemId)
        );
    };


    const saveLocalCart = () => {

        sessionStorage.setItem(
            'lb_cart',
            JSON.stringify(cart)
        );
    };


    // =========================================================
    // DATABASE CART ADD
    // =========================================================

    const addItemToDatabase = async (
        menuId,
        quantity
    ) => {

        const response = await fetch(
            '/customer/api/cart/add',
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json'
                },

                credentials: 'same-origin',

                body: JSON.stringify({
                    menu_id: menuId,
                    quantity: quantity
                })
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch (error) {
            throw new Error(
                'Invalid response from server.'
            );
        }

        return {
            response,
            data
        };
    };


    // =========================================================
    // DATABASE CART CLEAR
    // =========================================================

    const clearDatabaseCart = async () => {

        const response = await fetch(
            '/customer/api/cart/clear',
            {
                method: 'POST',
                credentials: 'same-origin'
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch (error) {
            throw new Error(
                'Invalid response from server.'
            );
        }

        if (
            !response.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                'Could not clear cart.'
            );
        }

        return data;
    };


    // =========================================================
    // ADD ITEM TO DATABASE WITH RESTAURANT CONFLICT HANDLING
    // =========================================================

    const addToDatabaseWithConflictCheck = async (
        menuId,
        quantity
    ) => {

        let result =
            await addItemToDatabase(
                menuId,
                quantity
            );

        let response = result.response;
        let data = result.data;


        // -----------------------------------------------------
        // DIFFERENT RESTAURANT FOUND
        // -----------------------------------------------------

        if (data.conflicting_cart) {

            const shouldClear =
                confirm(data.message);

            if (!shouldClear) {
                return false;
            }


            // Clear old restaurant cart
            await clearDatabaseCart();


            // Try adding the new item again
            result =
                await addItemToDatabase(
                    menuId,
                    quantity
                );

            response = result.response;

            data = result.data;


            if (
                !response.ok ||
                !data.success
            ) {
                throw new Error(
                    data.message ||
                    'Could not add item to cart.'
                );
            }

            return true;
        }


        // -----------------------------------------------------
        // NORMAL ERROR
        // -----------------------------------------------------

        if (
            !response.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                'Could not add item to cart.'
            );
        }


        return true;
    };


    // =========================================================
    // UPDATE LOCAL CART
    // =========================================================

    const updateLocalCart = (
        item,
        quantity
    ) => {

        const itemId =
            String(item.id);

        const existingItem =
            findCartItem(itemId);


        if (existingItem) {

            existingItem.qty += quantity;


            if (existingItem.qty <= 0) {

                cart =
                    cart.filter(
                        cartItem =>
                            String(cartItem.id) !==
                            itemId
                    );
            }

        } else if (quantity > 0) {

            cart.push({
                id: itemId,

                name: item.name,

                price:
                    Number(item.price) || 0,

                qty: quantity
            });
        }


        saveLocalCart();
    };


    // =========================================================
    // RENDER FOOD CARD
    // =========================================================

    const renderFoodCard = (item) => {

        const dietClass =
            item.veg
                ? 'veg-pill'
                : 'nonveg-pill';


        const bestSellerBadge =
            item.bestseller
                ? `<span class="bestseller-badge">Bestseller</span>`
                : '';


        const inCartItem =
            findCartItem(item.id);


        const hasQty =
            inCartItem
                ? 'hidden'
                : '';


        const hasControls =
            inCartItem
                ? ''
                : 'hidden';


        const qtyVal =
            inCartItem
                ? inCartItem.qty
                : 1;


        const isFav =
            sessionStorage.getItem(
                `fav_item_${item.id}`
            ) === 'true'
                ? 'active'
                : '';


        const heartChar =
            isFav
                ? '❤️'
                : '♡';


        return `
            <div
                class="menu-card"
                data-id="${item.id}"
                data-category="${item.category || ''}"
                data-veg="${item.veg}"
            >

                <div class="card-img-wrap">

                    <img
                        src="${item.imageUrl || FALLBACK_IMAGE}"
                        alt="${item.name}"
                        class="card-img"
                        onerror="this.onerror=null; this.src='${FALLBACK_IMAGE}';"
                    >

                    <div class="card-badge-container">

                        <div class="badge-row-top">

                            <span class="diet-pill ${dietClass}">
                                <span class="diet-dot"></span>
                            </span>

                            <button
                                type="button"
                                class="card-heart-btn ${isFav}"
                                onclick="
                                    event.stopPropagation();
                                    LB_DETAILS.toggleFavorite(
                                        '${item.id}',
                                        this
                                    )
                                "
                            >
                                ${heartChar}
                            </button>

                        </div>

                        <div style="display:flex;">
                            ${bestSellerBadge}
                        </div>

                    </div>

                </div>


                <div
                    class="card-info-box"
                    onclick="
                        LB_DETAILS.openFoodDetails(
                            '${item.id}'
                        )
                    "
                >

                    <h3 class="card-name">
                        ${item.name}
                    </h3>

                    <p class="card-desc">
                        ${item.desc || ''}
                    </p>

                    <div class="card-rating-row">
                        <span>
                            ⏱ ${item.prep}
                        </span>
                    </div>

                </div>


                <div class="card-action-bar">

                    <span class="card-price">
                        ₹${item.price}
                    </span>

                    <div class="action-box">

                        <button
                            type="button"
                            class="add-btn ${hasQty}"
                            onclick="
                                event.stopPropagation();
                                LB_DETAILS.handleAddToCartClick(
                                    '${item.id}',
                                    this
                                )
                            "
                        >
                            ADD
                        </button>


                        <div
                            class="quantity-selector ${hasControls}"
                        >

                            <button
                                type="button"
                                class="qty-btn"
                                onclick="
                                    event.stopPropagation();
                                    LB_DETAILS.updateQty(
                                        '${item.id}',
                                        -1
                                    )
                                "
                            >
                                -
                            </button>


                            <span
                                class="qty-val"
                                id="qty-val-${item.id}"
                            >
                                ${qtyVal}
                            </span>


                            <button
                                type="button"
                                class="qty-btn"
                                onclick="
                                    event.stopPropagation();
                                    LB_DETAILS.updateQty(
                                        '${item.id}',
                                        1
                                    )
                                "
                            >
                                +
                            </button>

                        </div>

                    </div>

                </div>

            </div>
        `;
    };


    // =========================================================
    // MOST ORDERED CARD
    // =========================================================

    const renderMostOrderedCard = (
        item,
        index
    ) => {

        const inCartItem =
            findCartItem(item.id);


        const hasQty =
            inCartItem
                ? 'hidden'
                : '';


        const hasControls =
            inCartItem
                ? ''
                : 'hidden';


        const qtyVal =
            inCartItem
                ? inCartItem.qty
                : 1;


        const badgeText =
            index < 2
                ? '🔥 Most Ordered'
                : '⭐ Favorite';


        return `
            <div
                class="pairing-card"
                style="
                    background: var(--clr-surface);
                    border: 1px solid var(--clr-border-1);
                    border-radius: var(--r-md);
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                "
            >

                <div
                    style="
                        position: relative;
                        width: 100%;
                        height: 95px;
                        border-radius: var(--r-sm);
                        overflow: hidden;
                        margin-bottom: 8px;
                        cursor: pointer;
                    "
                    onclick="
                        LB_DETAILS.openFoodDetails(
                            '${item.id}'
                        )
                    "
                >

                    <img
                        src="${item.imageUrl || FALLBACK_IMAGE}"
                        alt="${item.name}"
                        style="
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                        "
                        onerror="
                            this.onerror=null;
                            this.src='${FALLBACK_IMAGE}';
                        "
                    >

                    <span
                        style="
                            position: absolute;
                            top: 6px;
                            left: 6px;
                            background: #FF6B35;
                            color: #fff;
                            font-size: 10px;
                            font-weight: 700;
                            padding: 2px 6px;
                            border-radius: 4px;
                            text-transform: uppercase;
                        "
                    >
                        ${badgeText}
                    </span>

                </div>


                <div
                    style="
                        margin-bottom: 8px;
                        cursor: pointer;
                    "
                    onclick="
                        LB_DETAILS.openFoodDetails(
                            '${item.id}'
                        )
                    "
                >

                    <h4
                        style="
                            font-size: var(--fs-13);
                            font-weight: 700;
                            color: var(--clr-text-1);
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                        "
                    >
                        ${item.name}
                    </h4>

                    <span
                        style="
                            font-size: var(--fs-13);
                            font-weight: 800;
                            color: var(--clr-primary);
                        "
                    >
                        ₹${item.price}
                    </span>

                </div>


                <div
                    class="action-box"
                    style="height: 32px;"
                    onclick="event.stopPropagation();"
                >

                    <button
                        type="button"
                        class="add-btn ${hasQty}"
                        style="
                            font-size: 12px;
                            height: 100%;
                        "
                        onclick="
                            event.stopPropagation();
                            LB_DETAILS.handleAddToCartClick(
                                '${item.id}',
                                this
                            )
                        "
                    >
                        + ADD
                    </button>


                    <div
                        class="quantity-selector ${hasControls}"
                        style="height: 100%;"
                    >

                        <button
                            type="button"
                            class="qty-btn"
                            onclick="
                                event.stopPropagation();
                                LB_DETAILS.updateQty(
                                    '${item.id}',
                                    -1
                                )
                            "
                        >
                            -
                        </button>


                        <span
                            class="qty-val"
                            style="font-size: 12px;"
                        >
                            ${qtyVal}
                        </span>


                        <button
                            type="button"
                            class="qty-btn"
                            onclick="
                                event.stopPropagation();
                                LB_DETAILS.updateQty(
                                    '${item.id}',
                                    1
                                )
                            "
                        >
                            +
                        </button>

                    </div>

                </div>

            </div>
        `;
    };


    // =========================================================
    // MOST ORDERED SECTION
    // =========================================================

    const renderMostOrderedSection = () => {

    const recContainer =
        document.getElementById(
            'recommendedFoodSlider'
        );

    if (
        !recContainer ||
        !providerMenu ||
        providerMenu.length === 0
    ) {
        return;
    }


    // ---------------------------------------------------------
    // KEEP THE SAME 4 ITEMS AFTER THE FIRST RENDER
    // ---------------------------------------------------------
    // The recommendations are selected only once when the
    // business page is opened.
    //
    // ADD / quantity changes will only refresh the quantities
    // on these same cards instead of selecting new cards.
    // ---------------------------------------------------------

    if (!window.localBitesMostOrderedIds) {

        const shuffledMenu =
            [...providerMenu].sort(
                () => 0.5 - Math.random()
            );

        window.localBitesMostOrderedIds =
            shuffledMenu
                .slice(0, 4)
                .map(item => String(item.id));
    }


    // ---------------------------------------------------------
    // GET THE SAME ITEMS FROM THE CURRENT BUSINESS MENU
    // ---------------------------------------------------------

    const topItems =
        window.localBitesMostOrderedIds
            .map(id =>
                providerMenu.find(
                    item => String(item.id) === String(id)
                )
            )
            .filter(Boolean);


    // ---------------------------------------------------------
    // DISPLAY RECOMMENDATION SECTION
    // ---------------------------------------------------------

    recContainer.style.display =
        'grid';

    recContainer.style.gridTemplateColumns =
        'repeat(auto-fill, minmax(150px, 1fr))';

    recContainer.style.gap =
        '12px';

    recContainer.style.overflowX =
        'visible';


    // ---------------------------------------------------------
    // RENDER THE SAME 4 CARDS
    // ---------------------------------------------------------

    recContainer.innerHTML =
        topItems
            .map(
                (item, index) =>
                    renderMostOrderedCard(
                        item,
                        index
                    )
            )
            .join('');
};

    // =========================================================
    // FILTER + RENDER MENU
    // =========================================================

    const filterAndRenderMenu = () => {

        const query =
            document
                .getElementById(
                    'menuSearchInput'
                )
                ?.value
                .toLowerCase()
                .trim() || '';


        const filtered =
            providerMenu.filter(item => {

                if (
                    currentFilter !== 'all' &&
                    item.category !== currentFilter
                ) {
                    return false;
                }


                if (
                    currentDietFilter === 'veg' &&
                    !item.veg
                ) {
                    return false;
                }


                if (
                    currentDietFilter === 'nonveg' &&
                    item.veg
                ) {
                    return false;
                }


                if (
                    query &&
                    !item.name
                        .toLowerCase()
                        .includes(query) &&
                    !(
                        item.desc || ''
                    )
                        .toLowerCase()
                        .includes(query)
                ) {
                    return false;
                }


                return true;
            });


        const grid =
            document.getElementById(
                'menuGrid'
            );


        const emptyState =
            document.getElementById(
                'menuEmptyState'
            );


        if (!grid || !emptyState) {
            return;
        }


        if (filtered.length === 0) {

            grid.innerHTML = '';

            emptyState.classList.remove(
                'hidden'
            );

        } else {

            emptyState.classList.add(
                'hidden'
            );

            grid.innerHTML =
                filtered
                    .map(renderFoodCard)
                    .join('');
        }
    };


    // =========================================================
    // RENDER CART
    // =========================================================

    const renderCartItems = () => {

        const cartList =
            document.getElementById(
                'cartItemsList'
            );


        const emptyCartState =
            document.getElementById(
                'cartEmptyState'
            );


        const summarySec =
            document.getElementById(
                'cartSummarySection'
            );


        if (
            !cartList ||
            !emptyCartState ||
            !summarySec
        ) {
            return;
        }


        // -----------------------------------------------------
        // EMPTY CART
        // -----------------------------------------------------

        if (cart.length === 0) {

            cartList.innerHTML = '';

            emptyCartState.classList.remove(
                'hidden'
            );

            summarySec.classList.add(
                'hidden'
            );


            document
                .getElementById(
                    'btnFloatingCart'
                )
                ?.classList.add(
                    'hidden'
                );


            document
                .getElementById(
                    'lblNavCartCount'
                )
                ?.classList.add(
                    'hidden'
                );


            return;
        }


        // -----------------------------------------------------
        // CART HAS ITEMS
        // -----------------------------------------------------

        emptyCartState.classList.add(
            'hidden'
        );

        summarySec.classList.remove(
            'hidden'
        );


        cartList.innerHTML =
            cart.map(item => {

                const menuItem =
                    findMenuItem(item.id);


                const imgSrc =
                    (
                        menuItem &&
                        menuItem.imageUrl
                    ) ||
                    FALLBACK_IMAGE;


                return `
                    <div class="cart-item">

                        <img
                            src="${imgSrc}"
                            alt="${item.name}"
                            class="cart-item-img"
                            onerror="
                                this.onerror=null;
                                this.src='${FALLBACK_IMAGE}';
                            "
                        >


                        <div class="cart-item-details">

                            <h4 class="cart-item-name">
                                ${item.name}
                            </h4>

                            <span class="cart-item-price">
                                ₹${item.price}
                            </span>

                        </div>


                        <div class="cart-item-actions">

                            <div class="cart-item-qty">

                                <button
                                    type="button"
                                    class="qty-btn"
                                    onclick="
                                        LB_DETAILS.updateQty(
                                            '${item.id}',
                                            -1
                                        )
                                    "
                                >
                                    -
                                </button>


                                <span class="qty-val">
                                    ${item.qty}
                                </span>


                                <button
                                    type="button"
                                    class="qty-btn"
                                    onclick="
                                        LB_DETAILS.updateQty(
                                            '${item.id}',
                                            1
                                        )
                                    "
                                >
                                    +
                                </button>

                            </div>


                            <button
                                type="button"
                                class="cart-item-remove"
                                onclick="
                                    LB_DETAILS.removeFromCart(
                                        '${item.id}'
                                    )
                                "
                            >
                                Remove
                            </button>

                        </div>

                    </div>
                `;
            }).join('');


        // -----------------------------------------------------
        // TOTAL
        // -----------------------------------------------------

        let subtotal = 0;

        let count = 0;


        cart.forEach(item => {

            subtotal +=
                Number(item.price) *
                Number(item.qty);

            count +=
                Number(item.qty);
        });


        const cartTotalElem =
            document.getElementById(
                'lblCartTotal'
            );


        if (cartTotalElem) {

            cartTotalElem.textContent =
                `₹${subtotal}`;
        }


        // -----------------------------------------------------
        // NAV CART COUNT
        // -----------------------------------------------------

        const floatBtn =
            document.getElementById(
                'btnFloatingCart'
            );


        if (floatBtn) {

            floatBtn.classList.add(
                'hidden'
            );
        }


        const navCount =
            document.getElementById(
                'lblNavCartCount'
            );


        if (navCount) {

            navCount.textContent =
                count;

            navCount.classList.remove(
                'hidden'
            );
        }
    };


    // =========================================================
    // OPEN CART DRAWER
    // =========================================================

    const openCartDrawer = () => {

        renderCartItems();

        document
            .getElementById(
                'cartSidebarOverlay'
            )
            ?.classList.add(
                'active'
            );
    };


    // =========================================================
    // REVIEWS
    // =========================================================

    const renderReviews = () => {

        const reviewsContainer =
            document.getElementById(
                'reviewsContainer'
            );


        const emptyState =
            document.getElementById(
                'reviewsEmptyState'
            );


        const reviewData =
            provider.reviews || [];


        if (
            !reviewsContainer ||
            !emptyState
        ) {
            return;
        }


        if (reviewData.length === 0) {

            reviewsContainer.innerHTML = '';

            emptyState.classList.remove(
                'hidden'
            );

            return;
        }


        emptyState.classList.add(
            'hidden'
        );


        reviewsContainer.innerHTML =
            reviewData.map(
                (rev, index) => {

                    const rating =
                        Number(rev.rating) || 0;


                    const stars =
                        '★'.repeat(rating) +
                        '☆'.repeat(
                            Math.max(
                                0,
                                5 - rating
                            )
                        );


                    const verified =
                        rev.verified
                            ? `
                                <span class="verified-badge">
                                    ✓ Verified
                                </span>
                            `
                            : '';


                    return `
                        <div class="review-card">

                            <div class="review-header">

                                <div class="reviewer-profile">

                                    <div class="reviewer-avatar">
                                        ${
                                            (
                                                rev.name ||
                                                'U'
                                            ).charAt(0)
                                        }
                                    </div>

                                    <div>

                                        <h4 class="reviewer-name">
                                            ${LB_FOOD_ESCAPE(rev.name || 'User')}
                                            ${verified}
                                        </h4>

                                        <span class="review-date">
                                            ${LB_FOOD_ESCAPE(rev.date || '')}
                                        </span>

                                    </div>

                                </div>


                                <div class="review-meta">

                                    <span class="review-stars">
                                        ${stars}
                                    </span>

                                </div>

                            </div>


                            <p class="review-text">
                                "${LB_FOOD_ESCAPE(rev.text || '')}"
                            </p>


                            ${rev.businessReply ? `<div style="margin-top:10px;padding:10px 12px;border-radius:9px;background:#f0f7f0;border-left:3px solid #2E7D32;"><div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:4px;">💬 Business Response</div><div style="font-size:12px;color:#475569;">${LB_FOOD_ESCAPE(rev.businessReply)}</div></div>` : ''}

                            <div class="review-actions">

                                <button
                                    type="button"
                                    class="btn-helpful"
                                    onclick="
                                        LB_DETAILS.helpfulReview(
                                            ${index},
                                            this
                                        )
                                    "
                                >
                                    👍 Helpful
                                    (
                                    <span class="helpful-count">
                                        0
                                    </span>
                                    )

                                </button>

                            </div>

                        </div>
                    `;
                }
            ).join('');
    };


    // =========================================================
    // INITIAL RENDER
    // =========================================================

    renderMostOrderedSection();

    filterAndRenderMenu();

    renderCartItems();

    renderReviews();


    // =========================================================
    // CATEGORY / DIET FILTERS
    // =========================================================

    const chips =
        document.querySelectorAll(
            '.category-chips-scroll .chip'
        );


    chips.forEach(chip => {

        chip.addEventListener(
            'click',
            () => {

                const category =
                    chip.dataset.category;


                const diet =
                    chip.dataset.diet;


                if (category) {

                    chips.forEach(c => {

                        if (
                            c.dataset.category
                        ) {
                            c.classList.remove(
                                'active'
                            );
                        }
                    });


                    chip.classList.add(
                        'active'
                    );


                    currentFilter =
                        category;

                } else if (diet) {

                    const isActive =
                        chip.classList.contains(
                            'active'
                        );


                    chips.forEach(c => {

                        if (
                            c.dataset.diet
                        ) {
                            c.classList.remove(
                                'active'
                            );
                        }
                    });


                    if (isActive) {

                        currentDietFilter =
                            'all';

                    } else {

                        chip.classList.add(
                            'active'
                        );

                        currentDietFilter =
                            diet;
                    }
                }


                filterAndRenderMenu();
            }
        );
    });


    // =========================================================
    // SEARCH
    // =========================================================

    const searchInput =
        document.getElementById(
            'menuSearchInput'
        );


    const clearSearchBtn =
        document.getElementById(
            'btnClearMenuSearch'
        );


    searchInput?.addEventListener(
        'input',
        event => {

            const value =
                event.target.value;


            if (value) {

                clearSearchBtn
                    ?.classList
                    .remove('hidden');

            } else {

                clearSearchBtn
                    ?.classList
                    .add('hidden');
            }


            filterAndRenderMenu();
        }
    );


    clearSearchBtn?.addEventListener(
        'click',
        () => {

            if (searchInput) {
                searchInput.value = '';
            }


            clearSearchBtn.classList.add(
                'hidden'
            );


            filterAndRenderMenu();
        }
    );


    // =========================================================
    // RESET FILTERS
    // =========================================================

    document
        .getElementById(
            'btnResetFilters'
        )
        ?.addEventListener(
            'click',
            () => {

                if (searchInput) {
                    searchInput.value = '';
                }


                clearSearchBtn
                    ?.classList
                    .add('hidden');


                currentFilter =
                    'all';


                currentDietFilter =
                    'all';


                chips.forEach(chip => {

                    chip.classList.remove(
                        'active'
                    );


                    if (
                        chip.dataset.category ===
                        'all'
                    ) {
                        chip.classList.add(
                            'active'
                        );
                    }
                });


                filterAndRenderMenu();
            }
        );


    // =========================================================
    // BUSINESS FAVORITE
    // =========================================================

    const topFavBtn =
        document.getElementById(
            'btnFavTop'
        );


    if (topFavBtn) {

        const providerFavState =
            sessionStorage.getItem(
                `fav_provider_${provider.id}`
            ) === 'true';


        if (providerFavState) {

            topFavBtn.classList.add(
                'active'
            );

            topFavBtn.style.color =
                'var(--clr-error)';

            topFavBtn
                .querySelector(
                    '.heart-svg'
                )
                ?.setAttribute(
                    'fill',
                    'var(--clr-error)'
                );
        }


        topFavBtn.addEventListener(
            'click',
            () => {

                const active =
                    topFavBtn.classList.toggle(
                        'active'
                    );


                if (active) {

                    topFavBtn.style.color =
                        'var(--clr-error)';


                    topFavBtn
                        .querySelector(
                            '.heart-svg'
                        )
                        ?.setAttribute(
                            'fill',
                            'var(--clr-error)'
                        );


                    sessionStorage.setItem(
                        `fav_provider_${provider.id}`,
                        'true'
                    );


                    LB.toast(
                        `${provider.name} added to your favorites!`,
                        'success'
                    );

                } else {

                    topFavBtn.style.color =
                        '';


                    topFavBtn
                        .querySelector(
                            '.heart-svg'
                        )
                        ?.setAttribute(
                            'fill',
                            'none'
                        );


                    sessionStorage.setItem(
                        `fav_provider_${provider.id}`,
                        'false'
                    );


                    LB.toast(
                        'Removed from favorites.',
                        'info'
                    );
                }
            }
        );
    }


    // =========================================================
    // SHARE
    // =========================================================

    const shareTrigger = (
        title,
        text,
        url
    ) => {

        if (navigator.share) {

            navigator.share({
                title,
                text,
                url
            })
            .then(() => {

                LB.toast(
                    'Link shared successfully!',
                    'success'
                );
            })
            .catch(() => {

                LB.toast(
                    'Sharing cancelled.',
                    'info'
                );
            });

        } else {

            navigator.clipboard
                .writeText(url)
                .then(() => {

                    LB.toast(
                        'Share link copied to clipboard!',
                        'success'
                    );
                })
                .catch(() => {

                    LB.toast(
                        'Failed to copy link.',
                        'error'
                    );
                });
        }
    };


    document
        .getElementById(
            'btnShareTop'
        )
        ?.addEventListener(
            'click',
            () => {

                shareTrigger(
                    provider.name,
                    `Check out sweet local meals from ${provider.name}!`,
                    window.location.href
                );
            }
        );


    document
        .getElementById(
            'btnShareAction'
        )
        ?.addEventListener(
            'click',
            () => {

                shareTrigger(
                    provider.name,
                    `Check out sweet local meals from ${provider.name}!`,
                    window.location.href
                );
            }
        );


    // =========================================================
    // MAP
    // =========================================================

    document
        .getElementById(
            'btnViewMap'
        )
        ?.addEventListener(
            'click',
            () => {

                LB.toast(
                    `Map location coordinates for ${provider.name} loaded.`,
                    'info'
                );
            }
        );


    // =========================================================
    // CART DRAWER
    // =========================================================

    document
        .getElementById(
            'btnFloatingCart'
        )
        ?.addEventListener(
            'click',
            openCartDrawer
        );


    document
        .getElementById(
            'btnCartTop'
        )
        ?.addEventListener(
            'click',
            openCartDrawer
        );


    document
        .getElementById(
            'btnCartClose'
        )
        ?.addEventListener(
            'click',
            () => {

                document
                    .getElementById(
                        'cartSidebarOverlay'
                    )
                    ?.classList.remove(
                        'active'
                    );
            }
        );


    document
        .getElementById(
            'cartSidebarOverlay'
        )
        ?.addEventListener(
            'click',
            event => {

                if (
                    event.target.id ===
                    'cartSidebarOverlay'
                ) {

                    document
                        .getElementById(
                            'cartSidebarOverlay'
                        )
                        ?.classList.remove(
                            'active'
                        );
                }
            }
        );


    // =========================================================
    // CHECKOUT
    // =========================================================

    document
        .getElementById(
            'btnCartCheckout'
        )
        ?.addEventListener(
            'click',
            async () => {

                const btn =
                    document.getElementById(
                        'btnCartCheckout'
                    );


                if (cart.length === 0) {

                    LB.toast(
                        'Your cart is empty.',
                        'error'
                    );

                    return;
                }


                const deliveryType =
                    document.querySelector(
                        'input[name="deliveryType"]:checked'
                    )?.value ||
                    'delivery';


                const paymentMethod =
                    document.querySelector(
                        'input[name="paymentMethod"]:checked'
                    )?.value ||
                    'online';


                LB.setLoading(
                    btn,
                    true
                );


                try {

                    const res =
                        await fetch(
                            '/customer/api/checkout',
                            {
                                method: 'POST',

                                headers: {
                                    'Content-Type':
                                        'application/json'
                                },

                                credentials:
                                    'same-origin',

                                body:
                                    JSON.stringify({
                                        businessId:
                                            provider.id,

                                        deliveryType,

                                        paymentMethod,

                                        items:
                                            cart.map(
                                                item => ({
                                                    id:
                                                        item.id,

                                                    qty:
                                                        item.qty
                                                })
                                            )
                                    })
                            }
                        );


                    const data =
                        await res.json();


                    if (
                        !res.ok ||
                        !data.success
                    ) {
                        throw new Error(
                            data.message ||
                            'Could not place your order.'
                        );
                    }


                    // Clear local cart
                    cart = [];


                    sessionStorage.removeItem(
                        'lb_cart'
                    );


                    // Store active order
                    sessionStorage.setItem(
                        'active_order_id',
                        data.order.id
                    );


                    LB.navigate(
                        '/customer/payment'
                    );

                } catch (error) {

                    console.error(
                        'Checkout error:',
                        error
                    );


                    LB.toast(
                        error.message ||
                        'Could not place order.',
                        'error'
                    );

                } finally {

                    LB.setLoading(
                        btn,
                        false
                    );
                }
            }
        );


    // =========================================================
    // MODAL QUANTITY + / -
    // =========================================================

    document
        .getElementById(
            'btnModalInc'
        )
        ?.addEventListener(
            'click',
            () => {

                if (!selectedModalItem) {
                    return;
                }


                const qtyElement =
                    document.getElementById(
                        'lblModalQty'
                    );


                const totalElement =
                    document.getElementById(
                        'lblModalTotal'
                    );


                if (!qtyElement) {
                    return;
                }


                const currentQty =
                    parseInt(
                        qtyElement.textContent
                    ) || 1;


                const newQty =
                    currentQty + 1;


                qtyElement.textContent =
                    newQty;


                if (totalElement) {

                    totalElement.textContent =
                        `₹${
                            newQty *
                            Number(
                                selectedModalItem.price
                            )
                        }`;
                }
            }
        );


    document
        .getElementById(
            'btnModalDec'
        )
        ?.addEventListener(
            'click',
            () => {

                if (!selectedModalItem) {
                    return;
                }


                const qtyElement =
                    document.getElementById(
                        'lblModalQty'
                    );


                const totalElement =
                    document.getElementById(
                        'lblModalTotal'
                    );


                if (!qtyElement) {
                    return;
                }


                const currentQty =
                    parseInt(
                        qtyElement.textContent
                    ) || 1;


                if (currentQty <= 1) {
                    return;
                }


                const newQty =
                    currentQty - 1;


                qtyElement.textContent =
                    newQty;


                if (totalElement) {

                    totalElement.textContent =
                        `₹${
                            newQty *
                            Number(
                                selectedModalItem.price
                            )
                        }`;
                }
            }
        );


    // =========================================================
    // PUBLIC FUNCTIONS
    // =========================================================

    window.LB_DETAILS = {

        // -----------------------------------------------------
        // FAVORITE
        // -----------------------------------------------------

        toggleFavorite: async (itemId, buttonEl) => {
    const item = providerMenu.find(
        menuItem => String(menuItem.id) === String(itemId)
    );

    if (!item) {
        LB.toast('Food item not found.', 'error');
        return;
    }

    try {
        const res = await fetch('/customer/api/favorites/toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                menu_id: item.id,
                business_id: item.businessId || provider.id
            })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(
                data.message || 'Could not update favorites.'
            );
        }

        if (data.is_favorite) {
            buttonEl.classList.add('active');
            buttonEl.innerHTML = '❤️';
            LB.toast('Added to favorites!', 'success');
        } else {
            buttonEl.classList.remove('active');
            buttonEl.innerHTML = '♡';
            LB.toast('Removed from favorites.', 'info');
        }

    } catch (error) {
        console.error('Favorite error:', error);
        LB.toast(
            error.message || 'Could not update favorites.',
            'error'
        );
    }
},


        // -----------------------------------------------------
        // ADD ITEM TO CART
        // -----------------------------------------------------

        handleAddToCartClick:
            async (
                itemId,
                buttonEl,
                quantity = 1
            ) => {

                const item =
                    findMenuItem(itemId);


                if (!item) {

                    LB.toast(
                        'Food item not found.',
                        'error'
                    );

                    return false;
                }


                try {

                    // -----------------------------------------
                    // ADD TO MYSQL CART
                    // -----------------------------------------

                    const success =
                        await addToDatabaseWithConflictCheck(
                            item.id,
                            quantity
                        );


                    if (!success) {
                        return false;
                    }


                    // -----------------------------------------
                    // UPDATE LOCAL CART
                    // -----------------------------------------

                    updateLocalCart(
                        item,
                        quantity
                    );


                    // -----------------------------------------
                    // UPDATE UI
                    // -----------------------------------------

                    renderCartItems();

                    filterAndRenderMenu();

                    renderMostOrderedSection();


                    // -----------------------------------------
                    // SUCCESS MESSAGE
                    // -----------------------------------------

                    LB.toast(
                        'Item added to cart!',
                        'success'
                    );


                    return true;

                } catch (error) {

                    console.error(
                        'Add to cart error:',
                        error
                    );


                    LB.toast(
                        error.message ||
                        'Could not add item to cart.',
                        'error'
                    );


                    return false;
                }
            },


        // -----------------------------------------------------
        // UPDATE QUANTITY
        // -----------------------------------------------------

        updateQty:
            async (
                itemId,
                change
            ) => {

                const item =
                    findMenuItem(itemId);


                if (!item) {

                    LB.toast(
                        'Food item not found.',
                        'error'
                    );

                    return;
                }


                const currentItem =
                    findCartItem(itemId);


                // ------------------------------------------------
                // ADD FIRST ITEM
                // ------------------------------------------------

                if (
                    !currentItem &&
                    change > 0
                ) {

                    await LB_DETAILS
                        .handleAddToCartClick(
                            itemId,
                            null,
                            change
                        );

                    return;
                }


                // ------------------------------------------------
                // ITEM DOES NOT EXIST AND CHANGE IS -1
                // ------------------------------------------------

                if (!currentItem) {
                    return;
                }


                const newQuantity =
                    Number(
                        currentItem.qty
                    ) +
                    Number(change);


                // ------------------------------------------------
                // REMOVE ITEM
                // ------------------------------------------------

                if (newQuantity <= 0) {

                    try {

                        const result =
                            await addItemToDatabase(
                                item.id,
                                -currentItem.qty
                            );


                        if (
                            !result.response.ok ||
                            !result.data.success
                        ) {
                            throw new Error(
                                result.data.message ||
                                'Could not remove item.'
                            );
                        }


                        cart =
                            cart.filter(
                                cartItem =>
                                    String(
                                        cartItem.id
                                    ) !==
                                    String(itemId)
                            );


                        saveLocalCart();


                        renderCartItems();

                        filterAndRenderMenu();

                        renderMostOrderedSection();


                        LB.toast(
                            'Item removed from cart.',
                            'info'
                        );

                    } catch (error) {

                        console.error(
                            'Remove item error:',
                            error
                        );


                        LB.toast(
                            error.message ||
                            'Could not remove item.',
                            'error'
                        );
                    }


                    return;
                }


                // ------------------------------------------------
                // NORMAL QUANTITY CHANGE
                // ------------------------------------------------

                try {

                    const result =
                        await addItemToDatabase(
                            item.id,
                            change
                        );


                    if (
                        !result.response.ok ||
                        !result.data.success
                    ) {
                        throw new Error(
                            result.data.message ||
                            'Could not update quantity.'
                        );
                    }


                    currentItem.qty =
                        newQuantity;


                    saveLocalCart();


                    renderCartItems();

                    filterAndRenderMenu();

                    renderMostOrderedSection();

                } catch (error) {

                    console.error(
                        'Quantity update error:',
                        error
                    );


                    LB.toast(
                        error.message ||
                        'Could not update quantity.',
                        'error'
                    );
                }
            },


        // -----------------------------------------------------
        // REMOVE FROM CART
        // -----------------------------------------------------

        removeFromCart:
            async (
                itemId
            ) => {

                const item =
                    findCartItem(itemId);


                if (!item) {
                    return;
                }


                try {

                    const result =
                        await addItemToDatabase(
                            item.id,
                            -Number(item.qty)
                        );


                    if (
                        !result.response.ok ||
                        !result.data.success
                    ) {
                        throw new Error(
                            result.data.message ||
                            'Could not remove item.'
                        );
                    }


                    cart =
                        cart.filter(
                            cartItem =>
                                String(
                                    cartItem.id
                                ) !==
                                String(itemId)
                        );


                    saveLocalCart();


                    renderCartItems();

                    filterAndRenderMenu();

                    renderMostOrderedSection();


                    LB.toast(
                        'Item removed from cart.',
                        'info'
                    );

                } catch (error) {

                    console.error(
                        'Remove from cart error:',
                        error
                    );


                    LB.toast(
                        error.message ||
                        'Could not remove item.',
                        'error'
                    );
                }
            },


        // -----------------------------------------------------
        // OPEN FOOD DETAILS MODAL
        // -----------------------------------------------------

        openFoodDetails:
            (itemId) => {

                const item =
                    findMenuItem(itemId);


                if (!item) {

                    LB.toast(
                        'Food item not found.',
                        'error'
                    );

                    return;
                }


                selectedModalItem =
                    item;


                // ---------------------------------------------
                // IMAGE
                // ---------------------------------------------

                const modalImg =
                    document.getElementById(
                        'modalFoodImg'
                    );


                if (modalImg) {

                    modalImg.src =
                        item.imageUrl ||
                        FALLBACK_IMAGE;


                    modalImg.onerror =
                        function () {

                            this.onerror =
                                null;

                            this.src =
                                FALLBACK_IMAGE;
                        };
                }


                // ---------------------------------------------
                // NAME
                // ---------------------------------------------

                const nameEl =
                    document.getElementById(
                        'modalFoodName'
                    );


                if (nameEl) {

                    nameEl.textContent =
                        item.name;
                }


                // ---------------------------------------------
                // PRICE
                // ---------------------------------------------

                const priceEl =
                    document.getElementById(
                        'modalFoodPrice'
                    );


                if (priceEl) {

                    priceEl.textContent =
                        `₹${item.price}`;
                }


                // ---------------------------------------------
                // PREP TIME
                // ---------------------------------------------

                const prepEl =
                    document.getElementById(
                        'modalFoodPrep'
                    );


                if (prepEl) {

                    prepEl.textContent =
                        `⏱ ${item.prep} Prep`;
                }


                // ---------------------------------------------
                // DIET
                // ---------------------------------------------

                const dietEl =
                    document.getElementById(
                        'modalFoodDiet'
                    );


                if (dietEl) {

                    dietEl.textContent =
                        item.veg
                            ? 'Veg'
                            : 'Non-Veg';


                    dietEl.style.color =
                        item.veg
                            ? 'var(--clr-success)'
                            : 'var(--clr-error)';


                    dietEl.style.borderColor =
                        item.veg
                            ? 'var(--clr-success)'
                            : 'var(--clr-error)';
                }


                // ---------------------------------------------
                // RATING
                // ---------------------------------------------

                const ratingEl =
                    document.getElementById(
                        'modalFoodRating'
                    );


                if (ratingEl) {
                    ratingEl.textContent = selectedModalItem.rating != null && selectedModalItem.reviewCount > 0
                        ? `★ ${Number(selectedModalItem.rating).toFixed(1)} (${selectedModalItem.reviewCount} review${selectedModalItem.reviewCount === 1 ? '' : 's'})`
                        : '★ New — No reviews yet';
                }


                // ---------------------------------------------
                // DESCRIPTION
                // ---------------------------------------------

                const descEl =
                    document.getElementById(
                        'modalFoodDesc'
                    );


                if (descEl) {

                    descEl.textContent =
                        item.desc || '';
                }


                // ---------------------------------------------
                // INGREDIENTS
                // ---------------------------------------------

                const ingredientsEl =
                    document.getElementById(
                        'modalFoodIngredients'
                    );


                if (ingredientsEl) {

                    ingredientsEl.textContent =
                        item.ingredients ||
                        'Ask the business directly for full ingredient details.';
                }


                // ---------------------------------------------
                // MODAL QUANTITY
                // ---------------------------------------------
                //
                // Always start at 1.
                // If the item is already in cart, clicking
                // "Add to cart" adds the selected quantity
                // rather than accidentally duplicating the
                // existing cart quantity.
                // ---------------------------------------------

                const qtyEl =
                    document.getElementById(
                        'lblModalQty'
                    );


                if (qtyEl) {

                    qtyEl.textContent =
                        '1';
                }


                const totalEl =
                    document.getElementById(
                        'lblModalTotal'
                    );


                if (totalEl) {

                    totalEl.textContent =
                        `₹${item.price}`;
                }


                // ---------------------------------------------
                // OPEN MODAL
                // ---------------------------------------------

                if (
                    typeof LB !== 'undefined' &&
                    LB.openModal
                ) {

                    LB.openModal(
                        'foodDetailsModal'
                    );
                }
            },


        // -----------------------------------------------------
        // HELPFUL REVIEW
        // -----------------------------------------------------

        helpfulReview:
            (
                index,
                btnEl
            ) => {

                const countSpan =
                    btnEl.querySelector(
                        '.helpful-count'
                    );


                if (!countSpan) {
                    return;
                }


                let count =
                    parseInt(
                        countSpan.textContent
                    ) || 0;


                count++;


                countSpan.textContent =
                    count;


                btnEl.style.color =
                    'var(--clr-primary)';


                LB.toast(
                    'Thanks for your feedback!',
                    'success'
                );
            }
    };


    // =========================================================
    // MODAL ADD TO CART
    // =========================================================
    //
    // IMPORTANT:
    // There is now ONLY ONE modal add-to-cart handler.
    // No location.reload().
    // No duplicate database call.
    // =========================================================

    document
        .getElementById(
            'btnModalAddToCart'
        )
        ?.addEventListener(
            'click',
            async () => {

                if (!selectedModalItem) {

                    LB.toast(
                        'Food item not selected.',
                        'error'
                    );

                    return;
                }


                const qtyElement =
                    document.getElementById(
                        'lblModalQty'
                    );


                const quantity =
                    parseInt(
                        qtyElement?.textContent
                    ) || 1;


                const success =
                    await LB_DETAILS
                        .handleAddToCartClick(
                            selectedModalItem.id,
                            null,
                            quantity
                        );


                if (success) {

                    // Close modal only after
                    // successful database update.

                    if (
                        typeof LB !== 'undefined' &&
                        LB.closeModal
                    ) {

                        LB.closeModal(
                            'foodDetailsModal'
                        );
                    }


                    selectedModalItem =
                        null;
                }
            }
        );

});