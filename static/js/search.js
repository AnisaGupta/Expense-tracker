/**
 * ============================================================
 *  LocalBites — Search Page Interactions (search.js)
 *  Contains: Live search supporting business & food dish modes
 *  with automatic keyword, budget threshold, and search history.
 * ============================================================
 */

'use strict';
// Declare globally at the very top of search.js
const TYPE_EMOJI = {
    mess: "🍱",
    home_kitchen: "🥘",
    tiffin_service: "🍛",
    canteen: "🏫",
    poli_bhaji_kendra: "🫓",
    festival_seller: "🎉",
};

const CATEGORY_QUERY_MAP = {
    mess: "Mess",
    home_kitchen: "Home Kitchen",
    tiffin_service: "Tiffin",
    canteen: "Canteen",
    poli_bhaji_kendra: "Poli Bhaji",
    festival_seller: "Festival",
};

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page !== 'search') return;

    const TYPE_EMOJI = {
        mess: "🍱",
        home_kitchen: "🥘",
        tiffin_service: "🍛",
        canteen: "🏫",
        poli_bhaji_kendra: "🫓",
        festival_seller: "🎉",
    };

    const CATEGORY_QUERY_MAP = {
        mess: "Mess",
        home_kitchen: "Home Kitchen",
        tiffin_service: "Tiffin",
        canteen: "Canteen",
        poli_bhaji_kendra: "Poli Bhaji",
        festival_seller: "Festival",
    };

    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');

    // IF a category is provided in the URL, let Flask handle the rendering completely!
    if (categoryParam) {
        // Optionally set the search input text visually so the user sees what category they are viewing
        const searchInput = document.querySelector('input[name="q"], #search-input');
        if (searchInput && CATEGORY_QUERY_MAP[categoryParam]) {
            searchInput.value = CATEGORY_QUERY_MAP[categoryParam];
        }
        return; // Stop search.js from firing its conflicting API fetch!
    }

    // Otherwise, continue with your standard search input / API fetching logic below...
});

    const input = document.getElementById('liveSearchInput');
    const preSection = document.getElementById('searchPreSuggestions');
    const resultsSection = document.getElementById('searchResultsSection');
    const grid = document.getElementById('searchResultGrid');
    const resultCount = document.getElementById('searchResultCount');
    const emptyState = document.getElementById('searchEmptyState');
    const btnClear = document.getElementById('btnClearSearch');
    const recentContainer = document.getElementById('recentSearchesContainer');
    const clearAllHistoryBtn = document.getElementById('clearAllHistory');

    const HISTORY_KEY = "localbites_search_history";

    // ── SEARCH HISTORY MANAGEMENT ──
    const getSearchHistory = () => {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY)) || ["student mess", "lunch tiffin", "poli bhaji kendra"];
        } catch {
            return [];
        }
    };

    const saveSearchHistory = (term) => {
        const cleanTerm = term.trim();
        if (!cleanTerm) return;
        let history = getSearchHistory();
        
        // Remove case-insensitive duplicate if exists
        history = history.filter(item => item.toLowerCase() !== cleanTerm.toLowerCase());
        history.unshift(cleanTerm);
        
        // Keep max 5 items
        if (history.length > 5) history.pop();
        
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        renderRecentSearches();
    };

    const renderRecentSearches = () => {
        if (!recentContainer) return;
        const history = getSearchHistory();
        recentContainer.innerHTML = '';

        if (history.length === 0) {
            recentContainer.innerHTML = `<span style="font-size: 12px; color: #94a3b8;">No recent search history</span>`;
            return;
        }

        history.forEach((term, index) => {
            const tag = document.createElement('span');
            tag.className = "suggest-tag recent-tag";
            tag.style.display = "inline-flex";
            tag.style.alignItems = "center";
            tag.style.gap = "8px";

            tag.innerHTML = `
                <span style="cursor: pointer;">${term}</span>
                <i class="fa-solid fa-xmark remove-history-item" data-index="${index}" style="font-size: 11px; color: #94a3b8; cursor: pointer; padding: 2px;" title="Remove"></i>
            `;

            // Click text to trigger search
            tag.querySelector("span").addEventListener("click", () => {
                if (input) input.value = term;
                performSearch(term);
            });

            // Click individual 'X' to remove specific entry
            tag.querySelector(".remove-history-item").addEventListener("click", (e) => {
                e.stopPropagation();
                let history = getSearchHistory();
                history.splice(index, 1);
                localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
                renderRecentSearches();
            });

            recentContainer.appendChild(tag);
        });
    };

    clearAllHistoryBtn?.addEventListener('click', () => {
        localStorage.removeItem(HISTORY_KEY);
        renderRecentSearches();
    });

    // Escape text/attributes coming from the DB before putting into HTML
    const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    // Business logo (uploaded by the business) with emoji fallback when
    // no logo exists or the image fails to load.
    const renderBusinessImage = (item) => {
        const emoji = TYPE_EMOJI[item.type] || '🍽️';
        const tileStyle = 'width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#E5E9F2; font-size:3rem;';
        if (!item.logoUrl) {
            return `<div class="card-img" style="${tileStyle}">${emoji}</div>`;
        }
        return `<img class="card-img" src="${escHtml(item.logoUrl)}" alt="${escHtml(item.name)} logo" loading="lazy"
            style="width:100%; height:100%; object-fit:cover;"
            onerror="this.outerHTML='&lt;div class=&quot;card-img&quot; style=&quot;${tileStyle}&quot;&gt;${emoji}&lt;/div&gt;';">`;
    };

    // Render business/kitchen card
    const renderBusinessCard = (item) => {
        const statusText = item.open === false ? 'Closed' : (item.open === true ? 'Open Now' : '');
        const statusClass = item.open ? 'open' : 'closed';
        const priceText = item.startingPrice != null ? `From ₹${item.startingPrice}` : 'Menu coming soon';

        return `
            <div class="food-card" style="flex: auto;">
                <div class="card-img-wrap">
                    ${renderBusinessImage(item)}
                    <div class="card-overlay-badges">
                        ${statusText ? `<span class="badge-status ${statusClass}">${statusText}</span>` : ''}
                    </div>
                </div>
                <div class="card-info">
                    <span class="card-type">${item.typeLabel || item.type || 'Kitchen'}</span>
                    <h3 class="card-title">${item.name}</h3>
                    <div style="font-size: var(--fs-13); color: var(--clr-text-3); font-weight: 500; margin-bottom: 2px;">
                        📍 ${item.address || 'Local Area'}
                    </div>
                    <div class="card-meta-row">
                        <span class="card-price">${priceText}</span>
                    </div>
                </div>
                <div class="card-action-row">
                    <button type="button" class="btn card-btn" onclick="sessionStorage.setItem('selected_provider_id', ${item.id}); LB.navigate('/customer/food-details?biz=${item.id}');">
                        View Kitchen
                    </button>
                </div>
            </div>
        `;
    };

    // Render individual food dish card for budget views
    const renderFoodCard = (item) => {
        const dietBadge = (item.type || '').toLowerCase() === 'non-veg' ? '🔴 Non-Veg' : '🟢 Veg';

        return `
            <div class="food-card" style="flex: auto;">
                <div class="card-img-wrap" style="height: 120px; position: relative; overflow: hidden; border-radius: var(--r-sm);">
                    <img src="${item.imageUrl || '/static/images/LocalBites.png'}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.src='/static/images/LocalBites.png';">
                    <span style="position: absolute; top: 6px; left: 6px; background: rgba(0,0,0,0.75); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
                        ${dietBadge}
                    </span>
                </div>
                <div class="card-info" style="margin-top: 8px;">
                    <span class="card-type" style="font-weight: 700; color: var(--clr-primary); font-size: 11px; text-transform: uppercase;">${item.businessName}</span>
                    <h3 class="card-title" style="margin-top: 2px; font-size: 14px;">${item.name}</h3>
                    <div class="card-meta-row" style="margin-top: 4px;">
                        <span class="card-price" style="font-size: 14px; font-weight: 800; color: #2E7D32;">₹${item.price.toFixed(2)}</span>
                    </div>
                </div>
                <div class="card-action-row" style="margin-top: 8px;">
                    <button type="button" class="btn card-btn" onclick="sessionStorage.setItem('selected_provider_id', ${item.businessId}); LB.navigate('/customer/food-details?biz=${item.businessId}&id=${item.id}');">
                        View Dish
                    </button>
                </div>
            </div>
        `;
    };

    let searchTimer = null;

    // Helper to extract numeric price thresholds from search strings (e.g., "under 80", "below 100", "80")
    const extractPriceLimit = (queryStr) => {
        const match = queryStr.match(/(?:under|below|less than|<|<=|\b)\s*₹?\s*(\d+)/i);
        return match ? parseFloat(match[1]) : null;
    };

    const performSearch = (query, showAll = false, maxPriceConstraint = null) => {
        const q = query.trim();

        if (!q && !showAll && maxPriceConstraint === null) {
            preSection?.classList.remove('hidden');
            resultsSection?.classList.add('hidden');
            grid.innerHTML = '';
            emptyState?.classList.add('hidden');
            return;
        }

        preSection?.classList.add('hidden');
        resultsSection?.classList.remove('hidden');

        // Save valid search terms to recent history
        if (q && !showAll) {
            saveSearchHistory(q);
        }

        // Determine if budget mode is active
        let limit = maxPriceConstraint;
        const lowerQ = q.toLowerCase();
        if (limit === null && (lowerQ.includes('under') || lowerQ.includes('below') || lowerQ.includes('cheap') || lowerQ.includes('budget'))) {
            limit = extractPriceLimit(q) || 80;
        }

        const isBudgetSearch = limit !== null;
        let requestUrl = isBudgetSearch ? '/customer/api/food-items' : '/customer/api/businesses';
        const params = new URLSearchParams();

        if (limit !== null) {
            params.append('budget', limit);
            params.append('max_price', limit);
        }

        if (q && !lowerQ.includes('under') && !lowerQ.includes('below')) {
            params.append('q', q);
        }

        if (params.toString()) {
            requestUrl += `?${params.toString()}`;
        }

        fetch(requestUrl, { credentials: 'same-origin' })
            .then(res => res.json())
            .then(data => {
                const results = isBudgetSearch ? (data.items || []) : (data.businesses || []);
                const unitLabel = isBudgetSearch ? 'DISH' : 'RESULT';

                if (resultCount) {
                    resultCount.textContent = `${results.length} ${unitLabel}${results.length !== 1 ? 'ES' : ''} FOUND`;
                }

                if (results.length === 0) {
                    grid.innerHTML = '';
                    emptyState?.classList.remove('hidden');
                } else {
                    emptyState?.classList.add('hidden');
                    grid.innerHTML = isBudgetSearch 
                        ? results.map(item => renderFoodCard(item)).join('')
                        : results.map(item => renderBusinessCard(item)).join('');
                }
            })
            .catch(() => {
                grid.innerHTML = '';
                if (resultCount) resultCount.textContent = '0 RESULTS FOUND';
                emptyState?.classList.remove('hidden');
                LB.toast("Couldn't search right now. Please try again.", 'error');
            });
    };

    // ── INITIAL URL PARAMETER CHECK ──
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    const bizParam = urlParams.get('biz');
    const queryParam = urlParams.get('q');
    const budgetParam = urlParams.get('budget');
    const categoryParam = urlParams.get('category') || sessionStorage.getItem('selected_category');

    if (filterParam === 'all' || bizParam === 'all') {
        performSearch('', true);
    } else if (budgetParam) {
        const limit = parseFloat(budgetParam) || 80;
        if (input) input.value = `Under ₹${limit}`;
        performSearch('', false, limit);
    } else if (categoryParam) {
        // Fetch directly using the category parameter so the API filters it instantly
        const requestUrl = `/customer/api/businesses?category=${encodeURIComponent(categoryParam)}`;
        
        fetch(requestUrl, { credentials: 'same-origin' })
            .then(res => res.json())
            .then(data => {
                const results = data.businesses || [];
                if (resultCount) {
                    resultCount.textContent = `${results.length} RESULT${results.length !== 1 ? 'S' : ''} FOUND`;
                }
                if (results.length === 0) {
                    grid.innerHTML = '';
                    emptyState?.classList.remove('hidden');
                } else {
                    emptyState?.classList.add('hidden');
                    grid.innerHTML = results.map(item => renderBusinessCard(item)).join('');
                }
                resultsSection?.classList.remove('hidden');
                preSection?.classList.add('hidden');
            });
            
        sessionStorage.removeItem('selected_category');
    } else if (queryParam) {
        if (input) input.value = queryParam;
        performSearch(queryParam);
    }

    // Debounced input trigger event for real-time live typing
    input?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const value = e.target.value;
        searchTimer = setTimeout(() => performSearch(value), 300);
    });

    // Save search history on Enter keypress
    input?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const value = e.target.value.trim();
            if (value) saveSearchHistory(value);
        }
    });

    // Clear search click
    btnClear?.addEventListener('click', () => {
        if (input) input.value = '';
        performSearch('');
        if (input) input.focus();
    });

    // Tag helper click binders
    const tags = document.querySelectorAll('.suggest-tag');
    tags.forEach(tag => {
        tag.addEventListener('click', () => {
            let queryText = tag.textContent.trim();

            if (tag.classList.contains('cat-link-tag')) {
                const catType = tag.dataset.cat;
                const searchVal = CATEGORY_QUERY_MAP[catType] || catType;
                if (input) input.value = searchVal;
                performSearch(searchVal);
                return;
            }

            if (input) input.value = queryText;
            performSearch(queryText);
        });
    });

    // Initialize recent history render on load
    renderRecentSearches();
