/**
 * ============================================================
 *  LocalBites — Dashboard Core Controller (business-dashboard.js)
 *  Manages stats summary cards, recent orders table list,
 *  pure SVG charts renderers and settings.
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page !== 'business-dashboard') return;

    // Load common shell UI binder for Dashboard
    LB_Biz.initCommonUI('dashboard');

    const db = LB_Biz.getState();
    let dashboardData = null;

    // ── SUB-TAB IN-PAGE SCROLLING ──
    // Dashboard, Analytics and Settings are all sections
    // of the same page. Clicking a tab smoothly scrolls to that section
    // instead of hiding the other sections.
    const initSubTabRouting = () => {
        const sections = {
            overview: document.getElementById('panel-overview'),
            analytics: document.getElementById('panel-analytics'),
            settings: document.getElementById('panel-settings')
        };

        const subTabLinks = [...document.querySelectorAll('.sidebar-nav .nav-link')].filter(link => {
            const href = link.getAttribute('href') || '';
            return href.includes('/business/dashboard#');
        });

        const setActiveTab = (panelId) => {
            subTabLinks.forEach(link => {
                const href = link.getAttribute('href') || '';
                link.classList.toggle('active', href.endsWith(`#${panelId}`));
            });
        };

        const scrollToSection = (panelId, updateHash = true) => {
            const section = sections[panelId];
            if (!section) return;

            // Analytics charts can be rendered as soon as the section is requested.
            if (panelId === 'analytics') {
                renderAnalyticsCharts();
            }

            setActiveTab(panelId);

            if (updateHash && window.location.hash !== `#${panelId}`) {
                history.pushState(null, '', `#${panelId}`);
            }

            section.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        };

        // Handle sidebar clicks without navigating away from the dashboard.
        subTabLinks.forEach(link => {
            link.addEventListener('click', (event) => {
                const href = link.getAttribute('href') || '';
                const hash = href.split('#')[1];

                if (!sections[hash]) return;

                event.preventDefault();
                scrollToSection(hash);
            });
        });

        // Notification bell / other hash-based links can still open a section.
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1);
            if (sections[hash]) {
                scrollToSection(hash, false);
            }
        });

        // Keep the sidebar highlight in sync while the user manually scrolls.
        const observer = new IntersectionObserver((entries) => {
            const visible = entries
                .filter(entry => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

            if (visible.length) {
                const panelId = visible[0].target.id.replace('panel-', '');
                setActiveTab(panelId);
            }
        }, {
            root: document.querySelector('.content-body'),
            rootMargin: '-8% 0px -65% 0px',
            threshold: [0.1, 0.25, 0.5, 0.75]
        });

        Object.values(sections).forEach(section => {
            if (section) observer.observe(section);
        });

        // If a dashboard hash was supplied, scroll to it on page load.
        const initialHash = window.location.hash.substring(1);
        if (sections[initialHash]) {
            setTimeout(() => scrollToSection(initialHash, false), 100);
        } else {
            setActiveTab('overview');
        }
    };

    // ── LOAD REAL DASHBOARD DATA FROM MYSQL ──
    const loadDashboardData = async () => {
        try {
            const response = await fetch('/business/api/dashboard', {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not load dashboard data.');
            }

            dashboardData = data;
            renderOverviewData();
            renderAnalyticsCharts();
        } catch (error) {
            console.error('Business dashboard data error:', error);
            LB.toast('Could not load live dashboard data.', 'error');
        }
    };

    // ── RENDER OVERVIEW SECTION ──
    const renderOverviewData = () => {
        if (!dashboardData) return;

        document.getElementById('statTodayOrders').textContent = dashboardData.todayOrders ?? 0;
        document.getElementById('statPendingOrders').textContent = dashboardData.pendingOrders ?? 0;
        document.getElementById('statTodayRevenue').textContent =
            `₹${Number(dashboardData.todayRevenue || 0).toLocaleString('en-IN')}`;

        // Rating system is not implemented yet, so do not display a fake 0.0 rating.
        const avgRating = dashboardData.averageRating;
        document.getElementById('statAvgRating').textContent =
            avgRating !== null && avgRating !== undefined && Number(avgRating) > 0
                ? `${Number(avgRating).toFixed(1)} ★`
                : '—';

        const list = document.getElementById('recentOrdersList');
        const table = document.getElementById('recentOrdersTable');
        const emptyState = document.getElementById('recentOrdersEmptyState');

        if (!list || !table || !emptyState) return;

        list.innerHTML = '';
        const recentOrders = Array.isArray(dashboardData.recentOrders)
            ? dashboardData.recentOrders
            : [];

        if (recentOrders.length === 0) {
            table.style.display = 'none';
            emptyState.classList.remove('hidden');
            return;
        }

        table.style.display = 'table';
        emptyState.classList.add('hidden');

        recentOrders.forEach(order => {
            const tr = document.createElement('tr');
            const itemsText = (order.items || [])
                .map(item => `${item.name} (x${item.qty})`)
                .join(', ');

            const isDelivery = order.deliveryType === 'delivery';
            const optText = isDelivery ? '🚗 Business Delivery' : '🏪 Self Pickup';
            const optClass = isDelivery ? 'delivery' : '';
            const statText = String(order.status || '').replace(/_/g, ' ');

            tr.innerHTML = `
                <td data-label="Order ID"><strong>#${order.id}</strong></td>
                <td data-label="Customer">${order.customer || 'Customer'}</td>
                <td data-label="Items" title="${itemsText}">${itemsText || '—'}</td>
                <td data-label="Amount"><strong>₹${Number(order.amount || 0).toLocaleString('en-IN')}</strong></td>
                <td data-label="Time">${order.time || '—'}</td>
                <td data-label="Fulfillment"><span class="opt-badge ${optClass}">${optText}</span></td>
                <td data-label="Status"><span class="status-badge ${order.status || ''}">${statText}</span></td>
            `;
            list.appendChild(tr);
        });
    };

    // ── RENDER REAL MYSQL ANALYTICS ──
    const renderAnalyticsCharts = () => {
        if (!dashboardData) return;

        const ordersData = Array.isArray(dashboardData.weeklyOrders)
            ? dashboardData.weeklyOrders
            : [0, 0, 0, 0, 0, 0, 0];
        const revenueData = Array.isArray(dashboardData.weeklyRevenue)
            ? dashboardData.weeklyRevenue
            : [0, 0, 0, 0, 0, 0, 0];

        const todayEl = document.getElementById('analyticsOrdersToday');
        const weekEl = document.getElementById('analyticsOrdersWeek');
        const monthEl = document.getElementById('analyticsOrdersMonth');
        const cancelledEl = document.getElementById('analyticsOrdersCancelled');

        if (todayEl) todayEl.textContent = dashboardData.todayOrders ?? 0;
        if (weekEl) weekEl.textContent = ordersData.reduce((a, b) => a + Number(b || 0), 0);
        if (monthEl) monthEl.textContent = dashboardData.monthlyOrders ?? 0;
        if (cancelledEl) cancelledEl.textContent = dashboardData.cancelledOrders ?? 0;

        const barContainer = document.getElementById('barChartContainer');
        const lineContainer = document.getElementById('lineChartContainer');
        const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        // 1. Weekly Orders History
        if (barContainer) {
            const maxVal = Math.max(...ordersData.map(Number), 1);
            let svg = `
                <svg viewBox="0 0 400 220" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <line x1="40" y1="40" x2="380" y2="40" class="chart-grid-line" />
                    <line x1="40" y1="100" x2="380" y2="100" class="chart-grid-line" />
                    <line x1="40" y1="160" x2="380" y2="160" class="chart-grid-line" />
                    <text x="10" y="44" style="font-size:10px; fill:var(--clr-text-3); font-weight:700;">${Math.round(maxVal)}</text>
                    <text x="10" y="104" style="font-size:10px; fill:var(--clr-text-3); font-weight:700;">${Math.round(maxVal / 2)}</text>
                    <text x="10" y="164" style="font-size:10px; fill:var(--clr-text-3); font-weight:700;">0</text>
            `;

            const gap = 44;
            ordersData.forEach((rawVal, i) => {
                const val = Number(rawVal || 0);
                const x = 50 + (i * gap);
                const height = (val / maxVal) * 130;
                const y = 170 - height;

                svg += `
                    <rect x="${x}" y="${y}" width="24" height="${height}" class="chart-bar-rect" />
                    <text x="${x + 12}" y="${y - 6}" text-anchor="middle" style="font-size:10px; font-weight:800; fill:var(--clr-text-1);">${val}</text>
                    <text x="${x + 12}" y="190" text-anchor="middle" class="chart-bar-text">${weekLabels[i]}</text>
                `;
            });

            svg += `<line x1="40" y1="170" x2="380" y2="170" class="chart-axis-line" /></svg>`;
            barContainer.innerHTML = svg;
        }

        // 2. Daily Revenue Trend — delivered orders only
        if (lineContainer) {
            const numericRevenue = revenueData.map(v => Number(v || 0));
            const maxRev = Math.max(...numericRevenue, 1);
            let linePoints = '';
            let areaPoints = '40,170 ';
            const gap = 50;

            numericRevenue.forEach((val, i) => {
                const x = 50 + (i * gap);
                const y = 170 - ((val / maxRev) * 130);
                linePoints += `${x},${y} `;
                areaPoints += `${x},${y} `;
            });
            areaPoints += '350,170';

            let svg = `
                <svg viewBox="0 0 400 220" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="var(--clr-primary)" />
                            <stop offset="100%" stop-color="transparent" />
                        </linearGradient>
                    </defs>
                    <line x1="40" y1="40" x2="360" y2="40" class="chart-grid-line" />
                    <line x1="40" y1="100" x2="360" y2="100" class="chart-grid-line" />
                    <line x1="40" y1="160" x2="360" y2="160" class="chart-grid-line" />
                    <text x="5" y="44" style="font-size:9px; fill:var(--clr-text-3); font-weight:700;">₹${Math.round(maxRev)}</text>
                    <text x="5" y="104" style="font-size:9px; fill:var(--clr-text-3); font-weight:700;">₹${Math.round(maxRev / 2)}</text>
                    <text x="5" y="164" style="font-size:9px; fill:var(--clr-text-3); font-weight:700;">₹0</text>
                    <polygon points="${areaPoints}" class="chart-gradient-fill" />
                    <polyline points="${linePoints}" class="chart-trend-line" />
            `;

            numericRevenue.forEach((val, i) => {
                const x = 50 + (i * gap);
                const y = 170 - ((val / maxRev) * 130);
                svg += `
                    <circle cx="${x}" cy="${y}" r="4" fill="var(--clr-bg)" stroke="var(--clr-primary)" stroke-width="2.5" />
                    <text x="${x}" y="${y - 8}" text-anchor="middle" style="font-size:9px; font-weight:800; fill:var(--clr-text-2);">₹${Math.round(val)}</text>
                    <text x="${x}" y="190" text-anchor="middle" class="chart-bar-text">${weekLabels[i]}</text>
                `;
            });

            svg += `<line x1="40" y1="170" x2="360" y2="170" class="chart-axis-line" /></svg>`;
            lineContainer.innerHTML = svg;
        }
    };

    // ── INITIALIZE BINDINGS ──
    initSubTabRouting();
    loadDashboardData();


});
