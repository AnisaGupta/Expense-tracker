/**
 * ============================================================
 *  LocalBites — Common Business State Engine (business-state.js)
 *  Contains global structures, LocalStorage database controllers,
 *  and shell bindings (headers, sidebar metrics, navigation overlays).
 * ============================================================
 */

'use strict';

window.LB_Biz = (() => {

    // ── REAL BUSINESS IDENTITY (injected server-side from the logged-in
    //    account — see routes/business.py `_real_business_data`) ──
    const REAL = window.LB_REAL_BUSINESS || {};

    // ── DEFAULT DATABASE FOR A FRESH LOGIN ──
    // Identity fields come from the real, logged-in business record.
    // Menu items now live in the real database (see
    // static/js/business-menu.js, which talks to /business/api/menu
    // directly) — this local store no longer holds them. Orders and
    // reviews still start genuinely empty here: order-taking and
    // customer reviews aren't wired up to the backend yet, so showing
    // invented numbers would be worse than an honest empty state.
    const buildDefaultDatabase = () => ({
        profile: {
            name: REAL.name || "",
            owner: REAL.owner || "",
            email: REAL.email || "",
            phone: REAL.phone || "",
            type: REAL.type || "home_kitchen",
            hours: REAL.hours || "",
            description: REAL.description || "",
            address: REAL.address || "",
            city: "",
            pincode: "",
            latitude: REAL.latitude || "",
            longitude: REAL.longitude || "",
            logo: REAL.logoUrl || "",
            services: {
                delivery: false,
                selfPickup: false
            },
            deliverySettings: {
                available: false,
                radius: 0,
                charge: 0,
                minAmount: 0,
                info: ""
            },
            verificationStatus: REAL.verificationStatus || "approved",
            verificationRemarks: REAL.verificationStatus === "pending"
                ? "Your business registration is currently under admin verification."
                : "Your business has been verified and is visible to customers."
        },
        orders: [],
        reviews: [],
        notifications: [],
        analytics: {
            weeklyOrders: [0, 0, 0, 0, 0, 0, 0], // Mon-Sun
            weeklyRevenue: [0, 0, 0, 0, 0, 0, 0] // Mon-Sun
        }
    });

    // Storage is namespaced per business account so that switching which
    // business is logged in in the same browser never shows one
    // business's local data to another.
    const storageKey = () => `LB_BUSINESS_DB_${REAL.businessId || 'anon'}`;

    let state = null;

    /**
     * Load database from storage or initialize defaults
     */
    const getState = () => {
        if (state) return state;

        const raw = localStorage.getItem(storageKey());
        if (raw) {
            try {
                state = JSON.parse(raw);
            } catch (e) {
                console.error("Failed to parse LocalStorage business state, resetting database.", e);
                state = buildDefaultDatabase();
                saveState(state);
            }
        } else {
            state = buildDefaultDatabase();
            saveState(state);
        }
        return state;
    };

    /**
     * Write database to storage
     */
    const saveState = (newState) => {
        state = newState;
        localStorage.setItem(storageKey(), JSON.stringify(state));
    };

    /**
     * Reset database back to default initial values
     */
    const resetState = () => {
        state = buildDefaultDatabase();
        saveState(state);
        location.reload();
    };

    /**
     * Play browser audio tone for alerts
     */
    const playAlert = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.18);
        } catch (e) {
            console.log("AudioContext blocked or not supported by browser", e);
        }
    };

    /**
     * Dynamic shell binder to run on document load
     */
    const initCommonUI = (activePageId) => {
        const db = getState();
        const bName = db.profile.name || "My Business";

        // 1. Sync header text and dropdown detail
        const sidebarBizName = document.getElementById('sidebarBizName');
        const dropdownBizName = document.getElementById('dropdownBizName');
        const dropdownOwnerName = document.getElementById('dropdownOwnerName');
        const welcomeBizName = document.getElementById('welcomeBizName');

        if (sidebarBizName) sidebarBizName.textContent = bName;
        if (dropdownBizName) dropdownBizName.textContent = bName;
        if (dropdownOwnerName) dropdownOwnerName.textContent = db.profile.owner;
        if (welcomeBizName) welcomeBizName.textContent = bName;

        // 2. Initial avatar letter
        const headerInitials = document.getElementById('headerProfileInitials');
        if (headerInitials) {
            headerInitials.textContent = bName.trim().charAt(0).toUpperCase() || "🏪";
        }

        // 3. Render business type tag
        const sidebarBizType = document.getElementById('sidebarBizType');
        if (sidebarBizType) {
            const typeLabels = {
                mess: "Mess Service",
                home_kitchen: "Home Kitchen",
                tiffin_service: "Tiffin Service",
                canteen: "College Canteen",
                poli_bhaji_kendra: "Poli Bhaji Kendra",
                festival_seller: "Festival Seller"
            };
            sidebarBizType.textContent = typeLabels[db.profile.type] || "Food Business";
        }

        // 4. Logo binding
        const sidebarLogo = document.getElementById('sidebarBizLogo');
        const profileLogoPreview = document.getElementById('profileLogoPreview');
        if (db.profile.logo) {
            if (sidebarLogo) sidebarLogo.src = db.profile.logo;
            if (profileLogoPreview) profileLogoPreview.src = db.profile.logo;
        }

        // 5. Sync verification status tags
        const headerVerificationBadge = document.getElementById('headerVerificationBadge');
        const verificationBanner = document.getElementById('verificationAlertBanner');
        const bannerTitle = document.getElementById('verificationAlertTitle');
        const bannerMsg = document.getElementById('verificationAlertMessage');

        const status = db.profile.verificationStatus || "approved";
        const remarks = db.profile.verificationRemarks || "";
        const statText = status.charAt(0).toUpperCase() + status.slice(1);

        if (headerVerificationBadge) {
            headerVerificationBadge.className = "header-status-badge " + status;
            headerVerificationBadge.innerHTML = `<span class="dot"></span> ${statText}`;
        }

        if (verificationBanner) {
            verificationBanner.className = "verification-alert-banner " + status;
            if (status === 'approved') {
                verificationBanner.classList.add('hidden');
            } else {
                verificationBanner.classList.remove('hidden');
                if (status === 'pending') {
                    bannerTitle.textContent = "Pending Verification ⏳";
                    bannerMsg.textContent = "Your business registration is currently under admin verification. Customers cannot order from your menu yet.";
                } else if (status === 'rejected') {
                    bannerTitle.textContent = "Registration Rejected ❌";
                    bannerMsg.textContent = `Your registration requires changes. Reason: "${remarks}". Please edit details or contact support.`;
                }
            }
        }

        // 6. Navigation badges counts
        const unreadNotifCount = db.notifications.filter(n => !n.read).length;
        const bellBadge = document.getElementById('headerNotifBadge');
        const sidebarNotifBadge = document.getElementById('sidebarNotifBadge');

        if (unreadNotifCount > 0) {
            if (bellBadge) {
                bellBadge.textContent = unreadNotifCount;
                bellBadge.classList.remove('hidden');
            }
            if (sidebarNotifBadge) {
                sidebarNotifBadge.textContent = unreadNotifCount;
                sidebarNotifBadge.classList.remove('hidden');
            }
        } else {
            if (bellBadge) bellBadge.classList.add('hidden');
            if (sidebarNotifBadge) sidebarNotifBadge.classList.add('hidden');
        }

        // Pending orders sidebar count
        const pendingCount = db.orders.filter(o => o.status === 'pending').length;
        const sidebarOrdersBadge = document.getElementById('sidebarOrdersBadge');
        if (sidebarOrdersBadge) {
            if (pendingCount > 0) {
                sidebarOrdersBadge.textContent = pendingCount;
                sidebarOrdersBadge.classList.remove('hidden');
            } else {
                sidebarOrdersBadge.classList.add('hidden');
            }
        }

        // Active orders delivery sidebar count
        const activeDeliveryCount = db.orders.filter(o => ['preparing', 'ready', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)).length;
        const sidebarDeliveryBadge = document.getElementById('sidebarDeliveryBadge');
        if (sidebarDeliveryBadge) {
            if (activeDeliveryCount > 0) {
                sidebarDeliveryBadge.textContent = activeDeliveryCount;
                sidebarDeliveryBadge.classList.remove('hidden');
            } else {
                sidebarDeliveryBadge.classList.add('hidden');
            }
        }

        // 7. Highlight current sidebar menu item
        const links = document.querySelectorAll('.nav-link');
        links.forEach(l => {
            if (l.dataset.page === activePageId) l.classList.add('active');
            else l.classList.remove('active');
        });

        // 8. Bind hamburger trigger
        const sidebarMenu = document.getElementById('sidebarMenu');
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarMenu && sidebarToggle) {
            let overlay = document.querySelector('.sidebar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                document.body.appendChild(overlay);
            }

            sidebarToggle.addEventListener('click', () => {
                sidebarMenu.classList.toggle('active');
                overlay.classList.toggle('active');
            });

            overlay.addEventListener('click', () => {
                sidebarMenu.classList.remove('active');
                overlay.classList.remove('active');
            });
        }

        // 9. Profile dropdown trigger
        const profBtn = document.getElementById('headerProfileAvatar');
        const profMenu = document.getElementById('profileDropdownMenu');
        if (profBtn && profMenu) {
            profBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                profMenu.classList.toggle('active');
            });

            document.addEventListener('click', () => {
                profMenu.classList.remove('active');
            });
        }

        // 10. Logout link events
        document.querySelectorAll('.logout-action').forEach(btn => {
            btn.addEventListener('click', () => {
                LB.toast('Signing out from business portal...', 'info');
                LB.logout('/business/logout', '/business/login');
            });
        });

    };

    return {
        getState,
        saveState,
        resetState,
        initCommonUI,
        playAlert
    };

})();
