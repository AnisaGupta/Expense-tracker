'use strict';


// ============================================================
// GLOBAL FAVORITE TOGGLE
// Used by both Home page and Favorites page
// ============================================================
    window.addFavoriteToCart = async (menuId) => {
        try {
            const res = await fetch('/customer/api/cart/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ menu_id: menuId, quantity: 1 })
            });
            const data = await res.json();

            // Cart already has items from a different restaurant
            if (data.conflicting_cart) {
                if (confirm(data.message)) {
                    await fetch('/customer/api/cart/clear', { method: 'POST', credentials: 'same-origin' });
                    const retryRes = await fetch('/customer/api/cart/add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ menu_id: menuId, quantity: 1 })
                    });
                    const retryData = await retryRes.json();
                    if (retryRes.ok && retryData.success) {
                        LB.toast('Cart cleared and item added!', 'success');
                        setTimeout(() => LB.navigate('/customer/cart'), 500);
                    } else {
                        LB.toast(retryData.message || 'Could not add item.', 'error');
                    }
                }
                return;
            }

            if (data.success) {
                LB.toast('Added to cart!', 'success');
                setTimeout(() => LB.navigate('/customer/cart'), 500);
            } else {
                LB.toast(data.message || 'Could not add item.', 'error');
            }
        } catch (err) {
            LB.toast('Could not add item to cart.', 'error');
        }
    };
    
window.toggleFavoriteApi = async (menuId, businessId) => {

    try {

        const response = await fetch('/customer/api/favorites/toggle', {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            credentials: 'same-origin',

            body: JSON.stringify({
                menu_id: Number(menuId),
                business_id: businessId ? Number(businessId) : null
            })
        });


        const data = await response.json();


        if (!response.ok || !data.success) {

            throw new Error(
                data.message || 'Could not update favorites.'
            );
        }


        // ----------------------------------------------------
        // Update heart icons on the current page
        // ----------------------------------------------------

        const buttons = document.querySelectorAll('.fav-heart-btn');


        buttons.forEach(button => {

            const onclickValue =
                button.getAttribute('onclick') || '';


            // Check whether this button belongs to this food item
            const menuMatch =
                onclickValue.includes(`'${menuId}'`) ||
                onclickValue.includes(`(${menuId},`);


            if (!menuMatch) {
                return;
            }


            const icon = button.querySelector('i');


            if (!icon) {
                return;
            }


            if (data.is_favorite) {

                button.classList.add('active');

                icon.classList.remove('fa-regular');
                icon.classList.add('fa-solid');

            } else {

                button.classList.remove('active');

                icon.classList.remove('fa-solid');
                icon.classList.add('fa-regular');
            }

        });


        // ----------------------------------------------------
        // Toast message
        // ----------------------------------------------------

        if (typeof LB !== 'undefined' && LB.toast) {

            if (data.is_favorite) {

                LB.toast(
                    'Added to favorites!',
                    'success'
                );

            } else {

                LB.toast(
                    'Removed from favorites.',
                    'info'
                );
            }
        }


        // ----------------------------------------------------
        // If we are on Favorites page,
        // refresh the list after removing an item
        // ----------------------------------------------------

        if (
            document.body.dataset.page === 'favorites' &&
            !data.is_favorite
        ) {

            loadFavorites();

        }


        return data.is_favorite;


    } catch (error) {

        console.error(
            'Favorite error:',
            error
        );


        if (typeof LB !== 'undefined' && LB.toast) {

            LB.toast(
                error.message ||
                'Could not update favorites.',
                'error'
            );
        }


        return false;
    }
};



// ============================================================
// FAVORITES PAGE
// ============================================================

let loadFavorites = null;


document.addEventListener('DOMContentLoaded', () => {

    const page =
        document.body.dataset.page;


    // Only run the Favorites-page loading code
    // when we are actually on the Favorites page.

    if (page !== 'favorites') {
        return;
    }


    const grid =
        document.getElementById('favoritesGrid');


    if (!grid) {
        return;
    }



    // ========================================================
    // LOAD FAVORITES FROM MYSQL
    // ========================================================

    loadFavorites = () => {

        fetch(
            '/customer/api/favorites',
            {
                credentials: 'same-origin'
            }
        )

        .then(res => res.json())

        .then(data => {

            // ------------------------------------------------
            // No favorites
            // ------------------------------------------------

            if (
                !data.success ||
                !data.favorites ||
                data.favorites.length === 0
            ) {

                grid.innerHTML = `

                    <div class="fav-empty-container">

                        <i class="fa-regular fa-heart fav-empty-icon"></i>

                        <h3 class="fav-empty-title">
                            No food added yet
                        </h3>

                        <p class="fav-empty-desc">
                            Explore dishes to save your favorites here.
                        </p>

                        <a
                            href="/customer/dashboard"
                            class="btn btn-primary"
                            style="
                                padding: 10px 20px;
                                border-radius: 8px;
                                text-decoration: none;
                                display: inline-block;
                            "
                        >
                            Explore Menu
                        </a>

                    </div>

                `;

                return;
            }



            // ------------------------------------------------
            // Display favorites
            // ------------------------------------------------

            grid.innerHTML = data.favorites.map(item => `

    <div
        class="fav-card"
        id="fav-card-${item.id}"
        style="
            width: 240px;
            max-width: 100%;
            margin: 0 auto;
        "
    >

        <div
            class="fav-card-img-wrap"
            style="
                height: 135px;
            "
        >

            <img
                src="${item.imageUrl || '/static/images/LocalBites.png'}"
                class="fav-card-img"
                alt="${item.name}"
                onerror="
                    this.onerror=null;
                    this.src='/static/images/LocalBites.png';
                "
            >


            <button
                type="button"
                class="fav-heart-btn active"
                onclick="toggleFavoriteApi(${item.id}, ${item.businessId})"
                aria-label="Remove Favorite"
            >

                <i class="fa-solid fa-heart"></i>

            </button>

        </div>


        <div class="fav-card-body">

            <span class="fav-biz-name">
                ${item.businessName || 'Local Kitchen'}
            </span>


            <h3 class="fav-item-name">
                ${item.name}
            </h3>


            <div
                class="fav-price-row"
                style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    margin-top: 12px;
                "
            >

                <span
                    class="fav-price"
                    style="
                        flex-shrink: 0;
                        white-space: nowrap;
                    "
                >
                    ₹${Number(item.price).toFixed(2)}
                </span>


                                                <button class="btn card-btn" style="padding: 6px 12px; font-size: 12px;" onclick="addFavoriteToCart(${item.id})">
                                    Order Now
                                </button>

            </div>

        </div>

    </div>

`).join('');

        })

        .catch(error => {

            console.error(
                'Failed to load favorites:',
                error
            );


            grid.innerHTML = `

                <p
                    style="
                        color: #ef4444;
                        text-align: center;
                        grid-column: 1 / -1;
                    "
                >
                    Failed to load favorites.
                </p>

            `;

        });

    };



    // Load favorites when Favorites page opens
    loadFavorites();

});